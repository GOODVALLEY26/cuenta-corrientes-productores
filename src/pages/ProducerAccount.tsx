import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { generateProducerPdf } from '@/lib/generateProducerPdf';

const MONTHS_FULL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

type Producer = { id: string; name: string; drying_payment_method: string; rut?: string };

const ProducerAccount = () => {
  const { user } = useAuth();
  const [producers, setProducers] = useState<Producer[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<any>(null);

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
    const [ratesRes, kgRes, prodInvRes, dryInvRes, exRatesRes, instPayRes] = await Promise.all([
      supabase.from('advance_rates').select('*').eq('producer_id', selectedId).eq('year', year),
      supabase.from('dry_kg_reports').select('dry_kg').eq('producer_id', selectedId),
      supabase.from('producer_invoices').select('*').eq('producer_id', selectedId),
      supabase.from('drying_invoices').select('*').eq('producer_id', selectedId),
      supabase.from('exchange_rates').select('*').eq('year', year),
      supabase.from('installment_payments').select('*').eq('producer_id', selectedId).eq('year', year).order('installment_number'),
    ]);

    const rates = ratesRes.data ?? [];
    const dryKg = kgRes.data?.[0]?.dry_kg ?? 0;
    const prodInvoices = prodInvRes.data ?? [];
    const dryInvoices = dryInvRes.data ?? [];
    const exRates = exRatesRes.data ?? [];
    const installmentPayments = instPayRes.data ?? [];
    const producer = producers.find(p => p.id === selectedId)!;

    // Total facturado por productor (facturas + notas de débito)
    const totalInvoicedUsd = prodInvoices.reduce((s, i) => s + Number(i.amount_usd), 0);
    const totalInvoicedClp = prodInvoices.reduce((s, i) => s + Number(i.amount_clp), 0);

    // Anticipos por mes
    const advances = rates.map(r => {
      const advance = (Number(dryKg) * Number(r.cents_per_kg)) / 100;
      return { month: r.month, centsPerKg: r.cents_per_kg, advance, paid: r.paid };
    }).sort((a, b) => a.month - b.month);

    const totalAdvances = advances.reduce((s, a) => s + a.advance, 0);
    const paidAdvances = advances.filter(a => a.paid).reduce((s, a) => s + a.advance, 0);

    // Next advance to pay
    const nextAdvance = advances.find(a => !a.paid);

    // Secado
    const totalDryingUsd = dryInvoices.reduce((s, i) => s + Number(i.amount_usd ?? 0), 0);
    const totalDryingClp = dryInvoices.reduce((s, i) => s + Number(i.amount_clp), 0);

    // Cuota logic - works for all methods
    const method = producer.drying_payment_method;
    const numInstallments = advances.length + 1;
    const cuotaClp = numInstallments > 0 ? totalDryingClp / numInstallments : 0;

    // All installment payments for this producer
    const cuotaTotalPaidClp = installmentPayments.filter((p: any) => p.paid).reduce((s: number, p: any) => s + Number(p.amount_clp), 0);
    const cuotaTotalPaidUsd = installmentPayments.filter((p: any) => p.paid && p.amount_usd).reduce((s: number, p: any) => s + Number(p.amount_usd), 0);
    const cuotaSaldoClp = totalDryingClp - cuotaTotalPaidClp;
    const cuotaDetails = installmentPayments;

    // Fallback exchange rate: last producer invoice's exchange_rate
    const lastProdInvoice = [...prodInvoices].sort((a, b) => b.date.localeCompare(a.date))[0];
    const fallbackExRate = lastProdInvoice ? Number(lastProdInvoice.exchange_rate) : null;

    // Build per-month discount map
    // Only USD cuotas discount from anticipos
    const discountByMonth: Record<number, number> = {};
    const hasCuotasUsd = dryInvoices.some(inv => inv.installment_currency === 'usd');

    if (hasCuotasUsd) {
      for (const adv of advances) {
        const inst = installmentPayments.find((p: any) => p.month === adv.month);
        if (inst && inst.amount_usd) {
          discountByMonth[adv.month] = Number(inst.amount_usd);
        } else {
          const monthEx = exRates.find(e => e.month === adv.month);
          const tc = monthEx ? Number(monthEx.rate) : fallbackExRate;
          discountByMonth[adv.month] = tc ? cuotaClp / tc : 0;
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

    // Next payment detail
    const nextPaymentGross = nextAdvance?.advance ?? 0;
    const nextDiscount = nextAdvance ? (discountByMonth[nextAdvance.month] ?? 0) : 0;
    const nextPaymentNet = nextPaymentGross - nextDiscount;

    // Nota de débito needed?
    const alreadyInvoiced = totalInvoicedUsd;
    const needsDocument = nextPaymentGross > 0 && alreadyInvoiced < totalAdvances;
    const hasInitialInvoice = prodInvoices.some(i => i.document_type === 'factura');
    const docType = hasInitialInvoice ? 'Nota de Débito' : 'Factura';

    // Calculate how much more needs to be invoiced
    const cumulativeAdvancesToNext = advances
      .filter(a => a.month <= (nextAdvance?.month ?? 12))
      .reduce((s, a) => s + a.advance, 0);
    const docNeededUsd = Math.max(0, cumulativeAdvancesToNext - alreadyInvoiced);

    // Exchange rate for next month: from exchange_rates table, fallback to last producer invoice
    const nextMonthEx = exRates.find(e => e.month === (nextAdvance?.month ?? 0));
    const docExRate = nextMonthEx ? Number(nextMonthEx.rate) : fallbackExRate;

    // IVA balance
    const ivaSecado = dryInvoices.reduce((s, i) => s + Number(i.iva_clp ?? 0), 0);
    const ivaProductor = prodInvoices.reduce((s, i) => s + Number(i.iva_clp ?? 0), 0);
    const ivaSaldo = ivaSecado - ivaProductor;

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
      producer,
      cuotaClp,
      cuotaTotalPaidClp,
      cuotaTotalPaidUsd,
      cuotaSaldoClp,
      cuotaDetails,
    });
  };

  const fmt = (n: number | undefined | null) => (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtClp = (n: number | undefined | null) => Math.round(n ?? 0).toLocaleString('es-CL');

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
            <Button variant="outline" onClick={() => generateProducerPdf(data)}>
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
                    <TableCell className="font-medium">Kg Secos Totales</TableCell>
                    <TableCell className="text-right">{Number(data.dryKg).toLocaleString('es-CL')}</TableCell>
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
                  {data.totalDryingUsd > 0 && (
                    <TableRow>
                      <TableCell className="font-medium">Total Secado USD</TableCell>
                      <TableCell className="text-right">USD {fmt(data.totalDryingUsd)}</TableCell>
                    </TableRow>
                  )}
                  <TableRow>
                    <TableCell className="font-medium text-green-700">Total Pagado CLP</TableCell>
                    <TableCell className="text-right text-green-700 font-bold">CLP {fmtClp(data.cuotaTotalPaidClp)}</TableCell>
                  </TableRow>
                  {data.cuotaTotalPaidUsd > 0 && (
                    <TableRow>
                      <TableCell className="font-medium text-green-700">Total Pagado USD</TableCell>
                      <TableCell className="text-right text-green-700">USD {fmt(data.cuotaTotalPaidUsd)}</TableCell>
                    </TableRow>
                  )}
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
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Anticipos */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Anticipos {year}</CardTitle>
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
                     <TableHead className="text-center">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.advances.length === 0 ? (
                     <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Sin anticipos configurados</TableCell></TableRow>
                   ) : data.advances.map((a: any) => {
                     const discount = data.discountByMonth[a.month] ?? 0;
                     const net = a.advance - discount;
                     return (
                       <TableRow key={a.month}>
                         <TableCell className="font-medium">{MONTHS_FULL[a.month - 1]}</TableCell>
                         <TableCell className="text-right">{fmt(a.centsPerKg / 100)}</TableCell>
                         <TableCell className="text-right">USD {fmt(a.advance)}</TableCell>
                         <TableCell className="text-right text-destructive">{discount > 0 ? `-USD ${fmt(discount)}` : '-'}</TableCell>
                         <TableCell className="text-right font-bold">USD {fmt(net)}</TableCell>
                         <TableCell className="text-center">
                           <Badge variant={a.paid ? 'default' : 'outline'} className={a.paid ? 'bg-green-600' : ''}>
                             {a.paid ? 'Pagado' : 'Pendiente'}
                           </Badge>
                         </TableCell>
                       </TableRow>
                     );
                   })}
                   {data.advances.length > 0 && (
                     <TableRow className="font-bold bg-muted/50">
                       <TableCell>Total</TableCell>
                       <TableCell></TableCell>
                       <TableCell className="text-right">USD {fmt(data.totalAdvances)}</TableCell>
                       <TableCell></TableCell>
                       <TableCell></TableCell>
                       <TableCell className="text-center">
                         <span className="text-green-600">Pagado: USD {fmt(data.paidAdvances)}</span>
                       </TableCell>
                     </TableRow>
                   )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Próximo pago */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Próximo Pago</CardTitle>
            </CardHeader>
            <CardContent>
              {data.nextAdvance ? (
                 <Table>
                   <TableBody>
                     <TableRow>
                       <TableCell className="font-medium">Mes</TableCell>
                       <TableCell className="text-right font-bold">{MONTHS_FULL[data.nextAdvance.month - 1]}</TableCell>
                     </TableRow>
                     <TableRow>
                       <TableCell className="font-medium">Anticipo Bruto</TableCell>
                       <TableCell className="text-right">USD {fmt(data.nextPaymentGross)}</TableCell>
                     </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Descuento Secado</TableCell>
                        <TableCell className="text-right text-destructive">
                          {data.nextDiscount > 0
                            ? `-USD ${fmt(data.nextDiscount)}`
                            : '-'}
                        </TableCell>
                      </TableRow>
                      <TableRow className="bg-muted/50">
                        <TableCell className="font-bold">Neto a Pagar</TableCell>
                        <TableCell className="text-right font-bold text-lg">USD {fmt(data.nextPaymentNet)}</TableCell>
                      </TableRow>
                   </TableBody>
                 </Table>
              ) : (
                <p className="text-muted-foreground text-center py-4">Todos los anticipos están pagados</p>
              )}
            </CardContent>
          </Card>

          {/* Documento requerido */}
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
                 const tc = data.docExRate;
                 const montoCLP = tc ? data.docNeededUsd * tc : 0;
                 const iva = montoCLP * 0.19;
                 return (
                 <>
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
                        <TableCell className="text-right">{nextMonth} {data.year}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Monto Neto USD</TableCell>
                        <TableCell className="text-right font-bold">USD {fmt(data.docNeededUsd)}</TableCell>
                      </TableRow>
                      {tc ? (
                        <>
                          <TableRow>
                            <TableCell className="font-medium">Tipo de Cambio</TableCell>
                            <TableCell className="text-right">${Number(tc).toLocaleString('es-CL')}</TableCell>
                          </TableRow>
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
                        </>
                      ) : (
                        <TableRow>
                          <TableCell className="font-medium text-muted-foreground" colSpan={2}>
                            Sin tipo de cambio disponible. Registre un TC en Tipo de Cambio o ingrese una factura del productor.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                  <p className="text-xs text-muted-foreground mt-3 px-4 pb-2">
                    * Monto neto = Total anticipos acumulados (USD {fmt(data.docNeededUsd + data.totalInvoicedUsd)}) − Ya facturado (USD {fmt(data.totalInvoicedUsd)}) = USD {fmt(data.docNeededUsd)}
                  </p>
                 </>
                 );
               })() : (
                 <p className="text-center py-4 text-green-600 font-medium">Facturación al día ✓</p>
               )}
            </CardContent>
          </Card>

          {/* IVA - desde perspectiva del productor */}
           <Card className="lg:col-span-2">
             <CardHeader className="pb-3">
               <CardTitle className="text-base">Balance IVA <span className="text-sm font-normal text-muted-foreground">(perspectiva del productor)</span></CardTitle>
             </CardHeader>
             <CardContent>
               {(() => {
                 const ivaAFavor = data.ivaProductor; // producer invoiced us
                 const ivaEnContra = data.ivaSecado; // drying IVA they owe
                 const saldo = ivaAFavor - ivaEnContra;
                 return (
                 <div className="grid grid-cols-3 gap-4 text-center">
                   <div>
                     <p className="text-sm text-muted-foreground">IVA Facturado (a su favor)</p>
                     <p className="text-lg font-bold">CLP {fmtClp(ivaAFavor)}</p>
                   </div>
                   <div>
                     <p className="text-sm text-muted-foreground">IVA Secado (a favor exportadora)</p>
                     <p className="text-lg font-bold">CLP {fmtClp(ivaEnContra)}</p>
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
             </CardContent>
           </Card>
        </div>
      )}
    </div>
  );
};

export default ProducerAccount;
