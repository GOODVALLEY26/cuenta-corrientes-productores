import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type ProducerIva = {
  producerId: string;
  producerName: string;
  ivaSecado: number;       // IVA that producer OWES us (from drying invoices)
  ivaFacturado: number;    // IVA that WE OWE producer (from producer invoices)
  saldoIva: number;        // Balance: positive = producer still owes us
  ivaPagar: number;        // IVA we need to pay this period (if saldo < 0)
};

const IvaTracking = () => {
  const { user } = useAuth();
  const [data, setData] = useState<ProducerIva[]>([]);

  const load = async () => {
    const [prodRes, dryRes, prodInvRes] = await Promise.all([
      supabase.from('producers').select('id, name').order('name'),
      supabase.from('drying_invoices').select('producer_id, iva_clp'),
      supabase.from('producer_invoices').select('producer_id, iva_clp'),
    ]);

    const producers = prodRes.data ?? [];
    const dryingInvoices = dryRes.data ?? [];
    const producerInvoices = prodInvRes.data ?? [];

    const result: ProducerIva[] = producers.map(p => {
      // IVA from drying invoices = producer owes us
      const ivaSecado = dryingInvoices
        .filter(d => d.producer_id === p.id)
        .reduce((sum, d) => sum + Number(d.iva_clp || 0), 0);

      // IVA from producer invoices = we owe producer
      const ivaFacturado = producerInvoices
        .filter(i => i.producer_id === p.id)
        .reduce((sum, i) => sum + Number(i.iva_clp || 0), 0);

      // Positive saldo = producer still owes us IVA (we don't pay)
      // Negative saldo = we owe IVA to producer
      const saldoIva = ivaSecado - ivaFacturado;
      const ivaPagar = saldoIva < 0 ? Math.abs(saldoIva) : 0;

      return {
        producerId: p.id,
        producerName: p.name,
        ivaSecado,
        ivaFacturado,
        saldoIva,
        ivaPagar,
      };
    }).filter(p => p.ivaSecado > 0 || p.ivaFacturado > 0);

    setData(result);
  };

  useEffect(() => { if (user) load(); }, [user]);

  const totals = data.reduce((acc, d) => ({
    ivaSecado: acc.ivaSecado + d.ivaSecado,
    ivaFacturado: acc.ivaFacturado + d.ivaFacturado,
    ivaPagar: acc.ivaPagar + d.ivaPagar,
  }), { ivaSecado: 0, ivaFacturado: 0, ivaPagar: 0 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Control de IVA</h1>
        <p className="text-muted-foreground">
          El IVA del secado lo debe el productor. A medida que factura (facturas + notas de débito), se va compensando.
          Solo se paga IVA cuando el productor ha facturado más IVA del que debe por secado.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">IVA Secado (nos deben)</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">${totals.ivaSecado.toLocaleString('es-CL')}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">IVA Facturado (debemos)</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">${totals.ivaFacturado.toLocaleString('es-CL')}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">IVA a Pagar</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-destructive">${totals.ivaPagar.toLocaleString('es-CL')}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Productor</TableHead>
                <TableHead className="text-right">IVA Secado (nos deben)</TableHead>
                <TableHead className="text-right">IVA Facturado (debemos)</TableHead>
                <TableHead className="text-right">Saldo IVA</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">IVA a Pagar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Sin datos de IVA</TableCell></TableRow>
              ) : data.map(d => (
                <TableRow key={d.producerId}>
                  <TableCell className="font-medium">{d.producerName}</TableCell>
                  <TableCell className="text-right">${d.ivaSecado.toLocaleString('es-CL')}</TableCell>
                  <TableCell className="text-right">${d.ivaFacturado.toLocaleString('es-CL')}</TableCell>
                  <TableCell className="text-right font-semibold">
                    {d.saldoIva >= 0 ? (
                      <span className="text-green-600">${d.saldoIva.toLocaleString('es-CL')}</span>
                    ) : (
                      <span className="text-destructive">-${Math.abs(d.saldoIva).toLocaleString('es-CL')}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {d.saldoIva > 0 ? (
                      <Badge variant="outline" className="text-green-600">Cubierto</Badge>
                    ) : d.saldoIva === 0 ? (
                      <Badge variant="secondary">Empate</Badge>
                    ) : (
                      <Badge variant="destructive">Debe IVA</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-bold">
                    {d.ivaPagar > 0 ? `$${d.ivaPagar.toLocaleString('es-CL')}` : '-'}
                  </TableCell>
                </TableRow>
              ))}
              {data.length > 0 && (
                <TableRow className="font-bold bg-muted/50">
                  <TableCell>TOTAL</TableCell>
                  <TableCell className="text-right">${totals.ivaSecado.toLocaleString('es-CL')}</TableCell>
                  <TableCell className="text-right">${totals.ivaFacturado.toLocaleString('es-CL')}</TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-right text-destructive">${totals.ivaPagar.toLocaleString('es-CL')}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default IvaTracking;
