CREATE TABLE app_private.public_interest_rate_limit_windows (
  subject_digest bytea NOT NULL,
  bucket_date date NOT NULL,
  attempt_count integer NOT NULL DEFAULT 1,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT public_interest_rate_limit_windows_pkey
    PRIMARY KEY (subject_digest, bucket_date),
  CONSTRAINT public_interest_rate_limit_windows_digest_check
    CHECK (octet_length(subject_digest) = 32),
  CONSTRAINT public_interest_rate_limit_windows_count_check
    CHECK (attempt_count BETWEEN 1 AND 11)
);

ALTER TABLE app_private.public_interest_rate_limit_windows ENABLE ROW LEVEL SECURITY;

CREATE INDEX public_interest_rate_limit_windows_expiry_idx
  ON app_private.public_interest_rate_limit_windows (expires_at);

REVOKE ALL ON TABLE app_private.public_interest_rate_limit_windows
  FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA app_private TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE app_private.public_interest_rate_limit_windows
  TO service_role;

CREATE OR REPLACE FUNCTION public.submit_public_interest_request_limited(
  p_subject_digest bytea,
  p_request_type text,
  p_full_name text,
  p_work_email text,
  p_company_name text,
  p_portfolio_size text,
  p_message text
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_attempt_count integer;
  v_bucket_date date := (statement_timestamp() AT TIME ZONE 'utc')::date;
  v_request_id uuid;
BEGIN
  IF p_subject_digest IS NULL OR octet_length(p_subject_digest) <> 32 THEN
    RAISE EXCEPTION 'Public intake subject digest is invalid.'
      USING ERRCODE = '22023';
  END IF;

  DELETE FROM app_private.public_interest_rate_limit_windows
  WHERE expires_at <= statement_timestamp();

  INSERT INTO app_private.public_interest_rate_limit_windows (
    subject_digest,
    bucket_date,
    attempt_count,
    expires_at
  ) VALUES (
    p_subject_digest,
    v_bucket_date,
    1,
    ((v_bucket_date + 2)::timestamp AT TIME ZONE 'utc')
  )
  ON CONFLICT (subject_digest, bucket_date) DO UPDATE
    SET attempt_count = LEAST(
          app_private.public_interest_rate_limit_windows.attempt_count + 1,
          11
        ),
        updated_at = statement_timestamp()
  RETURNING attempt_count INTO v_attempt_count;

  IF v_attempt_count > 10 THEN
    RETURN 'limited';
  END IF;

  INSERT INTO public.public_interest_requests (
    request_type,
    full_name,
    work_email,
    company_name,
    portfolio_size,
    message
  ) VALUES (
    p_request_type,
    p_full_name,
    p_work_email,
    p_company_name,
    p_portfolio_size,
    p_message
  )
  ON CONFLICT (request_type, work_email, submission_date) DO NOTHING
  RETURNING id INTO v_request_id;

  RETURN CASE WHEN v_request_id IS NULL THEN 'duplicate' ELSE 'accepted' END;
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_public_interest_request_limited(
  bytea, text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_public_interest_request_limited(
  bytea, text, text, text, text, text, text
) TO service_role;

REVOKE UPDATE ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE UPDATE ON SEQUENCES FROM anon, authenticated;
