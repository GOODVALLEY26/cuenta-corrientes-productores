ALTER TABLE public.advance_rates REPLICA IDENTITY FULL;
ALTER TABLE public.dry_kg_reports REPLICA IDENTITY FULL;
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.advance_rates;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dry_kg_reports;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;