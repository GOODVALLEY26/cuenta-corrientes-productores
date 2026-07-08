
-- 1) Harden shared_account_user_id: return NULL for anon callers
CREATE OR REPLACE FUNCTION private.shared_account_user_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT owner_user_id
  FROM public.company_account
  WHERE auth.uid() IS NOT NULL
  ORDER BY created_at ASC
  LIMIT 1
$function$;

-- 2) Drop existing overly-broad and conflicting storage policies
DROP POLICY IF EXISTS "Company users can view drying invoice files" ON storage.objects;
DROP POLICY IF EXISTS "Company users can upload drying invoice files" ON storage.objects;
DROP POLICY IF EXISTS "Company users can update drying invoice files" ON storage.objects;
DROP POLICY IF EXISTS "Company users can delete drying invoice files" ON storage.objects;

DROP POLICY IF EXISTS "Company users can view producer invoice files" ON storage.objects;
DROP POLICY IF EXISTS "Company users can upload producer invoice files" ON storage.objects;
DROP POLICY IF EXISTS "Company users can update producer invoice files" ON storage.objects;
DROP POLICY IF EXISTS "Company users can delete producer invoice files" ON storage.objects;

DROP POLICY IF EXISTS "Users can view own producer invoice files" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own producer invoice files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own producer invoice files" ON storage.objects;

-- 3) Drying invoices: file must be referenced from a drying_invoices row visible to the caller (RLS scopes to shared account)
CREATE POLICY "Drying files: read via linked invoice"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'drying-invoices-files'
  AND EXISTS (SELECT 1 FROM public.drying_invoices di WHERE di.file_path = storage.objects.name)
);

CREATE POLICY "Drying files: upload to own folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'drying-invoices-files'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Drying files: update linked or own"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'drying-invoices-files'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR EXISTS (SELECT 1 FROM public.drying_invoices di WHERE di.file_path = storage.objects.name)
  )
)
WITH CHECK (
  bucket_id = 'drying-invoices-files'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR EXISTS (SELECT 1 FROM public.drying_invoices di WHERE di.file_path = storage.objects.name)
  )
);

CREATE POLICY "Drying files: delete linked or own"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'drying-invoices-files'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR EXISTS (SELECT 1 FROM public.drying_invoices di WHERE di.file_path = storage.objects.name)
  )
);

-- 4) Producer invoices: same pattern
CREATE POLICY "Producer files: read via linked invoice"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'producer-invoices-files'
  AND EXISTS (SELECT 1 FROM public.producer_invoices pi WHERE pi.file_path = storage.objects.name)
);

CREATE POLICY "Producer files: upload to own folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'producer-invoices-files'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Producer files: update linked or own"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'producer-invoices-files'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR EXISTS (SELECT 1 FROM public.producer_invoices pi WHERE pi.file_path = storage.objects.name)
  )
)
WITH CHECK (
  bucket_id = 'producer-invoices-files'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR EXISTS (SELECT 1 FROM public.producer_invoices pi WHERE pi.file_path = storage.objects.name)
  )
);

CREATE POLICY "Producer files: delete linked or own"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'producer-invoices-files'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR EXISTS (SELECT 1 FROM public.producer_invoices pi WHERE pi.file_path = storage.objects.name)
  )
);
