CREATE TABLE public.public_interest_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type text NOT NULL,
  full_name text NOT NULL,
  work_email text NOT NULL,
  company_name text NOT NULL,
  portfolio_size text,
  message text,
  status text NOT NULL DEFAULT 'new',
  submission_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'utc')::date),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT public_interest_requests_type_check
    CHECK (request_type IN ('information', 'demo')),
  CONSTRAINT public_interest_requests_name_check
    CHECK (length(trim(full_name)) BETWEEN 2 AND 120),
  CONSTRAINT public_interest_requests_email_normalized_check
    CHECK (
      work_email = lower(trim(work_email))
      AND work_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ),
  CONSTRAINT public_interest_requests_company_check
    CHECK (length(trim(company_name)) BETWEEN 2 AND 160),
  CONSTRAINT public_interest_requests_portfolio_size_check
    CHECK (portfolio_size IS NULL OR portfolio_size IN ('1-25', '26-100', '101-500', '500+')),
  CONSTRAINT public_interest_requests_message_check
    CHECK (message IS NULL OR length(message) <= 1200),
  CONSTRAINT public_interest_requests_status_check
    CHECK (status IN ('new', 'contacted', 'closed')),
  CONSTRAINT public_interest_requests_daily_email_type_key
    UNIQUE (request_type, work_email, submission_date)
);

CREATE INDEX public_interest_requests_status_submitted_idx
  ON public.public_interest_requests (status, submitted_at DESC);

CREATE TRIGGER set_public_interest_requests_updated_at
BEFORE UPDATE ON public.public_interest_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.public_interest_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.public_interest_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.public_interest_requests TO service_role;
