-- Internal implementation names must describe current authority, not migration history.
ALTER FUNCTION app_private.assign_maintenance_task_legacy_checked(
  uuid, uuid, uuid, uuid
) RENAME TO assign_maintenance_task_internal;

ALTER FUNCTION app_private.create_maintenance_task_legacy_checked(
  uuid, uuid, uuid, text, text, text, text, text, date, time, date, time,
  uuid, numeric, public.currency_code, jsonb, text, uuid, uuid
) RENAME TO create_maintenance_task_internal;

ALTER FUNCTION app_private.update_maintenance_task_legacy_checked(
  uuid, uuid, uuid, uuid, text, text, text, text, text, date, time, date, time,
  uuid, numeric, public.currency_code, numeric, public.currency_code, jsonb,
  text, boolean, uuid, uuid
) RENAME TO update_maintenance_task_internal;

ALTER FUNCTION app_private.commit_generic_import_run_checked_lease_legacy(
  uuid, uuid
) RENAME TO commit_generic_import_run_internal;

ALTER FUNCTION app_private.commit_unit_import_run_legacy_unchecked(
  uuid, uuid
) RENAME TO commit_unit_import_run_internal;

ALTER FUNCTION app_private.create_finance_income_item_lease_unchecked(
  uuid, uuid, uuid, uuid, text, text, date, numeric, numeric, date, text, text,
  uuid
) RENAME TO create_lease_income_item_internal;

ALTER FUNCTION app_private.refresh_finance_expense_compatibility(
  uuid, uuid
) RENAME TO refresh_finance_expense_state;

ALTER FUNCTION app_private.refresh_finance_income_compatibility(
  uuid, uuid
) RENAME TO refresh_finance_income_state;

ALTER FUNCTION public.commit_generic_import_run_legacy_unchecked(
  uuid, uuid
) RENAME TO commit_generic_import_run_internal;

ALTER FUNCTION public.confirm_owner_collected_rent_lease_derived_unchecked(
  uuid, uuid, numeric, date, text, jsonb, text
) RENAME TO confirm_owner_collected_rent_internal;

ALTER FUNCTION public.record_tenant_invoice_payment_lease_derived_unchecked(
  uuid, uuid, numeric, date, uuid, text, jsonb, text
) RENAME TO record_tenant_invoice_payment_internal;

ALTER FUNCTION public.record_finance_income_payment_expense_approval_unchecked(
  uuid, uuid, numeric, date, text
) RENAME TO record_finance_income_payment_internal;

ALTER FUNCTION public.record_finance_payment_expense_approval_unchecked(
  uuid, uuid, numeric, date, text
) RENAME TO record_finance_payment_internal;

ALTER FUNCTION public.record_finance_receipt_expense_approval_unchecked(
  uuid, uuid, numeric, date, text
) RENAME TO record_finance_receipt_internal;

ALTER FUNCTION public.record_finance_receipt_v2_expense_approval_unchecked(
  uuid, uuid, numeric, date, uuid, text, text
) RENAME TO record_finance_receipt_v2_internal;

ALTER FUNCTION public.reverse_finance_payment_expense_approval_unchecked(
  uuid, uuid, date, text
) RENAME TO reverse_finance_payment_internal;

ALTER FUNCTION public.reverse_finance_receipt_expense_approval_unchecked(
  uuid, uuid, date, text
) RENAME TO reverse_finance_receipt_internal;

ALTER FUNCTION public.reverse_finance_receipt_v2_expense_approval_unchecked(
  uuid, uuid, date, uuid, text, text
) RENAME TO reverse_finance_receipt_v2_internal;

ALTER FUNCTION public.set_finance_expense_status_expense_approval_unchecked(
  uuid, uuid, text
) RENAME TO set_finance_expense_status_internal;

ALTER FUNCTION public.void_finance_income_item_expense_approval_unchecked(
  uuid, uuid
) RENAME TO void_finance_income_item_internal;

-- PL/pgSQL stores routine bodies as source text, so update callers after renaming.
DO $migration$
DECLARE
  mapping record;
  routine record;
  definition text;
BEGIN
  FOR mapping IN
    SELECT *
    FROM (VALUES
      ('app_private.assign_maintenance_task_legacy_checked', 'app_private.assign_maintenance_task_internal'),
      ('app_private.create_maintenance_task_legacy_checked', 'app_private.create_maintenance_task_internal'),
      ('app_private.update_maintenance_task_legacy_checked', 'app_private.update_maintenance_task_internal'),
      ('app_private.commit_generic_import_run_checked_lease_legacy', 'app_private.commit_generic_import_run_internal'),
      ('app_private.commit_unit_import_run_legacy_unchecked', 'app_private.commit_unit_import_run_internal'),
      ('app_private.create_finance_income_item_lease_unchecked', 'app_private.create_lease_income_item_internal'),
      ('app_private.refresh_finance_expense_compatibility', 'app_private.refresh_finance_expense_state'),
      ('app_private.refresh_finance_income_compatibility', 'app_private.refresh_finance_income_state'),
      ('public.commit_generic_import_run_legacy_unchecked', 'public.commit_generic_import_run_internal'),
      ('public.confirm_owner_collected_rent_lease_derived_unchecked', 'public.confirm_owner_collected_rent_internal'),
      ('public.record_tenant_invoice_payment_lease_derived_unchecked', 'public.record_tenant_invoice_payment_internal'),
      ('public.record_finance_income_payment_expense_approval_unchecked', 'public.record_finance_income_payment_internal'),
      ('public.record_finance_payment_expense_approval_unchecked', 'public.record_finance_payment_internal'),
      ('public.record_finance_receipt_expense_approval_unchecked', 'public.record_finance_receipt_internal'),
      ('public.record_finance_receipt_v2_expense_approval_unchecked', 'public.record_finance_receipt_v2_internal'),
      ('public.reverse_finance_payment_expense_approval_unchecked', 'public.reverse_finance_payment_internal'),
      ('public.reverse_finance_receipt_expense_approval_unchecked', 'public.reverse_finance_receipt_internal'),
      ('public.reverse_finance_receipt_v2_expense_approval_unchecked', 'public.reverse_finance_receipt_v2_internal'),
      ('public.set_finance_expense_status_expense_approval_unchecked', 'public.set_finance_expense_status_internal'),
      ('public.void_finance_income_item_expense_approval_unchecked', 'public.void_finance_income_item_internal')
    ) AS names(old_name, new_name)
  LOOP
    FOR routine IN
      SELECT procedure.oid
      FROM pg_proc AS procedure
      JOIN pg_namespace AS namespace
        ON namespace.oid = procedure.pronamespace
      WHERE namespace.nspname IN ('public', 'app_private')
        AND procedure.prokind IN ('f', 'p')
        AND pg_get_functiondef(procedure.oid) LIKE '%' || mapping.old_name || '%'
    LOOP
      definition := pg_get_functiondef(routine.oid);
      definition := replace(definition, mapping.old_name, mapping.new_name);
      EXECUTE definition;
    END LOOP;
  END LOOP;
END;
$migration$;

-- These migration-only and bypass entrypoints have no current product caller.
DROP FUNCTION public.confirm_legacy_lease_term(
  uuid, uuid, uuid, integer, text, text, text
);
DROP FUNCTION public.generate_monthly_rent_income_items_legacy_unchecked(uuid, date);
DROP FUNCTION app_private.create_legacy_ledger_entry_internal(
  uuid, uuid, uuid, date, text, text, numeric, public.currency_code, text, text,
  uuid, uuid
);
