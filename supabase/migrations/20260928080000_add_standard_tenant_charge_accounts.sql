-- Provide the common charge accounts operators need when billing tenants.
-- Utilities keeps its existing category identity so historical invoice lines
-- retain their original authority period when the account link changes.
CREATE OR REPLACE FUNCTION app_private.ensure_standard_tenant_charge_accounts(
  p_organization_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.organizations AS organization
    WHERE organization.id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Organization not found' USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.finance_accounts AS account (
    organization_id,
    account_class,
    account_subtype,
    display_name,
    description,
    use_for_lease_charges,
    created_by,
    updated_by
  )
  SELECT
    p_organization_id,
    'income',
    'income',
    charge.display_name,
    charge.description,
    true,
    p_organization_id,
    p_organization_id
  FROM (
    VALUES
      ('Utilities'::text, 'Tenant utility reimbursement income.'::text),
      ('Parking', 'Tenant parking charge income.'),
      ('Internet', 'Tenant internet reimbursement income.')
  ) AS charge(display_name, description)
  ON CONFLICT (organization_id, account_class, normalized_name) DO UPDATE
  SET account_subtype = EXCLUDED.account_subtype,
      description = coalesce(account.description, EXCLUDED.description),
      use_for_lease_charges = true,
      archived_at = NULL,
      archived_by = NULL,
      updated_by = p_organization_id;

  PERFORM pg_catalog.set_config(
    'app.finance_account_category_context',
    'on',
    true
  );

  INSERT INTO public.finance_categories (
    organization_id,
    namespace,
    code,
    display_label,
    reporting_group,
    sort_order,
    is_default,
    is_active,
    created_by,
    updated_by
  )
  SELECT
    p_organization_id,
    'tenant_billing',
    charge.category_code,
    charge.display_name,
    charge.reporting_group,
    charge.sort_order,
    true,
    true,
    p_organization_id,
    p_organization_id
  FROM (
    VALUES
      ('utilities'::text, 'Utilities'::text, 'utilities'::text, 'utility_reimbursement'::text, 20),
      ('parking', 'Parking', 'parking', 'parking', 25),
      ('internet', 'Internet', 'internet', 'utility_reimbursement', 27)
  ) AS charge(normalized_name, display_name, category_code, reporting_group, sort_order)
  ON CONFLICT DO NOTHING;

  PERFORM pg_catalog.set_config(
    'app.finance_account_category_context',
    'off',
    true
  );

  INSERT INTO public.finance_account_category_links AS link (
    organization_id,
    account_id,
    category_id
  )
  SELECT
    p_organization_id,
    account.id,
    category.id
  FROM (
    VALUES
      ('utilities'::text, 'utilities'::text),
      ('parking', 'parking'),
      ('internet', 'internet')
  ) AS charge(normalized_name, category_code)
  JOIN public.finance_accounts AS account
    ON account.organization_id = p_organization_id
   AND account.account_class = 'income'
   AND account.normalized_name = charge.normalized_name
   AND account.archived_at IS NULL
   AND account.use_for_lease_charges
  JOIN LATERAL (
    SELECT candidate.id
    FROM public.finance_categories AS candidate
    WHERE candidate.organization_id = p_organization_id
      AND candidate.namespace = 'tenant_billing'
      AND candidate.archived_at IS NULL
      AND (
        candidate.code = charge.category_code
        OR candidate.normalized_label = charge.normalized_name
      )
    ORDER BY (candidate.code = charge.category_code) DESC, candidate.id
    LIMIT 1
  ) AS category ON true
  ON CONFLICT (organization_id, category_id) DO UPDATE
  SET account_id = EXCLUDED.account_id;

  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('utilities'::text, 'utilities'::text),
        ('parking', 'parking'),
        ('internet', 'internet')
    ) AS required(normalized_name, category_code)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.finance_accounts AS account
      JOIN public.finance_account_category_links AS link
        ON link.organization_id = account.organization_id
       AND link.account_id = account.id
      JOIN public.finance_categories AS category
        ON category.organization_id = link.organization_id
       AND category.id = link.category_id
      WHERE account.organization_id = p_organization_id
        AND account.account_class = 'income'
        AND account.normalized_name = required.normalized_name
        AND account.archived_at IS NULL
        AND account.use_for_lease_charges
        AND category.namespace = 'tenant_billing'
        AND category.archived_at IS NULL
        AND (
          category.code = required.category_code
          OR category.normalized_label = required.normalized_name
        )
    )
  ) THEN
    RAISE EXCEPTION 'Standard tenant charge account backfill is incomplete'
      USING ERRCODE = '23514';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION app_private.ensure_standard_tenant_charge_accounts(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.complete_finance_account_catalog(
  p_organization_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account record;
  v_category_id uuid;
BEGIN
  PERFORM app_private.ensure_standard_tenant_charge_accounts(p_organization_id);

  FOR v_account IN
    SELECT id
    FROM public.finance_accounts
    WHERE organization_id = p_organization_id
      AND archived_at IS NULL
      AND (
        account_class = 'expense'
        OR (account_class = 'income' AND use_for_lease_charges)
      )
    ORDER BY id
  LOOP
    PERFORM app_private.ensure_finance_account_categories(
      p_organization_id,
      v_account.id,
      NULL
    );
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM app_private.finance_account_generated_categories
    WHERE organization_id = p_organization_id
      AND category_code = 'management_fee'
  ) THEN
    SELECT category.id INTO STRICT v_category_id
    FROM public.finance_accounts AS account
    JOIN public.finance_account_category_links AS link
      ON link.organization_id = account.organization_id
     AND link.account_id = account.id
    JOIN public.finance_categories AS category
      ON category.organization_id = link.organization_id
     AND category.id = link.category_id
    WHERE account.organization_id = p_organization_id
      AND account.account_class = 'expense'
      AND account.normalized_name = 'management fees'
      AND category.namespace = 'owner_expense';

    INSERT INTO app_private.finance_account_generated_categories
    VALUES (p_organization_id, 'management_fee', v_category_id);

    UPDATE app_private.finance_account_activity_authority_history
    SET valid_from = '-infinity'::timestamptz
    WHERE organization_id = p_organization_id
      AND authority_kind = 'category'
      AND authority_id = v_category_id::text
      AND valid_to IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM app_private.finance_account_activity_authority_history AS previous
        WHERE previous.organization_id = p_organization_id
          AND previous.authority_kind = 'category'
          AND previous.authority_id = v_category_id::text
          AND previous.valid_to IS NOT NULL
      );
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION app_private.complete_finance_account_catalog(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE
  v_organization_id uuid;
BEGIN
  FOR v_organization_id IN
    SELECT organization.id
    FROM public.organizations AS organization
    ORDER BY organization.id
  LOOP
    PERFORM app_private.complete_finance_account_catalog(v_organization_id);
  END LOOP;
END;
$$;
