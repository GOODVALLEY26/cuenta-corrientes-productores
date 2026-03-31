import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

type Producer = { id: string; name: string };
type DryKgReport = { id: string; producer_id: string; month: number; year: number; dry_kg: number; producers?: { name: string } };

const DryKg = () => {
  const { user } = useAuth();
  const [producers, setProducers] = useState<Producer[]>([]);
  const [reports, setReports] = useState<DryKgReport[]>([]);
  const [open, setOpen] = useState(false);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [form, setForm] = useState({ producer_id: '', month: String(new Date().getMonth() + 1), year: String(new Date().getFullYear()), dry_kg: '' });

  const load = async () => {
    const [p, r] = await Promise.all([
      supabase.from('producers').select('id, name').order('name'),
      supabase.from('dry_kg_reports').select('*, producers(name)').eq('year', filterYear).order('month'),
    ]);
    if (p.data) setProducers(p.data);
    if (r.data) setReports(r.data as any);
  };

  useEffect(() => { if (user) load(); }, [user, filterYear]);

  const save = async () => {
    if (!form.producer_id || !form.dry_kg) { toast.error('Completa todos los campos'); return; }
    const { error } = await supabase.from('dry_kg_reports').upsert({
      producer_id: form.producer_id,
      month: Number(form.month),
      year: Number(form.year),
      dry_kg: Number(form.dry_kg),
      user_id: user!.id,
    }, { onConflict: 'producer_id,month,year' });
    if (error) { toast.error(error.message); return; }
    toast.success('Kilos secos guardados');
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('¿Eliminar?')) return;
    await supabase.from('dry_kg_reports').delete().eq('id', id);
    toast.success('Eliminado');
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Kilos Secos</h1>
          <p className="text-muted-foreground">Registro de kilos secos por productor y mes</p>
        </div>
        <div className="flex gap-2">
          <Select value={String(filterYear)} onValueChange={v => setFilterYear(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[2024,2025,2026,2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => { setForm({ producer_id: '', month: String(new Date().getMonth() + 1), year: String(filterYear), dry_kg: '' }); setOpen(true); }}>
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
                <TableHead>Mes</TableHead>
                <TableHead>Año</TableHead>
                <TableHead className="text-right">Kilos Secos</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Sin registros para {filterYear}</TableCell></TableRow>
              ) : reports.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{(r as any).producers?.name}</TableCell>
                  <TableCell>{MONTHS[r.month - 1]}</TableCell>
                  <TableCell>{r.year}</TableCell>
                  <TableCell className="text-right">{Number(r.dry_kg).toLocaleString('es-CL')}</TableCell>
                  <TableCell><Button variant="ghost" size="icon" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar Kilos Secos</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Productor</Label>
              <Select value={form.producer_id} onValueChange={v => setForm({ ...form, producer_id: v })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>{producers.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
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
              <Label>Kilos Secos</Label>
              <Input type="number" step="0.01" value={form.dry_kg} onChange={e => setForm({ ...form, dry_kg: e.target.value })} />
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

export default DryKg;
