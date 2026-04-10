import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Check, RefreshCw, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

type Producer = { id: string; name: string; drying_payment_method: string };

const InstallmentPayments = () => {
  const { user } = useAuth();
  const [producers, setProducers] = useState<Producer[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [allDryingInvoices, setAllDryingInvoices] = useState<any[]>([]);
  const [allInstallments, setAllInstallments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [payDialog, setPayDialog] = useState<{ open: boolean; installment: any | null }>({ open: false, installment: null });
  const [payForm, setPayForm] = useState({ exchange_rate: '', paid_date: new Date().toISOString().split('T')[0] });

  // Generate dialog state
  const [genDialog, setGenDialog] = useState<{ open: boolean; producerId: string | null }>({ open: false, producerId: null });
  const [selectedMonths, setSelectedMonths] = useState<number[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase.from('producers').select('id, name, drying_payment_method').order('name').then(({ data }) => {
      if (data) setProducers(data);
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [year, user]);

  const loadData = async () => {
    const [dryRes, instRes] = await Promise.all([
      supabase.from('drying_invoices').select('*, producers(name)'),
      supabase.from('installment_payments').select('*').eq('year', year).order('installment_number'),
    ]);
    setAllDryingInvoices(dryRes.data ?? []);
    setAllInstallments(instRes.data ?? []);
  };

  const openGenerateDialog = (producerId: string) => {
    // Pre-select months that already have installments for this producer
    const existingMonths = allInstallments
      .filter(i => i.producer_id === producerId)
      .map(i => i.month as number)
      .filter((v, idx, arr) => arr.indexOf(v) === idx);
    setSelectedMonths(existingMonths);
    setGenDialog({ open: true, producerId });
  };

  const toggleMonth = (month: number) => {
    setSelectedMonths(prev =>
      prev.includes(month) ? prev.filter(m => m !== month) : [...prev, month].sort((a, b) => a - b)
    );
  };

  const generateInstallmentsForProducer = async () => {
    if (!user || !genDialog.producerId || selectedMonths.length === 0) return;
    setLoading(true);
    try {
      const producerId = genDialog.producerId;
      const dryingInvoices = allDryingInvoices.filter(i => i.producer_id === producerId && i.installment_currency !== 'liquidacion');
      const existingInstallments = allInstallments.filter(i => i.producer_id === producerId);

      if (dryingInvoices.length === 0) {
        toast.error('No hay facturas de secado para este productor');
        return;
      }

      const { data: exRates } = await supabase.from('exchange_rates').select('*').eq('year', year);
      const totalInstallments = selectedMonths.length;

      for (const inv of dryingInvoices) {
        const totalClp = Number(inv.amount_clp);
        const cuotaClp = totalClp / totalInstallments;

        for (let i = 0; i < totalInstallments; i++) {
          const month = selectedMonths[i];
          const installmentNumber = i + 1;
          const monthRate = exRates?.find(e => e.month === month);
          const exchangeRate = monthRate ? Number(monthRate.rate) : null;
          const amountUsd = exchangeRate ? cuotaClp / exchangeRate : null;

          const existing = existingInstallments.find(
            inst => inst.drying_invoice_id === inv.id && inst.installment_number === installmentNumber
          );

          if (!existing) {
            await supabase.from('installment_payments').upsert({
              user_id: user.id,
              producer_id: producerId,
              drying_invoice_id: inv.id,
              installment_number: installmentNumber,
              amount_clp: Math.round(cuotaClp),
              exchange_rate: exchangeRate,
              amount_usd: amountUsd,
              month,
              year,
              paid: false,
            }, { onConflict: 'drying_invoice_id,installment_number' });
          }
        }
      }

      toast.success(`${totalInstallments} cuotas generadas correctamente`);
      setGenDialog({ open: false, producerId: null });
      await loadData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const markAsPaid = async () => {
    if (!payDialog.installment) return;
    const inst = payDialog.installment;
    const exchangeRate = Number(payForm.exchange_rate) || inst.exchange_rate;
    const amountUsd = exchangeRate ? inst.amount_clp / exchangeRate : null;

    const { error } = await supabase.from('installment_payments')
      .update({
        paid: true,
        paid_date: payForm.paid_date,
        exchange_rate: exchangeRate,
        amount_usd: amountUsd,
      } as any)
      .eq('id', inst.id);

    if (error) { toast.error(error.message); return; }
    toast.success('Cuota marcada como pagada');
    setPayDialog({ open: false, installment: null });
    loadData();
  };

  const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtClp = (n: number | null | undefined) => Math.round(n ?? 0).toLocaleString('es-CL');

  // Group by producer
  const producersWithInvoices = producers
    .map(producer => {
      const invoices = allDryingInvoices.filter(i => i.producer_id === producer.id && i.installment_currency !== 'liquidacion');
      if (invoices.length === 0) return null;
      const installments = allInstallments.filter(i => i.producer_id === producer.id);
      const totalClp = invoices.reduce((s, i) => s + Number(i.amount_clp), 0);
      const paidClp = installments.filter(i => i.paid).reduce((s, i) => s + Number(i.amount_clp), 0);
      const paidUsd = installments.filter(i => i.paid && i.amount_usd).reduce((s, i) => s + Number(i.amount_usd), 0);
      const currency = invoices[0]?.installment_currency || 'clp';
      return { producer, invoices, installments, totalClp, paidClp, paidUsd, saldoClp: totalClp - paidClp, currency };
    })
    .filter(Boolean) as any[];

  const deleteInstallmentsForProducer = async (producerId: string) => {
    if (!confirm('¿Estás seguro de que quieres borrar todas las cuotas de este productor?')) return;
    const { error } = await supabase.from('installment_payments').delete().eq('producer_id', producerId).eq('year', year);
    if (error) { toast.error(error.message); return; }
    toast.success('Cuotas eliminadas');
    loadData();
  };

  const selectedProducer = producers.find(p => p.id === genDialog.producerId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Pago Cuotas Secado</h1>
          <p className="text-muted-foreground">Vista general de cuotas de secado por productor</p>
        </div>
        <div className="flex gap-2">
          <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{[2024,2025,2026,2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {producersWithInvoices.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No hay facturas de secado con cuotas registradas</CardContent></Card>
      ) : (
        producersWithInvoices.map(({ producer, invoices, installments: insts, totalClp, paidClp, paidUsd, saldoClp, currency }) => (
          <Card key={producer.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  {producer.name}
                  <Badge variant="outline" className="text-xs">
                    {currency === 'usd' ? 'Cuotas USD' : 'Cuotas CLP'}
                  </Badge>
                </CardTitle>
                <div className="flex gap-4 text-sm items-center">
                  <span>Total: CLP {fmtClp(totalClp)}</span>
                  <span className="text-green-600 font-medium">Pagado: CLP {fmtClp(paidClp)}</span>
                  <span className="text-destructive font-medium">Saldo: CLP {fmtClp(saldoClp)}</span>
                  <Button size="sm" variant="outline" onClick={() => openGenerateDialog(producer.id)}>
                    <Plus className="h-3 w-3 mr-1" /> Generar Cuotas
                  </Button>
                  {insts.length > 0 && (
                    <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => deleteInstallmentsForProducer(producer.id)}>
                      <Trash2 className="h-3 w-3 mr-1" /> Borrar Cuotas
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {invoices.map((inv: any) => {
                const invInsts = insts.filter((i: any) => i.drying_invoice_id === inv.id).sort((a: any, b: any) => a.installment_number - b.installment_number);
                return (
                  <div key={inv.id}>
                    <div className="px-4 py-2 bg-muted/30 text-sm font-medium border-b">
                      Factura {inv.invoice_number || 'S/N'} — CLP {fmtClp(Number(inv.amount_clp))}
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Cuota</TableHead>
                          <TableHead>Mes</TableHead>
                          <TableHead className="text-right">Monto CLP</TableHead>
                          <TableHead className="text-right">TC</TableHead>
                          <TableHead className="text-right">Monto USD</TableHead>
                          <TableHead className="text-center">Estado</TableHead>
                          <TableHead>Fecha Pago</TableHead>
                          <TableHead className="w-24"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invInsts.length === 0 ? (
                          <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-4">Presiona "Generar Cuotas" para crear las cuotas</TableCell></TableRow>
                        ) : invInsts.map((inst: any) => (
                          <TableRow key={inst.id}>
                            <TableCell className="font-medium">{inst.installment_number}/{invInsts.length}</TableCell>
                            <TableCell>{inst.month && inst.month <= 12 ? MONTHS[inst.month - 1] : `Mes ${inst.month}`}</TableCell>
                            <TableCell className="text-right">CLP {fmtClp(Number(inst.amount_clp))}</TableCell>
                            <TableCell className="text-right">{inst.exchange_rate ? `$${Number(inst.exchange_rate).toLocaleString('es-CL')}` : '-'}</TableCell>
                            <TableCell className="text-right">{inst.amount_usd ? `USD ${fmt(Number(inst.amount_usd))}` : '-'}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant={inst.paid ? 'default' : 'outline'} className={inst.paid ? 'bg-green-600' : ''}>
                                {inst.paid ? 'Pagado' : 'Pendiente'}
                              </Badge>
                            </TableCell>
                            <TableCell>{inst.paid_date ? new Date(inst.paid_date).toLocaleDateString('es-CL') : '-'}</TableCell>
                            <TableCell>
                              {!inst.paid && (
                                <Button size="sm" variant="outline" onClick={() => {
                                  setPayForm({
                                    exchange_rate: inst.exchange_rate ? String(inst.exchange_rate) : '',
                                    paid_date: new Date().toISOString().split('T')[0],
                                  });
                                  setPayDialog({ open: true, installment: inst });
                                }}>
                                  <Check className="h-3 w-3 mr-1" /> Pagar
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))
      )}

      {/* Generate installments dialog */}
      <Dialog open={genDialog.open} onOpenChange={o => setGenDialog({ open: o, producerId: genDialog.producerId })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Generar Cuotas — {selectedProducer?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Selecciona los meses en que se pagarán las cuotas. El monto total se dividirá en partes iguales.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {MONTHS.map((name, idx) => {
                const month = idx + 1;
                const isSelected = selectedMonths.includes(month);
                return (
                  <label
                    key={month}
                    className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-colors ${
                      isSelected ? 'bg-primary/10 border-primary' : 'hover:bg-muted'
                    }`}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleMonth(month)}
                    />
                    <span className="text-sm">{name}</span>
                  </label>
                );
              })}
            </div>
            {selectedMonths.length > 0 && (
              <p className="text-sm font-medium">
                {selectedMonths.length} cuota{selectedMonths.length !== 1 ? 's' : ''} seleccionada{selectedMonths.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenDialog({ open: false, producerId: null })}>Cancelar</Button>
            <Button onClick={generateInstallmentsForProducer} disabled={loading || selectedMonths.length === 0}>
              {loading && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
              Generar {selectedMonths.length} Cuota{selectedMonths.length !== 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pay dialog */}
      <Dialog open={payDialog.open} onOpenChange={o => setPayDialog({ open: o, installment: payDialog.installment })}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar Pago de Cuota</DialogTitle></DialogHeader>
          {payDialog.installment && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Cuota {payDialog.installment.installment_number} — CLP {fmtClp(Number(payDialog.installment.amount_clp))}
              </p>
              <div className="space-y-2">
                <Label>Tipo de Cambio (CLP/USD) del último día del mes</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={payForm.exchange_rate}
                  onChange={e => setPayForm({ ...payForm, exchange_rate: e.target.value })}
                  placeholder="ej: 980"
                />
                {payForm.exchange_rate && (
                  <p className="text-sm text-muted-foreground">
                    Equivale a USD {fmt(Number(payDialog.installment.amount_clp) / Number(payForm.exchange_rate))}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Fecha de Pago</Label>
                <Input
                  type="date"
                  value={payForm.paid_date}
                  onChange={e => setPayForm({ ...payForm, paid_date: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialog({ open: false, installment: null })}>Cancelar</Button>
            <Button onClick={markAsPaid}>Confirmar Pago</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InstallmentPayments;
