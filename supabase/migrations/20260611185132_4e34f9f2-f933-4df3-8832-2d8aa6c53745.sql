
DROP POLICY IF EXISTS "Authenticated users can read company account" ON public.company_account;

CREATE POLICY "Owner can read company account"
ON public.company_account
FOR SELECT
TO authenticated
USING (owner_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.shared_account_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT owner_user_id
  FROM public.company_account
  ORDER BY created_at ASC
  LIMIT 1
$function$;
