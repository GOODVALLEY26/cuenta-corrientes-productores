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
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

type Producer = { id: string; name: string };
type DryKgReport = { id: string; producer_id: string; dry_kg: number; producers?: { name: string } };

const DryKg = () => {
  const { user } = useAuth();
  const [producers, setProducers] = useState<Producer[]>([]);
  const [reports, setReports] = useState<DryKgReport[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DryKgReport | null>(null);
  const [form, setForm] = useState({ producer_id: '', dry_kg: '' });

  const load = async () => {
    const [p, r] = await Promise.all([
      supabase.from('producers').select('id, name').order('name'),
      supabase.from('dry_kg_reports').select('*, producers(name)').order('created_at'),
    ]);
    if (p.data) setProducers(p.data);
    if (r.data) setReports(r.data as any);
  };

  useEffect(() => { if (user) load(); }, [user]);

  const openNew = () => {
    setEditing(null);
    setForm({ producer_id: '', dry_kg: '' });
    setOpen(true);
  };

  const openEdit = (r: DryKgReport) => {
    setEditing(r);
    setForm({ producer_id: r.producer_id, dry_kg: String(r.dry_kg) });
    setOpen(true);
  };

  const save = async () => {
    if (!form.producer_id || !form.dry_kg) { toast.error('Completa todos los campos'); return; }
    
    if (editing) {
      const { error } = await supabase.from('dry_kg_reports').update({
        dry_kg: Number(form.dry_kg),
      }).eq('id', editing.id);
      if (error) { toast.error(error.message); return; }
      toast.success('Kilos secos actualizados');
    } else {
      const { error } = await supabase.from('dry_kg_reports').upsert({
        producer_id: form.producer_id,
        month: 0,
        year: 0,
        dry_kg: Number(form.dry_kg),
        user_id: user!.id,
      }, { onConflict: 'producer_id' });
      if (error) { toast.error(error.message); return; }
      toast.success('Kilos secos guardados');
    }
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('¿Eliminar?')) return;
    await supabase.from('dry_kg_reports').delete().eq('id', id);
    toast.success('Eliminado');
    load();
  };

  const totalKg = reports.reduce((s, r) => s + Number(r.dry_kg), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Kilos Secos</h1>
          <p className="text-muted-foreground">Total de kilos secos por productor (independiente del mes)</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-2" />Agregar
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Productor</TableHead>
                <TableHead className="text-right">Kilos Secos</TableHead>
                <TableHead className="w-24">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">Sin registros</TableCell></TableRow>
              ) : reports.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{(r as any).producers?.name}</TableCell>
                  <TableCell className="text-right">{Number(r.dry_kg).toLocaleString('es-CL')}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {reports.length > 0 && (
                <TableRow className="font-bold bg-muted/50">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">{totalKg.toLocaleString('es-CL')}</TableCell>
                  <TableCell></TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Editar Kilos Secos' : 'Registrar Kilos Secos'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {!editing && (
              <div className="space-y-2">
                <Label>Productor</Label>
                <Select value={form.producer_id} onValueChange={v => setForm({ ...form, producer_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                  <SelectContent>{producers.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Kilos Secos (total)</Label>
              <Input type="number" step="0.01" value={form.dry_kg} onChange={e => setForm({ ...form, dry_kg: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>{editing ? 'Guardar' : 'Crear'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DryKg;
