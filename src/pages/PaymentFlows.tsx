import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const PaymentFlows = () => {
  const { user } = useAuth();
  const [flows, setFlows] = useState<any[]>([]);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from('payment_flows')
      .select('*, producers(name, drying_payment_method)')
      .eq('year', filterYear)
      .eq('month', filterMonth)
      .order('created_at');
    if (data) setFlows(data);
  };

  useEffect(() => { if (user) load(); }, [user, filterYear, filterMonth]);

  const calculate = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Get all relevant data
      const [producersRes, ratesRes, kgRes, prodInvRes, dryInvRes] = await Promise.all([
        supabase.from('producers').select('*'),
        supabase.from('advance_rates').select('*').eq('year', filterYear).eq('month', filterMonth),
        supabase.from('dry_kg_reports').select('*'), // All kg (no month filter)
        supabase.from('producer_invoices').select('*'),
        supabase.from('drying_invoices').select('*').in('status', ['pendiente', 'parcial']),
      ]);

      const producers = producersRes.data ?? [];
      const rates = ratesRes.data ?? [];
      const kgs = kgRes.data ?? [];
      const prodInvoices = prodInvRes.data ?? [];
      const dryInvoices = dryInvRes.data ?? [];

      for (const producer of producers) {
        const rate = rates.find(r => r.producer_id === producer.id);
        const kg = kgs.find(k => k.producer_id === producer.id);
        if (!rate || !kg) continue;

        // Advance = total dry kg × cents per kg / 100
        const advanceUsd = (Number(kg.dry_kg) * Number(rate.cents_per_kg)) / 100;

        // Calculate drying discount based on payment method
        let dryingDiscountUsd = 0;
        const method = producer.drying_payment_method;

        if (method === 'descuento_usd') {
          // Deduct from advance in USD
          const pendingDrying = dryInvoices.filter(d => d.producer_id === producer.id);
          for (const inv of pendingDrying) {
            if (inv.amount_usd && inv.total_installments && inv.total_installments > 0) {
              dryingDiscountUsd += Number(inv.amount_usd) / inv.total_installments;
            }
          }
        } else if (method === 'cuotas') {
          // Installments - divide total drying into equal parts
          const pendingDrying = dryInvoices.filter(d => d.producer_id === producer.id);
          for (const inv of pendingDrying) {
            if (inv.amount_usd && inv.total_installments && inv.total_installments > 0) {
              dryingDiscountUsd += Number(inv.amount_usd) / inv.total_installments;
            }
          }
        }
        // 'pago_clp' and 'liquidacion_fin_año' don't deduct from advance

        const netPayment = advanceUsd - dryingDiscountUsd;

        // Check producer invoiced amount
        const producerInvoicedUsd = prodInvoices
          .filter(i => i.producer_id === producer.id)
          .reduce((s, i) => s + Number(i.amount_usd), 0);

        // Document logic
        const requiresDocument = producerInvoicedUsd < advanceUsd;
        let documentTypeNeeded: string | null = null;
        let documentAmountUsd = 0;

        if (requiresDocument) {
          const hasInitialInvoice = prodInvoices.some(i => i.producer_id === producer.id && i.document_type === 'factura');
          documentTypeNeeded = hasInitialInvoice ? 'nota_debito' : 'factura';
          documentAmountUsd = advanceUsd - producerInvoicedUsd;
        }

        await supabase.from('payment_flows').upsert({
          producer_id: producer.id,
          month: filterMonth,
          year: filterYear,
          advance_usd: advanceUsd,
          drying_discount_usd: dryingDiscountUsd,
          producer_invoiced_usd: producerInvoicedUsd,
          net_payment_usd: netPayment,
          requires_document: requiresDocument,
          document_type_needed: documentTypeNeeded as any,
          document_amount_usd: documentAmountUsd,
          user_id: user.id,
        }, { onConflict: 'producer_id,month,year' });
      }

      toast.success('Flujos calculados correctamente');
      load();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const total = flows.reduce((acc, f) => ({
    advance: acc.advance + Number(f.advance_usd),
    drying: acc.drying + Number(f.drying_discount_usd),
    net: acc.net + Number(f.net_payment_usd),
  }), { advance: 0, drying: 0, net: 0 });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Flujos de Pago</h1>
          <p className="text-muted-foreground">Anticipo = Kg totales × ¢/kg del mes. Descuento según método de pago secado.</p>
        </div>
        <div className="flex gap-2">
          <Select value={String(filterMonth)} onValueChange={v => setFilterMonth(Number(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={String(filterYear)} onValueChange={v => setFilterYear(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{[2024,2025,2026,2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <Button onClick={calculate} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Calcular
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Productor</TableHead>
                <TableHead className="text-right">Anticipo USD</TableHead>
                <TableHead className="text-right">Desc. Secado</TableHead>
                <TableHead className="text-right">Pago Neto USD</TableHead>
                <TableHead className="text-right">Facturado USD</TableHead>
                <TableHead>Doc. Requerido</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {flows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Sin flujos. Presiona "Calcular" para generar.</TableCell></TableRow>
              ) : flows.map(f => (
                <TableRow key={f.id}>
                  <TableCell className="font-medium">{f.producers?.name}</TableCell>
                  <TableCell className="text-right">USD {Number(f.advance_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell className="text-right text-destructive">-USD {Number(f.drying_discount_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell className="text-right font-bold">USD {Number(f.net_payment_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell className="text-right">USD {Number(f.producer_invoiced_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell>
                    {f.requires_document ? (
                      <div>
                        <Badge variant="destructive">
                          {f.document_type_needed === 'nota_debito' ? 'Nota de Débito' : 'Factura'}
                        </Badge>
                        <span className="text-xs text-muted-foreground ml-2">
                          USD {Number(f.document_amount_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    ) : (
                      <Badge variant="outline" className="text-green-600">Cubierto</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {flows.length > 0 && (
                <TableRow className="font-bold bg-muted/50">
                  <TableCell>TOTAL</TableCell>
                  <TableCell className="text-right">USD {total.advance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell className="text-right text-destructive">-USD {total.drying.toLocaleString('en-US', { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell className="text-right">USD {total.net.toLocaleString('en-US', { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell colSpan={2}></TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default PaymentFlows;
