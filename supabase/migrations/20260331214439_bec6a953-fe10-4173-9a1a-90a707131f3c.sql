
-- Create storage bucket for drying invoice PDFs
INSERT INTO storage.buckets (id, name, public) VALUES ('drying-invoices-files', 'drying-invoices-files', false);

-- Storage policies: users can manage their own files (folder = user_id)
CREATE POLICY "Users can upload own drying invoice files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'drying-invoices-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view own drying invoice files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'drying-invoices-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own drying invoice files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'drying-invoices-files' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Add file_path column to drying_invoices
ALTER TABLE public.drying_invoices ADD COLUMN file_path TEXT;
