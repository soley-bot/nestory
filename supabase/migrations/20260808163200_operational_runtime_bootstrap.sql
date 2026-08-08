-- Runtime rows are kept separate because schema squashing intentionally emits
-- DDL only. These records are required by private Storage, checked financial
-- contexts, and automatic monthly rent generation.

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES
  (
    'nestory-documents',
    'nestory-documents',
    false,
    10485760,
    ARRAY[
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp'
    ]
  ),
  (
    'nestory-photos',
    'nestory-photos',
    false,
    10485760,
    ARRAY[
      'image/jpeg',
      'image/png',
      'image/webp'
    ]
  )
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO app_private.finance_settlement_context_capability (
  singleton,
  capability_token
)
VALUES (true, encode(extensions.gen_random_bytes(32), 'hex'))
ON CONFLICT (singleton) DO UPDATE
SET capability_token = EXCLUDED.capability_token;

INSERT INTO app_private.financial_projection_context_capability (
  singleton,
  capability_token
)
VALUES (true, encode(extensions.gen_random_bytes(32), 'hex'))
ON CONFLICT (singleton) DO UPDATE
SET capability_token = EXCLUDED.capability_token;

INSERT INTO app_private.tenant_invoice_settlement_context_capability (
  singleton,
  capability_token
)
VALUES (true, encode(extensions.gen_random_bytes(32), 'hex'))
ON CONFLICT (singleton) DO UPDATE
SET capability_token = EXCLUDED.capability_token;

DO $migration$
DECLARE
  existing_job_id bigint;
BEGIN
  SELECT job.jobid
  INTO existing_job_id
  FROM cron.job AS job
  WHERE job.jobname = 'nestory-hourly-rent-generation';

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'nestory-hourly-rent-generation',
    '17 * * * *',
    'SELECT app_private.run_due_rent_generation();'
  );
END;
$migration$;
