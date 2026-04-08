import { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, FileText, Upload, Eye, Loader2, FolderOpen, Copy, Info, Link2, Unlink } from 'lucide-react';
import { toast } from 'sonner';
import DriveFileBrowser from '@/components/DriveFileBrowser';

type Producer = { id: string; name: string; rut: string | null };

type DriveConnectionStatus = {
  authMode: 'oauth' | 'service_account' | 'none';
  connectedEmail: string;
  oauthConnected: boolean;
  oauthClientConfigured: boolean;
  serviceAccountConfigured: boolean;
  serviceAccountEmail?: string;
};

const STATUS_LABELS: Record<string, string> = { pendiente: 'Pendiente', pagada: 'Pagada', parcial: 'Parcial' };
const STATUS_COLORS: Record<string, string> = { pendiente: 'destructive', pagada: 'default', parcial: 'secondary' };

const DryingInvoices = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [producers, setProducers] = useState<Producer[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [driveOpen, setDriveOpen] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [driveBase64, setDriveBase64] = useState<string | null>(null);
  const [driveFileName, setDriveFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ producer_id: '', invoice_number: '', amount_clp: '', iva_clp: '', exchange_rate: '', payment_method: 'cuotas_clp' as 'cuotas_usd' | 'cuotas_clp' | 'liquidacion_final', date: new Date().toISOString().split('T')[0], notes: '' });
  const [driveStatus, setDriveStatus] = useState<DriveConnectionStatus | null>(null);
  const [driveStatusLoading, setDriveStatusLoading] = useState(false);
  const [driveStatusHint, setDriveStatusHint] = useState<string | null>(null);
  const [oauthBusy, setOauthBusy] = useState(false);

  const loadDriveStatus = useCallback(async () => {
    if (!user) return;
    setDriveStatusLoading(true);
    setDriveStatusHint(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/drive-service-account-email`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
      const data = await res.json();
      if (data.error) {
        setDriveStatus(null);
        setDriveStatusHint(data.error);
        return;
      }
      setDriveStatus({
        authMode: data.authMode ?? 'none',
        connectedEmail: data.connectedEmail ?? '',
        oauthConnected: !!data.oauthConnected,
        oauthClientConfigured: !!data.oauthClientConfigured,
        serviceAccountConfigured: !!data.serviceAccountConfigured,
        serviceAccountEmail: data.serviceAccountEmail,
      });
    } catch {
      setDriveStatus(null);
      setDriveStatusHint('No se pudo cargar el estado de Drive. ¿Están desplegadas las funciones en Supabase?');
    } finally {
      setDriveStatusLoading(false);
    }
  }, [user]);

  const load = async () => {
    const [p, i] = await Promise.all([
      supabase.from('producers').select('id, name, rut').order('name'),
      supabase.from('drying_invoices').select('*, producers(name)').order('date', { ascending: false }),
    ]);
    if (p.data) setProducers(p.data);
    if (i.data) setInvoices(i.data);
  };

  useEffect(() => { if (user) load(); }, [user]);

  useEffect(() => {
    if (user) loadDriveStatus();
  }, [user, loadDriveStatus]);

  useEffect(() => {
    const ok = searchParams.get('drive_connected');
    const err = searchParams.get('drive_error');
    if (!ok && !err) return;
    const next = new URLSearchParams(searchParams);
    if (ok) {
      toast.success('Google Drive quedó conectado con tu cuenta empresa.');
      next.delete('drive_connected');
      loadDriveStatus();
    }
    if (err) {
      toast.error(decodeURIComponent(err));
      next.delete('drive_error');
    }
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, loadDriveStatus]);

  const copyConnectedEmail = async () => {
    const em = driveStatus?.connectedEmail;
    if (!em) return;
    try {
      await navigator.clipboard.writeText(em);
      toast.success('Correo copiado');
    } catch {
      toast.error('No se pudo copiar');
    }
  };

  const startGoogleDriveOAuth = async () => {
    setOauthBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/drive-oauth-start`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      toast.error(data.error || 'No se pudo iniciar la conexión con Google');
    } catch {
      toast.error('Error al conectar con Google');
    } finally {
      setOauthBusy(false);
    }
  };

  const disconnectGoogleDrive = async () => {
    if (!confirm('¿Desconectar la cuenta de Google Drive? Podrás volver a conectar después.')) return;
    setOauthBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/drive-oauth-disconnect`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        toast.error(data.error || 'No se pudo desconectar');
        return;
      }
      toast.success('Cuenta de Drive desconectada');
      loadDriveStatus();
    } catch {
      toast.error('Error al desconectar');
    } finally {
      setOauthBusy(false);
    }
  };

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
      if (parsed.producer_name || parsed.producer_rut) {
        const rutNorm = parsed.producer_rut?.replace(/[.\s]/g, '').toLowerCase() || '';
        const match = producers.find(p => {
          if (rutNorm && p.rut) {
            return p.rut.replace(/[.\s]/g, '').toLowerCase() === rutNorm;
          }
          return parsed.producer_name && (
            p.name.toLowerCase().includes(parsed.producer_name.toLowerCase()) ||
            parsed.producer_name.toLowerCase().includes(p.name.toLowerCase())
          );
        });
        if (match) {
          producerId = match.id;
        } else if (user && parsed.producer_name) {
          const { data: newProducer, error: createErr } = await supabase
            .from('producers')
            .insert({ name: parsed.producer_name, rut: parsed.producer_rut || null, user_id: user.id })
            .select('id, name, rut')
            .single();
          if (!createErr && newProducer) {
            producerId = newProducer.id;
            setProducers(prev => [...prev, { id: newProducer.id, name: newProducer.name, rut: newProducer.rut }].sort((a, b) => a.name.localeCompare(b.name)));
            toast.info(`Productor "${newProducer.name}" creado automáticamente`);
          }
        }
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

      toast.success('Datos extraídos del PDF');
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

    const installmentCurrency = form.payment_method === 'cuotas_usd' ? 'usd' : form.payment_method === 'cuotas_clp' ? 'clp' : 'liquidacion';
    const totalInstallments = form.payment_method === 'liquidacion_final' ? 1 : 1; // will be calculated from advances when generating

    const { data, error } = await supabase.from('drying_invoices').insert({
      producer_id: form.producer_id,
      invoice_number: form.invoice_number || null,
      amount_clp: amountClp,
      iva_clp: ivaClp,
      exchange_rate: er,
      amount_usd: amountUsd,
      total_installments: totalInstallments,
      installment_currency: installmentCurrency,
      date: form.date,
      notes: form.notes || null,
      user_id: user!.id,
    } as any).select('id').single();

    if (error) { toast.error(error.message); setUploading(false); return; }

    if (data) {
      if (pdfFile) {
        const filePath = await uploadPdf(data.id);
        if (filePath) {
          await supabase.from('drying_invoices').update({ file_path: filePath } as any).eq('id', data.id);
        }
      } else if (driveBase64 && driveFileName) {
        const bytes = Uint8Array.from(atob(driveBase64), c => c.charCodeAt(0));
        const filePath = `${user!.id}/${data.id}_${driveFileName}`;
        const { error: upErr } = await supabase.storage.from('drying-invoices-files').upload(filePath, bytes, { contentType: 'application/pdf', cacheControl: '3600', upsert: true });
        if (!upErr) {
          await supabase.from('drying_invoices').update({ file_path: filePath } as any).eq('id', data.id);
        }
      }
    }

    toast.success('Factura creada');
    setPdfFile(null);
    setDriveBase64(null);
    setDriveFileName(null);
    setOpen(false);
    setUploading(false);
    load();
  };

  const handleDriveImport = async (parsed: any) => {
    let producerId = '';
    if (parsed.producer_name || parsed.producer_rut) {
      const rutNorm = parsed.producer_rut?.replace(/[.\s]/g, '').toLowerCase() || '';
      const match = producers.find(p => {
        if (rutNorm && p.rut) {
          return p.rut.replace(/[.\s]/g, '').toLowerCase() === rutNorm;
        }
        return parsed.producer_name && (
          p.name.toLowerCase().includes(parsed.producer_name.toLowerCase()) ||
          parsed.producer_name.toLowerCase().includes(p.name.toLowerCase())
        );
      });
      if (match) {
        producerId = match.id;
      } else if (user && parsed.producer_name) {
        const { data: newProducer, error: createErr } = await supabase
          .from('producers')
          .insert({ name: parsed.producer_name, rut: parsed.producer_rut || null, user_id: user.id })
          .select('id, name, rut')
          .single();
        if (!createErr && newProducer) {
          producerId = newProducer.id;
          setProducers(prev => [...prev, { id: newProducer.id, name: newProducer.name, rut: newProducer.rut }].sort((a, b) => a.name.localeCompare(b.name)));
          toast.info(`Productor "${newProducer.name}" creado automáticamente`);
        }
      }
    }

    setDriveBase64(parsed.pdf_base64 || null);
    setDriveFileName(parsed.file_name || null);

    setForm({
      producer_id: producerId,
      invoice_number: parsed.invoice_number || '',
      amount_clp: parsed.amount_net_clp ? String(parsed.amount_net_clp) : '',
      iva_clp: parsed.iva_clp ? String(parsed.iva_clp) : '',
      exchange_rate: parsed.exchange_rate ? String(parsed.exchange_rate) : '',
      payment_method: 'cuotas_clp',
      date: parsed.date || new Date().toISOString().split('T')[0],
      notes: parsed.notes || '',
    });

    toast.success('Datos extraídos — revisa y completa el formulario');
    setOpen(true);
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
        <div className="flex flex-wrap gap-2">
          {driveStatus?.oauthClientConfigured && !driveStatus.oauthConnected && (
            <Button variant="secondary" onClick={startGoogleDriveOAuth} disabled={oauthBusy}>
              <Link2 className="h-4 w-4 mr-2" />
              {oauthBusy ? 'Abriendo Google…' : 'Conectar cuenta Google (empresa)'}
            </Button>
          )}
          <Button variant="outline" onClick={() => setDriveOpen(true)}>
            <FolderOpen className="h-4 w-4 mr-2" />Importar de Drive
          </Button>
          <Button onClick={() => { setForm({ producer_id: '', invoice_number: '', amount_clp: '', iva_clp: '', exchange_rate: '', payment_method: 'cuotas_clp', date: new Date().toISOString().split('T')[0], notes: '' }); setPdfFile(null); setDriveBase64(null); setDriveFileName(null); setOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />Agregar
          </Button>
        </div>
      </div>

      {(driveStatusLoading || driveStatus || driveStatusHint) && (
        <Alert className="border-primary/30 bg-primary/5">
          <Info className="h-4 w-4" />
          <AlertTitle className="text-sm">Google Drive e importación de PDF</AlertTitle>
          <AlertDescription className="text-sm space-y-3">
            {driveStatusLoading && !driveStatus && !driveStatusHint ? (
              <p className="text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" /> Cargando…
              </p>
            ) : driveStatusHint ? (
              <p className="text-muted-foreground">{driveStatusHint}</p>
            ) : driveStatus?.authMode === 'oauth' ? (
              <>
                <p>
                  <strong>Modo recomendado (cuenta empresa).</strong> La app lee Drive usando la cuenta{' '}
                  <strong>{driveStatus.connectedEmail}</strong>. Pon los PDF en una carpeta a la que{' '}
                  <em>esa misma cuenta</em> tenga acceso (solo hace falta compartir entre personas de tu empresa, no con
                  robots).
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex flex-wrap items-center gap-2 rounded-md border bg-background px-2 py-1.5 font-mono text-xs break-all flex-1 min-w-[12rem]">
                    <span className="flex-1 min-w-0">{driveStatus.connectedEmail}</span>
                    <Button type="button" variant="secondary" size="sm" className="shrink-0 h-8" onClick={copyConnectedEmail}>
                      <Copy className="h-3.5 w-3.5 mr-1" />
                      Copiar
                    </Button>
                  </div>
                  <Button type="button" variant="outline" size="sm" className="h-8" onClick={disconnectGoogleDrive} disabled={oauthBusy}>
                    <Unlink className="h-3.5 w-3.5 mr-1" />
                    Desconectar
                  </Button>
                </div>
              </>
            ) : driveStatus?.authMode === 'service_account' && driveStatus.connectedEmail ? (
              <>
                <p>
                  <strong>Modo cuenta de servicio.</strong> Si tu empresa bloquea compartir con correos{' '}
                  <code className="text-[11px]">…gserviceaccount.com</code>, usa el botón{' '}
                  <strong>Conectar cuenta Google (empresa)</strong> arriba.
                </p>
                <p>
                  Si pueden compartir con servicio: añade este correo a la carpeta con rol <strong>Lector</strong>.
                </p>
                <div className="flex flex-wrap items-center gap-2 rounded-md border bg-background px-2 py-1.5 font-mono text-xs break-all">
                  <span className="flex-1 min-w-0">{driveStatus.connectedEmail}</span>
                  <Button type="button" variant="secondary" size="sm" className="shrink-0 h-8" onClick={copyConnectedEmail}>
                    <Copy className="h-3.5 w-3.5 mr-1" />
                    Copiar
                  </Button>
                </div>
              </>
            ) : driveStatus?.oauthClientConfigured ? (
              <p className="text-muted-foreground">
                Pulsa <strong>Conectar cuenta Google (empresa)</strong> e inicia sesión con el usuario de Goodvalley que debe
                ver la carpeta de facturas (por ejemplo <code className="text-xs">secado-pdfs@tu-dominio.com</code>). Luego
                comparte la carpeta solo con correos internos como siempre.
              </p>
            ) : (
              <p className="text-muted-foreground">
                Para usar Drive, un administrador debe configurar en Supabase los secretos OAuth de Google y desplegar las
                funciones <code className="text-xs">drive-oauth-start</code> y <code className="text-xs">drive-oauth-callback</code>,
                o bien dejar configurada la cuenta de servicio en <code className="text-xs">google_sa_b64</code>.
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}

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
                <TableHead>Método Pago</TableHead>
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
                  <TableCell>
                    <Badge variant="outline">
                      {inv.installment_currency === 'usd' ? 'Cuotas USD' : inv.installment_currency === 'liquidacion' ? 'Liquidación' : 'Cuotas CLP'}
                    </Badge>
                  </TableCell>
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
                <Label>Método de Pago Secado</Label>
                <Select value={form.payment_method} onValueChange={(v: any) => setForm({ ...form, payment_method: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cuotas_clp">Cuotas en CLP</SelectItem>
                    <SelectItem value="cuotas_usd">Cuotas en USD</SelectItem>
                    <SelectItem value="liquidacion_final">Liquidación Final</SelectItem>
                  </SelectContent>
                </Select>
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

      <DriveFileBrowser
        open={driveOpen}
        onOpenChange={setDriveOpen}
        onInvoiceImported={handleDriveImport}
      />
    </div>
  );
};

export default DryingInvoices;
