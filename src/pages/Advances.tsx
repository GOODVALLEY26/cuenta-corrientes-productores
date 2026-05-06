import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const SPECIAL_PRODUCER_MATCH = 'casablanca';

type Producer = { id: string; name: string };
type Rate = { id: string; producer_id: string; month: number; year: number; cents_per_kg: number; paid: boolean; paid_date: string | null };
type DryKg = { producer_id: string; dry_kg: number };

const Advances = () => {
  const { user } = useAuth();
  const [producers, setProducers] = useState<Producer[]>([]);
  const [rates, setRates] = useState<Rate[]>([]);
  const [dryKgs, setDryKgs] = useState<DryKg[]>([]);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  // Date dialog state
  const [dateDialogOpen, setDateDialogOpen] = useState(false);
  const [pendingToggle, setPendingToggle] = useState<{ pid: string; month: number } | null>(null);
  const [paidDateValue, setPaidDateValue] = useState('');

  const load = async () => {
    const [p, r, k] = await Promise.all([
      supabase.from('producers').select('id, name').order('name'),
      supabase.from('advance_rates').select('*').eq('year', filterYear),
      supabase.from('dry_kg_reports').select('producer_id, dry_kg'),
    ]);
    if (p.data) setProducers(p.data);
    if (r.data) setRates(r.data as Rate[]);
    if (k.data) setDryKgs(k.data);
  };

  useEffect(() => { if (user) load(); }, [user, filterYear]);

  const getKg = (pid: string) => dryKgs.find(d => d.producer_id === pid)?.dry_kg ?? 0;
  const getRate = (pid: string, month: number) => rates.find(r => r.producer_id === pid && r.month === month);

  const cellKey = (pid: string, month: number) => `${pid}-${month}`;

  const saveCell = async (pid: string, month: number) => {
    const val = parseFloat(editValue);
    if (isNaN(val) && editValue !== '') { toast.error('Valor inválido'); return; }

    if (editValue === '' || val === 0) {
      const existing = getRate(pid, month);
      if (existing) {
        await supabase.from('advance_rates').delete().eq('id', existing.id);
      }
    } else {
      const existing = getRate(pid, month);
      if (existing) {
        await supabase.from('advance_rates').update({ cents_per_kg: val }).eq('id', existing.id);
      } else {
        await supabase.from('advance_rates').insert({
          producer_id: pid,
          month,
          year: filterYear,
          cents_per_kg: val,
          user_id: user!.id,
        });
      }
    }
    setEditingCell(null);
    load();
  };

  const togglePaid = async (pid: string, month: number) => {
    const rate = getRate(pid, month);
    if (!rate) return;

    if (!rate.paid) {
      // Marking as paid → ask for date
      setPendingToggle({ pid, month });
      setPaidDateValue(new Date().toISOString().slice(0, 10));
      setDateDialogOpen(true);
    } else {
      // Unmarking as paid
      await supabase.from('advance_rates').update({ paid: false, paid_date: null } as any).eq('id', rate.id);
      load();
    }
  };

  const confirmPaidDate = async () => {
    if (!pendingToggle) return;
    const rate = getRate(pendingToggle.pid, pendingToggle.month);
    if (!rate) return;
    await supabase.from('advance_rates').update({ paid: true, paid_date: paidDateValue || null } as any).eq('id', rate.id);
    setDateDialogOpen(false);
    setPendingToggle(null);
    load();
  };

  const getAdvance = (pid: string, month: number) => {
    const rate = getRate(pid, month);
    if (!rate) return 0;
    return (getKg(pid) * rate.cents_per_kg) / 100;
  };

  const monthTotals = MONTHS.map((_, i) => {
    const month = i + 1;
    const total = producers.reduce((sum, p) => sum + getAdvance(p.id, month), 0);
    const paid = producers.reduce((sum, p) => {
      const rate = getRate(p.id, month);
      return sum + (rate?.paid ? getAdvance(p.id, month) : 0);
    }, 0);
    return { total, paid, pending: total - paid };
  });

  const grandTotal = monthTotals.reduce((s, m) => s + m.total, 0);
  const grandPaid = monthTotals.reduce((s, m) => s + m.paid, 0);
  const grandPending = monthTotals.reduce((s, m) => s + m.pending, 0);

  const fmt = (n: number) => n > 0 ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Anticipos</h1>
          <p className="text-muted-foreground">Ingresa ¢/kg por productor y mes. Anticipo = Kg × ¢/kg ÷ 100</p>
        </div>
        <Select value={String(filterYear)} onValueChange={v => setFilterYear(Number(v))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>{[2024,2025,2026,2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {/* Grid de centavos por mes */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Centavos por Kilo (¢/kg)</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-card z-10 min-w-[140px]">Productor</TableHead>
                <TableHead className="text-right min-w-[80px]">Kg Secos</TableHead>
                {MONTHS.map((m, i) => (
                  <TableHead key={i} className="text-center min-w-[80px]">{m}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {producers.filter(p => !p.name.toLowerCase().includes(SPECIAL_PRODUCER_MATCH)).map(p => (
                <TableRow key={p.id}>
                  <TableCell className="sticky left-0 bg-card z-10 font-medium">{p.name}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{Number(getKg(p.id)).toLocaleString('es-CL')}</TableCell>
                  {MONTHS.map((_, i) => {
                    const month = i + 1;
                    const key = cellKey(p.id, month);
                    const rate = getRate(p.id, month);
                    const isEditing = editingCell === key;

                    return (
                      <TableCell key={i} className="text-center p-1">
                        {isEditing ? (
                          <Input
                            type="number"
                            step="any"
                            className="h-8 w-16 text-center mx-auto text-sm"
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={() => saveCell(p.id, month)}
                            onKeyDown={e => { if (e.key === 'Enter') saveCell(p.id, month); if (e.key === 'Escape') setEditingCell(null); }}
                            autoFocus
                          />
                        ) : (
                          <button
                            className="w-full h-8 text-sm hover:bg-accent rounded transition-colors flex items-center justify-center gap-1"
                            onClick={() => { setEditingCell(key); setEditValue(rate ? String(rate.cents_per_kg) : ''); }}
                          >
                            {rate ? (
                              <span className={rate.paid ? 'text-green-600 font-medium' : ''}>{rate.cents_per_kg}</span>
                            ) : (
                              <span className="text-muted-foreground/40">—</span>
                            )}
                          </button>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Anticipo USD por mes */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Anticipo USD por Mes</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-card z-10 min-w-[140px]">Productor</TableHead>
                {MONTHS.map((m, i) => (
                  <TableHead key={i} className="text-center min-w-[100px]">{m}</TableHead>
                ))}
                <TableHead className="text-right min-w-[100px]">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {producers.filter(p => MONTHS.some((_, i) => getRate(p.id, i + 1))).map(p => {
                const total = MONTHS.reduce((s, _, i) => s + getAdvance(p.id, i + 1), 0);
                return (
                  <TableRow key={p.id}>
                    <TableCell className="sticky left-0 bg-card z-10 font-medium">{p.name}</TableCell>
                    {MONTHS.map((_, i) => {
                      const month = i + 1;
                      const adv = getAdvance(p.id, month);
                      const rate = getRate(p.id, month);
                      return (
                        <TableCell key={i} className="text-center p-1">
                          {adv > 0 ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <span className={`text-sm ${rate?.paid ? 'text-green-600 line-through' : 'font-medium'}`}>
                                {fmt(adv)}
                              </span>
                              <Checkbox
                                checked={rate?.paid ?? false}
                                onCheckedChange={() => togglePaid(p.id, month)}
                                className="h-3.5 w-3.5"
                              />
                            </div>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-right font-bold">{fmt(total)}</TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="font-bold bg-muted/50">
                <TableCell className="sticky left-0 bg-muted/50 z-10">Total</TableCell>
                {monthTotals.map((m, i) => (
                  <TableCell key={i} className="text-center">{fmt(m.total)}</TableCell>
                ))}
                <TableCell className="text-right">{fmt(grandTotal)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Resumen de pagos */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Resumen de Pagos {filterYear}</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-card z-10">Concepto</TableHead>
                {MONTHS.map((m, i) => (
                  <TableHead key={i} className="text-center min-w-[100px]">{m}</TableHead>
                ))}
                <TableHead className="text-right min-w-[100px]">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="sticky left-0 bg-card z-10 font-medium">A pagar</TableCell>
                {monthTotals.map((m, i) => (
                  <TableCell key={i} className="text-center text-sm">{fmt(m.total)}</TableCell>
                ))}
                <TableCell className="text-right font-bold">{fmt(grandTotal)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="sticky left-0 bg-card z-10 font-medium text-green-600">Pagado</TableCell>
                {monthTotals.map((m, i) => (
                  <TableCell key={i} className="text-center text-sm text-green-600">{fmt(m.paid)}</TableCell>
                ))}
                <TableCell className="text-right font-bold text-green-600">{fmt(grandPaid)}</TableCell>
              </TableRow>
              <TableRow className="bg-muted/50">
                <TableCell className="sticky left-0 bg-muted/50 z-10 font-bold">Pendiente</TableCell>
                {monthTotals.map((m, i) => (
                  <TableCell key={i} className="text-center font-bold text-sm">{fmt(m.pending)}</TableCell>
                ))}
                <TableCell className="text-right font-bold">{fmt(grandPending)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog for paid date */}
      <Dialog open={dateDialogOpen} onOpenChange={(open) => { if (!open) { setDateDialogOpen(false); setPendingToggle(null); } }}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Fecha de Pago</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="paid-date">¿Cuándo se pagó este anticipo?</Label>
            <Input
              id="paid-date"
              type="date"
              value={paidDateValue}
              onChange={e => setPaidDateValue(e.target.value)}
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDateDialogOpen(false); setPendingToggle(null); }}>Cancelar</Button>
            <Button onClick={confirmPaidDate}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Advances;
