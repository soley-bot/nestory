DROP FUNCTION IF EXISTS public.record_ips_paid_expense(
  uuid,
  uuid,
  uuid,
  text,
  text,
  date,
  numeric,
  numeric,
  text,
  uuid,
  uuid,
  uuid,
  text,
  text
);

DROP FUNCTION IF EXISTS public.get_finance_payment_drilldown(
  uuid,
  date,
  date,
  uuid,
  uuid,
  text,
  text,
  text,
  integer,
  integer
);
