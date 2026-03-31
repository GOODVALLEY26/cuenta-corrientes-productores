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

const ExchangeRate = () => {
  const { user } = useAuth();
  const [rates, setRates] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [form, setForm] = useState({ month: String(new Date().getMonth() + 1), year: String(new Date().getFullYear()), rate: '' });

  const load = async () => {
    const { data } = await supabase.from('exchange_rates').select('*').eq('year', filterYear).order('month');
    if (data) setRates(data);
  };

  useEffect(() => { if (user) load(); }, [user, filterYear]);

  const save = async () => {
    if (!form.rate) { toast.error('Ingresa el tipo de cambio'); return; }
    const { error } = await supabase.from('exchange_rates').upsert({
      month: Number(form.month),
      year: Number(form.year),
      rate: Number(form.rate),
      user_id: user!.id,
    }, { onConflict: 'month,year' });
    if (error) { toast.error(error.message); return; }
    toast.success('Tipo de cambio guardado');
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('¿Eliminar?')) return;
    await supabase.from('exchange_rates').delete().eq('id', id);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Tipo de Cambio</h1>
          <p className="text-muted-foreground">Tipo de cambio CLP/USD por mes</p>
        </div>
        <div className="flex gap-2">
          <Select value={String(filterYear)} onValueChange={v => setFilterYear(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{[2024,2025,2026,2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <Button onClick={() => { setForm({ month: String(new Date().getMonth() + 1), year: String(filterYear), rate: '' }); setOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />Agregar
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mes</TableHead>
                <TableHead>Año</TableHead>
                <TableHead className="text-right">CLP por USD</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rates.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Sin tipos de cambio para {filterYear}</TableCell></TableRow>
              ) : rates.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{MONTHS[r.month - 1]}</TableCell>
                  <TableCell>{r.year}</TableCell>
                  <TableCell className="text-right font-semibold">${Number(r.rate).toLocaleString('es-CL')}</TableCell>
                  <TableCell><Button variant="ghost" size="icon" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Tipo de Cambio</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Mes</Label>
                <Select value={form.month} onValueChange={v => setForm({ ...form, month: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Año</Label>
                <Input type="number" value={form.year} onChange={e => setForm({ ...form, year: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>CLP por USD</Label>
              <Input type="number" step="0.01" value={form.rate} onChange={e => setForm({ ...form, rate: e.target.value })} placeholder="ej: 950" />
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

export default ExchangeRate;
