import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, TrendingUp, DollarSign, Receipt } from 'lucide-react';

const Dashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState({ producers: 0, totalKg: 0, totalAdvance: 0, pendingInvoices: 0 });

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [p, k, pf, di] = await Promise.all([
        supabase.from('producers').select('id', { count: 'exact', head: true }),
        supabase.from('dry_kg_reports').select('dry_kg'),
        supabase.from('payment_flows').select('advance_usd'),
        supabase.from('drying_invoices').select('id', { count: 'exact', head: true }).eq('status', 'pendiente'),
      ]);
      setStats({
        producers: p.count ?? 0,
        totalKg: (k.data ?? []).reduce((s, r) => s + Number(r.dry_kg), 0),
        totalAdvance: (pf.data ?? []).reduce((s, r) => s + Number(r.advance_usd), 0),
        pendingInvoices: di.count ?? 0,
      });
    };
    load();
  }, [user]);

  const cards = [
    { title: 'Productores', value: stats.producers, icon: Users, fmt: (v: number) => v.toString() },
    { title: 'Kilos Secos Total', value: stats.totalKg, icon: TrendingUp, fmt: (v: number) => v.toLocaleString('es-CL', { maximumFractionDigits: 0 }) + ' kg' },
    { title: 'Anticipos Totales', value: stats.totalAdvance, icon: DollarSign, fmt: (v: number) => 'USD ' + v.toLocaleString('en-US', { minimumFractionDigits: 2 }) },
    { title: 'Facturas Pendientes', value: stats.pendingInvoices, icon: Receipt, fmt: (v: number) => v.toString() },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bienvenido</h1>
        <p className="text-muted-foreground">Resumen general del sistema de anticipos</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ title, value, icon: Icon, fmt }) => (
          <Card key={title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{fmt(value)}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default Dashboard;
