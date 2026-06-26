
-- Move SECURITY DEFINER helpers out of the public (API-exposed) schema
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

-- Recreate shared_account_user_id in private schema
CREATE OR REPLACE FUNCTION private.shared_account_user_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT owner_user_id
  FROM public.company_account
  ORDER BY created_at ASC
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION private.shared_account_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.shared_account_user_id() TO authenticated, service_role;

-- Recreate trigger function in private schema
CREATE OR REPLACE FUNCTION private.set_shared_account_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  shared_user UUID;
BEGIN
  shared_user := private.shared_account_user_id();
  IF shared_user IS NOT NULL THEN
    NEW.user_id := shared_user;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.set_shared_account_user_id() FROM PUBLIC;
-- Trigger functions are invoked by the trigger system; no role EXECUTE needed.

-- Repoint all RLS policies to private.shared_account_user_id()
DROP POLICY IF EXISTS "Company users manage shared installment_payments" ON public.installment_payments;
CREATE POLICY "Company users manage shared installment_payments" ON public.installment_payments
  FOR ALL TO authenticated
  USING (user_id = private.shared_account_user_id())
  WITH CHECK (user_id = private.shared_account_user_id());

DROP POLICY IF EXISTS "Company users manage shared producers" ON public.producers;
CREATE POLICY "Company users manage shared producers" ON public.producers
  FOR ALL TO authenticated
  USING (user_id = private.shared_account_user_id())
  WITH CHECK (user_id = private.shared_account_user_id());

DROP POLICY IF EXISTS "Company users manage shared dry_kg_reports" ON public.dry_kg_reports;
CREATE POLICY "Company users manage shared dry_kg_reports" ON public.dry_kg_reports
  FOR ALL TO authenticated
  USING (user_id = private.shared_account_user_id())
  WITH CHECK (user_id = private.shared_account_user_id());

DROP POLICY IF EXISTS "Company users manage shared advance_rates" ON public.advance_rates;
CREATE POLICY "Company users manage shared advance_rates" ON public.advance_rates
  FOR ALL TO authenticated
  USING (user_id = private.shared_account_user_id())
  WITH CHECK (user_id = private.shared_account_user_id());

DROP POLICY IF EXISTS "Company users manage shared exchange_rates" ON public.exchange_rates;
CREATE POLICY "Company users manage shared exchange_rates" ON public.exchange_rates
  FOR ALL TO authenticated
  USING (user_id = private.shared_account_user_id())
  WITH CHECK (user_id = private.shared_account_user_id());

DROP POLICY IF EXISTS "Company users manage shared drying_invoices" ON public.drying_invoices;
CREATE POLICY "Company users manage shared drying_invoices" ON public.drying_invoices
  FOR ALL TO authenticated
  USING (user_id = private.shared_account_user_id())
  WITH CHECK (user_id = private.shared_account_user_id());

DROP POLICY IF EXISTS "Company users manage shared producer_invoices" ON public.producer_invoices;
CREATE POLICY "Company users manage shared producer_invoices" ON public.producer_invoices
  FOR ALL TO authenticated
  USING (user_id = private.shared_account_user_id())
  WITH CHECK (user_id = private.shared_account_user_id());

DROP POLICY IF EXISTS "Company users manage shared payment_flows" ON public.payment_flows;
CREATE POLICY "Company users manage shared payment_flows" ON public.payment_flows
  FOR ALL TO authenticated
  USING (user_id = private.shared_account_user_id())
  WITH CHECK (user_id = private.shared_account_user_id());

DROP POLICY IF EXISTS "Company users manage shared iva_payments" ON public.iva_payments;
CREATE POLICY "Company users manage shared iva_payments" ON public.iva_payments
  FOR ALL TO authenticated
  USING (user_id = private.shared_account_user_id())
  WITH CHECK (user_id = private.shared_account_user_id());

-- Repoint all triggers to private.set_shared_account_user_id()
DROP TRIGGER IF EXISTS set_shared_account_user_id_producers ON public.producers;
CREATE TRIGGER set_shared_account_user_id_producers BEFORE INSERT ON public.producers
  FOR EACH ROW EXECUTE FUNCTION private.set_shared_account_user_id();

DROP TRIGGER IF EXISTS set_shared_account_user_id_dry_kg_reports ON public.dry_kg_reports;
CREATE TRIGGER set_shared_account_user_id_dry_kg_reports BEFORE INSERT ON public.dry_kg_reports
  FOR EACH ROW EXECUTE FUNCTION private.set_shared_account_user_id();

DROP TRIGGER IF EXISTS set_shared_account_user_id_advance_rates ON public.advance_rates;
CREATE TRIGGER set_shared_account_user_id_advance_rates BEFORE INSERT ON public.advance_rates
  FOR EACH ROW EXECUTE FUNCTION private.set_shared_account_user_id();

DROP TRIGGER IF EXISTS set_shared_account_user_id_exchange_rates ON public.exchange_rates;
CREATE TRIGGER set_shared_account_user_id_exchange_rates BEFORE INSERT ON public.exchange_rates
  FOR EACH ROW EXECUTE FUNCTION private.set_shared_account_user_id();

DROP TRIGGER IF EXISTS set_shared_account_user_id_drying_invoices ON public.drying_invoices;
CREATE TRIGGER set_shared_account_user_id_drying_invoices BEFORE INSERT ON public.drying_invoices
  FOR EACH ROW EXECUTE FUNCTION private.set_shared_account_user_id();

DROP TRIGGER IF EXISTS set_shared_account_user_id_installment_payments ON public.installment_payments;
CREATE TRIGGER set_shared_account_user_id_installment_payments BEFORE INSERT ON public.installment_payments
  FOR EACH ROW EXECUTE FUNCTION private.set_shared_account_user_id();

DROP TRIGGER IF EXISTS set_shared_account_user_id_producer_invoices ON public.producer_invoices;
CREATE TRIGGER set_shared_account_user_id_producer_invoices BEFORE INSERT ON public.producer_invoices
  FOR EACH ROW EXECUTE FUNCTION private.set_shared_account_user_id();

DROP TRIGGER IF EXISTS set_shared_account_user_id_payment_flows ON public.payment_flows;
CREATE TRIGGER set_shared_account_user_id_payment_flows BEFORE INSERT ON public.payment_flows
  FOR EACH ROW EXECUTE FUNCTION private.set_shared_account_user_id();

DROP TRIGGER IF EXISTS set_iva_payments_user_id ON public.iva_payments;
CREATE TRIGGER set_iva_payments_user_id BEFORE INSERT ON public.iva_payments
  FOR EACH ROW EXECUTE FUNCTION private.set_shared_account_user_id();

-- Drop the now-unused public SECURITY DEFINER functions that were exposed via the API
DROP FUNCTION IF EXISTS public.shared_account_user_id();
DROP FUNCTION IF EXISTS public.set_shared_account_user_id();
