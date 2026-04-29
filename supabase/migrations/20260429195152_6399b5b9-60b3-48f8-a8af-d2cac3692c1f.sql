CREATE OR REPLACE FUNCTION public.set_shared_account_user_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  shared_user UUID;
BEGIN
  shared_user := public.shared_account_user_id();
  IF shared_user IS NOT NULL THEN
    NEW.user_id := shared_user;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_shared_account_user_id_producers ON public.producers;
CREATE TRIGGER set_shared_account_user_id_producers
BEFORE INSERT OR UPDATE ON public.producers
FOR EACH ROW
EXECUTE FUNCTION public.set_shared_account_user_id();

DROP TRIGGER IF EXISTS set_shared_account_user_id_dry_kg_reports ON public.dry_kg_reports;
CREATE TRIGGER set_shared_account_user_id_dry_kg_reports
BEFORE INSERT OR UPDATE ON public.dry_kg_reports
FOR EACH ROW
EXECUTE FUNCTION public.set_shared_account_user_id();

DROP TRIGGER IF EXISTS set_shared_account_user_id_advance_rates ON public.advance_rates;
CREATE TRIGGER set_shared_account_user_id_advance_rates
BEFORE INSERT OR UPDATE ON public.advance_rates
FOR EACH ROW
EXECUTE FUNCTION public.set_shared_account_user_id();

DROP TRIGGER IF EXISTS set_shared_account_user_id_exchange_rates ON public.exchange_rates;
CREATE TRIGGER set_shared_account_user_id_exchange_rates
BEFORE INSERT OR UPDATE ON public.exchange_rates
FOR EACH ROW
EXECUTE FUNCTION public.set_shared_account_user_id();

DROP TRIGGER IF EXISTS set_shared_account_user_id_drying_invoices ON public.drying_invoices;
CREATE TRIGGER set_shared_account_user_id_drying_invoices
BEFORE INSERT OR UPDATE ON public.drying_invoices
FOR EACH ROW
EXECUTE FUNCTION public.set_shared_account_user_id();

DROP TRIGGER IF EXISTS set_shared_account_user_id_installment_payments ON public.installment_payments;
CREATE TRIGGER set_shared_account_user_id_installment_payments
BEFORE INSERT OR UPDATE ON public.installment_payments
FOR EACH ROW
EXECUTE FUNCTION public.set_shared_account_user_id();

DROP TRIGGER IF EXISTS set_shared_account_user_id_producer_invoices ON public.producer_invoices;
CREATE TRIGGER set_shared_account_user_id_producer_invoices
BEFORE INSERT OR UPDATE ON public.producer_invoices
FOR EACH ROW
EXECUTE FUNCTION public.set_shared_account_user_id();

DROP TRIGGER IF EXISTS set_shared_account_user_id_payment_flows ON public.payment_flows;
CREATE TRIGGER set_shared_account_user_id_payment_flows
BEFORE INSERT OR UPDATE ON public.payment_flows
FOR EACH ROW
EXECUTE FUNCTION public.set_shared_account_user_id();