import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { FolderOpen, FileText, Loader2, RefreshCw, Download } from 'lucide-react';
import { toast } from 'sonner';

const DRIVE_FOLDER_ID = '1ugXdx3lBftbpVYfGxCWbxaeAd25oXWt8';

type DriveFile = {
  id: string;
  name: string;
  createdTime: string;
  modifiedTime: string;
  size?: string;
};

type ParsedInvoice = {
  invoice_type: 'producer' | 'drying';
  producer_name: string | null;
  invoice_number: string | null;
  amount_net_clp: number | null;
  iva_clp: number | null;
  date: string | null;
  exchange_rate: number | null;
  document_type: string | null;
  notes: string | null;
  pdf_base64: string;
  file_name: string;
};

interface DriveFileBrowserProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvoiceImported: (data: ParsedInvoice) => void;
}

const DriveFileBrowser = ({ open, onOpenChange, onInvoiceImported }: DriveFileBrowserProps) => {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);

  const loadFiles = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/list-drive-files`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ folderId: DRIVE_FOLDER_ID }),
      });

      if (!res.ok) throw new Error('Error al listar archivos');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setFiles(data.files || []);
    } catch (err: any) {
      toast.error(err.message || 'Error conectando con Google Drive');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) loadFiles();
  }, [open]);

  const importFile = async (file: DriveFile) => {
    setImporting(file.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/download-drive-file`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fileId: file.id, fileName: file.name }),
      });

      if (!res.ok) throw new Error('Error al descargar archivo');
      const parsed = await res.json();
      if (parsed.error) throw new Error(parsed.error);

      toast.success(`"${file.name}" procesado correctamente`);
      onInvoiceImported(parsed);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || 'Error importando archivo');
    } finally {
      setImporting(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Archivos en Google Drive
          </DialogTitle>
        </DialogHeader>

        <div className="flex justify-end mb-2">
          <Button variant="outline" size="sm" onClick={loadFiles} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>

        <div className="overflow-auto max-h-[55vh]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Cargando archivos...</span>
            </div>
          ) : files.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>No se encontraron archivos PDF en la carpeta</p>
              <p className="text-xs mt-1">Asegúrate de compartir la carpeta con la cuenta de servicio</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Archivo</TableHead>
                  <TableHead>Modificado</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map(file => (
                  <TableRow key={file.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-red-500 shrink-0" />
                        <span className="truncate max-w-[300px]">{file.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(file.modifiedTime).toLocaleDateString('es-CL')}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        onClick={() => importFile(file)}
                        disabled={importing !== null}
                      >
                        {importing === file.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4 mr-1" />
                        )}
                        {importing === file.id ? 'Leyendo...' : 'Importar'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DriveFileBrowser;
