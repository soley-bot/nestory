alter table public.organizations
  add column if not exists preferred_currency public.currency_code not null default 'USD';

alter table public.organizations
  add column if not exists khr_per_usd numeric(14, 4) not null default 4100;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'organizations_khr_per_usd_positive'
      and conrelid = 'public.organizations'::regclass
  ) then
    alter table public.organizations
      add constraint organizations_khr_per_usd_positive check (khr_per_usd > 0);
  end if;
end $$;
