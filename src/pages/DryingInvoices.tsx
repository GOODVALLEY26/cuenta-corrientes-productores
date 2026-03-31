import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, FileText, Upload, Eye, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

type Producer = { id: string; name: string };

const STATUS_LABELS: Record<string, string> = { pendiente: 'Pendiente', pagada: 'Pagada', parcial: 'Parcial' };
const STATUS_COLORS: Record<string, string> = { pendiente: 'destructive', pagada: 'default', parcial: 'secondary' };

const DryingInvoices = () => {
  const { user } = useAuth();
  const [producers, setProducers] = useState<Producer[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ producer_id: '', invoice_number: '', amount_clp: '', iva_clp: '', exchange_rate: '', total_installments: '1', installment_currency: 'clp', date: new Date().toISOString().split('T')[0], notes: '' });

  const load = async () => {
    const [p, i] = await Promise.all([
      supabase.from('producers').select('id, name').order('name'),
      supabase.from('drying_invoices').select('*, producers(name)').order('date', { ascending: false }),
    ]);
    if (p.data) setProducers(p.data);
    if (i.data) setInvoices(i.data);
  };

  useEffect(() => { if (user) load(); }, [user]);

  const parseInvoicePdf = async (file: File) => {
    setParsing(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'drying');

      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-invoice`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
        body: formData,
      });

      if (!res.ok) throw new Error('Error al procesar PDF');
      const parsed = await res.json();

      if (parsed.error) {
        toast.error('No se pudo leer la factura: ' + parsed.error);
        return;
      }

      let producerId = '';
      if (parsed.producer_name) {
        const match = producers.find(p =>
          p.name.toLowerCase().includes(parsed.producer_name.toLowerCase()) ||
          parsed.producer_name.toLowerCase().includes(p.name.toLowerCase())
        );
        if (match) producerId = match.id;
      }

      setForm(prev => ({
        ...prev,
        producer_id: producerId || prev.producer_id,
        invoice_number: parsed.invoice_number || prev.invoice_number,
        amount_clp: parsed.amount_net_clp ? String(parsed.amount_net_clp) : (parsed.amount_clp ? String(parsed.amount_clp) : prev.amount_clp),
        iva_clp: parsed.iva_clp ? String(parsed.iva_clp) : prev.iva_clp,
        exchange_rate: parsed.exchange_rate ? String(parsed.exchange_rate) : prev.exchange_rate,
        date: parsed.date || prev.date,
        notes: parsed.notes || prev.notes,
      }));

      toast.success('Datos extraídos del PDF' + (producerId ? '' : ' — selecciona el productor manualmente'));
    } catch (err: any) {
      toast.error(err.message || 'Error procesando PDF');
    } finally {
      setParsing(false);
    }
  };

  const handleFileSelect = async (file: File) => {
    setPdfFile(file);
    await parseInvoicePdf(file);
  };

  const uploadPdf = async (invoiceId: string): Promise<string | null> => {
    if (!pdfFile || !user) return null;
    const filePath = `${user.id}/${invoiceId}_${pdfFile.name}`;
    const { error } = await supabase.storage.from('drying-invoices-files').upload(filePath, pdfFile, { cacheControl: '3600', upsert: true });
    if (error) { toast.error('Error subiendo PDF: ' + error.message); return null; }
    return filePath;
  };

  const save = async () => {
    if (!form.producer_id || !form.amount_clp) { toast.error('Completa los campos requeridos'); return; }
    setUploading(true);
    const amountClp = Number(form.amount_clp);
    const ivaClp = Number(form.iva_clp) || 0;
    const er = form.exchange_rate ? Number(form.exchange_rate) : null;
    const amountUsd = er ? amountClp / er : null;

    const { data, error } = await supabase.from('drying_invoices').insert({
      producer_id: form.producer_id,
      invoice_number: form.invoice_number || null,
      amount_clp: amountClp,
      iva_clp: ivaClp,
      exchange_rate: er,
      amount_usd: amountUsd,
      total_installments: Number(form.total_installments),
      installment_currency: form.installment_currency,
      date: form.date,
      notes: form.notes || null,
      user_id: user!.id,
    } as any).select('id').single();

    if (error) { toast.error(error.message); setUploading(false); return; }

    if (pdfFile && data) {
      const filePath = await uploadPdf(data.id);
      if (filePath) {
        await supabase.from('drying_invoices').update({ file_path: filePath } as any).eq('id', data.id);
      }
    }

    toast.success('Factura creada');
    setPdfFile(null);
    setOpen(false);
    setUploading(false);
    load();
  };

  const remove = async (id: string, filePath?: string) => {
    if (!confirm('¿Eliminar?')) return;
    if (filePath) await supabase.storage.from('drying-invoices-files').remove([filePath]);
    await supabase.from('drying_invoices').delete().eq('id', id);
    toast.success('Factura eliminada');
    load();
  };

  const viewPdf = async (filePath: string) => {
    const { data } = await supabase.storage.from('drying-invoices-files').createSignedUrl(filePath, 300);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
    else toast.error('No se pudo abrir el archivo');
  };

  const handleUploadToExisting = async (invoiceId: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file || !user) return;
      const filePath = `${user.id}/${invoiceId}_${file.name}`;
      const { error } = await supabase.storage.from('drying-invoices-files').upload(filePath, file, { cacheControl: '3600', upsert: true });
      if (error) { toast.error(error.message); return; }
      await supabase.from('drying_invoices').update({ file_path: filePath } as any).eq('id', invoiceId);
      toast.success('PDF subido');
      load();
    };
    input.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Facturas de Secado</h1>
          <p className="text-muted-foreground">Sube el PDF y el sistema lee Neto + IVA automáticamente</p>
        </div>
        <Button onClick={() => { setForm({ producer_id: '', invoice_number: '', amount_clp: '', iva_clp: '', exchange_rate: '', total_installments: '1', installment_currency: 'clp', date: new Date().toISOString().split('T')[0], notes: '' }); setPdfFile(null); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />Agregar
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Productor</TableHead>
                <TableHead>N° Factura</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Neto CLP</TableHead>
                <TableHead className="text-right">IVA CLP</TableHead>
                <TableHead className="text-right">TC</TableHead>
                <TableHead className="text-right">Neto USD</TableHead>
                <TableHead>Cuotas</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>PDF</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.length === 0 ? (
                <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">Sin facturas</TableCell></TableRow>
              ) : invoices.map(inv => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.producers?.name}</TableCell>
                  <TableCell>{inv.invoice_number ?? '-'}</TableCell>
                  <TableCell>{new Date(inv.date).toLocaleDateString('es-CL')}</TableCell>
                  <TableCell className="text-right">${Number(inv.amount_clp).toLocaleString('es-CL')}</TableCell>
                  <TableCell className="text-right">${Number(inv.iva_clp || 0).toLocaleString('es-CL')}</TableCell>
                  <TableCell className="text-right">{inv.exchange_rate ?? '-'}</TableCell>
                  <TableCell className="text-right">{inv.amount_usd ? `USD ${Number(inv.amount_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '-'}</TableCell>
                  <TableCell>{inv.paid_installments}/{inv.total_installments}</TableCell>
                  <TableCell><Badge variant={STATUS_COLORS[inv.status] as any}>{STATUS_LABELS[inv.status]}</Badge></TableCell>
                  <TableCell>
                    {inv.file_path ? (
                      <Button variant="ghost" size="icon" onClick={() => viewPdf(inv.file_path)} title="Ver PDF">
                        <Eye className="h-4 w-4 text-primary" />
                      </Button>
                    ) : (
                      <Button variant="ghost" size="icon" onClick={() => handleUploadToExisting(inv.id)} title="Subir PDF">
                        <Upload className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    )}
                  </TableCell>
                  <TableCell><Button variant="ghost" size="icon" onClick={() => remove(inv.id, inv.file_path)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nueva Factura de Secado</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>📄 Subir PDF de la factura (se lee automáticamente)</Label>
              <div
                className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }} />
                {parsing ? (
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />Leyendo factura con IA...
                  </div>
                ) : pdfFile ? (
                  <div className="flex items-center justify-center gap-2 text-sm">
                    <FileText className="h-5 w-5 text-primary" />
                    <span className="font-medium">{pdfFile.name}</span>
                    <Button type="button" variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setPdfFile(null); }}>Quitar</Button>
                  </div>
                ) : (
                  <div className="text-muted-foreground text-sm">
                    <Upload className="h-6 w-6 mx-auto mb-1" />Haz clic para seleccionar un PDF — se extraerán los datos
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Productor *</Label>
              <Select value={form.producer_id} onValueChange={v => setForm({ ...form, producer_id: v })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>{producers.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>N° Factura</Label>
                <Input value={form.invoice_number} onChange={e => setForm({ ...form, invoice_number: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Fecha</Label>
                <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Monto Neto CLP *</Label>
                <Input type="number" value={form.amount_clp} onChange={e => setForm({ ...form, amount_clp: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>IVA CLP</Label>
                <Input type="number" value={form.iva_clp} onChange={e => setForm({ ...form, iva_clp: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo de Cambio (CLP/USD)</Label>
                <Input type="number" step="0.01" value={form.exchange_rate} onChange={e => setForm({ ...form, exchange_rate: e.target.value })} placeholder="ej: 950" />
              </div>
              <div className="space-y-2">
                <Label>Cuotas</Label>
                <Input type="number" min="1" value={form.total_installments} onChange={e => setForm({ ...form, total_installments: e.target.value })} />
              </div>
            </div>
            {form.amount_clp && form.exchange_rate && (
              <p className="text-sm text-muted-foreground">
                Neto USD: {(Number(form.amount_clp) / Number(form.exchange_rate)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                {form.iva_clp && ` · IVA USD: ${(Number(form.iva_clp) / Number(form.exchange_rate)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={uploading || parsing}>{uploading ? 'Subiendo...' : 'Crear'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DryingInvoices;
