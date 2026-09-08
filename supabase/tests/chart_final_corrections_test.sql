BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT no_plan();

-- A fresh organization exercises the real organization seed triggers.
INSERT INTO public.organizations (id, name, slug)
VALUES ('cf710000-0000-4000-8000-000000000001', 'Chart correction test', 'chart-correction-test');
INSERT INTO public.organization_members (organization_id, user_id, role)
VALUES ('cf710000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000101', 'super_admin');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);

SELECT is((SELECT count(*) FROM public.finance_accounts AS account
  WHERE account.organization_id = 'cf710000-0000-4000-8000-000000000001'
    AND account.display_name IN ('Rental income', 'Late fees', 'Application fees', 'Management fees')
    AND EXISTS (SELECT 1 FROM public.finance_account_category_links AS link
      JOIN public.finance_categories AS category
        ON category.organization_id = link.organization_id AND category.id = link.category_id
      WHERE link.organization_id = account.organization_id AND link.account_id = account.id
        AND category.namespace = CASE account.account_class
          WHEN 'income' THEN 'tenant_billing' ELSE 'owner_expense' END)),
  4::bigint, 'all four formerly unmapped starter accounts are workflow-ready in future organizations');

CREATE TEMP TABLE category_snapshot AS SELECT * FROM public.finance_categories;
SELECT app_private.complete_finance_account_catalog('cf710000-0000-4000-8000-000000000001');
SELECT is((SELECT count(*) FROM public.finance_categories),
  (SELECT count(*) FROM category_snapshot), 're-running category completion preserves category IDs and count');
SELECT lives_ok($q$SELECT public.set_finance_account_archived(
  'cf710000-0000-4000-8000-000000000001',
  public.create_finance_account('cf710000-0000-4000-8000-000000000001',
    'asset', 'bank', 'Unused bank', NULL, NULL, NULL, NULL, false, false, false),
  true, NULL)$q$, 'an unused bank can be retired without manufacturing a replacement');

CREATE TEMP TABLE source_cases (
  subtype text, old_id uuid, new_id uuid, old_source uuid, new_source uuid, original_payment uuid
);
DO $$
DECLARE kind text; old_id uuid; new_id uuid; payment_id uuid;
  org uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  FOREACH kind IN ARRAY ARRAY['bank', 'cash', 'petty_cash', 'credit_card'] LOOP
    old_id := public.create_finance_account(org,
      CASE kind WHEN 'credit_card' THEN 'liability' ELSE 'asset' END,
      kind, 'Old ' || kind, NULL, NULL, NULL, NULL, false, false, false);
    new_id := public.create_finance_account(org,
      CASE kind WHEN 'credit_card' THEN 'liability' ELSE 'asset' END,
      kind, 'New ' || kind, NULL, NULL, NULL, NULL, false, false, false);
    INSERT INTO source_cases SELECT kind, old_id, new_id, old_link.source_id, new_link.source_id, NULL
      FROM public.finance_account_source_links AS old_link
      CROSS JOIN public.finance_account_source_links AS new_link
      WHERE old_link.account_id = old_id AND new_link.account_id = new_id;
    INSERT INTO public.finance_payments (organization_id, property_id, paid_date,
      amount, currency, payee_label, reconciliation_source_id)
    SELECT org, property.id, CURRENT_DATE, 10, 'USD', 'Chart lifecycle test', test.old_source
    FROM source_cases AS test CROSS JOIN public.properties AS property
    WHERE test.subtype = kind AND property.organization_id = org
    ORDER BY property.id LIMIT 1 RETURNING id INTO payment_id;
    UPDATE source_cases SET original_payment = payment_id WHERE subtype = kind;
    PERFORM public.set_finance_account_archived(org, old_id, true, new_id);
  END LOOP;
END;
$$;
SELECT is((SELECT count(*) FROM source_cases AS test
  JOIN public.finance_account_source_links AS old_link ON old_link.account_id = test.old_id
  JOIN public.finance_account_source_links AS new_link ON new_link.account_id = test.new_id
  JOIN public.financial_reconciliation_sources AS old_source ON old_source.id = test.old_source
  JOIN public.financial_reconciliation_sources AS new_source ON new_source.id = test.new_source
  WHERE old_link.source_id = test.old_source AND new_link.source_id = test.new_source
    AND old_source.archived_at IS NOT NULL AND new_source.archived_at IS NULL),
  4::bigint, 'ordinary UI-created replacements work for every in-use cash/card subtype without moving source identity');
SELECT is((SELECT count(*) FROM source_cases AS test
  JOIN app_private.finance_account_internal_sources AS registry ON registry.source_id = test.old_source),
  4::bigint, 'retirement preserves the internal UUID registry');
SELECT lives_ok($q$INSERT INTO public.finance_payments (organization_id, property_id,
  paid_date, amount, currency, payee_label, reconciliation_source_id, reversal_of_id)
  SELECT original.organization_id, original.property_id, CURRENT_DATE, original.amount,
    original.currency, 'Chart reversal', original.reconciliation_source_id, original.id
  FROM public.finance_payments AS original
  JOIN source_cases AS test ON test.original_payment = original.id$q$,
  'real original-linked payment reversals retain retired cash/card sources');
SELECT throws_ok($q$INSERT INTO public.finance_payments (organization_id, property_id,
  paid_date, amount, currency, payee_label, reconciliation_source_id)
  SELECT original.organization_id, original.property_id, CURRENT_DATE, original.amount,
    original.currency, 'Forbidden new movement', original.reconciliation_source_id
  FROM public.finance_payments AS original
  JOIN source_cases AS test ON test.original_payment = original.id LIMIT 1$q$,
  '22023', 'Financial reconciliation source is archived',
  'the correction exception cannot create new activity on a retired source');
SELECT lives_ok($$SELECT public.set_finance_account_archived(
  '00000000-0000-0000-0000-000000000001', old_id, false, NULL) FROM source_cases$$,
  'all retired source-backed accounts can be restored through the checked path');
SELECT is((SELECT count(*) FROM source_cases AS test
  JOIN public.financial_reconciliation_sources AS source ON source.id = test.old_source
  WHERE source.archived_at IS NULL), 4::bigint, 'restoration re-enables each original source');

SELECT public.create_finance_account('cf710000-0000-4000-8000-000000000001',
  'expense', 'expense', 'Root one', NULL, NULL, NULL, NULL, false, false, false) AS root_one \gset
SELECT public.create_finance_account('cf710000-0000-4000-8000-000000000001',
  'expense', 'expense', 'Root two', NULL, NULL, NULL, NULL, false, false, false) AS root_two \gset
SELECT public.create_finance_account('cf710000-0000-4000-8000-000000000001',
  'expense', 'expense', 'Child', NULL, NULL, :'root_one', NULL, false, false, false) AS child \gset
SELECT throws_ok(format($q$SELECT public.update_finance_account(
  'cf710000-0000-4000-8000-000000000001', %L, 'Root one', NULL, NULL, %L,
  NULL, false, false, false)$q$, :'root_one', :'root_two'),
  '23514', 'Accounts support only one level of sub-accounts',
  'checked edit rejects reparenting a root with children');
SELECT throws_ok(format('UPDATE public.finance_accounts SET parent_account_id = %L WHERE id = %L',
  :'root_two', :'root_one'), '23514', 'Accounts support only one level of sub-accounts',
  'direct DML rejects the same grandchild-producing reparent');
SET CONSTRAINTS ALL DEFERRED;
SELECT throws_ok(format($q$SELECT public.create_finance_account(
  'cf710000-0000-4000-8000-000000000001', 'expense', 'expense', 'Grandchild',
  NULL, NULL, %L, NULL, false, false, false)$q$, :'child'),
  '23514', 'Accounts support only one level of sub-accounts',
  'deferring constraints cannot admit a grandchild through the checked create RPC');
SET CONSTRAINTS ALL IMMEDIATE;

-- Real generated fixture events are the input authority, without synthetic
-- category IDs or account-name fallback in the activity consumer.
CREATE TEMP TABLE generated_events AS
SELECT line.organization_id, line.property_id, line.recognized_on AS event_date,
  'tenant_invoice_line:' || line.id AS event_key, account.id AS old_account
FROM public.tenant_invoice_lines AS line
JOIN public.finance_accounts AS account ON account.organization_id = line.organization_id
  AND account.system_role = 'rental_income'
WHERE line.organization_id = '00000000-0000-0000-0000-000000000001'
  AND line.line_type = 'rent' AND line.finance_category_id IS NULL
  AND line.reversal_of_id IS NULL
UNION ALL
SELECT fee.organization_id, fee.property_id, fee.fee_date,
  'management_fee_occurrence:' || fee.id, link.account_id
FROM public.management_fee_occurrences AS fee
JOIN app_private.finance_account_generated_categories AS generated
  ON generated.organization_id = fee.organization_id AND generated.category_code = 'management_fee'
JOIN public.finance_account_category_links AS link
  ON link.organization_id = generated.organization_id AND link.category_id = generated.category_id
WHERE fee.organization_id = '00000000-0000-0000-0000-000000000001'
  AND fee.reversal_of_id IS NULL;
SELECT ok(EXISTS(SELECT 1 FROM generated_events WHERE event_key LIKE 'tenant_invoice_line:%'),
  'fixture contains real generated rent');
SELECT ok(EXISTS(SELECT 1 FROM generated_events WHERE event_key LIKE 'management_fee_occurrence:%'),
  'fixture contains real generated management fees');
SELECT is((SELECT count(*) FROM generated_events AS event WHERE NOT EXISTS (
  SELECT 1 FROM public.get_finance_account_activity_authorities(event.organization_id,
    event.old_account, event.property_id, event.event_date, event.event_date) AS authority
  WHERE authority.event_key = event.event_key AND authority.event_matches)),
  0::bigint, 'generated rent and management fees resolve to their authoritative accounts');
CREATE TEMP TABLE generated_replacements AS
SELECT DISTINCT old_account, NULL::uuid AS new_account FROM generated_events;
DO $$
DECLARE account record; replacement uuid;
BEGIN
  FOR account IN SELECT original.* FROM public.finance_accounts AS original
    JOIN generated_replacements AS test ON test.old_account = original.id LOOP
    replacement := public.create_finance_account(account.organization_id,
      account.account_class, account.account_subtype, 'Transferred ' || account.display_name,
      NULL, NULL, NULL, NULL, account.use_for_lease_charges, account.use_for_lease_credits, false);
    PERFORM public.set_finance_account_archived(account.organization_id, account.id, true, replacement);
    UPDATE generated_replacements SET new_account = replacement WHERE old_account = account.id;
  END LOOP;
END;
$$;
SELECT is((SELECT count(*) FROM generated_events AS event WHERE NOT EXISTS (
  SELECT 1 FROM public.get_finance_account_activity_authorities(event.organization_id,
    event.old_account, event.property_id, event.event_date, event.event_date) AS authority
  WHERE authority.event_key = event.event_key AND authority.event_matches)),
  0::bigint, 'lifecycle transfers leave generated history on the original accounts');
SELECT is((SELECT count(*) FROM generated_events AS event
  JOIN generated_replacements AS replacement USING (old_account) WHERE NOT EXISTS (
  SELECT 1 FROM public.get_finance_account_activity_authorities(event.organization_id,
    replacement.new_account, event.property_id, event.event_date, event.event_date) AS authority
  WHERE authority.event_key = event.event_key AND NOT authority.event_matches)),
  0::bigint, 'replacement accounts receive explicit false overrides for prior generated history');

CREATE TEMP TABLE correction_candidate AS
SELECT invoice.id, invoice.organization_id
FROM public.tenant_invoices AS invoice
JOIN public.management_fee_occurrences AS fee
  ON fee.organization_id = invoice.organization_id AND fee.tenant_invoice_id = invoice.id
WHERE invoice.organization_id = '00000000-0000-0000-0000-000000000001'
  AND invoice.lifecycle = 'issued' AND fee.reversal_of_id IS NULL
  AND NOT app_private.is_financial_month_locked(invoice.organization_id, fee.fee_date)
  AND NOT EXISTS (SELECT 1 FROM public.tenant_invoice_payments AS payment
    WHERE payment.invoice_id = invoice.id)
  AND NOT EXISTS (
    SELECT 1 FROM public.owner_collection_confirmation_allocations AS allocation
    WHERE allocation.organization_id = invoice.organization_id
      AND allocation.invoice_id = invoice.id
    GROUP BY allocation.invoice_line_id
    HAVING sum(allocation.signed_amount) <> 0
  )
  AND NOT EXISTS (SELECT 1 FROM public.management_fee_occurrences AS reversal
    WHERE reversal.reversal_of_id = fee.id)
ORDER BY fee.fee_date DESC, invoice.id LIMIT 1;
SELECT is((SELECT count(*) FROM correction_candidate), 1::bigint,
  'fixture provides an unpaid issued generated invoice for checked reversal');
SELECT lives_ok($q$SELECT public.correct_tenant_invoice(organization_id, id,
  'void', NULL, 'Chart generated authority reversal', 'chart-generated-reversal-v1')
  FROM correction_candidate$q$, 'checked invoice correction generates rent and fee reversals after account transfer');
CREATE TEMP TABLE generated_reversals AS
SELECT original.organization_id, original.old_account, reversal.property_id,
  reversal.recognized_on AS event_date, 'tenant_invoice_line:' || reversal.id AS event_key
FROM generated_events AS original JOIN public.tenant_invoice_lines AS reversal
  ON original.event_key = 'tenant_invoice_line:' || reversal.reversal_of_id
UNION ALL
SELECT original.organization_id, original.old_account, reversal.property_id,
  reversal.fee_date, 'management_fee_occurrence:' || reversal.id
FROM generated_events AS original JOIN public.management_fee_occurrences AS reversal
  ON original.event_key = 'management_fee_occurrence:' || reversal.reversal_of_id;
SELECT ok(EXISTS(SELECT 1 FROM generated_reversals WHERE event_key LIKE 'tenant_invoice_line:%')
  AND EXISTS(SELECT 1 FROM generated_reversals WHERE event_key LIKE 'management_fee_occurrence:%'),
  'checked correction produced both generated reversal kinds');
SELECT is((SELECT count(*) FROM generated_reversals AS event WHERE NOT EXISTS (
  SELECT 1 FROM public.get_finance_account_activity_authorities(event.organization_id,
    event.old_account, event.property_id, event.event_date, event.event_date) AS authority
  WHERE authority.event_key = event.event_key AND authority.event_matches)),
  0::bigint, 'generated reversals inherit original account authority across lifecycle transfers');
SELECT is((SELECT count(*) FROM generated_reversals AS event
  JOIN generated_replacements AS replacement USING (old_account) WHERE NOT EXISTS (
  SELECT 1 FROM public.get_finance_account_activity_authorities(event.organization_id,
    replacement.new_account, event.property_id, event.event_date, event.event_date) AS authority
  WHERE authority.event_key = event.event_key AND NOT authority.event_matches)),
  0::bigint, 'transferred defaults do not steal the original generated reversals');
SELECT * FROM finish();
ROLLBACK;
