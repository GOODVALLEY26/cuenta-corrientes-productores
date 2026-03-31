
-- Create enum for drying payment method
CREATE TYPE public.drying_payment_method AS ENUM ('descuento_usd', 'pago_clp', 'liquidacion_fin_año', 'cuotas');

-- Create enum for document type
CREATE TYPE public.document_type AS ENUM ('factura', 'nota_debito');

-- Create enum for invoice status
CREATE TYPE public.invoice_status AS ENUM ('pendiente', 'pagada', 'parcial');

-- Producers table
CREATE TABLE public.producers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rut TEXT,
  email TEXT,
  phone TEXT,
  drying_payment_method drying_payment_method NOT NULL DEFAULT 'descuento_usd',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Dry kg reports (uploaded per producer per month)
CREATE TABLE public.dry_kg_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  producer_id UUID NOT NULL REFERENCES public.producers(id) ON DELETE CASCADE,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL,
  dry_kg NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(producer_id, month, year)
);

-- Advance rates (cents per kg per producer per month)
CREATE TABLE public.advance_rates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  producer_id UUID NOT NULL REFERENCES public.producers(id) ON DELETE CASCADE,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL,
  cents_per_kg NUMERIC(10,4) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(producer_id, month, year)
);

-- Exchange rates (CLP per USD)
CREATE TABLE public.exchange_rates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL,
  rate NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(month, year)
);

-- Drying invoices (invoices you issue to producers for drying service)
CREATE TABLE public.drying_invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  producer_id UUID NOT NULL REFERENCES public.producers(id) ON DELETE CASCADE,
  invoice_number TEXT,
  amount_clp NUMERIC(14,0) NOT NULL,
  exchange_rate NUMERIC(10,2),
  amount_usd NUMERIC(12,2),
  total_installments INTEGER DEFAULT 1,
  paid_installments INTEGER DEFAULT 0,
  status invoice_status NOT NULL DEFAULT 'pendiente',
  date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Producer invoices (invoices the producer issues to you)
CREATE TABLE public.producer_invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  producer_id UUID NOT NULL REFERENCES public.producers(id) ON DELETE CASCADE,
  document_type document_type NOT NULL DEFAULT 'factura',
  invoice_number TEXT,
  amount_clp NUMERIC(14,0) NOT NULL,
  exchange_rate NUMERIC(10,2) NOT NULL,
  amount_usd NUMERIC(12,2) NOT NULL,
  date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Payment flows (monthly summary per producer)
CREATE TABLE public.payment_flows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  producer_id UUID NOT NULL REFERENCES public.producers(id) ON DELETE CASCADE,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL,
  advance_usd NUMERIC(12,2) DEFAULT 0,
  drying_discount_usd NUMERIC(12,2) DEFAULT 0,
  producer_invoiced_usd NUMERIC(12,2) DEFAULT 0,
  net_payment_usd NUMERIC(12,2) DEFAULT 0,
  requires_document BOOLEAN DEFAULT false,
  document_type_needed document_type,
  document_amount_usd NUMERIC(12,2) DEFAULT 0,
  status TEXT DEFAULT 'pendiente',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(producer_id, month, year)
);

-- Enable RLS on all tables
ALTER TABLE public.producers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dry_kg_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advance_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drying_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producer_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_flows ENABLE ROW LEVEL SECURITY;

-- RLS policies for producers
CREATE POLICY "Users manage own producers" ON public.producers FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- RLS policies for dry_kg_reports
CREATE POLICY "Users manage own dry_kg_reports" ON public.dry_kg_reports FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- RLS policies for advance_rates
CREATE POLICY "Users manage own advance_rates" ON public.advance_rates FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- RLS policies for exchange_rates
CREATE POLICY "Users manage own exchange_rates" ON public.exchange_rates FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- RLS policies for drying_invoices
CREATE POLICY "Users manage own drying_invoices" ON public.drying_invoices FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- RLS policies for producer_invoices
CREATE POLICY "Users manage own producer_invoices" ON public.producer_invoices FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- RLS policies for payment_flows
CREATE POLICY "Users manage own payment_flows" ON public.payment_flows FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers for updated_at
CREATE TRIGGER update_producers_updated_at BEFORE UPDATE ON public.producers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_drying_invoices_updated_at BEFORE UPDATE ON public.drying_invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_producer_invoices_updated_at BEFORE UPDATE ON public.producer_invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_payment_flows_updated_at BEFORE UPDATE ON public.payment_flows FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
