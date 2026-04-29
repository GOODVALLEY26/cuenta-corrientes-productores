-- Create company account configuration for shared data ownership
CREATE TABLE IF NOT EXISTS public.company_account (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Goodvalley',
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.company_account ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read company account" ON public.company_account;
CREATE POLICY "Authenticated users can read company account"
ON public.company_account
FOR SELECT
TO authenticated
USING (true);

-- Function used by RLS and inserts to identify the shared account owner
CREATE OR REPLACE FUNCTION public.shared_account_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT owner_user_id
  FROM public.company_account
  ORDER BY created_at ASC
  LIMIT 1
$$;

-- Seed company account with the first existing owner if it does not exist yet
INSERT INTO public.company_account (name, owner_user_id)
SELECT 'Goodvalley', user_id
FROM (
  SELECT user_id, min(created_at) AS first_created
  FROM (
    SELECT user_id, created_at FROM public.producers
    UNION ALL SELECT user_id, created_at FROM public.dry_kg_reports
    UNION ALL SELECT user_id, created_at FROM public.advance_rates
    UNION ALL SELECT user_id, created_at FROM public.exchange_rates
    UNION ALL SELECT user_id, created_at FROM public.drying_invoices
    UNION ALL SELECT user_id, created_at FROM public.installment_payments
    UNION ALL SELECT user_id, created_at FROM public.producer_invoices
    UNION ALL SELECT user_id, created_at FROM public.payment_flows
  ) existing_data
  GROUP BY user_id
  ORDER BY first_created ASC
  LIMIT 1
) first_owner
WHERE NOT EXISTS (SELECT 1 FROM public.company_account);

-- Share existing records by assigning them to the company account owner
UPDATE public.producers SET user_id = public.shared_account_user_id() WHERE public.shared_account_user_id() IS NOT NULL;
UPDATE public.dry_kg_reports SET user_id = public.shared_account_user_id() WHERE public.shared_account_user_id() IS NOT NULL;
UPDATE public.advance_rates SET user_id = public.shared_account_user_id() WHERE public.shared_account_user_id() IS NOT NULL;
UPDATE public.exchange_rates SET user_id = public.shared_account_user_id() WHERE public.shared_account_user_id() IS NOT NULL;
UPDATE public.drying_invoices SET user_id = public.shared_account_user_id() WHERE public.shared_account_user_id() IS NOT NULL;
UPDATE public.installment_payments SET user_id = public.shared_account_user_id() WHERE public.shared_account_user_id() IS NOT NULL;
UPDATE public.producer_invoices SET user_id = public.shared_account_user_id() WHERE public.shared_account_user_id() IS NOT NULL;
UPDATE public.payment_flows SET user_id = public.shared_account_user_id() WHERE public.shared_account_user_id() IS NOT NULL;

-- Replace per-user RLS with shared company account access
DROP POLICY IF EXISTS "Users manage own producers" ON public.producers;
CREATE POLICY "Company users manage shared producers"
ON public.producers
FOR ALL
TO authenticated
USING (user_id = public.shared_account_user_id())
WITH CHECK (user_id = public.shared_account_user_id());

DROP POLICY IF EXISTS "Users manage own dry_kg_reports" ON public.dry_kg_reports;
CREATE POLICY "Company users manage shared dry_kg_reports"
ON public.dry_kg_reports
FOR ALL
TO authenticated
USING (user_id = public.shared_account_user_id())
WITH CHECK (user_id = public.shared_account_user_id());

DROP POLICY IF EXISTS "Users manage own advance_rates" ON public.advance_rates;
CREATE POLICY "Company users manage shared advance_rates"
ON public.advance_rates
FOR ALL
TO authenticated
USING (user_id = public.shared_account_user_id())
WITH CHECK (user_id = public.shared_account_user_id());

DROP POLICY IF EXISTS "Users manage own exchange_rates" ON public.exchange_rates;
CREATE POLICY "Company users manage shared exchange_rates"
ON public.exchange_rates
FOR ALL
TO authenticated
USING (user_id = public.shared_account_user_id())
WITH CHECK (user_id = public.shared_account_user_id());

DROP POLICY IF EXISTS "Users manage own drying_invoices" ON public.drying_invoices;
CREATE POLICY "Company users manage shared drying_invoices"
ON public.drying_invoices
FOR ALL
TO authenticated
USING (user_id = public.shared_account_user_id())
WITH CHECK (user_id = public.shared_account_user_id());

DROP POLICY IF EXISTS "Users manage own installment_payments" ON public.installment_payments;
CREATE POLICY "Company users manage shared installment_payments"
ON public.installment_payments
FOR ALL
TO authenticated
USING (user_id = public.shared_account_user_id())
WITH CHECK (user_id = public.shared_account_user_id());

DROP POLICY IF EXISTS "Users manage own producer_invoices" ON public.producer_invoices;
CREATE POLICY "Company users manage shared producer_invoices"
ON public.producer_invoices
FOR ALL
TO authenticated
USING (user_id = public.shared_account_user_id())
WITH CHECK (user_id = public.shared_account_user_id());

DROP POLICY IF EXISTS "Users manage own payment_flows" ON public.payment_flows;
CREATE POLICY "Company users manage shared payment_flows"
ON public.payment_flows
FOR ALL
TO authenticated
USING (user_id = public.shared_account_user_id())
WITH CHECK (user_id = public.shared_account_user_id());