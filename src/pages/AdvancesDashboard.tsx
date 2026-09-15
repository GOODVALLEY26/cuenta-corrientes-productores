import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { DollarSign, CheckCircle2, Clock, Radio } from 'lucide-react';

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const SPECIAL_PRODUCER_MATCH = 'casablanca';

type Producer = { id: string; name: string };
type Rate = {
  id: string;
  producer_id: string;
  month: number;
  year: number;
  cents_per_kg: number;
  paid: boolean;
  paid_date: string | null;
};
type DryKg = { producer_id: string; dry_kg: number };

const fmtUsd = (n: number) =>
  'USD ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const AdvancesDashboard = () => {
  const { user } = useAuth();
  const [producers, setProducers] = useState<Producer[]>([]);
  const [rates, setRates] = useState<Rate[]>([]);
  const [dryKgs, setDryKgs] = useState<DryKg[]>([]);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const load = useCallback(async () => {
    const [p, r, k] = await Promise.all([
      supabase.from('producers').select('id, name').order('name'),
      supabase.from('advance_rates').select('*').eq('year', filterYear),
      supabase.from('dry_kg_reports').select('producer_id, dry_kg'),
    ]);
    if (p.data) setProducers(p.data);
    if (r.data) setRates(r.data as Rate[]);
    if (k.data) setDryKgs(k.data);
    setLastUpdate(new Date());
  }, [filterYear]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  // Realtime: refresh whenever advances or dry kg change
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('advances-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'advance_rates' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dry_kg_reports' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, load]);

  const getKg = (pid: string) => Number(dryKgs.find(d => d.producer_id === pid)?.dry_kg ?? 0);
  const isSpecial = (name: string) => name.toLowerCase().includes(SPECIAL_PRODUCER_MATCH);

  // USD del anticipo = kg deshidratados x (¢/kg / 100), igual que en Cuenta Corriente
  const advanceUsd = (p: Producer, rate: Rate) => (getKg(p.id) * Number(rate.cents_per_kg)) / 100;

  const rows = producers
    .map(p => {
      const own = rates.filter(r => r.producer_id === p.id);
      const total = own.reduce((s, r) => s + advanceUsd(p, r), 0);
      const paid = own.filter(r => r.paid).reduce((s, r) => s + advanceUsd(p, r), 0);
      const paidDates = own.filter(r => r.paid && r.paid_date).map(r => r.paid_date!) as string[];
      const lastPaid = paidDates.sort().slice(-1)[0] ?? null;
      const monthState = MONTHS.map((_, i) => {
        const monthRates = own.filter(r => r.month === i + 1);
        if (monthRates.length === 0) return null;
        return monthRates.every(r => r.paid) ? 'paid' : 'pending';
      });
      return { producer: p, total, paid, pending: total - paid, lastPaid, monthState, count: own.length };
    })
    .filter(r => r.count > 0)
    .sort((a, b) => b.pending - a.pending || b.total - a.total);

  const grandTotal = rows.reduce((s, r) => s + r.total, 0);
  const grandPaid = rows.reduce((s, r) => s + r.paid, 0);
  const grandPending = grandTotal - grandPaid;
  const pct = grandTotal > 0 ? (grandPaid / grandTotal) * 100 : 0;

  const kpis = [
    { title: 'Anticipos del año', value: fmtUsd(grandTotal), icon: DollarSign, tone: '' },
    { title: 'Pagado', value: fmtUsd(grandPaid), icon: CheckCircle2, tone: 'text-green-600' },
    { title: 'Pendiente', value: fmtUsd(grandPending), icon: Clock, tone: 'text-destructive' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Panel de Anticipos</h1>
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Radio className="h-3.5 w-3.5 text-green-600 animate-pulse" />
            En vivo · actualizado {lastUpdate.toLocaleTimeString('es-CL')}
          </p>
        </div>
        <Select value={String(filterYear)} onValueChange={v => setFilterYear(Number(v))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[2024, 2025, 2026, 2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {kpis.map(({ title, value, icon: Icon, tone }) => (
          <Card key={title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
              <Icon className={`h-4 w-4 ${tone || 'text-muted-foreground'}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${tone}`}>{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Avance de pagos {filterYear}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Progress value={pct} />
          <p className="text-sm text-muted-foreground">
            {pct.toFixed(1)}% pagado · {fmtUsd(grandPending)} por pagar
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Detalle por productor</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-card z-10 min-w-[160px]">Productor</TableHead>
                <TableHead className="text-right min-w-[120px]">Anticipos USD</TableHead>
                <TableHead className="text-right min-w-[120px]">Pagado</TableHead>
                <TableHead className="text-right min-w-[120px]">Pendiente</TableHead>
                <TableHead className="min-w-[160px]">Avance</TableHead>
                <TableHead className="min-w-[240px]">Meses</TableHead>
                <TableHead className="min-w-[110px]">Último pago</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Sin anticipos registrados en {filterYear}.
                  </TableCell>
                </TableRow>
              ) : rows.map(r => {
                const rowPct = r.total > 0 ? (r.paid / r.total) * 100 : 0;
                return (
                  <TableRow key={r.producer.id}>
                    <TableCell className="sticky left-0 bg-card z-10 font-medium">{r.producer.name}</TableCell>
                    <TableCell className="text-right">{fmtUsd(r.total)}</TableCell>
                    <TableCell className="text-right text-green-600">{fmtUsd(r.paid)}</TableCell>
                    <TableCell className={`text-right font-semibold ${r.pending > 0 ? 'text-destructive' : ''}`}>
                      {fmtUsd(r.pending)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={rowPct} className="h-2" />
                        <span className="text-xs text-muted-foreground w-10 text-right">{rowPct.toFixed(0)}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {r.monthState.map((state, i) =>
                          state === null ? null : (
                            <Badge
                              key={i}
                              variant={state === 'paid' ? 'outline' : 'destructive'}
                              className={state === 'paid' ? 'text-green-600 border-green-600/40' : ''}
                            >
                              {MONTHS[i]}
                            </Badge>
                          )
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.lastPaid ? new Date(r.lastPaid + 'T00:00:00').toLocaleDateString('es-CL') : '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
              {rows.length > 0 && (
                <TableRow className="font-bold bg-muted/50">
                  <TableCell className="sticky left-0 bg-muted/50 z-10">TOTAL</TableCell>
                  <TableCell className="text-right">{fmtUsd(grandTotal)}</TableCell>
                  <TableCell className="text-right text-green-600">{fmtUsd(grandPaid)}</TableCell>
                  <TableCell className="text-right">{fmtUsd(grandPending)}</TableCell>
                  <TableCell colSpan={3} />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdvancesDashboard;
