import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Download, Plus, Trash2 } from 'lucide-react';
import { generateProducerPdf } from '@/lib/generateProducerPdf';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

const MONTHS_FULL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const SPECIAL_PRODUCER_MATCH = 'casablanca';

type Producer = { id: string; name: string; drying_payment_method: string; rut?: string };

const ProducerAccount = () => {
  const { user } = useAuth();
  const [producers, setProducers] = useState<Producer[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<any>(null);
  const [docTcOverride, setDocTcOverride] = useState<string>('');
  const [docUsdOverride, setDocUsdOverride] = useState<string>('');
  const [docDateOverride, setDocDateOverride] = useState<string>('');
  const [editingTcId, setEditingTcId] = useState<string | null>(null);
  const [tcEditValue, setTcEditValue] = useState<string>('');
  const [editingExRateId, setEditingExRateId] = useState<string | null>(null);
  const [exRateEditValue, setExRateEditValue] = useState<string>('');
  const [addOpen, setAddOpen] = useState(false);
  const [newAdvMonth, setNewAdvMonth] = useState<number>(new Date().getMonth() + 1);
  const [newAdvCents, setNewAdvCents] = useState<string>('');
  const [newAdvTc, setNewAdvTc] = useState<string>('');

  useEffect(() => {
    if (!user) return;
    supabase.from('producers').select('id, name, drying_payment_method, rut').order('name').then(({ data }) => {
      if (data) setProducers(data);
    });
  }, [user]);

  useEffect(() => {
    if (!selectedId || !user) { setData(null); return; }
    loadData();
  }, [selectedId, year, user]);

  const loadData = async () => {
    const [ratesRes, kgRes, prodInvRes, dryInvRes, exRatesRes, instPayRes, ivaPayRes] = await Promise.all([
      supabase.from('advance_rates').select('*').eq('producer_id', selectedId).eq('year', year),
      supabase.from('dry_kg_reports').select('dry_kg').eq('producer_id', selectedId),
      supabase.from('producer_invoices').select('*').eq('producer_id', selectedId),
      supabase.from('drying_invoices').select('*').eq('producer_id', selectedId),
      supabase.from('exchange_rates').select('*').eq('year', year).order('created_at', { ascending: false }),
      supabase.from('installment_payments').select('*').eq('producer_id', selectedId).eq('year', year).order('installment_number'),
      supabase.from('iva_payments').select('*').eq('producer_id', selectedId).order('payment_date', { ascending: false }),
    ]);

    const rates = ratesRes.data ?? [];
    const dryKg = kgRes.data?.[0]?.dry_kg ?? 0;
    const prodInvoices = prodInvRes.data ?? [];
    const dryInvoices = dryInvRes.data ?? [];
    const exRates = exRatesRes.data ?? [];
    const installmentPayments = instPayRes.data ?? [];
    const ivaPaymentsList = ivaPayRes.data ?? [];
    const producer = producers.find(p => p.id === selectedId)!;

    const totalInvoicedUsd = prodInvoices.reduce((s, i) => {
      const amount = Number(i.amount_usd);
      return i.document_type === 'nota_credito' ? s - amount : s + amount;
    }, 0);
    const totalInvoicedClp = prodInvoices.reduce((s, i) => {
      const amount = Number(i.amount_clp);
      return i.document_type === 'nota_credito' ? s - amount : s + amount;
    }, 0);

    const advances = rates.map(r => {
      const advance = (Number(dryKg) * Number(r.cents_per_kg)) / 100;
      const netClp = (r as any).net_clp ? Number((r as any).net_clp) : null;
      const exchangeRate = (r as any).exchange_rate ? Number((r as any).exchange_rate) : null;
      return {
        id: r.id,
        month: r.month,
        centsPerKg: r.cents_per_kg,
        advance,
        paid: r.paid,
        paidDate: (r as any).paid_date,
        netClp,
        exchangeRate,
      };
    }).sort((a, b) => a.month - b.month);

    const totalAdvances = advances.reduce((s, a) => s + a.advance, 0);
    const paidAdvances = advances.filter(a => a.paid).reduce((s, a) => s + a.advance, 0);
    const nextAdvance = advances.find(a => !a.paid);

    const totalDryingUsd = dryInvoices.reduce((s, i) => s + Number(i.amount_usd ?? 0), 0);
    const totalDryingClp = dryInvoices.reduce((s, i) => s + Number(i.amount_clp), 0);

    const method = producer.drying_payment_method;
    // For "pago_clp" producers, the real installments live in installment_payments.
    // Use the next pending installment as the "Cuota a depositar"; fall back to
    // dividing by (advances + 1) only if no installment entries exist yet.
    const sortedInstallments = [...installmentPayments].sort((a: any, b: any) => {
      const ma = a.month ?? 0, mb = b.month ?? 0;
      if (ma !== mb) return ma - mb;
      return (a.installment_number ?? 0) - (b.installment_number ?? 0);
    });
    const nextPendingInstallment = sortedInstallments.find((p: any) => !p.paid);
    let cuotaClp = 0;
    if (installmentPayments.length > 0) {
      cuotaClp = nextPendingInstallment
        ? Number(nextPendingInstallment.amount_clp)
        : Number(sortedInstallments[sortedInstallments.length - 1].amount_clp);
    } else {
      const numInstallments = advances.length + 1;
      cuotaClp = numInstallments > 0 ? totalDryingClp / numInstallments : 0;
    }

    let cuotaTotalPaidClp = installmentPayments.filter((p: any) => p.paid).reduce((s: number, p: any) => s + Number(p.amount_clp), 0);
    let cuotaTotalPaidUsd = installmentPayments.filter((p: any) => p.paid && p.amount_usd).reduce((s: number, p: any) => s + Number(p.amount_usd), 0);
    const cuotaDetails = installmentPayments;

    const lastProdInvoice = [...prodInvoices].sort((a, b) => b.date.localeCompare(a.date))[0];
    const fallbackExRate = lastProdInvoice ? Number(lastProdInvoice.exchange_rate) : null;
    const targetMonth = advances.find(a => !a.paid)?.month
      ?? [...advances].sort((a, b) => b.month - a.month)[0]?.month
      ?? 0;
    // exRates already ordered by created_at desc → find returns latest registered
    const nextMonthEx = exRates.find(e => e.month === targetMonth)
      ?? exRates[0]; // fallback: latest TC of any month in year
    const docExRate = nextMonthEx ? Number(nextMonthEx.rate) : fallbackExRate;

    const discountByMonth: Record<number, number> = {};
    // Use per-installment computation whenever installment_payments entries exist
    // (regardless of installment_currency). This covers both USD cuotas and CLP cuotas
    // entered manually for descuento_usd producers.
    const hasInstallmentEntries = installmentPayments.length > 0;
    const hasCuotasUsd = hasInstallmentEntries;

    const cuotaTcByMonth: Record<number, number | null> = {};
    const cuotaClpByMonth: Record<number, number> = {};
    const cuotaUsdByMonth: Record<number, number> = {};

    if (hasInstallmentEntries) {
      for (const adv of advances) {
        const monthInsts = installmentPayments.filter((p: any) => p.month === adv.month);
        if (monthInsts.length === 0) {
          discountByMonth[adv.month] = 0;
          cuotaTcByMonth[adv.month] = null;
          cuotaClpByMonth[adv.month] = 0;
          cuotaUsdByMonth[adv.month] = 0;
          continue;
        }
        const paidInsts = monthInsts.filter((p: any) => p.paid && p.amount_usd);
        if (paidInsts.length > 0) {
          const totalPaidUsd = paidInsts.reduce((s: number, p: any) => s + Number(p.amount_usd), 0);
          const totalPaidClp = paidInsts.reduce((s: number, p: any) => s + Number(p.amount_clp), 0);
          discountByMonth[adv.month] = totalPaidUsd;
          cuotaTcByMonth[adv.month] = paidInsts[0].exchange_rate ? Number(paidInsts[0].exchange_rate) : null;
          cuotaClpByMonth[adv.month] = totalPaidClp;
          cuotaUsdByMonth[adv.month] = totalPaidUsd;
        } else {
          const totalInstClp = monthInsts.reduce((s: number, p: any) => s + Number(p.amount_clp), 0);
          // Prefer the TC manually set on the installment(s) themselves; fall back to monthly exchange_rates.
          const instWithTc = monthInsts.find((p: any) => p.exchange_rate);
          const tcSource = instWithTc
            ? Number(instWithTc.exchange_rate)
            : (exRates.find(e => e.month === adv.month)?.rate ? Number(exRates.find(e => e.month === adv.month)!.rate) : null);
          if (tcSource) {
            const tc = tcSource;
            const usdAmount = totalInstClp / tc;
            discountByMonth[adv.month] = usdAmount;
            cuotaTcByMonth[adv.month] = tc;
            cuotaClpByMonth[adv.month] = totalInstClp;
            cuotaUsdByMonth[adv.month] = usdAmount;
          } else {
            discountByMonth[adv.month] = 0;
            cuotaTcByMonth[adv.month] = null;
            cuotaClpByMonth[adv.month] = totalInstClp;
            cuotaUsdByMonth[adv.month] = 0;
          }
        }
      }
    } else if (method === 'descuento_usd') {
      const discountTotal = dryInvoices.reduce((s, inv) => {
        const installments = inv.total_installments ?? 1;
        if (installments > 0 && inv.amount_usd) {
          return s + Number(inv.amount_usd) / installments;
        }
        return s;
      }, 0);
      for (const adv of advances) {
        discountByMonth[adv.month] = discountTotal;
      }
    }

    // For descuento_usd flow (no installment_payments table entries), the drying gets
    // paid implicitly when an advance is marked as paid. Add those discounts here.
    if (method === 'descuento_usd' && !hasCuotasUsd) {
      const rateMap = new Map(rates.map((r: any) => [r.month, r]));
      for (const a of advances) {
        if (!a.paid) continue;
        const discUsd = discountByMonth[a.month] ?? 0;
        if (discUsd <= 0) continue;
        const r: any = rateMap.get(a.month);
        const tc = r?.exchange_rate
          ? Number(r.exchange_rate)
          : (exRates.find(e => e.month === a.month)?.rate ?? null);
        cuotaTotalPaidUsd += discUsd;
        if (tc) cuotaTotalPaidClp += discUsd * Number(tc);
      }
    }

    const cuotaSaldoClp = totalDryingClp - cuotaTotalPaidClp;

    const nextPaymentGross = nextAdvance?.advance ?? 0;
    const nextDiscount = nextAdvance ? (discountByMonth[nextAdvance.month] ?? 0) : 0;
    const nextPaymentNet = nextPaymentGross - nextDiscount;

    const alreadyInvoiced = totalInvoicedUsd;
    const hasInitialInvoice = prodInvoices.some(i => i.document_type === 'factura');
    const docType = hasInitialInvoice ? 'Nota de Débito' : 'Factura';

    const isSpecialProd = !!producer?.name?.toLowerCase().includes(SPECIAL_PRODUCER_MATCH);
    const advanceUsdFor = (a: any) => {
      if (!isSpecialProd) return a.advance;
      const disc = discountByMonth[a.month] ?? 0;
      const netSp = (a.netClp && a.exchangeRate) ? a.netClp / a.exchangeRate : 0;
      return netSp + disc;
    };
    const cumulativeAdvancesToNext = advances
      .filter(a => a.month <= (nextAdvance?.month ?? 12))
      .reduce((s, a) => s + advanceUsdFor(a), 0);
    const docNeededUsd = Math.max(0, cumulativeAdvancesToNext - alreadyInvoiced);

    const ivaSecado = dryInvoices.reduce((s, i) => s + Number(i.iva_clp ?? 0), 0);
    const ivaFacturado = prodInvoices.reduce((s, i) => s + Number(i.iva_clp ?? 0), 0);
    const docMontoCLP = docExRate ? docNeededUsd * docExRate : 0;
    const ivaDocRequerido = docNeededUsd > 0 ? docMontoCLP * 0.19 : 0;
    const ivaProductor = ivaFacturado + ivaDocRequerido;
    const ivaSaldo = ivaSecado - ivaProductor;
    const ivaPagado = ivaPaymentsList.reduce((s: number, p: any) => s + Number(p.amount_clp ?? 0), 0);

    setData({
      year,
      dryKg,
      totalInvoicedUsd,
      totalInvoicedClp,
      advances,
      totalAdvances,
      paidAdvances,
      nextAdvance,
      totalDryingUsd,
      totalDryingClp,
      discountByMonth,
      nextDiscount,
      nextPaymentGross,
      nextPaymentNet,
      method,
      needsDocument: docNeededUsd > 0,
      docType,
      docNeededUsd,
      nextMonthEx,
      docExRate,
      ivaSaldo,
      ivaSecado,
      ivaProductor,
      ivaPagado,
      ivaPayments: ivaPaymentsList,
      producer,
      cuotaClp,
      cuotaTotalPaidClp,
      cuotaTotalPaidUsd,
      cuotaSaldoClp,
      cuotaDetails,
      hasCuotasUsd,
      cuotaTcByMonth,
      cuotaClpByMonth,
      cuotaUsdByMonth,
      prodInvoices,
    });
    setDocTcOverride('');
    setDocUsdOverride('');
    setDocDateOverride('');
  };

  const fmt = (n: number | undefined | null) => Math.round(n ?? 0).toLocaleString('en-US');
  const fmtDec = (n: number | undefined | null, decimals = 2) => (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const fmtClp = (n: number | undefined | null) => Math.round(n ?? 0).toLocaleString('es-CL');

  const effectiveTc = data ? (docTcOverride !== '' ? Number(docTcOverride) : data.docExRate) : null;
  const effectiveDocUsd = data ? (docUsdOverride !== '' ? Number(docUsdOverride) : data.docNeededUsd) : 0;

  const selectedProducer = producers.find(p => p.id === selectedId);
  const isSpecial = !!selectedProducer?.name?.toLowerCase().includes(SPECIAL_PRODUCER_MATCH);

  const saveNetClp = async (advanceId: string) => {
    const val = tcEditValue === '' ? null : Number(tcEditValue);
    if (val !== null && isNaN(val)) { toast.error('Valor inválido'); return; }
    const { error } = await supabase
      .from('advance_rates')
      .update({ net_clp: val } as any)
      .eq('id', advanceId);
    if (error) { toast.error('Error al guardar Neto CLP'); return; }
    setEditingTcId(null);
    setTcEditValue('');
    loadData();
  };

  const saveExchangeRate = async (advanceId: string) => {
    const val = exRateEditValue === '' ? null : Number(exRateEditValue);
    if (val !== null && isNaN(val)) { toast.error('Valor inválido'); return; }
    const { error } = await supabase
      .from('advance_rates')
      .update({ exchange_rate: val } as any)
      .eq('id', advanceId);
    if (error) { toast.error('Error al guardar TC'); return; }
    setEditingExRateId(null);
    setExRateEditValue('');
    loadData();
  };

  const addAdvance = async () => {
    const cents = Number(newAdvCents);
    if (!cents || isNaN(cents)) { toast.error('Ingresa ¢/kg'); return; }
    const netClp = newAdvTc === '' ? null : Number(newAdvTc);
    const { error } = await supabase.from('advance_rates').insert({
      producer_id: selectedId,
      year,
      month: newAdvMonth,
      cents_per_kg: cents,
      user_id: user!.id,
      net_clp: netClp,
    } as any);
    if (error) { toast.error('Error al agregar anticipo'); return; }
    setAddOpen(false);
    setNewAdvCents('');
    setNewAdvTc('');
    loadData();
  };

  const deleteAdvance = async (id: string) => {
    if (!confirm('¿Eliminar este anticipo?')) return;
    const { error } = await supabase.from('advance_rates').delete().eq('id', id);
    if (error) { toast.error('Error al eliminar'); return; }
    loadData();
  };

  const setPaidDate = async (id: string, date: string) => {
    const payload: any = date
      ? { paid: true, paid_date: date }
      : { paid: false, paid_date: null };
    const { error } = await supabase.from('advance_rates').update(payload).eq('id', id);
    if (error) { toast.error('Error al guardar fecha'); return; }
    loadData();
  };

  const buildPdfData = () => {
    if (!data) return null;
    const tc = effectiveTc;
    const usd = effectiveDocUsd;
    return {
      ...data,
      docExRate: tc,
      docNeededUsd: usd,
      needsDocument: usd > 0,
      docDate: docDateOverride || null,
      isSpecial,
      ivaPagado: data.ivaPagado,
      ivaPayments: data.ivaPayments,
    };
  };

  const methodLabel: Record<string, string> = {
    descuento_usd: 'Descuento en USD',
    pago_clp: 'Pago en CLP',
    liquidacion_fin_año: 'Liquidación fin de año',
    cuotas: 'Cuotas',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Cuenta Corriente Productor</h1>
          <p className="text-muted-foreground">Resumen completo de la relación comercial con cada productor</p>
        </div>
        <div className="flex gap-2">
          {data && (
            <Button variant="outline" onClick={async () => await generateProducerPdf(buildPdfData())}>
              <Download className="h-4 w-4 mr-1" /> Descargar PDF
            </Button>
          )}
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Seleccionar productor..." /></SelectTrigger>
            <SelectContent>{producers.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{[2024,2025,2026,2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {!data ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Selecciona un productor para ver su cuenta corriente</CardContent></Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Facturación total */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Facturación Total</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">Kilos deshidratados totales</TableCell>
                    <TableCell className="text-right font-bold text-primary">
                      {Number(data.dryKg).toLocaleString('es-CL', { maximumFractionDigits: 2 })} kg
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Total Facturado USD</TableCell>
                    <TableCell className="text-right font-bold">USD {fmt(data.totalInvoicedUsd)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Total Facturado CLP</TableCell>
                    <TableCell className="text-right">CLP {fmtClp(data.totalInvoicedClp)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Secado */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Secado</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">Total Secado CLP</TableCell>
                    <TableCell className="text-right font-bold">CLP {fmtClp(data.totalDryingClp)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium text-green-700">Total Pagado CLP</TableCell>
                    <TableCell className="text-right text-green-700 font-bold">CLP {fmtClp(data.cuotaTotalPaidClp)}</TableCell>
                  </TableRow>
                  <TableRow className="bg-muted/50">
                    <TableCell className="font-bold">Saldo CLP</TableCell>
                    <TableCell className={`text-right font-bold ${data.cuotaSaldoClp > 0 ? 'text-destructive' : 'text-green-700'}`}>
                      CLP {fmtClp(data.cuotaSaldoClp)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Método pago</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline">{methodLabel[data.method] ?? data.method}</Badge>
                    </TableCell>
                  </TableRow>
                  {data.method === 'pago_clp' && data.cuotaClp > 0 && (
                    <TableRow className="bg-primary/5">
                      <TableCell className="font-medium">Cuota a depositar</TableCell>
                      <TableCell className="text-right font-bold">CLP {fmtClp(data.cuotaClp)}</TableCell>
                    </TableRow>
                  )}
                  {data.hasCuotasUsd && data.nextAdvance && (() => {
                    const m = data.nextAdvance.month;
                    const clp = data.cuotaClpByMonth?.[m] ?? 0;
                    const tc = effectiveTc;
                    const usd = tc ? clp / tc : 0;
                    if (clp === 0) {
                      return (
                        <TableRow className="bg-primary/5">
                          <TableCell className="font-medium">Descuento secado</TableCell>
                          <TableCell className="text-right text-muted-foreground italic">Sin cuota este mes</TableCell>
                        </TableRow>
                      );
                    }
                    return (
                      <>
                        <TableRow className="bg-primary/5">
                          <TableCell className="font-medium">Cuota mensual CLP</TableCell>
                          <TableCell className="text-right font-bold">CLP {fmtClp(clp)}</TableCell>
                        </TableRow>
                        <TableRow className="bg-primary/5">
                          <TableCell className="font-medium">TC utilizado</TableCell>
                          <TableCell className="text-right">{tc ? `$${Number(tc).toLocaleString('es-CL')}` : <span className="text-muted-foreground italic">Sin TC</span>}</TableCell>
                        </TableRow>
                        <TableRow className="bg-primary/5">
                          <TableCell className="font-medium">Cuota en USD</TableCell>
                          <TableCell className="text-right font-bold">{tc ? `USD ${fmt(usd)}` : <span className="text-muted-foreground italic">Pendiente TC</span>}</TableCell>
                        </TableRow>
                      </>
                    );
                  })()}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Anticipos */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Anticipos {year}</CardTitle>
              {isSpecial && (
                <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Agregar
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                     <TableHead>Mes</TableHead>
                     <TableHead className="text-right">USD/kg</TableHead>
                     <TableHead className="text-right">Anticipo USD</TableHead>
                     <TableHead className="text-right">Desc. Secado</TableHead>
                     <TableHead className="text-right">Neto a Pagar</TableHead>
                     {isSpecial && <TableHead className="text-right">Neto CLP</TableHead>}
                     {isSpecial && <TableHead className="text-right">TC</TableHead>}
                     <TableHead className="text-center">Estado</TableHead>
                     <TableHead className="text-center">Fecha Pago</TableHead>
                     {isSpecial && <TableHead></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.advances.length === 0 ? (
                     <TableRow><TableCell colSpan={isSpecial ? 10 : 7} className="text-center text-muted-foreground py-6">Sin anticipos configurados</TableCell></TableRow>
                   ) : (isSpecial
                        ? [...data.advances].sort((a: any, b: any) => {
                            if (a.paidDate && b.paidDate) return a.paidDate.localeCompare(b.paidDate);
                            if (a.paidDate) return -1;
                            if (b.paidDate) return 1;
                            return a.month - b.month;
                          })
                        : data.advances
                      ).map((a: any) => {
                     const discount = data.discountByMonth[a.month] ?? 0;
                     const netClp = a.netClp;
                     const tc = a.exchangeRate;
                     // For Casablanca (isSpecial): user enters Neto CLP and TC manually.
                     // Neto a Pagar USD = Neto CLP / TC; Anticipo USD = Neto + Desc; USD/kg = Anticipo / kg
                     const netSpecial = (netClp && tc) ? netClp / tc : 0;
                     const anticipoSpecial = netSpecial + discount;
                     const usdPerKgSpecial = data.dryKg > 0 ? anticipoSpecial / Number(data.dryKg) : 0;
                     const net = isSpecial ? netSpecial : (a.advance - discount);
                     const anticipoUsd = isSpecial ? anticipoSpecial : a.advance;
                     const usdPerKgDisplay = isSpecial ? usdPerKgSpecial : (a.centsPerKg / 100);
                     return (
                       <TableRow key={a.id}>
                         <TableCell className="font-medium">{MONTHS_FULL[a.month - 1]}</TableCell>
                         <TableCell className="text-right">{fmtDec(usdPerKgDisplay, 4)}</TableCell>
                         <TableCell className="text-right">USD {fmt(anticipoUsd)}</TableCell>
                         <TableCell className="text-right text-destructive">{discount > 0 ? `-USD ${fmt(discount)}` : '-'}</TableCell>
                         <TableCell className="text-right font-bold">USD {fmt(net)}</TableCell>
                         {isSpecial && (
                           <TableCell className="text-right p-1">
                             {editingTcId === a.id ? (
                               <Input
                                 type="number"
                                 step="any"
                                 className="h-8 w-28 text-right ml-auto"
                                 value={tcEditValue}
                                 onChange={(e) => setTcEditValue(e.target.value)}
                                 onBlur={() => saveNetClp(a.id)}
                                 onKeyDown={(e) => { if (e.key === 'Enter') saveNetClp(a.id); if (e.key === 'Escape') { setEditingTcId(null); setTcEditValue(''); } }}
                                 autoFocus
                               />
                             ) : (
                               <button
                                 className="hover:bg-accent rounded px-2 py-1 text-sm font-bold"
                                 onClick={() => { setEditingTcId(a.id); setTcEditValue(netClp ? String(netClp) : ''); }}
                               >
                                 {netClp ? `CLP ${fmtClp(netClp)}` : <span className="text-muted-foreground font-normal">—</span>}
                               </button>
                             )}
                           </TableCell>
                         )}
                         {isSpecial && (
                           <TableCell className="text-right p-1">
                             {editingExRateId === a.id ? (
                               <Input
                                 type="number"
                                 step="any"
                                 className="h-8 w-28 text-right ml-auto"
                                 value={exRateEditValue}
                                 onChange={(e) => setExRateEditValue(e.target.value)}
                                 onBlur={() => saveExchangeRate(a.id)}
                                 onKeyDown={(e) => { if (e.key === 'Enter') saveExchangeRate(a.id); if (e.key === 'Escape') { setEditingExRateId(null); setExRateEditValue(''); } }}
                                 autoFocus
                               />
                             ) : (
                               <button
                                 className="hover:bg-accent rounded px-2 py-1 text-sm font-bold"
                                 onClick={() => { setEditingExRateId(a.id); setExRateEditValue(tc ? String(tc) : ''); }}
                               >
                                 {tc ? `$${tc.toLocaleString('es-CL', { maximumFractionDigits: 2 })}` : <span className="text-muted-foreground font-normal">—</span>}
                               </button>
                             )}
                           </TableCell>
                         )}
                         <TableCell className="text-center">
                           <Badge variant={a.paid ? 'default' : 'outline'} className={a.paid ? 'bg-green-600' : ''}>
                             {a.paid ? 'Pagado' : 'Pendiente'}
                           </Badge>
                         </TableCell>
                          <TableCell className="text-center text-sm text-muted-foreground">
                            {isSpecial ? (
                              <Input
                                type="date"
                                value={a.paidDate ?? ''}
                                onChange={(e) => setPaidDate(a.id, e.target.value)}
                                className="h-8 w-36 mx-auto text-sm"
                              />
                            ) : (
                              a.paidDate ? new Date(a.paidDate + 'T12:00:00').toLocaleDateString('es-CL') : '-'
                            )}
                          </TableCell>
                         {isSpecial && (
                           <TableCell className="text-center">
                             <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteAdvance(a.id)}>
                               <Trash2 className="h-3.5 w-3.5 text-destructive" />
                             </Button>
                           </TableCell>
                         )}
                       </TableRow>
                     );
                   })}
                   {data.advances.length > 0 && (
                     <TableRow className="font-bold bg-muted/50">
                       <TableCell>Total</TableCell>
                       <TableCell></TableCell>
                       <TableCell className="text-right">USD {fmt(
                         isSpecial
                           ? data.advances.reduce((s: number, a: any) => {
                               const disc = data.discountByMonth[a.month] ?? 0;
                               const netSp = (a.netClp && a.exchangeRate) ? a.netClp / a.exchangeRate : 0;
                               return s + netSp + disc;
                             }, 0)
                           : data.totalAdvances
                       )}</TableCell>
                       <TableCell></TableCell>
                       <TableCell></TableCell>
                       {isSpecial && (
                         <TableCell className="text-right">
                           CLP {fmtClp(data.advances.reduce((s: number, a: any) => {
                             return s + (a.netClp ?? 0);
                           }, 0))}
                         </TableCell>
                       )}
                       {isSpecial && <TableCell></TableCell>}
                       <TableCell className="text-center">
                         <span className="text-green-600">Pagado: USD {fmt(data.paidAdvances)}</span>
                       </TableCell>
                       <TableCell></TableCell>
                       {isSpecial && <TableCell></TableCell>}
                     </TableRow>
                   )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Próximo pago & USD por Facturar (left) + Documento requerido (right) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:col-span-2">
            {/* LEFT: Próximo Pago + USD por Facturar */}
            <div className="flex flex-col gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Próximo Pago</CardTitle>
                </CardHeader>
                <CardContent>
                  {data.nextAdvance ? (() => {
                    const nA = data.nextAdvance;
                    const disc = data.discountByMonth[nA.month] ?? 0;
                    const netSp = (nA.netClp && nA.exchangeRate) ? nA.netClp / nA.exchangeRate : 0;
                    const gross = isSpecial ? (netSp + disc) : data.nextPaymentGross;
                    const net = isSpecial ? netSp : data.nextPaymentNet;
                    return (
                     <Table>
                       <TableBody>
                         <TableRow>
                           <TableCell className="font-medium">Mes</TableCell>
                           <TableCell className="text-right font-bold">{MONTHS_FULL[nA.month - 1]}</TableCell>
                         </TableRow>
                         {isSpecial && (
                           <>
                             <TableRow>
                               <TableCell className="font-medium">Neto CLP</TableCell>
                               <TableCell className="text-right">{nA.netClp ? `CLP ${fmtClp(nA.netClp)}` : '—'}</TableCell>
                             </TableRow>
                             <TableRow>
                               <TableCell className="font-medium">TC</TableCell>
                               <TableCell className="text-right">{nA.exchangeRate ? `$${Number(nA.exchangeRate).toLocaleString('es-CL', { maximumFractionDigits: 2 })}` : '—'}</TableCell>
                             </TableRow>
                           </>
                         )}
                         <TableRow>
                           <TableCell className="font-medium">Anticipo Bruto</TableCell>
                           <TableCell className="text-right">USD {fmt(gross)}</TableCell>
                         </TableRow>
                         <TableRow>
                           <TableCell className="font-medium">Descuento Secado</TableCell>
                           <TableCell className="text-right text-destructive">
                             {disc > 0 ? `-USD ${fmt(disc)}` : '-'}
                           </TableCell>
                         </TableRow>
                         <TableRow className="bg-muted/50">
                           <TableCell className="font-bold">Neto a Pagar</TableCell>
                           <TableCell className="text-right font-bold text-lg">USD {fmt(net)}</TableCell>
                         </TableRow>
                       </TableBody>
                     </Table>
                    );
                  })() : (
                    <p className="text-muted-foreground text-center py-4">Todos los anticipos están pagados</p>
                  )}
                </CardContent>
              </Card>

              {data.needsDocument && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">USD por Facturar</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableBody>
                        <TableRow>
                          <TableCell className="font-medium text-muted-foreground">Anticipos acumulados</TableCell>
                          <TableCell className="text-right">USD {fmt(data.docNeededUsd + data.totalInvoicedUsd)}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium text-muted-foreground">Ya facturado</TableCell>
                          <TableCell className="text-right text-destructive">-USD {fmt(data.totalInvoicedUsd)}</TableCell>
                        </TableRow>
                        <TableRow className="bg-muted/50">
                          <TableCell className="font-bold">USD por Facturar</TableCell>
                          <TableCell className="text-right font-bold text-primary text-lg">USD {fmt(data.docNeededUsd)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* RIGHT: Documento requerido */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Documento Requerido</CardTitle>
              </CardHeader>
              <CardContent>
                {data.needsDocument ? (() => {
                   const nextMonth = data.nextAdvance ? MONTHS_FULL[data.nextAdvance.month - 1] : '';
                   const glosa = data.docType === 'Nota de Débito'
                     ? `Ajuste de precio de anticipo ${nextMonth}`
                     : `Anticipo compra fruta temporada ${data.year}`;
                   const tc = effectiveTc;
                   const usd = effectiveDocUsd;
                   const montoCLP = tc ? usd * tc : 0;
                   const iva = montoCLP * 0.19;
                   return (
                   <Table>
                     <TableBody>
                       <TableRow>
                         <TableCell className="font-medium">Tipo</TableCell>
                         <TableCell className="text-right">
                           <Badge variant="destructive">{data.docType}</Badge>
                         </TableCell>
                       </TableRow>
                       <TableRow>
                         <TableCell className="font-medium">Glosa</TableCell>
                         <TableCell className="text-right font-medium">{glosa}</TableCell>
                       </TableRow>
                       <TableRow>
                         <TableCell className="font-medium">Fecha Documento</TableCell>
                         <TableCell className="text-right">
                           <Input
                             type="date"
                             className="h-8 w-44 text-right ml-auto"
                             value={docDateOverride}
                             onChange={(e) => setDocDateOverride(e.target.value)}
                           />
                         </TableCell>
                       </TableRow>
                       <TableRow>
                         <TableCell className="font-medium">Monto Neto USD</TableCell>
                         <TableCell className="text-right">
                           <Input
                             type="number"
                             step="any"
                             className="h-8 w-32 text-right ml-auto font-bold"
                             value={docUsdOverride !== '' ? docUsdOverride : data.docNeededUsd}
                             onChange={(e) => setDocUsdOverride(e.target.value)}
                           />
                         </TableCell>
                       </TableRow>
                         <>
                           <TableRow>
                             <TableCell className="font-medium">Tipo de Cambio</TableCell>
                             <TableCell className="text-right">
                               <Input
                                 type="number"
                                 step="any"
                                 className="h-8 w-32 text-right ml-auto"
                                 placeholder="TC"
                                 value={docTcOverride !== '' ? docTcOverride : (tc ?? '')}
                                 onChange={(e) => setDocTcOverride(e.target.value)}
                               />
                             </TableCell>
                           </TableRow>
                         {tc ? (<>
                           <TableRow>
                             <TableCell className="font-medium">Monto Neto CLP</TableCell>
                             <TableCell className="text-right">CLP {fmtClp(Math.round(montoCLP))}</TableCell>
                           </TableRow>
                           <TableRow>
                             <TableCell className="font-medium">IVA (19%)</TableCell>
                             <TableCell className="text-right">CLP {fmtClp(Math.round(iva))}</TableCell>
                           </TableRow>
                           <TableRow className="bg-muted/50">
                             <TableCell className="font-bold">Total Documento</TableCell>
                             <TableCell className="text-right font-bold">CLP {fmtClp(Math.round(montoCLP + iva))}</TableCell>
                           </TableRow>
                         </>) : (
                         <TableRow>
                           <TableCell className="font-medium text-muted-foreground" colSpan={2}>
                             Ingresa un tipo de cambio para calcular CLP e IVA.
                           </TableCell>
                         </TableRow>
                       )}
                       </>
                     </TableBody>
                   </Table>
                   );
                 })() : (
                   <p className="text-center py-4 text-green-600 font-medium">Facturación al día ✓</p>
                 )}
                {data.needsDocument && (
                  <div className="mt-4 p-3 rounded-md border bg-muted/30 text-sm">
                    <p className="font-semibold mb-2">Facturar a:</p>
                    <div className="space-y-1">
                      <p><span className="font-medium">Razón social:</span> Exportadora Goodvalley SpA</p>
                      <p><span className="font-medium">RUT:</span> 78.328.166-K</p>
                      <p><span className="font-medium">Giro:</span> Compra, venta, importación y exportación de productos agrícolas</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* IVA */}
           <Card className="lg:col-span-2">
             <CardHeader className="pb-3">
               <CardTitle className="text-base">Balance IVA <span className="text-sm font-normal text-muted-foreground">(perspectiva del productor)</span></CardTitle>
             </CardHeader>
             <CardContent>
               {(() => {
                 const ivaAFavor = data.ivaProductor;
                 const ivaEnContra = data.ivaSecado;
                 const ivaPagado = data.ivaPagado ?? 0;
                 // saldo bruto: positivo = a favor productor, negativo = a favor exportadora
                 const saldoBruto = ivaAFavor - ivaEnContra;
                 // los pagos hechos al productor reducen lo que se le debe (o aumentan la deuda del productor)
                 const saldo = saldoBruto - ivaPagado;
                 return (
                 <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                   <div>
                     <p className="text-sm text-muted-foreground">IVA Facturado (a su favor)</p>
                     <p className="text-lg font-bold">CLP {fmtClp(ivaAFavor)}</p>
                   </div>
                   <div>
                     <p className="text-sm text-muted-foreground">IVA Secado (a favor exportadora)</p>
                     <p className="text-lg font-bold">CLP {fmtClp(ivaEnContra)}</p>
                   </div>
                   <div>
                     <p className="text-sm text-muted-foreground">IVA Pagado al productor</p>
                     <p className="text-lg font-bold text-blue-600">CLP {fmtClp(ivaPagado)}</p>
                   </div>
                   <div>
                     <p className="text-sm text-muted-foreground">Saldo IVA Neto</p>
                     <p className={`text-lg font-bold ${saldo > 0 ? 'text-green-600' : saldo < 0 ? 'text-destructive' : ''}`}>
                       CLP {fmtClp(saldo)}
                       {saldo > 0 && <span className="text-sm font-normal ml-1">(a favor productor)</span>}
                       {saldo < 0 && <span className="text-sm font-normal ml-1">(a favor exportadora)</span>}
                     </p>
                   </div>
                 </div>
                 );
               })()}
               {data.ivaPayments && data.ivaPayments.length > 0 && (
                 <div className="mt-4 border-t pt-3">
                   <p className="text-sm font-medium mb-2">Historial de pagos de IVA</p>
                   <Table>
                     <TableHeader>
                       <TableRow>
                         <TableHead>Fecha</TableHead>
                         <TableHead className="text-right">Monto CLP</TableHead>
                         <TableHead>Notas</TableHead>
                       </TableRow>
                     </TableHeader>
                     <TableBody>
                       {data.ivaPayments.map((p: any) => (
                         <TableRow key={p.id}>
                           <TableCell>{p.payment_date}</TableCell>
                           <TableCell className="text-right">CLP {fmtClp(Number(p.amount_clp))}</TableCell>
                           <TableCell className="text-muted-foreground">{p.notes ?? '—'}</TableCell>
                         </TableRow>
                       ))}
                     </TableBody>
                   </Table>
                 </div>
               )}
             </CardContent>
           </Card>

          {/* Historial Facturas Productor */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Historial de Facturas del Productor</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N° Documento</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="text-right">Monto CLP</TableHead>
                    <TableHead className="text-right">TC</TableHead>
                    <TableHead className="text-right">Monto USD</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(!data.prodInvoices || data.prodInvoices.length === 0) ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Sin facturas registradas</TableCell></TableRow>
                  ) : [...data.prodInvoices].sort((a: any, b: any) => a.date.localeCompare(b.date)).map((inv: any) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">{inv.invoice_number || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {inv.document_type === 'nota_debito' ? 'Nota de Débito' : inv.document_type === 'nota_credito' ? 'Nota de Crédito' : 'Factura'}
                        </Badge>
                      </TableCell>
                      <TableCell>{new Date(inv.date + 'T12:00:00').toLocaleDateString('es-CL')}</TableCell>
                      <TableCell className="text-right">CLP {fmtClp(inv.amount_clp)}</TableCell>
                      <TableCell className="text-right">${Number(inv.exchange_rate).toLocaleString('es-CL')}</TableCell>
                      <TableCell className="text-right font-bold">USD {fmt(inv.amount_usd)}</TableCell>
                    </TableRow>
                  ))}
                  {data.prodInvoices && data.prodInvoices.length > 0 && (
                    <TableRow className="font-bold bg-muted/50">
                      <TableCell colSpan={3}>Total</TableCell>
                      <TableCell className="text-right">CLP {fmtClp(data.totalInvoicedClp)}</TableCell>
                      <TableCell></TableCell>
                      <TableCell className="text-right">USD {fmt(data.totalInvoicedUsd)}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Agregar anticipo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Mes</Label>
              <Select value={String(newAdvMonth)} onValueChange={(v) => setNewAdvMonth(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS_FULL.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>¢/kg</Label>
              <Input type="number" step="any" value={newAdvCents} onChange={(e) => setNewAdvCents(e.target.value)} />
            </div>
            <div>
              <Label>Neto CLP (opcional)</Label>
              <Input type="number" step="any" value={newAdvTc} onChange={(e) => setNewAdvTc(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
            <Button onClick={addAdvance}>Agregar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProducerAccount;
