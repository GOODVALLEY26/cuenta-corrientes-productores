DROP POLICY IF EXISTS "Drying files: read via linked invoice" ON storage.objects;
DROP POLICY IF EXISTS "Drying files: update linked or own" ON storage.objects;
DROP POLICY IF EXISTS "Drying files: delete linked or own" ON storage.objects;
DROP POLICY IF EXISTS "Producer files: read via linked invoice" ON storage.objects;
DROP POLICY IF EXISTS "Producer files: update linked or own" ON storage.objects;
DROP POLICY IF EXISTS "Producer files: delete linked or own" ON storage.objects;

CREATE POLICY "Drying files: read via linked invoice" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'drying-invoices-files' AND EXISTS (SELECT 1 FROM public.drying_invoices di WHERE di.file_path = objects.name AND di.user_id = private.shared_account_user_id()));
CREATE POLICY "Drying files: update linked or own" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'drying-invoices-files' AND ((select auth.uid())::text = (storage.foldername(name))[1] OR EXISTS (SELECT 1 FROM public.drying_invoices di WHERE di.file_path = objects.name AND di.user_id = private.shared_account_user_id())))
WITH CHECK (bucket_id = 'drying-invoices-files' AND ((select auth.uid())::text = (storage.foldername(name))[1] OR EXISTS (SELECT 1 FROM public.drying_invoices di WHERE di.file_path = objects.name AND di.user_id = private.shared_account_user_id())));
CREATE POLICY "Drying files: delete linked or own" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'drying-invoices-files' AND ((select auth.uid())::text = (storage.foldername(name))[1] OR EXISTS (SELECT 1 FROM public.drying_invoices di WHERE di.file_path = objects.name AND di.user_id = private.shared_account_user_id())));

CREATE POLICY "Producer files: read via linked invoice" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'producer-invoices-files' AND EXISTS (SELECT 1 FROM public.producer_invoices pi WHERE pi.file_path = objects.name AND pi.user_id = private.shared_account_user_id()));
CREATE POLICY "Producer files: update linked or own" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'producer-invoices-files' AND ((select auth.uid())::text = (storage.foldername(name))[1] OR EXISTS (SELECT 1 FROM public.producer_invoices pi WHERE pi.file_path = objects.name AND pi.user_id = private.shared_account_user_id())))
WITH CHECK (bucket_id = 'producer-invoices-files' AND ((select auth.uid())::text = (storage.foldername(name))[1] OR EXISTS (SELECT 1 FROM public.producer_invoices pi WHERE pi.file_path = objects.name AND pi.user_id = private.shared_account_user_id())));
CREATE POLICY "Producer files: delete linked or own" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'producer-invoices-files' AND ((select auth.uid())::text = (storage.foldername(name))[1] OR EXISTS (SELECT 1 FROM public.producer_invoices pi WHERE pi.file_path = objects.name AND pi.user_id = private.shared_account_user_id())));