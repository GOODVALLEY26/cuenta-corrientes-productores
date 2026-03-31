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
    supabase.from('producers').select('id, name, drying_payment_method').order('name').then(({ data }) => {
      if (data) setProducers(data);
    });
  }, [user]);

  useEffect(() => {
    if (!selectedId || !user) { setData(null); return; }
    loadData();
  }, [selectedId, year, user]);

  const loadData = async () => {
    const [ratesRes, kgRes, prodInvRes, dryInvRes, exRatesRes] = await Promise.all([
      supabase.from('advance_rates').select('*').eq('producer_id', selectedId).eq('year', year),
      supabase.from('dry_kg_reports').select('dry_kg').eq('producer_id', selectedId),
      supabase.from('producer_invoices').select('*').eq('producer_id', selectedId),
      supabase.from('drying_invoices').select('*').eq('producer_id', selectedId),
      supabase.from('exchange_rates').select('*').eq('year', year),
    ]);

    const rates = ratesRes.data ?? [];
    const dryKg = kgRes.data?.[0]?.dry_kg ?? 0;
    const prodInvoices = prodInvRes.data ?? [];
    const dryInvoices = dryInvRes.data ?? [];
    const exRates = exRatesRes.data ?? [];
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

    // Drying discount per month (for cuotas/descuento)
    let dryingDiscountPerMonth = 0;
    const method = producer.drying_payment_method;
    if (method === 'descuento_usd' || method === 'cuotas') {
      for (const inv of dryInvoices) {
        const installments = inv.total_installments ?? 1;
        if (installments > 0 && inv.amount_usd) {
          dryingDiscountPerMonth += Number(inv.amount_usd) / installments;
        }
      }
    }

    // Next payment detail
    const nextPaymentGross = nextAdvance?.advance ?? 0;
    const nextPaymentNet = nextPaymentGross - (method === 'descuento_usd' || method === 'cuotas' ? dryingDiscountPerMonth : 0);

    // Nota de débito needed?
    const alreadyInvoiced = totalInvoicedUsd;
    const needsDocument = nextPaymentGross > 0 && alreadyInvoiced < totalAdvances;
    const hasInitialInvoice = prodInvoices.some(i => i.document_type === 'factura');
    const docType = hasInitialInvoice ? 'Nota de Débito' : 'Factura';
    const docAmountUsd = Math.max(0, (nextAdvance?.advance ?? 0) - 0); // Next advance to cover

    // Calculate how much more needs to be invoiced
    const cumulativeAdvancesToNext = advances
      .filter(a => a.month <= (nextAdvance?.month ?? 12))
      .reduce((s, a) => s + a.advance, 0);
    const docNeededUsd = Math.max(0, cumulativeAdvancesToNext - alreadyInvoiced);

    // Exchange rate for next month
    const nextMonthEx = exRates.find(e => e.month === (nextAdvance?.month ?? 0));

    // IVA balance
    const ivaSecado = dryInvoices.reduce((s, i) => s + Number(i.iva_clp ?? 0), 0);
    const ivaProductor = prodInvoices.reduce((s, i) => s + Number(i.iva_clp ?? 0), 0);
    const ivaSaldo = ivaSecado - ivaProductor;

    setData({
      dryKg,
      totalInvoicedUsd,
      totalInvoicedClp,
      advances,
      totalAdvances,
      paidAdvances,
      nextAdvance,
      totalDryingUsd,
      totalDryingClp,
      dryingDiscountPerMonth,
      nextPaymentGross,
      nextPaymentNet,
      method,
      needsDocument: docNeededUsd > 0,
      docType,
      docNeededUsd,
      nextMonthEx,
      ivaSaldo,
      ivaSecado,
      ivaProductor,
      producer,
    });
  };

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtClp = (n: number) => n.toLocaleString('es-CL');

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
                  <TableRow>
                    <TableCell className="font-medium">Método pago secado</TableCell>
                    <TableCell className="text-right"><Badge variant="outline">{methodLabel[data.method] ?? data.method}</Badge></TableCell>
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
                    <TableCell className="font-medium">Total Secado USD</TableCell>
                    <TableCell className="text-right">USD {fmt(data.totalDryingUsd)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Total Secado CLP</TableCell>
                    <TableCell className="text-right">CLP {fmtClp(data.totalDryingClp)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Descuento mensual</TableCell>
                    <TableCell className="text-right">
                      {data.method === 'descuento_usd' || data.method === 'cuotas'
                        ? `USD ${fmt(data.dryingDiscountPerMonth)}`
                        : <span className="text-muted-foreground">No aplica</span>}
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
                    <TableHead className="text-right">¢/kg</TableHead>
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
                    const discount = (data.method === 'descuento_usd' || data.method === 'cuotas') ? data.dryingDiscountPerMonth : 0;
                    const net = a.advance - discount;
                    return (
                      <TableRow key={a.month}>
                        <TableCell className="font-medium">{MONTHS_FULL[a.month - 1]}</TableCell>
                        <TableCell className="text-right">{a.centsPerKg}</TableCell>
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
                        {data.dryingDiscountPerMonth > 0 && (data.method === 'descuento_usd' || data.method === 'cuotas')
                          ? `-USD ${fmt(data.dryingDiscountPerMonth)}`
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
              {data.needsDocument ? (
                <Table>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium">Tipo</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="destructive">{data.docType}</Badge>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Monto USD</TableCell>
                      <TableCell className="text-right font-bold">USD {fmt(data.docNeededUsd)}</TableCell>
                    </TableRow>
                    {data.nextMonthEx && (
                      <>
                        <TableRow>
                          <TableCell className="font-medium">Tipo de Cambio</TableCell>
                          <TableCell className="text-right">{data.nextMonthEx.rate}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Monto CLP</TableCell>
                          <TableCell className="text-right font-bold">CLP {fmtClp(Math.round(data.docNeededUsd * data.nextMonthEx.rate))}</TableCell>
                        </TableRow>
                      </>
                    )}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center py-4 text-green-600 font-medium">Facturación al día ✓</p>
              )}
            </CardContent>
          </Card>

          {/* IVA */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Balance IVA</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-sm text-muted-foreground">IVA Secado (nos debe)</p>
                  <p className="text-lg font-bold">CLP {fmtClp(data.ivaSecado)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">IVA Facturado (le debemos)</p>
                  <p className="text-lg font-bold">CLP {fmtClp(data.ivaProductor)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Saldo IVA</p>
                  <p className={`text-lg font-bold ${data.ivaSaldo > 0 ? 'text-green-600' : data.ivaSaldo < 0 ? 'text-destructive' : ''}`}>
                    CLP {fmtClp(data.ivaSaldo)}
                    {data.ivaSaldo > 0 && <span className="text-sm font-normal ml-1">(a favor)</span>}
                    {data.ivaSaldo < 0 && <span className="text-sm font-normal ml-1">(a pagar)</span>}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default ProducerAccount;
