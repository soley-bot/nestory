ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS preferred_currency public.currency_code NOT NULL DEFAULT 'USD';

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS khr_per_usd numeric(14, 4) NOT NULL DEFAULT 4100;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organizations_khr_per_usd_positive'
      AND conrelid = 'public.organizations'::regclass
  ) THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_khr_per_usd_positive CHECK (khr_per_usd > 0);
  END IF;
END $$;
