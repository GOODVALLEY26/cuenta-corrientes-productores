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
import { Check, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

type Producer = { id: string; name: string; drying_payment_method: string };

const InstallmentPayments = () => {
  const { user } = useAuth();
  const [producers, setProducers] = useState<Producer[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [allDryingInvoices, setAllDryingInvoices] = useState<any[]>([]);
  const [allInstallments, setAllInstallments] = useState<any[]>([]);
  const [allAdvances, setAllAdvances] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [payDialog, setPayDialog] = useState<{ open: boolean; installment: any | null }>({ open: false, installment: null });
  const [payForm, setPayForm] = useState({ exchange_rate: '', paid_date: new Date().toISOString().split('T')[0] });

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
    const [dryRes, advRes, instRes] = await Promise.all([
      supabase.from('drying_invoices').select('*, producers(name)'),
      supabase.from('advance_rates').select('*').eq('year', year).order('month'),
      supabase.from('installment_payments').select('*').eq('year', year).order('installment_number'),
    ]);
    setAllDryingInvoices(dryRes.data ?? []);
    setAllAdvances(advRes.data ?? []);
    setAllInstallments(instRes.data ?? []);
  };

  const generateInstallmentsForProducer = async (producerId: string) => {
    if (!user) return;
    const dryingInvoices = allDryingInvoices.filter(i => i.producer_id === producerId && i.installment_currency !== 'liquidacion');
    const advances = allAdvances.filter(a => a.producer_id === producerId);
    const installments = allInstallments.filter(i => i.producer_id === producerId);

    if (advances.length === 0) return;

    const { data: exRates } = await supabase.from('exchange_rates').select('*').eq('year', year);
    const totalInstallments = advances.length + 1;

    for (const inv of dryingInvoices) {
      const totalClp = Number(inv.amount_clp);
      const cuotaClp = totalClp / totalInstallments;

      for (let i = 1; i <= totalInstallments; i++) {
        const advanceMonth = i <= advances.length ? advances[i - 1].month : (advances[advances.length - 1].month + 1);
        const monthRate = exRates?.find(e => e.month === advanceMonth);
        const exchangeRate = monthRate ? Number(monthRate.rate) : null;
        const amountUsd = exchangeRate ? cuotaClp / exchangeRate : null;

        const existing = installments.find(
          inst => inst.drying_invoice_id === inv.id && inst.installment_number === i
        );

        if (!existing) {
          await supabase.from('installment_payments').upsert({
            user_id: user.id,
            producer_id: producerId,
            drying_invoice_id: inv.id,
            installment_number: i,
            amount_clp: Math.round(cuotaClp),
            exchange_rate: exchangeRate,
            amount_usd: amountUsd,
            month: advanceMonth,
            year,
            paid: false,
          }, { onConflict: 'drying_invoice_id,installment_number' });
        }
      }
    }
  };

  const generateAllInstallments = async () => {
    setLoading(true);
    try {
      const producerIds = [...new Set(allDryingInvoices.filter(i => i.installment_currency !== 'liquidacion').map(i => i.producer_id))];
      for (const pid of producerIds) {
        await generateInstallmentsForProducer(pid);
      }
      toast.success('Cuotas generadas correctamente');
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
          <Button onClick={generateAllInstallments} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Generar Cuotas
          </Button>
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
                <div className="flex gap-4 text-sm">
                  <span>Total: CLP {fmtClp(totalClp)}</span>
                  <span className="text-green-600 font-medium">Pagado: CLP {fmtClp(paidClp)}</span>
                  <span className="text-destructive font-medium">Saldo: CLP {fmtClp(saldoClp)}</span>
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
                          <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-4">Presiona "Generar Cuotas"</TableCell></TableRow>
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
