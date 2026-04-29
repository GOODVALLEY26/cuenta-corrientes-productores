DROP POLICY IF EXISTS "Users can upload own drying invoice files" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own drying invoice files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own drying invoice files" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload producer invoice files" ON storage.objects;
DROP POLICY IF EXISTS "Users can view producer invoice files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete producer invoice files" ON storage.objects;

CREATE POLICY "Company users can upload drying invoice files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'drying-invoices-files');

CREATE POLICY "Company users can view drying invoice files"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'drying-invoices-files');

CREATE POLICY "Company users can update drying invoice files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'drying-invoices-files')
WITH CHECK (bucket_id = 'drying-invoices-files');

CREATE POLICY "Company users can delete drying invoice files"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'drying-invoices-files');

CREATE POLICY "Company users can upload producer invoice files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'producer-invoices-files');

CREATE POLICY "Company users can view producer invoice files"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'producer-invoices-files');

CREATE POLICY "Company users can update producer invoice files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'producer-invoices-files')
WITH CHECK (bucket_id = 'producer-invoices-files');

CREATE POLICY "Company users can delete producer invoice files"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'producer-invoices-files');