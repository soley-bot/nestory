DROP FUNCTION IF EXISTS public.get_property_cash_events_v1_page(
  uuid,
  uuid,
  public.currency_code,
  date,
  date,
  date,
  text,
  uuid,
  integer
);

DROP FUNCTION IF EXISTS app_private.get_property_cash_events_v1_page_pre_expense_approval(
  uuid,
  uuid,
  public.currency_code,
  date,
  date,
  date,
  text,
  uuid,
  integer
);
