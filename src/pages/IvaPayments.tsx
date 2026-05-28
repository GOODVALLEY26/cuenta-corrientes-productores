import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

type Producer = { id: string; name: string };
type IvaPayment = {
  id: string;
  producer_id: string;
  payment_date: string;
  amount_clp: number;
  notes: string | null;
};

const IvaPayments = () => {
  const { user } = useAuth();
  const [producers, setProducers] = useState<Producer[]>([]);
  const [payments, setPayments] = useState<IvaPayment[]>([]);
  const [filterProducer, setFilterProducer] = useState<string>('all');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    producer_id: '',
    payment_date: new Date().toISOString().slice(0, 10),
    amount_clp: '',
    notes: '',
  });

  const load = async () => {
    const [pRes, payRes] = await Promise.all([
      supabase.from('producers').select('id, name').order('name'),
      supabase.from('iva_payments').select('*').order('payment_date', { ascending: false }),
    ]);
    if (pRes.data) setProducers(pRes.data);
    if (payRes.data) setPayments(payRes.data as IvaPayment[]);
  };

  useEffect(() => { if (user) load(); }, [user]);

  const save = async () => {
    if (!form.producer_id) { toast.error('Selecciona un productor'); return; }
    const amount = Number(form.amount_clp);
    if (!amount || isNaN(amount)) { toast.error('Ingresa un monto válido'); return; }
    const { error } = await supabase.from('iva_payments').insert({
      producer_id: form.producer_id,
      payment_date: form.payment_date,
      amount_clp: amount,
      notes: form.notes || null,
      user_id: user!.id,
    } as any);
    if (error) { toast.error('Error al guardar'); return; }
    toast.success('Pago de IVA registrado');
    setOpen(false);
    setForm({ producer_id: '', payment_date: new Date().toISOString().slice(0, 10), amount_clp: '', notes: '' });
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('¿Eliminar este pago?')) return;
    const { error } = await supabase.from('iva_payments').delete().eq('id', id);
    if (error) { toast.error('Error al eliminar'); return; }
    load();
  };

  const filtered = filterProducer === 'all' ? payments : payments.filter(p => p.producer_id === filterProducer);
  const total = filtered.reduce((s, p) => s + Number(p.amount_clp), 0);
  const nameOf = (id: string) => producers.find(p => p.id === id)?.name ?? '—';
  const fmtClp = (n: number) => Math.round(n).toLocaleString('es-CL');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Pagos de IVA</h1>
          <p className="text-muted-foreground">Registra los pagos de IVA realizados a cada productor. Se descuentan en el Balance IVA de la cuenta corriente.</p>
        </div>
        <div className="flex gap-2">
          <Select value={filterProducer} onValueChange={setFilterProducer}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Filtrar productor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los productores</SelectItem>
              {producers.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-1" /> Nuevo pago</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Registrar pago de IVA</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Productor</Label>
                  <Select value={form.producer_id} onValueChange={v => setForm({ ...form, producer_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecciona..." /></SelectTrigger>
                    <SelectContent>{producers.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Fecha de pago</Label>
                  <Input type="date" value={form.payment_date} onChange={e => setForm({ ...form, payment_date: e.target.value })} />
                </div>
                <div>
                  <Label>Monto CLP</Label>
                  <Input type="number" value={form.amount_clp} onChange={e => setForm({ ...form, amount_clp: e.target.value })} placeholder="0" />
                </div>
                <div>
                  <Label>Notas</Label>
                  <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Opcional" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={save}>Guardar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Total {filterProducer === 'all' ? 'general' : `de ${nameOf(filterProducer)}`}: CLP {fmtClp(total)}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Productor</TableHead>
                <TableHead className="text-right">Monto CLP</TableHead>
                <TableHead>Notas</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Sin pagos registrados</TableCell></TableRow>
              ) : filtered.map(p => (
                <TableRow key={p.id}>
                  <TableCell>{p.payment_date}</TableCell>
                  <TableCell className="font-medium">{nameOf(p.producer_id)}</TableCell>
                  <TableCell className="text-right font-bold">CLP {fmtClp(Number(p.amount_clp))}</TableCell>
                  <TableCell className="text-muted-foreground">{p.notes ?? '—'}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => remove(p.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default IvaPayments;