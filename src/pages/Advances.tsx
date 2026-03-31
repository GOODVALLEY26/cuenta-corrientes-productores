import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

type Producer = { id: string; name: string };
type AdvanceRate = { id: string; producer_id: string; month: number; year: number; cents_per_kg: number; producers?: { name: string } };
type DryKg = { producer_id: string; dry_kg: number };

const Advances = () => {
  const { user } = useAuth();
  const [producers, setProducers] = useState<Producer[]>([]);
  const [rates, setRates] = useState<AdvanceRate[]>([]);
  const [dryKgs, setDryKgs] = useState<DryKg[]>([]);
  const [open, setOpen] = useState(false);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);
  const [form, setForm] = useState({ producer_id: '', cents_per_kg: '' });

  const load = async () => {
    const [p, r, k] = await Promise.all([
      supabase.from('producers').select('id, name').order('name'),
      supabase.from('advance_rates').select('*, producers(name)').eq('year', filterYear).eq('month', filterMonth).order('created_at'),
      supabase.from('dry_kg_reports').select('producer_id, dry_kg'),
    ]);
    if (p.data) setProducers(p.data);
    if (r.data) setRates(r.data as any);
    if (k.data) setDryKgs(k.data);
  };

  useEffect(() => { if (user) load(); }, [user, filterYear, filterMonth]);

  const getKg = (producerId: string) => dryKgs.find(d => d.producer_id === producerId)?.dry_kg ?? 0;

  const save = async () => {
    if (!form.producer_id || !form.cents_per_kg) { toast.error('Completa todos los campos'); return; }
    const { error } = await supabase.from('advance_rates').upsert({
      producer_id: form.producer_id,
      month: filterMonth,
      year: filterYear,
      cents_per_kg: Number(form.cents_per_kg),
      user_id: user!.id,
    }, { onConflict: 'producer_id,month,year' });
    if (error) { toast.error(error.message); return; }
    toast.success('Tasa guardada');
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('¿Eliminar?')) return;
    await supabase.from('advance_rates').delete().eq('id', id);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Anticipos</h1>
          <p className="text-muted-foreground">Centavos por kilo por productor y mes. Anticipo = Kg totales × ¢/kg / 100</p>
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
          <Button onClick={() => { setForm({ producer_id: '', cents_per_kg: '' }); setOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />Agregar
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Productor</TableHead>
                <TableHead className="text-right">Kg Secos (total)</TableHead>
                <TableHead className="text-right">¢/kg</TableHead>
                <TableHead className="text-right">Anticipo USD</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rates.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Sin tasas para {MONTHS[filterMonth - 1]} {filterYear}</TableCell></TableRow>
              ) : rates.map(r => {
                const kg = getKg(r.producer_id);
                const advance = (kg * Number(r.cents_per_kg)) / 100;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{(r as any).producers?.name}</TableCell>
                    <TableCell className="text-right">{Number(kg).toLocaleString('es-CL')}</TableCell>
                    <TableCell className="text-right">{Number(r.cents_per_kg).toFixed(2)}</TableCell>
                    <TableCell className="text-right font-semibold">USD {advance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                    <TableCell><Button variant="ghost" size="icon" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                  </TableRow>
                );
              })}
              {rates.length > 0 && (
                <TableRow className="font-bold bg-muted/50">
                  <TableCell>Total</TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-right">
                    USD {rates.reduce((s, r) => s + (getKg(r.producer_id) * Number(r.cents_per_kg)) / 100, 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell></TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Tasa de Anticipo - {MONTHS[filterMonth - 1]} {filterYear}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Productor</Label>
              <Select value={form.producer_id} onValueChange={v => setForm({ ...form, producer_id: v })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>{producers.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Centavos por Kilo (¢/kg)</Label>
              <Input type="number" step="0.01" value={form.cents_per_kg} onChange={e => setForm({ ...form, cents_per_kg: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Advances;
