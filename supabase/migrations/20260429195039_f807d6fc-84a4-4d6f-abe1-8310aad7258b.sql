CREATE OR REPLACE FUNCTION public.shared_account_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT owner_user_id
  FROM public.company_account
  ORDER BY created_at ASC
  LIMIT 1
$$;