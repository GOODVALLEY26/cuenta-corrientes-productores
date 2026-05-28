import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

const TABLES = [
  'producers',
  'dry_kg_reports',
  'advance_rates',
  'exchange_rates',
  'drying_invoices',
  'installment_payments',
  'producer_invoices',
  'payment_flows',
  'iva_payments',
] as const;

const Backup = () => {
  const [loading, setLoading] = useState(false);

  const downloadAll = async () => {
    setLoading(true);
    try {
      const wb = XLSX.utils.book_new();

      for (const table of TABLES) {
        const all: any[] = [];
        let from = 0;
        const pageSize = 1000;
        while (true) {
          const { data, error } = await supabase
            .from(table as any)
            .select('*')
            .range(from, from + pageSize - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          all.push(...data);
          if (data.length < pageSize) break;
          from += pageSize;
        }
        const ws = XLSX.utils.json_to_sheet(all.length ? all : [{ info: 'Sin datos' }]);
        XLSX.utils.book_append_sheet(wb, ws, table.slice(0, 31));
      }

      const today = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `respaldo-${today}.xlsx`);
      toast.success('Respaldo descargado');
    } catch (e: any) {
      console.error(e);
      toast.error('Error al generar respaldo: ' + (e.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Respaldo</h1>
        <p className="text-muted-foreground">Descarga toda la información del sistema en un archivo Excel.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Respaldo completo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Se generará un archivo <code>.xlsx</code> con una hoja por cada tabla del sistema:
          </p>
          <ul className="text-sm list-disc pl-5 text-muted-foreground space-y-0.5">
            {TABLES.map(t => <li key={t}><code>{t}</code></li>)}
          </ul>
          <Button onClick={downloadAll} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            {loading ? 'Generando...' : 'Descargar respaldo Excel'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default Backup;