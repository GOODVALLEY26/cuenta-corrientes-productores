-- 1. Drop unique constraint on dry_kg_reports(producer_id, month, year)
ALTER TABLE public.dry_kg_reports DROP CONSTRAINT IF EXISTS dry_kg_reports_producer_id_month_year_key;

-- Make month and year have defaults (no longer relevant, kept for compatibility)
ALTER TABLE public.dry_kg_reports ALTER COLUMN month SET DEFAULT 0;
ALTER TABLE public.dry_kg_reports ALTER COLUMN year SET DEFAULT 0;

-- Remove duplicates before adding unique constraint
DELETE FROM public.dry_kg_reports a USING public.dry_kg_reports b
WHERE a.id > b.id AND a.producer_id = b.producer_id;

-- One record per producer
ALTER TABLE public.dry_kg_reports ADD CONSTRAINT dry_kg_reports_producer_unique UNIQUE (producer_id);

-- 2. Add file_path to producer_invoices
ALTER TABLE public.producer_invoices ADD COLUMN IF NOT EXISTS file_path TEXT;

-- 3. Create storage bucket for producer invoice files
INSERT INTO storage.buckets (id, name, public) VALUES ('producer-invoices-files', 'producer-invoices-files', false);

CREATE POLICY "Users can upload own producer invoice files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'producer-invoices-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view own producer invoice files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'producer-invoices-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own producer invoice files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'producer-invoices-files' AND auth.uid()::text = (storage.foldername(name))[1]);