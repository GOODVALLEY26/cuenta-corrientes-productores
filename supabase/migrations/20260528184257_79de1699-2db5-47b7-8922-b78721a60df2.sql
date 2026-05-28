CREATE TABLE public.iva_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  producer_id UUID NOT NULL,
  payment_date DATE NOT NULL,
  amount_clp NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.iva_payments TO authenticated;
GRANT ALL ON public.iva_payments TO service_role;

ALTER TABLE public.iva_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users manage shared iva_payments"
ON public.iva_payments
FOR ALL
TO authenticated
USING (user_id = shared_account_user_id())
WITH CHECK (user_id = shared_account_user_id());

CREATE TRIGGER set_iva_payments_user_id
BEFORE INSERT ON public.iva_payments
FOR EACH ROW
EXECUTE FUNCTION public.set_shared_account_user_id();

CREATE TRIGGER update_iva_payments_updated_at
BEFORE UPDATE ON public.iva_payments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();