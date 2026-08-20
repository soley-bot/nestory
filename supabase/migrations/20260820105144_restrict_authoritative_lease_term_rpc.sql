REVOKE ALL ON FUNCTION public.create_authoritative_lease_term(
  uuid,
  uuid,
  date,
  date,
  numeric,
  public.currency_code,
  integer,
  text,
  text,
  uuid,
  text
) FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.create_authoritative_lease_term(
  uuid,
  uuid,
  date,
  date,
  numeric,
  public.currency_code,
  integer,
  text,
  text,
  uuid,
  text
) IS
  'Low-level authoritative Lease term writer restricted to trusted internal and service workflows; user lifecycle changes must use checked commands.';
