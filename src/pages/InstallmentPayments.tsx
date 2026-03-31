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
  const [selectedProducer, setSelectedProducer] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [dryingInvoices, setDryingInvoices] = useState<any[]>([]);
  const [installments, setInstallments] = useState<any[]>([]);
  const [advances, setAdvances] = useState<any[]>([]);
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
    if (!selectedProducer || !user) return;
    loadData();
  }, [selectedProducer, year, user]);

  const loadData = async () => {
    const [dryRes, advRes, instRes] = await Promise.all([
      supabase.from('drying_invoices').select('*').eq('producer_id', selectedProducer),
      supabase.from('advance_rates').select('*').eq('producer_id', selectedProducer).eq('year', year).order('month'),
      supabase.from('installment_payments').select('*').eq('producer_id', selectedProducer).eq('year', year).order('installment_number'),
    ]);
    setDryingInvoices(dryRes.data ?? []);
    setAdvances(advRes.data ?? []);
    setInstallments(instRes.data ?? []);
  };

  const generateInstallments = async () => {
    if (!user || !selectedProducer) return;
    setLoading(true);
    try {
      const numAdvances = advances.length;
      if (numAdvances === 0) {
        toast.error('No hay anticipos configurados para este año');
        setLoading(false);
        return;
      }

      const totalInstallments = numAdvances + 1;

      // Get exchange rates for the year
      const { data: exRates } = await supabase.from('exchange_rates').select('*').eq('year', year);

      for (const inv of dryingInvoices) {
        const totalClp = Number(inv.amount_clp);
        const cuotaClp = totalClp / totalInstallments;
        const currency = (inv as any).installment_currency || 'clp';

        for (let i = 1; i <= totalInstallments; i++) {
          // Map installment to advance month (installment 1 = first advance month, last installment = month after last advance)
          const advanceMonth = i <= numAdvances ? advances[i - 1].month : (advances[numAdvances - 1].month + 1);

          // Find exchange rate for this month
          const monthRate = exRates?.find(e => e.month === advanceMonth);
          const exchangeRate = monthRate ? Number(monthRate.rate) : null;
          const amountUsd = exchangeRate ? cuotaClp / exchangeRate : null;

          // Check if already exists
          const existing = installments.find(
            inst => inst.drying_invoice_id === inv.id && inst.installment_number === i
          );

          if (!existing) {
            await supabase.from('installment_payments').upsert({
              user_id: user.id,
              producer_id: selectedProducer,
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

      toast.success('Cuotas generadas correctamente');
      loadData();
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

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Cuota marcada como pagada');
    setPayDialog({ open: false, installment: null });
    loadData();
  };

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtClp = (n: number) => Math.round(n).toLocaleString('es-CL');

  // Group installments by drying invoice
  const groupedByInvoice = dryingInvoices.map(inv => {
    const invInstallments = installments.filter(i => i.drying_invoice_id === inv.id).sort((a, b) => a.installment_number - b.installment_number);
    const totalClp = Number(inv.amount_clp);
    const paidClp = invInstallments.filter(i => i.paid).reduce((s, i) => s + Number(i.amount_clp), 0);
    const paidUsd = invInstallments.filter(i => i.paid && i.amount_usd).reduce((s, i) => s + Number(i.amount_usd), 0);
    return { invoice: inv, installments: invInstallments, totalClp, paidClp, paidUsd, saldoClp: totalClp - paidClp };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Pago Cuotas Secado</h1>
          <p className="text-muted-foreground">Gestiona el pago de cuotas de secado por productor. Total se divide en anticipos + 1.</p>
        </div>
        <div className="flex gap-2">
          <Select value={selectedProducer} onValueChange={setSelectedProducer}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Seleccionar productor..." /></SelectTrigger>
            <SelectContent>{producers.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{[2024,2025,2026,2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
          {selectedProducer && (
            <Button onClick={generateInstallments} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Generar Cuotas
            </Button>
          )}
        </div>
      </div>

      {!selectedProducer ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Selecciona un productor con método de pago "Cuotas"</CardContent></Card>
      ) : groupedByInvoice.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No hay facturas de secado para este productor</CardContent></Card>
      ) : (
        groupedByInvoice.map(({ invoice, installments: insts, totalClp, paidClp, paidUsd, saldoClp }) => (
          <Card key={invoice.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  Factura {invoice.invoice_number || 'S/N'} — CLP {fmtClp(totalClp)}
                </CardTitle>
                <div className="flex gap-4 text-sm">
                  <span className="text-green-600 font-medium">Pagado: CLP {fmtClp(paidClp)}</span>
                  <span className="text-destructive font-medium">Saldo: CLP {fmtClp(saldoClp)}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
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
                  {insts.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Presiona "Generar Cuotas" para crear las cuotas</TableCell></TableRow>
                  ) : insts.map(inst => (
                    <TableRow key={inst.id}>
                      <TableCell className="font-medium">{inst.installment_number}/{insts.length}</TableCell>
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
                  {insts.length > 0 && (
                    <TableRow className="font-bold bg-muted/50">
                      <TableCell colSpan={2}>TOTAL</TableCell>
                      <TableCell className="text-right">CLP {fmtClp(totalClp)}</TableCell>
                      <TableCell></TableCell>
                      <TableCell className="text-right">{paidUsd > 0 ? `USD ${fmt(paidUsd)}` : '-'}</TableCell>
                      <TableCell className="text-center">
                        <span className="text-green-600">{insts.filter(i => i.paid).length}/{insts.length}</span>
                      </TableCell>
                      <TableCell colSpan={2}></TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
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
