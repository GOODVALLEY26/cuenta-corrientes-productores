import { useEffect, useState } from 'react';
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
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

type Producer = { id: string; name: string };

const ProducerInvoices = () => {
  const { user } = useAuth();
  const [producers, setProducers] = useState<Producer[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ producer_id: '', document_type: 'factura', invoice_number: '', amount_clp: '', exchange_rate: '', date: new Date().toISOString().split('T')[0], notes: '' });

  const load = async () => {
    const [p, i] = await Promise.all([
      supabase.from('producers').select('id, name').order('name'),
      supabase.from('producer_invoices').select('*, producers(name)').order('date', { ascending: false }),
    ]);
    if (p.data) setProducers(p.data);
    if (i.data) setInvoices(i.data);
  };

  useEffect(() => { if (user) load(); }, [user]);

  const save = async () => {
    if (!form.producer_id || !form.amount_clp || !form.exchange_rate) { toast.error('Completa los campos requeridos'); return; }
    const amountClp = Number(form.amount_clp);
    const er = Number(form.exchange_rate);
    const amountUsd = amountClp / er;

    const { error } = await supabase.from('producer_invoices').insert({
      producer_id: form.producer_id,
      document_type: form.document_type as any,
      invoice_number: form.invoice_number || null,
      amount_clp: amountClp,
      exchange_rate: er,
      amount_usd: amountUsd,
      date: form.date,
      notes: form.notes || null,
      user_id: user!.id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Documento registrado');
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('¿Eliminar?')) return;
    await supabase.from('producer_invoices').delete().eq('id', id);
    load();
  };

  // Calculate totals per producer for document logic
  const getProducerTotalUsd = (producerId: string) => {
    return invoices.filter(i => i.producer_id === producerId).reduce((s, i) => s + Number(i.amount_usd), 0);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Facturas de Productores</h1>
          <p className="text-muted-foreground">Documentos emitidos por los productores (facturas y notas de débito)</p>
        </div>
        <Button onClick={() => { setForm({ producer_id: '', document_type: 'factura', invoice_number: '', amount_clp: '', exchange_rate: '', date: new Date().toISOString().split('T')[0], notes: '' }); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />Agregar
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Productor</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>N° Doc</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Monto CLP</TableHead>
                <TableHead className="text-right">TC</TableHead>
                <TableHead className="text-right">Monto USD</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Sin documentos</TableCell></TableRow>
              ) : invoices.map(inv => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.producers?.name}</TableCell>
                  <TableCell>
                    <Badge variant={inv.document_type === 'factura' ? 'default' : 'secondary'}>
                      {inv.document_type === 'factura' ? 'Factura' : 'Nota de Débito'}
                    </Badge>
                  </TableCell>
                  <TableCell>{inv.invoice_number ?? '-'}</TableCell>
                  <TableCell>{new Date(inv.date).toLocaleDateString('es-CL')}</TableCell>
                  <TableCell className="text-right">${Number(inv.amount_clp).toLocaleString('es-CL')}</TableCell>
                  <TableCell className="text-right">{Number(inv.exchange_rate).toLocaleString('es-CL')}</TableCell>
                  <TableCell className="text-right font-semibold">USD {Number(inv.amount_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell><Button variant="ghost" size="icon" onClick={() => remove(inv.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar Documento del Productor</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Productor *</Label>
              <Select value={form.producer_id} onValueChange={v => setForm({ ...form, producer_id: v })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>{producers.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo de Documento</Label>
              <Select value={form.document_type} onValueChange={v => setForm({ ...form, document_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="factura">Factura</SelectItem>
                  <SelectItem value="nota_debito">Nota de Débito</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Si ya tiene factura inicial, usa Nota de Débito para la diferencia</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>N° Documento</Label>
                <Input value={form.invoice_number} onChange={e => setForm({ ...form, invoice_number: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Fecha</Label>
                <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Monto CLP *</Label>
                <Input type="number" value={form.amount_clp} onChange={e => setForm({ ...form, amount_clp: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Tipo de Cambio *</Label>
                <Input type="number" step="0.01" value={form.exchange_rate} onChange={e => setForm({ ...form, exchange_rate: e.target.value })} placeholder="ej: 950" />
              </div>
            </div>
            {form.amount_clp && form.exchange_rate && (
              <p className="text-sm text-muted-foreground">
                Equivalente: USD {(Number(form.amount_clp) / Number(form.exchange_rate)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            )}
            <div className="space-y-2">
              <Label>Notas</Label>
              <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>Registrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProducerInvoices;
