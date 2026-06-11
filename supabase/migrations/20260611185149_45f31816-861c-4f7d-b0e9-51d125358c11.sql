
REVOKE EXECUTE ON FUNCTION public.shared_account_user_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shared_account_user_id() TO service_role;
