import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

type Producer = {
  id: string;
  name: string;
  rut: string | null;
  email: string | null;
  phone: string | null;
  drying_payment_method: string;
  notes: string | null;
};

const METHODS: Record<string, string> = {
  descuento_usd: 'Descuento en USD',
  pago_clp: 'Pago en CLP',
  'liquidacion_fin_año': 'Liquidación fin de año',
  cuotas: 'Cuotas',
};

const Producers = () => {
  const { user } = useAuth();
  const [producers, setProducers] = useState<Producer[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Producer | null>(null);
  const [form, setForm] = useState({ name: '', rut: '', email: '', phone: '', drying_payment_method: 'descuento_usd', notes: '' });

  const load = async () => {
    const { data } = await supabase.from('producers').select('*').order('name');
    if (data) setProducers(data);
  };

  useEffect(() => { if (user) load(); }, [user]);

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', rut: '', email: '', phone: '', drying_payment_method: 'descuento_usd', notes: '' });
    setOpen(true);
  };

  const openEdit = (p: Producer) => {
    setEditing(p);
    setForm({ name: p.name, rut: p.rut ?? '', email: p.email ?? '', phone: p.phone ?? '', drying_payment_method: p.drying_payment_method, notes: p.notes ?? '' });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error('Nombre requerido'); return; }
    const payload = {
      name: form.name.trim(),
      rut: form.rut.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      drying_payment_method: form.drying_payment_method as any,
      notes: form.notes.trim() || null,
      user_id: user!.id,
    };

    if (editing) {
      const { error } = await supabase.from('producers').update(payload).eq('id', editing.id);
      if (error) { toast.error(error.message); return; }
      toast.success('Productor actualizado');
    } else {
      const { error } = await supabase.from('producers').insert(payload);
      if (error) { toast.error(error.message); return; }
      toast.success('Productor creado');
    }
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('¿Eliminar este productor?')) return;
    const { error } = await supabase.from('producers').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Productor eliminado');
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Productores</h1>
          <p className="text-muted-foreground">Gestiona tus productores y su método de cobro de secado</p>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Agregar</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>RUT</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Método Secado</TableHead>
                <TableHead className="w-24">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {producers.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No hay productores. Agrega el primero.</TableCell></TableRow>
              ) : producers.map(p => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.rut ?? '-'}</TableCell>
                  <TableCell>{p.email ?? '-'}</TableCell>
                  <TableCell>{METHODS[p.drying_payment_method] ?? p.drying_payment_method}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Productor' : 'Nuevo Productor'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>RUT</Label>
                <Input value={form.rut} onChange={e => setForm({ ...form, rut: e.target.value })} placeholder="12.345.678-9" />
              </div>
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Método de Cobro Secado</Label>
              <Select value={form.drying_payment_method} onValueChange={v => setForm({ ...form, drying_payment_method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(METHODS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notas</Label>
              <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
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

export default Producers;
