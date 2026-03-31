
-- Add installment_currency to drying_invoices (clp or usd)
ALTER TABLE public.drying_invoices ADD COLUMN IF NOT EXISTS installment_currency text NOT NULL DEFAULT 'clp';

-- Create installment_payments table to track each cuota payment
CREATE TABLE public.installment_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  producer_id uuid NOT NULL REFERENCES public.producers(id) ON DELETE CASCADE,
  drying_invoice_id uuid NOT NULL REFERENCES public.drying_invoices(id) ON DELETE CASCADE,
  installment_number integer NOT NULL,
  amount_clp numeric NOT NULL DEFAULT 0,
  exchange_rate numeric,
  amount_usd numeric,
  paid boolean NOT NULL DEFAULT false,
  paid_date date,
  month integer,
  year integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(drying_invoice_id, installment_number)
);

ALTER TABLE public.installment_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own installment_payments"
  ON public.installment_payments FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
