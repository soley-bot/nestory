CREATE TABLE public.finance_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  parent_account_id uuid,
  account_class text NOT NULL CHECK (account_class IN ('asset','liability','equity','income','expense')),
  account_subtype text NOT NULL CHECK (account_subtype IN (
    'bank','cash','petty_cash','accounts_receivable','other_current_asset','fixed_asset','other_asset',
    'accounts_payable','credit_card','current_liability','long_term_liability',
    'equity','income','other_income','expense','other_expense','cogs'
  )),
  account_number text,
  display_name text NOT NULL,
  normalized_name text GENERATED ALWAYS AS (
    lower(regexp_replace(btrim(display_name), '[[:space:]]+', ' ', 'g'))
  ) STORED,
  description text,
  system_role text,
  use_for_lease_charges boolean NOT NULL DEFAULT false,
  use_for_lease_credits boolean NOT NULL DEFAULT false,
  use_for_lease_deposits boolean NOT NULL DEFAULT false,
  property_id uuid,
  archived_at timestamptz,
  archived_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT finance_accounts_name_check CHECK (length(normalized_name) BETWEEN 2 AND 100),
  CONSTRAINT finance_accounts_number_check CHECK (account_number IS NULL OR length(btrim(account_number)) BETWEEN 1 AND 24),
  CONSTRAINT finance_accounts_org_class_name_key UNIQUE (organization_id, account_class, normalized_name),
  CONSTRAINT finance_accounts_org_id_key UNIQUE (organization_id, id),
  CONSTRAINT finance_accounts_parent_fkey FOREIGN KEY (organization_id, parent_account_id)
    REFERENCES public.finance_accounts(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT finance_accounts_property_fkey FOREIGN KEY (organization_id, property_id)
    REFERENCES public.properties(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT finance_accounts_type_pair_check CHECK (
    (account_class = 'asset' AND account_subtype IN ('bank','cash','petty_cash','accounts_receivable','other_current_asset','fixed_asset','other_asset')) OR
    (account_class = 'liability' AND account_subtype IN ('accounts_payable','credit_card','current_liability','long_term_liability')) OR
    (account_class = 'equity' AND account_subtype = 'equity') OR
    (account_class = 'income' AND account_subtype IN ('income','other_income')) OR
    (account_class = 'expense' AND account_subtype IN ('expense','other_expense','cogs'))
  ),
  CONSTRAINT finance_accounts_parent_not_self_check CHECK (parent_account_id IS NULL OR parent_account_id <> id),
  CONSTRAINT finance_accounts_property_scope_check CHECK (
    property_id IS NULL
    OR (
      account_class = 'asset'
      AND account_subtype IN ('bank','cash','petty_cash','other_current_asset','other_asset')
    )
  ),
  CONSTRAINT finance_accounts_lease_charge_check CHECK (
    NOT use_for_lease_charges OR account_class = 'income'
  ),
  CONSTRAINT finance_accounts_lease_credit_check CHECK (
    NOT use_for_lease_credits OR account_class = 'expense'
  ),
  CONSTRAINT finance_accounts_lease_deposit_check CHECK (
    NOT use_for_lease_deposits
    OR (account_class = 'liability' AND account_subtype = 'current_liability')
  ),
  CONSTRAINT finance_accounts_archive_actor_check CHECK (
    (archived_at IS NULL AND archived_by IS NULL)
    OR (archived_at IS NOT NULL AND archived_by IS NOT NULL)
  ),
  CONSTRAINT finance_accounts_system_role_check CHECK (
    system_role IS NULL
    OR (
      system_role IN (
        'operating_bank','trust_bank','undeposited_funds','accounts_receivable',
        'accounts_payable','security_deposits','opening_balance',
        'owner_contributions','owner_distributions','retained_earnings','rental_income'
      )
      AND (
        (system_role IN ('operating_bank','trust_bank') AND account_class = 'asset' AND account_subtype = 'bank')
        OR (system_role = 'undeposited_funds' AND account_class = 'asset' AND account_subtype = 'other_current_asset')
        OR (system_role = 'accounts_receivable' AND account_class = 'asset' AND account_subtype = 'accounts_receivable')
        OR (system_role = 'accounts_payable' AND account_class = 'liability' AND account_subtype = 'accounts_payable')
        OR (system_role = 'security_deposits' AND account_class = 'liability' AND account_subtype = 'current_liability' AND use_for_lease_deposits)
        OR (system_role IN ('opening_balance','owner_contributions','owner_distributions','retained_earnings') AND account_class = 'equity' AND account_subtype = 'equity')
        OR (system_role = 'rental_income' AND account_class = 'income' AND account_subtype = 'income' AND use_for_lease_charges)
      )
    )
  )
);

CREATE UNIQUE INDEX finance_accounts_org_system_role_key
  ON public.finance_accounts (organization_id, system_role)
  WHERE system_role IS NOT NULL;

CREATE UNIQUE INDEX finance_accounts_org_number_key
  ON public.finance_accounts (organization_id, account_number)
  WHERE account_number IS NOT NULL;

CREATE INDEX finance_accounts_active_catalog_idx
  ON public.finance_accounts (organization_id, account_class, normalized_name, id)
  WHERE archived_at IS NULL;

CREATE TABLE public.finance_account_roles (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  role_code text NOT NULL CHECK (role_code IN (
    'operating_bank','trust_bank','undeposited_funds','accounts_receivable',
    'accounts_payable','security_deposits','opening_balance',
    'owner_contributions','owner_distributions','retained_earnings','rental_income'
  )),
  account_id uuid NOT NULL,
  PRIMARY KEY (organization_id, role_code),
  FOREIGN KEY (organization_id, account_id)
    REFERENCES public.finance_accounts(organization_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.finance_account_source_links (
  organization_id uuid NOT NULL,
  account_id uuid NOT NULL,
  source_id uuid NOT NULL,
  PRIMARY KEY (organization_id, account_id),
  UNIQUE (organization_id, source_id),
  FOREIGN KEY (organization_id, account_id)
    REFERENCES public.finance_accounts(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, source_id)
    REFERENCES public.financial_reconciliation_sources(organization_id, id) ON DELETE RESTRICT
);

ALTER TABLE public.finance_categories
  ADD CONSTRAINT finance_categories_org_id_key UNIQUE (organization_id, id);

CREATE TABLE public.finance_account_category_links (
  organization_id uuid NOT NULL,
  account_id uuid NOT NULL,
  category_id uuid NOT NULL,
  PRIMARY KEY (organization_id, account_id, category_id),
  UNIQUE (organization_id, category_id),
  FOREIGN KEY (organization_id, account_id)
    REFERENCES public.finance_accounts(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, category_id)
    REFERENCES public.finance_categories(organization_id, id) ON DELETE RESTRICT
);

COMMENT ON TABLE public.finance_accounts IS
  'Organization-owned Chart of Accounts catalog. Archived accounts remain readable for historical activity.';
COMMENT ON TABLE public.finance_account_roles IS
  'Current organization workflow defaults pointing to compatible active Chart of Accounts rows.';
COMMENT ON TABLE public.finance_account_source_links IS
  'Hidden one-to-one compatibility bridge from cash-like accounts to preserved reconciliation-source identities.';
COMMENT ON TABLE public.finance_account_category_links IS
  'Hidden compatibility bridge from accounts to preserved Finance category identities; one account may own several categories.';

CREATE FUNCTION app_private.finance_account_role_is_compatible(
  p_role_code text,
  p_account_class text,
  p_account_subtype text,
  p_use_for_lease_charges boolean,
  p_use_for_lease_deposits boolean
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_role_code
    WHEN 'operating_bank' THEN p_account_class = 'asset' AND p_account_subtype = 'bank'
    WHEN 'trust_bank' THEN p_account_class = 'asset' AND p_account_subtype = 'bank'
    WHEN 'undeposited_funds' THEN p_account_class = 'asset' AND p_account_subtype = 'other_current_asset'
    WHEN 'accounts_receivable' THEN p_account_class = 'asset' AND p_account_subtype = 'accounts_receivable'
    WHEN 'accounts_payable' THEN p_account_class = 'liability' AND p_account_subtype = 'accounts_payable'
    WHEN 'security_deposits' THEN p_account_class = 'liability' AND p_account_subtype = 'current_liability' AND p_use_for_lease_deposits
    WHEN 'opening_balance' THEN p_account_class = 'equity' AND p_account_subtype = 'equity'
    WHEN 'owner_contributions' THEN p_account_class = 'equity' AND p_account_subtype = 'equity'
    WHEN 'owner_distributions' THEN p_account_class = 'equity' AND p_account_subtype = 'equity'
    WHEN 'retained_earnings' THEN p_account_class = 'equity' AND p_account_subtype = 'equity'
    WHEN 'rental_income' THEN p_account_class = 'income' AND p_account_subtype = 'income' AND p_use_for_lease_charges
    ELSE false
  END;
$$;

CREATE FUNCTION app_private.finance_account_source_is_compatible(
  p_source_kind text,
  p_account_class text,
  p_account_subtype text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT p_account_class = 'asset' AND CASE p_source_kind
    WHEN 'bank' THEN p_account_subtype = 'bank'
    WHEN 'cash' THEN p_account_subtype IN ('cash','petty_cash')
    WHEN 'petty_cash' THEN p_account_subtype = 'petty_cash'
    WHEN 'clearing' THEN p_account_subtype = 'other_current_asset'
    WHEN 'other' THEN p_account_subtype IN ('cash','other_current_asset','other_asset')
    ELSE false
  END;
$$;

CREATE FUNCTION app_private.enforce_finance_account_parent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_parent public.finance_accounts%ROWTYPE;
BEGIN
  IF NEW.parent_account_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT account.*
  INTO v_parent
  FROM public.finance_accounts AS account
  WHERE account.organization_id = NEW.organization_id
    AND account.id = NEW.parent_account_id;

  IF NOT FOUND
    OR v_parent.account_class IS DISTINCT FROM NEW.account_class
    OR v_parent.id = NEW.id THEN
    RAISE EXCEPTION 'Choose a parent with the same account type'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    WITH RECURSIVE ancestors AS (
      SELECT account.id, account.parent_account_id
      FROM public.finance_accounts AS account
      WHERE account.organization_id = NEW.organization_id
        AND account.id = NEW.parent_account_id
      UNION
      SELECT account.id, account.parent_account_id
      FROM public.finance_accounts AS account
      JOIN ancestors ON ancestors.parent_account_id = account.id
      WHERE account.organization_id = NEW.organization_id
    )
    SELECT 1 FROM ancestors WHERE id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Account hierarchy cannot contain a cycle'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER enforce_finance_account_parent
AFTER INSERT OR UPDATE OF organization_id, parent_account_id, account_class
ON public.finance_accounts
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW
EXECUTE FUNCTION app_private.enforce_finance_account_parent();

CREATE FUNCTION app_private.enforce_finance_account_role_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account public.finance_accounts%ROWTYPE;
BEGIN
  SELECT account.* INTO v_account
  FROM public.finance_accounts AS account
  WHERE account.organization_id = NEW.organization_id
    AND account.id = NEW.account_id;

  IF NOT FOUND OR v_account.archived_at IS NOT NULL
    OR NOT app_private.finance_account_role_is_compatible(
      NEW.role_code,
      v_account.account_class,
      v_account.account_subtype,
      v_account.use_for_lease_charges,
      v_account.use_for_lease_deposits
    ) THEN
    RAISE EXCEPTION 'Account is incompatible with this default role'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER enforce_finance_account_role_link
AFTER INSERT OR UPDATE ON public.finance_account_roles
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW
EXECUTE FUNCTION app_private.enforce_finance_account_role_link();

CREATE FUNCTION app_private.enforce_finance_account_source_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account public.finance_accounts%ROWTYPE;
  v_source public.financial_reconciliation_sources%ROWTYPE;
BEGIN
  SELECT account.* INTO v_account
  FROM public.finance_accounts AS account
  WHERE account.organization_id = NEW.organization_id
    AND account.id = NEW.account_id;

  SELECT source.* INTO v_source
  FROM public.financial_reconciliation_sources AS source
  WHERE source.organization_id = NEW.organization_id
    AND source.id = NEW.source_id;

  IF NOT FOUND
    OR NOT app_private.finance_account_source_is_compatible(
      v_source.source_kind,
      v_account.account_class,
      v_account.account_subtype
    )
    OR v_account.property_id IS DISTINCT FROM v_source.property_id THEN
    RAISE EXCEPTION 'Account is incompatible with its cash source'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER enforce_finance_account_source_link
AFTER INSERT OR UPDATE ON public.finance_account_source_links
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW
EXECUTE FUNCTION app_private.enforce_finance_account_source_link();

CREATE FUNCTION app_private.enforce_finance_account_category_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account public.finance_accounts%ROWTYPE;
  v_namespace text;
BEGIN
  SELECT account.* INTO v_account
  FROM public.finance_accounts AS account
  WHERE account.organization_id = NEW.organization_id
    AND account.id = NEW.account_id;

  SELECT category.namespace INTO v_namespace
  FROM public.finance_categories AS category
  WHERE category.organization_id = NEW.organization_id
    AND category.id = NEW.category_id;

  IF v_account.id IS NULL OR v_namespace IS NULL
    OR (v_namespace = 'owner_expense' AND v_account.account_class <> 'expense')
    OR (
      v_namespace = 'tenant_billing'
      AND NOT (
        v_account.account_class = 'income'
        OR (v_account.account_class = 'expense' AND v_account.use_for_lease_credits)
      )
    ) THEN
    RAISE EXCEPTION 'Account is incompatible with its Finance category'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER enforce_finance_account_category_link
AFTER INSERT OR UPDATE ON public.finance_account_category_links
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW
EXECUTE FUNCTION app_private.enforce_finance_account_category_link();

CREATE FUNCTION app_private.ensure_finance_account_categories(
  p_organization_id uuid,
  p_account_id uuid,
  p_actor_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account public.finance_accounts%ROWTYPE;
  v_category_id uuid;
  v_label text;
  v_sort_order integer;
BEGIN
  SELECT account.* INTO v_account
  FROM public.finance_accounts AS account
  WHERE account.organization_id = p_organization_id
    AND account.id = p_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found' USING ERRCODE = '23503';
  END IF;

  IF v_account.account_class = 'expense' THEN
    SELECT link.category_id INTO v_category_id
    FROM public.finance_account_category_links AS link
    JOIN public.finance_categories AS category
      ON category.organization_id = link.organization_id
     AND category.id = link.category_id
    WHERE link.organization_id = p_organization_id
      AND link.account_id = v_account.id
      AND category.namespace = 'owner_expense'
    ORDER BY link.category_id
    LIMIT 1;

    IF v_category_id IS NULL THEN
    SELECT category.id INTO v_category_id
    FROM public.finance_categories AS category
    WHERE category.organization_id = p_organization_id
      AND category.namespace = 'owner_expense'
      AND category.normalized_label = v_account.normalized_name
      AND NOT EXISTS (
        SELECT 1 FROM public.finance_account_category_links AS link
        WHERE link.organization_id = p_organization_id
          AND link.category_id = category.id
      )
    ORDER BY category.id
    LIMIT 1
    FOR UPDATE;
    END IF;

    IF v_category_id IS NULL THEN
      SELECT coalesce(max(category.sort_order), 40) + 10 INTO v_sort_order
      FROM public.finance_categories AS category
      WHERE category.organization_id = p_organization_id
        AND category.namespace = 'owner_expense';

      v_label := left(v_account.display_name, 80);
      IF EXISTS (
        SELECT 1 FROM public.finance_categories AS category
        WHERE category.organization_id = p_organization_id
          AND category.namespace = 'owner_expense'
          AND category.normalized_label = lower(regexp_replace(btrim(v_label), '[[:space:]]+', ' ', 'g'))
      ) THEN
        v_label := left(v_account.display_name, 69) || ' [' || left(replace(v_account.id::text, '-', ''), 8) || ']';
      END IF;

      PERFORM pg_catalog.set_config('app.finance_account_category_context', 'on', true);
      INSERT INTO public.finance_categories (
        organization_id, namespace, code, display_label, reporting_group,
        sort_order, is_default, created_by, updated_by
      ) VALUES (
        p_organization_id,
        'owner_expense',
        'account_' || left(replace(v_account.id::text, '-', ''), 24),
        v_label,
        'other',
        v_sort_order,
        false,
        p_actor_id,
        p_actor_id
      )
      RETURNING id INTO v_category_id;
      PERFORM pg_catalog.set_config('app.finance_account_category_context', 'off', true);
    END IF;

    INSERT INTO public.finance_account_category_links (
      organization_id, account_id, category_id
    ) VALUES (p_organization_id, v_account.id, v_category_id)
    ON CONFLICT (organization_id, category_id) DO NOTHING;
  END IF;

  IF (v_account.account_class = 'income' AND v_account.use_for_lease_charges)
    OR (v_account.account_class = 'expense' AND v_account.use_for_lease_credits) THEN
    v_category_id := NULL;
    SELECT link.category_id INTO v_category_id
    FROM public.finance_account_category_links AS link
    JOIN public.finance_categories AS category
      ON category.organization_id = link.organization_id
     AND category.id = link.category_id
    WHERE link.organization_id = p_organization_id
      AND link.account_id = v_account.id
      AND category.namespace = 'tenant_billing'
    ORDER BY link.category_id
    LIMIT 1;

    IF v_category_id IS NULL THEN
    SELECT category.id INTO v_category_id
    FROM public.finance_categories AS category
    WHERE category.organization_id = p_organization_id
      AND category.namespace = 'tenant_billing'
      AND category.normalized_label = v_account.normalized_name
      AND NOT EXISTS (
        SELECT 1 FROM public.finance_account_category_links AS link
        WHERE link.organization_id = p_organization_id
          AND link.category_id = category.id
      )
    ORDER BY category.id
    LIMIT 1
    FOR UPDATE;
    END IF;

    IF v_category_id IS NULL THEN
      SELECT coalesce(max(category.sort_order), 40) + 10 INTO v_sort_order
      FROM public.finance_categories AS category
      WHERE category.organization_id = p_organization_id
        AND category.namespace = 'tenant_billing';

      v_label := left(v_account.display_name, 80);
      IF EXISTS (
        SELECT 1 FROM public.finance_categories AS category
        WHERE category.organization_id = p_organization_id
          AND category.namespace = 'tenant_billing'
          AND category.normalized_label = lower(regexp_replace(btrim(v_label), '[[:space:]]+', ' ', 'g'))
      ) THEN
        v_label := left(v_account.display_name, 69) || ' [' || left(replace(v_account.id::text, '-', ''), 8) || ']';
      END IF;

      PERFORM pg_catalog.set_config('app.finance_account_category_context', 'on', true);
      INSERT INTO public.finance_categories (
        organization_id, namespace, code, display_label, reporting_group,
        sort_order, is_default, created_by, updated_by
      ) VALUES (
        p_organization_id,
        'tenant_billing',
        'account_charge_' || left(replace(v_account.id::text, '-', ''), 24),
        v_label,
        'other',
        v_sort_order,
        false,
        p_actor_id,
        p_actor_id
      )
      RETURNING id INTO v_category_id;
      PERFORM pg_catalog.set_config('app.finance_account_category_context', 'off', true);
    END IF;

    INSERT INTO public.finance_account_category_links (
      organization_id, account_id, category_id
    ) VALUES (p_organization_id, v_account.id, v_category_id)
    ON CONFLICT (organization_id, category_id) DO NOTHING;
  END IF;
END;
$$;

CREATE FUNCTION app_private.ensure_finance_account_source(
  p_organization_id uuid,
  p_account_id uuid,
  p_actor_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account public.finance_accounts%ROWTYPE;
  v_source_id uuid;
  v_source_kind text;
BEGIN
  SELECT account.* INTO v_account
  FROM public.finance_accounts AS account
  WHERE account.organization_id = p_organization_id
    AND account.id = p_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found' USING ERRCODE = '23503';
  END IF;

  IF v_account.account_class <> 'asset'
    OR v_account.account_subtype NOT IN ('bank','cash','petty_cash')
    OR EXISTS (
      SELECT 1 FROM public.finance_account_source_links AS link
      WHERE link.organization_id = p_organization_id
        AND link.account_id = p_account_id
    ) THEN
    RETURN;
  END IF;

  v_source_kind := CASE v_account.account_subtype
    WHEN 'bank' THEN 'bank'
    WHEN 'petty_cash' THEN 'petty_cash'
    ELSE 'cash'
  END;

  PERFORM pg_catalog.set_config('app.finance_account_source_context', 'on', true);
  PERFORM pg_catalog.set_config('app.financial_reconciliation_source_context', 'on', true);
  INSERT INTO public.financial_reconciliation_sources (
    organization_id, property_id, currency, code, display_name,
    source_kind, scope_kind, created_by, updated_by
  )
  SELECT
    p_organization_id,
    v_account.property_id,
    organization.preferred_currency,
    'ACCOUNT_' || upper(left(replace(v_account.id::text, '-', ''), 24)),
    v_account.display_name,
    v_source_kind,
    CASE WHEN v_account.property_id IS NULL THEN 'organization_pooled' ELSE 'property_dedicated' END,
    p_actor_id,
    p_actor_id
  FROM public.organizations AS organization
  WHERE organization.id = p_organization_id
  RETURNING id INTO v_source_id;
  PERFORM pg_catalog.set_config('app.financial_reconciliation_source_context', 'off', true);
  PERFORM pg_catalog.set_config('app.finance_account_source_context', 'off', true);

  INSERT INTO public.finance_account_source_links (
    organization_id, account_id, source_id
  ) VALUES (p_organization_id, p_account_id, v_source_id)
  ON CONFLICT DO NOTHING;
END;
$$;

CREATE FUNCTION app_private.seed_finance_account_catalog(p_organization_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.finance_accounts (
    organization_id,
    account_class,
    account_subtype,
    display_name,
    description,
    system_role,
    use_for_lease_charges,
    use_for_lease_deposits,
    created_by
  )
  SELECT
    p_organization_id,
    starter.account_class,
    starter.account_subtype,
    starter.display_name,
    starter.description,
    starter.system_role,
    starter.use_for_lease_charges,
    starter.use_for_lease_deposits,
    p_organization_id
  FROM (
    VALUES
      ('asset'::text, 'bank'::text, 'Operating account'::text, 'Default pay-from and receive-into account.'::text, 'operating_bank'::text, false, false),
      ('asset', 'bank', 'Trust account', 'Account available for deposit custody.', 'trust_bank', false, false),
      ('asset', 'other_current_asset', 'Undeposited funds', 'System-controlled collected funds awaiting deposit.', 'undeposited_funds', false, false),
      ('asset', 'accounts_receivable', 'Accounts receivable', 'System-controlled tenant receivables.', 'accounts_receivable', false, false),
      ('asset', 'petty_cash', 'Petty cash', 'Cash kept for small operating expenses.', NULL, false, false),
      ('liability', 'accounts_payable', 'Accounts payable', 'System-controlled amounts owed to vendors.', 'accounts_payable', false, false),
      ('liability', 'current_liability', 'Security deposits', 'Default liability account for lease deposits.', 'security_deposits', false, true),
      ('equity', 'equity', 'Opening balance', 'System-controlled opening balance account.', 'opening_balance', false, false),
      ('equity', 'equity', 'Owner contributions', 'Default owner-contribution account.', 'owner_contributions', false, false),
      ('equity', 'equity', 'Owner distributions', 'Default owner-distribution account.', 'owner_distributions', false, false),
      ('equity', 'equity', 'Retained earnings', 'System-controlled retained earnings account.', 'retained_earnings', false, false),
      ('income', 'income', 'Rental income', 'Default recurring-rent income account.', 'rental_income', true, false),
      ('income', 'income', 'Late fees', NULL, NULL, true, false),
      ('income', 'income', 'Application fees', NULL, NULL, true, false),
      ('income', 'other_income', 'Other income', NULL, NULL, true, false),
      ('expense', 'expense', 'Cleaning', NULL, NULL, false, false),
      ('expense', 'expense', 'Management fees', NULL, NULL, false, false),
      ('expense', 'expense', 'Repairs and maintenance', NULL, NULL, false, false),
      ('expense', 'expense', 'Utilities', NULL, NULL, false, false),
      ('expense', 'other_expense', 'Other expenses', NULL, NULL, false, false)
  ) AS starter(
    account_class,
    account_subtype,
    display_name,
    description,
    system_role,
    use_for_lease_charges,
    use_for_lease_deposits
  )
  ON CONFLICT (organization_id, account_class, normalized_name) DO NOTHING;

  INSERT INTO public.finance_account_roles (
    organization_id, role_code, account_id
  )
  SELECT account.organization_id, account.system_role, account.id
  FROM public.finance_accounts AS account
  WHERE account.organization_id = p_organization_id
    AND account.system_role IS NOT NULL
  ON CONFLICT (organization_id, role_code) DO NOTHING;

  WITH ranked_sources AS (
    SELECT
      source.*,
      row_number() OVER (
        PARTITION BY source.organization_id, source.source_kind, (source.property_id IS NULL)
        ORDER BY source.archived_at NULLS FIRST, source.code, source.id
      ) AS kind_rank
    FROM public.financial_reconciliation_sources AS source
    WHERE source.organization_id = p_organization_id
  ), source_targets AS (
    SELECT
      source.*,
      CASE
        WHEN source.property_id IS NULL AND source.source_kind = 'bank' AND source.kind_rank = 1 THEN 'operating_bank'
        WHEN source.property_id IS NULL AND source.source_kind = 'bank' AND source.kind_rank = 2 THEN 'trust_bank'
        WHEN source.property_id IS NULL AND source.source_kind = 'clearing' AND source.kind_rank = 1 THEN 'undeposited_funds'
        WHEN source.property_id IS NULL AND source.source_kind = 'petty_cash' AND source.kind_rank = 1 THEN 'petty_cash'
        ELSE NULL
      END AS target_key,
      left(btrim(source.display_name), 70) || ' (' || left(source.code, 24) || ')' AS account_name
    FROM ranked_sources AS source
  )
  INSERT INTO public.finance_accounts (
    organization_id,
    account_class,
    account_subtype,
    display_name,
    description,
    property_id,
    created_by
  )
  SELECT
    source.organization_id,
    'asset',
    CASE source.source_kind
      WHEN 'bank' THEN 'bank'
      WHEN 'cash' THEN 'cash'
      WHEN 'petty_cash' THEN 'petty_cash'
      WHEN 'clearing' THEN 'other_current_asset'
      ELSE 'other_asset'
    END,
    source.account_name,
    'Imported cash account.',
    source.property_id,
    p_organization_id
  FROM source_targets AS source
  WHERE source.target_key IS NULL
  ON CONFLICT (organization_id, account_class, normalized_name) DO NOTHING;

  WITH ranked_sources AS (
    SELECT
      source.*,
      row_number() OVER (
        PARTITION BY source.organization_id, source.source_kind, (source.property_id IS NULL)
        ORDER BY source.archived_at NULLS FIRST, source.code, source.id
      ) AS kind_rank
    FROM public.financial_reconciliation_sources AS source
    WHERE source.organization_id = p_organization_id
  ), source_targets AS (
    SELECT
      source.*,
      CASE
        WHEN source.property_id IS NULL AND source.source_kind = 'bank' AND source.kind_rank = 1 THEN 'operating_bank'
        WHEN source.property_id IS NULL AND source.source_kind = 'bank' AND source.kind_rank = 2 THEN 'trust_bank'
        WHEN source.property_id IS NULL AND source.source_kind = 'clearing' AND source.kind_rank = 1 THEN 'undeposited_funds'
        WHEN source.property_id IS NULL AND source.source_kind = 'petty_cash' AND source.kind_rank = 1 THEN 'petty_cash'
        ELSE NULL
      END AS target_key,
      lower(regexp_replace(
        btrim(left(btrim(source.display_name), 70) || ' (' || left(source.code, 24) || ')'),
        '[[:space:]]+',
        ' ',
        'g'
      )) AS account_name
    FROM ranked_sources AS source
  )
  INSERT INTO public.finance_account_source_links (
    organization_id, account_id, source_id
  )
  SELECT
    source.organization_id,
    account.id,
    source.id
  FROM source_targets AS source
  JOIN public.finance_accounts AS account
    ON account.organization_id = source.organization_id
   AND (
     (source.target_key IN ('operating_bank','trust_bank','undeposited_funds') AND account.system_role = source.target_key)
     OR (source.target_key = 'petty_cash' AND account.account_class = 'asset' AND account.normalized_name = 'petty cash')
     OR (source.target_key IS NULL AND account.account_class = 'asset' AND account.normalized_name = source.account_name)
   )
  ON CONFLICT (organization_id, source_id) DO NOTHING;

  PERFORM pg_catalog.set_config('app.finance_account_source_context', 'on', true);
  PERFORM pg_catalog.set_config('app.financial_reconciliation_source_context', 'on', true);
  INSERT INTO public.financial_reconciliation_sources (
    organization_id, property_id, currency, code, display_name,
    source_kind, scope_kind
  )
  SELECT
    account.organization_id,
    NULL,
    organization.preferred_currency,
    'CHART_' || upper(account.system_role),
    account.display_name,
    'bank',
    'organization_pooled'
  FROM public.finance_accounts AS account
  JOIN public.organizations AS organization ON organization.id = account.organization_id
  WHERE account.organization_id = p_organization_id
    AND account.system_role IN ('operating_bank','trust_bank')
    AND NOT EXISTS (
      SELECT 1 FROM public.finance_account_source_links AS link
      WHERE link.organization_id = account.organization_id
        AND link.account_id = account.id
    )
  ON CONFLICT (organization_id, code) DO NOTHING;
  PERFORM pg_catalog.set_config('app.financial_reconciliation_source_context', 'off', true);
  PERFORM pg_catalog.set_config('app.finance_account_source_context', 'off', true);

  INSERT INTO public.finance_account_source_links (
    organization_id, account_id, source_id
  )
  SELECT account.organization_id, account.id, source.id
  FROM public.finance_accounts AS account
  JOIN public.financial_reconciliation_sources AS source
    ON source.organization_id = account.organization_id
   AND source.code = 'CHART_' || upper(account.system_role)
  WHERE account.organization_id = p_organization_id
    AND account.system_role IN ('operating_bank','trust_bank')
    AND NOT EXISTS (
      SELECT 1 FROM public.finance_account_source_links AS link
      WHERE link.organization_id = account.organization_id
        AND link.account_id = account.id
    )
  ON CONFLICT DO NOTHING;

  -- Petty cash has no system role, so its generated hidden source uses a stable
  -- account-derived code instead of competing for an organization default role.
  PERFORM app_private.ensure_finance_account_source(
    account.organization_id,
    account.id,
    NULL
  )
  FROM public.finance_accounts AS account
  WHERE account.organization_id = p_organization_id
    AND account.account_class = 'asset'
    AND account.normalized_name = 'petty cash'
    AND NOT EXISTS (
      SELECT 1 FROM public.finance_account_source_links AS link
      WHERE link.organization_id = account.organization_id
        AND link.account_id = account.id
    );

  INSERT INTO public.finance_accounts (
    organization_id, account_class, account_subtype, display_name,
    description, created_by
  )
  SELECT
    category.organization_id,
    'expense',
    'expense',
    category.display_label,
    'Expense category account.',
    p_organization_id
  FROM public.finance_categories AS category
  WHERE category.organization_id = p_organization_id
    AND category.namespace = 'owner_expense'
    AND NOT category.is_default
  ON CONFLICT (organization_id, account_class, normalized_name) DO NOTHING;

  INSERT INTO public.finance_accounts (
    organization_id, account_class, account_subtype, display_name,
    description, use_for_lease_charges, created_by
  )
  SELECT
    category.organization_id,
    'income',
    'income',
    category.display_label,
    'Tenant billing category account.',
    true,
    p_organization_id
  FROM public.finance_categories AS category
  WHERE category.organization_id = p_organization_id
    AND category.namespace = 'tenant_billing'
    AND NOT category.is_default
  ON CONFLICT (organization_id, account_class, normalized_name) DO NOTHING;

  INSERT INTO public.finance_account_category_links (
    organization_id, account_id, category_id
  )
  SELECT
    category.organization_id,
    account.id,
    category.id
  FROM public.finance_categories AS category
  JOIN public.finance_accounts AS account
    ON account.organization_id = category.organization_id
   AND account.account_class = 'expense'
   AND account.normalized_name = CASE category.code
     WHEN 'cleaning' THEN 'cleaning'
     WHEN 'utilities' THEN 'utilities'
     WHEN 'repairs_maintenance' THEN 'repairs and maintenance'
     WHEN 'other' THEN 'other expenses'
     ELSE category.normalized_label
   END
  WHERE category.organization_id = p_organization_id
    AND category.namespace = 'owner_expense'
  ON CONFLICT (organization_id, category_id) DO NOTHING;

  INSERT INTO public.finance_account_category_links (
    organization_id, account_id, category_id
  )
  SELECT
    category.organization_id,
    account.id,
    category.id
  FROM public.finance_categories AS category
  JOIN public.finance_accounts AS account
    ON account.organization_id = category.organization_id
   AND account.account_class = 'income'
   AND account.normalized_name = CASE
     WHEN category.is_default THEN 'other income'
     ELSE category.normalized_label
   END
  WHERE category.organization_id = p_organization_id
    AND category.namespace = 'tenant_billing'
  ON CONFLICT (organization_id, category_id) DO NOTHING;

  IF EXISTS (
    SELECT 1
    FROM public.financial_reconciliation_sources AS source
    LEFT JOIN public.finance_account_source_links AS link
      ON link.organization_id = source.organization_id
     AND link.source_id = source.id
    WHERE source.organization_id = p_organization_id
    GROUP BY source.id
    HAVING count(link.source_id) <> 1
  ) THEN
    RAISE EXCEPTION 'Chart of Accounts source backfill is incomplete'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.finance_categories AS category
    LEFT JOIN public.finance_account_category_links AS link
      ON link.organization_id = category.organization_id
     AND link.category_id = category.id
    WHERE category.organization_id = p_organization_id
    GROUP BY category.id
    HAVING count(link.category_id) <> 1
  ) THEN
    RAISE EXCEPTION 'Chart of Accounts category backfill is incomplete'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE FUNCTION app_private.ensure_inserted_finance_source_account_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account_id uuid;
  v_account_name text := left(btrim(NEW.display_name), 70)
    || ' (' || left(NEW.code, 24) || ')';
  v_account_subtype text;
BEGIN
  IF coalesce(
    pg_catalog.current_setting('app.finance_account_source_context', true),
    'off'
  ) = 'on' OR NOT EXISTS (
    SELECT 1 FROM public.finance_accounts AS account
    WHERE account.organization_id = NEW.organization_id
  ) THEN
    RETURN NEW;
  END IF;

  SELECT account.id INTO v_account_id
  FROM public.finance_accounts AS account
  WHERE account.organization_id = NEW.organization_id
    AND NOT EXISTS (
      SELECT 1 FROM public.finance_account_source_links AS link
      WHERE link.organization_id = account.organization_id
        AND link.account_id = account.id
    )
    AND app_private.finance_account_source_is_compatible(
      NEW.source_kind,
      account.account_class,
      account.account_subtype
    )
    AND account.property_id IS NOT DISTINCT FROM NEW.property_id
    AND (
      (NEW.code = 'CHART_OPERATING_BANK' AND account.system_role = 'operating_bank')
      OR (NEW.code = 'CHART_TRUST_BANK' AND account.system_role = 'trust_bank')
      OR (
        NEW.code LIKE 'ACCOUNT\_%' ESCAPE '\'
        AND upper(left(replace(account.id::text, '-', ''), 24)) = substr(NEW.code, 9)
      )
      OR (
        NEW.code NOT IN ('CHART_OPERATING_BANK','CHART_TRUST_BANK')
        AND NEW.code NOT LIKE 'ACCOUNT\_%' ESCAPE '\'
      )
    )
  ORDER BY
    CASE account.system_role
      WHEN 'operating_bank' THEN 1
      WHEN 'trust_bank' THEN 2
      WHEN 'undeposited_funds' THEN 3
      ELSE 4
    END,
    account.normalized_name,
    account.id
  LIMIT 1
  FOR UPDATE;

  IF v_account_id IS NULL THEN
    v_account_subtype := CASE NEW.source_kind
      WHEN 'bank' THEN 'bank'
      WHEN 'cash' THEN 'cash'
      WHEN 'petty_cash' THEN 'petty_cash'
      WHEN 'clearing' THEN 'other_current_asset'
      ELSE 'other_asset'
    END;

    INSERT INTO public.finance_accounts (
      organization_id,
      account_class,
      account_subtype,
      display_name,
      description,
      property_id,
      created_by,
      updated_by
    ) VALUES (
      NEW.organization_id,
      'asset',
      v_account_subtype,
      v_account_name,
      'Imported cash account.',
      NEW.property_id,
      coalesce(NEW.created_by, NEW.organization_id),
      NEW.created_by
    )
    ON CONFLICT (organization_id, account_class, normalized_name) DO NOTHING
    RETURNING id INTO v_account_id;

    IF v_account_id IS NULL THEN
      SELECT account.id INTO v_account_id
      FROM public.finance_accounts AS account
      WHERE account.organization_id = NEW.organization_id
        AND account.account_class = 'asset'
        AND account.normalized_name = lower(regexp_replace(
          btrim(v_account_name), '[[:space:]]+', ' ', 'g'
        ))
      ORDER BY account.id
      LIMIT 1
      FOR UPDATE;
    END IF;
  END IF;

  INSERT INTO public.finance_account_source_links (
    organization_id, account_id, source_id
  ) VALUES (NEW.organization_id, v_account_id, NEW.id)
  ON CONFLICT (organization_id, source_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER ensure_inserted_finance_source_account_link
AFTER INSERT ON public.financial_reconciliation_sources
FOR EACH ROW
EXECUTE FUNCTION app_private.ensure_inserted_finance_source_account_link();

CREATE FUNCTION app_private.ensure_inserted_finance_category_account_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account_id uuid;
  v_account_class text;
  v_account_subtype text;
BEGIN
  IF coalesce(
    pg_catalog.current_setting('app.finance_account_category_context', true),
    'off'
  ) = 'on' OR NOT EXISTS (
    SELECT 1 FROM public.finance_accounts AS account
    WHERE account.organization_id = NEW.organization_id
  ) THEN
    RETURN NEW;
  END IF;

  v_account_class := CASE NEW.namespace
    WHEN 'owner_expense' THEN 'expense'
    ELSE 'income'
  END;
  v_account_subtype := CASE NEW.namespace
    WHEN 'owner_expense' THEN 'expense'
    ELSE 'income'
  END;

  SELECT account.id INTO v_account_id
  FROM public.finance_accounts AS account
  WHERE account.organization_id = NEW.organization_id
    AND account.account_class = v_account_class
    AND account.normalized_name = NEW.normalized_label
    AND account.archived_at IS NULL
    AND (
      NEW.namespace <> 'tenant_billing'
      OR account.use_for_lease_charges
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.finance_account_category_links AS link
      WHERE link.organization_id = account.organization_id
        AND link.account_id = account.id
        AND link.category_id = NEW.id
    )
  ORDER BY account.id
  LIMIT 1
  FOR UPDATE;

  IF v_account_id IS NULL THEN
    INSERT INTO public.finance_accounts (
      organization_id,
      account_class,
      account_subtype,
      display_name,
      description,
      use_for_lease_charges,
      created_by,
      updated_by
    ) VALUES (
      NEW.organization_id,
      v_account_class,
      v_account_subtype,
      NEW.display_label,
      CASE NEW.namespace
        WHEN 'owner_expense' THEN 'Expense category account.'
        ELSE 'Tenant billing category account.'
      END,
      NEW.namespace = 'tenant_billing',
      coalesce(NEW.created_by, NEW.organization_id),
      NEW.created_by
    )
    ON CONFLICT (organization_id, account_class, normalized_name) DO NOTHING
    RETURNING id INTO v_account_id;

    IF v_account_id IS NULL THEN
      SELECT account.id INTO v_account_id
      FROM public.finance_accounts AS account
      WHERE account.organization_id = NEW.organization_id
        AND account.account_class = v_account_class
        AND account.normalized_name = NEW.normalized_label
      ORDER BY account.id
      LIMIT 1
      FOR UPDATE;
    END IF;
  END IF;

  INSERT INTO public.finance_account_category_links (
    organization_id, account_id, category_id
  ) VALUES (NEW.organization_id, v_account_id, NEW.id)
  ON CONFLICT (organization_id, category_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER ensure_inserted_finance_category_account_link
AFTER INSERT ON public.finance_categories
FOR EACH ROW
EXECUTE FUNCTION app_private.ensure_inserted_finance_category_account_link();

CREATE FUNCTION app_private.ensure_default_finance_accounts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app_private.seed_finance_account_catalog(NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER zz_ensure_default_finance_accounts
AFTER INSERT ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION app_private.ensure_default_finance_accounts();

SELECT app_private.seed_finance_account_catalog(organization.id)
FROM public.organizations AS organization;

CREATE TRIGGER set_finance_accounts_updated_at
BEFORE UPDATE ON public.finance_accounts
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE FUNCTION app_private.can_read_finance_account(
  p_organization_id uuid,
  p_property_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    app_private.is_super_admin(p_organization_id)
    OR (
      p_property_id IS NULL
      AND app_private.has_org_permission(p_organization_id, 'finance.view')
    )
    OR (
      p_property_id IS NOT NULL
      AND app_private.can_read_finance_property(p_organization_id, p_property_id)
    ),
    false
  );
$$;

ALTER TABLE public.finance_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_account_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_account_source_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_account_category_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY financial_reconciliation_sources_hide_chart_accounts
ON public.financial_reconciliation_sources
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  code NOT LIKE 'CHART\_%' ESCAPE '\'
  AND code NOT LIKE 'ACCOUNT\_%' ESCAPE '\'
);

CREATE POLICY finance_accounts_select
ON public.finance_accounts
FOR SELECT
TO authenticated
USING (app_private.can_read_finance_account(organization_id, property_id));

CREATE POLICY finance_account_roles_select
ON public.finance_account_roles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.finance_accounts AS account
    WHERE account.organization_id = finance_account_roles.organization_id
      AND account.id = finance_account_roles.account_id
      AND app_private.can_read_finance_account(account.organization_id, account.property_id)
  )
);

CREATE POLICY finance_account_source_links_select
ON public.finance_account_source_links
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.finance_accounts AS account
    WHERE account.organization_id = finance_account_source_links.organization_id
      AND account.id = finance_account_source_links.account_id
      AND app_private.can_read_finance_account(account.organization_id, account.property_id)
  )
);

CREATE POLICY finance_account_category_links_select
ON public.finance_account_category_links
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.finance_accounts AS account
    WHERE account.organization_id = finance_account_category_links.organization_id
      AND account.id = finance_account_category_links.account_id
      AND app_private.can_read_finance_account(account.organization_id, account.property_id)
  )
);

REVOKE ALL ON TABLE public.finance_accounts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.finance_account_roles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.finance_account_source_links FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.finance_account_category_links FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.finance_accounts TO authenticated;
GRANT SELECT ON TABLE public.finance_account_roles TO authenticated;
GRANT SELECT ON TABLE public.finance_account_source_links TO authenticated;
GRANT SELECT ON TABLE public.finance_account_category_links TO authenticated;

CREATE FUNCTION public.create_finance_account(
  p_organization_id uuid,
  p_account_class text,
  p_account_subtype text,
  p_display_name text,
  p_account_number text,
  p_description text,
  p_parent_account_id uuid,
  p_property_id uuid,
  p_use_for_lease_charges boolean,
  p_use_for_lease_credits boolean,
  p_use_for_lease_deposits boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_account_id uuid;
  v_account_class text := lower(btrim(coalesce(p_account_class, '')));
  v_account_subtype text := lower(btrim(coalesce(p_account_subtype, '')));
  v_display_name text := btrim(regexp_replace(coalesce(p_display_name, ''), '[[:space:]]+', ' ', 'g'));
  v_parent public.finance_accounts%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_super_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.organizations AS organization
  WHERE organization.id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF length(v_display_name) NOT BETWEEN 2 AND 100
    OR NOT (
      (v_account_class = 'asset' AND v_account_subtype IN ('bank','cash','petty_cash','accounts_receivable','other_current_asset','fixed_asset','other_asset'))
      OR (v_account_class = 'liability' AND v_account_subtype IN ('accounts_payable','credit_card','current_liability','long_term_liability'))
      OR (v_account_class = 'equity' AND v_account_subtype = 'equity')
      OR (v_account_class = 'income' AND v_account_subtype IN ('income','other_income'))
      OR (v_account_class = 'expense' AND v_account_subtype IN ('expense','other_expense','cogs'))
    )
    OR (coalesce(p_use_for_lease_charges, false) AND v_account_class <> 'income')
    OR (coalesce(p_use_for_lease_credits, false) AND v_account_class <> 'expense')
    OR (
      coalesce(p_use_for_lease_deposits, false)
      AND NOT (v_account_class = 'liability' AND v_account_subtype = 'current_liability')
    ) THEN
    RAISE EXCEPTION 'Account inputs are incomplete or incompatible'
      USING ERRCODE = '22023';
  END IF;

  IF p_parent_account_id IS NOT NULL THEN
    SELECT account.* INTO v_parent
    FROM public.finance_accounts AS account
    WHERE account.organization_id = p_organization_id
      AND account.id = p_parent_account_id
    FOR SHARE;

    IF NOT FOUND OR v_parent.archived_at IS NOT NULL
      OR v_parent.account_class <> v_account_class THEN
      RAISE EXCEPTION 'Choose a parent with the same account type'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_property_id IS NOT NULL AND (
    NOT (v_account_class = 'asset' AND v_account_subtype IN ('bank','cash','petty_cash'))
    OR NOT EXISTS (
      SELECT 1 FROM public.properties AS property
      WHERE property.organization_id = p_organization_id
        AND property.id = p_property_id
        AND property.archived_at IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'Account property availability is incompatible'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.finance_accounts (
    organization_id,
    parent_account_id,
    account_class,
    account_subtype,
    account_number,
    display_name,
    description,
    use_for_lease_charges,
    use_for_lease_credits,
    use_for_lease_deposits,
    property_id,
    created_by,
    updated_by
  ) VALUES (
    p_organization_id,
    p_parent_account_id,
    v_account_class,
    v_account_subtype,
    nullif(btrim(coalesce(p_account_number, '')), ''),
    v_display_name,
    nullif(btrim(coalesce(p_description, '')), ''),
    coalesce(p_use_for_lease_charges, false),
    coalesce(p_use_for_lease_credits, false),
    coalesce(p_use_for_lease_deposits, false),
    p_property_id,
    v_actor_id,
    v_actor_id
  )
  RETURNING id INTO v_account_id;

  PERFORM app_private.ensure_finance_account_source(
    p_organization_id,
    v_account_id,
    v_actor_id
  );
  PERFORM app_private.ensure_finance_account_categories(
    p_organization_id,
    v_account_id,
    v_actor_id
  );

  RETURN v_account_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Use a unique account name and account number'
      USING ERRCODE = '23505';
END;
$$;

CREATE FUNCTION public.update_finance_account(
  p_organization_id uuid,
  p_account_id uuid,
  p_display_name text,
  p_account_number text,
  p_description text,
  p_parent_account_id uuid,
  p_property_id uuid,
  p_use_for_lease_charges boolean,
  p_use_for_lease_credits boolean,
  p_use_for_lease_deposits boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_account public.finance_accounts%ROWTYPE;
  v_parent public.finance_accounts%ROWTYPE;
  v_display_name text := btrim(regexp_replace(coalesce(p_display_name, ''), '[[:space:]]+', ' ', 'g'));
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_super_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT account.* INTO v_account
  FROM public.finance_accounts AS account
  WHERE account.organization_id = p_organization_id
    AND account.id = p_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF length(v_display_name) NOT BETWEEN 2 AND 100
    OR (coalesce(p_use_for_lease_charges, false) AND v_account.account_class <> 'income')
    OR (coalesce(p_use_for_lease_credits, false) AND v_account.account_class <> 'expense')
    OR (
      coalesce(p_use_for_lease_deposits, false)
      AND NOT (v_account.account_class = 'liability' AND v_account.account_subtype = 'current_liability')
    ) THEN
    RAISE EXCEPTION 'Account inputs are incomplete or incompatible'
      USING ERRCODE = '22023';
  END IF;

  IF v_account.system_role IS NOT NULL AND (
    p_parent_account_id IS DISTINCT FROM v_account.parent_account_id
    OR p_property_id IS DISTINCT FROM v_account.property_id
    OR (v_account.system_role = 'rental_income' AND NOT coalesce(p_use_for_lease_charges, false))
    OR (v_account.system_role = 'security_deposits' AND NOT coalesce(p_use_for_lease_deposits, false))
  ) THEN
    RAISE EXCEPTION 'System account workflow settings are protected'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.finance_account_source_links AS link
    WHERE link.organization_id = p_organization_id
      AND link.account_id = p_account_id
  ) AND p_property_id IS DISTINCT FROM v_account.property_id THEN
    RAISE EXCEPTION 'An account in use cannot change property availability'
      USING ERRCODE = '55000';
  END IF;

  IF (
    v_account.account_class = 'income'
    AND NOT coalesce(p_use_for_lease_charges, false)
    AND EXISTS (
      SELECT 1
      FROM public.finance_account_category_links AS link
      JOIN public.finance_categories AS category
        ON category.organization_id = link.organization_id
       AND category.id = link.category_id
      WHERE link.organization_id = p_organization_id
        AND link.account_id = p_account_id
        AND category.namespace = 'tenant_billing'
    )
  ) OR (
    v_account.account_class = 'expense'
    AND NOT coalesce(p_use_for_lease_credits, false)
    AND EXISTS (
      SELECT 1
      FROM public.finance_account_category_links AS link
      JOIN public.finance_categories AS category
        ON category.organization_id = link.organization_id
       AND category.id = link.category_id
      WHERE link.organization_id = p_organization_id
        AND link.account_id = p_account_id
        AND category.namespace = 'tenant_billing'
    )
  ) THEN
    RAISE EXCEPTION 'An account in use cannot disable its lease workflow'
      USING ERRCODE = '55000';
  END IF;

  IF p_parent_account_id IS NOT NULL THEN
    SELECT account.* INTO v_parent
    FROM public.finance_accounts AS account
    WHERE account.organization_id = p_organization_id
      AND account.id = p_parent_account_id
    FOR SHARE;

    IF NOT FOUND OR v_parent.archived_at IS NOT NULL
      OR v_parent.account_class <> v_account.account_class
      OR v_parent.id = v_account.id THEN
      RAISE EXCEPTION 'Choose a parent with the same account type'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_property_id IS NOT NULL AND (
    NOT (v_account.account_class = 'asset' AND v_account.account_subtype IN ('bank','cash','petty_cash'))
    OR NOT EXISTS (
      SELECT 1 FROM public.properties AS property
      WHERE property.organization_id = p_organization_id
        AND property.id = p_property_id
        AND property.archived_at IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'Account property availability is incompatible'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.finance_accounts AS account
  SET display_name = v_display_name,
      account_number = nullif(btrim(coalesce(p_account_number, '')), ''),
      description = nullif(btrim(coalesce(p_description, '')), ''),
      parent_account_id = p_parent_account_id,
      property_id = p_property_id,
      use_for_lease_charges = coalesce(p_use_for_lease_charges, false),
      use_for_lease_credits = coalesce(p_use_for_lease_credits, false),
      use_for_lease_deposits = coalesce(p_use_for_lease_deposits, false),
      updated_by = v_actor_id
  WHERE account.organization_id = p_organization_id
    AND account.id = p_account_id;

  PERFORM app_private.ensure_finance_account_source(
    p_organization_id,
    p_account_id,
    v_actor_id
  );
  PERFORM app_private.ensure_finance_account_categories(
    p_organization_id,
    p_account_id,
    v_actor_id
  );

  RETURN p_account_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Use a unique account name and account number'
      USING ERRCODE = '23505';
END;
$$;

CREATE FUNCTION public.set_finance_account_archived(
  p_organization_id uuid,
  p_account_id uuid,
  p_archived boolean,
  p_replacement_account_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_account public.finance_accounts%ROWTYPE;
  v_replacement public.finance_accounts%ROWTYPE;
  v_needs_replacement boolean;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_super_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT account.* INTO v_account
  FROM public.finance_accounts AS account
  WHERE account.organization_id = p_organization_id
    AND account.id = p_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF NOT coalesce(p_archived, true) THEN
    UPDATE public.finance_accounts AS account
    SET archived_at = NULL,
        archived_by = NULL,
        updated_by = v_actor_id
    WHERE account.organization_id = p_organization_id
      AND account.id = p_account_id;
    RETURN p_account_id;
  END IF;

  IF v_account.archived_at IS NOT NULL THEN
    RETURN p_account_id;
  END IF;

  SELECT
    EXISTS (
      SELECT 1 FROM public.finance_account_roles AS role
      WHERE role.organization_id = p_organization_id
        AND role.account_id = p_account_id
    )
    OR EXISTS (
      SELECT 1 FROM public.finance_account_source_links AS link
      WHERE link.organization_id = p_organization_id
        AND link.account_id = p_account_id
    )
    OR EXISTS (
      SELECT 1 FROM public.finance_account_category_links AS link
      WHERE link.organization_id = p_organization_id
        AND link.account_id = p_account_id
    )
  INTO v_needs_replacement;

  IF v_needs_replacement AND p_replacement_account_id IS NULL THEN
    RAISE EXCEPTION 'Choose a replacement default before making this account inactive'
      USING ERRCODE = '55000';
  END IF;

  IF p_replacement_account_id IS NOT NULL THEN
    SELECT account.* INTO v_replacement
    FROM public.finance_accounts AS account
    WHERE account.organization_id = p_organization_id
      AND account.id = p_replacement_account_id
      AND account.id <> p_account_id
      AND account.archived_at IS NULL
    FOR UPDATE;

    IF NOT FOUND OR v_replacement.account_class <> v_account.account_class THEN
      RAISE EXCEPTION 'Choose an active replacement with the same account type'
        USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.finance_account_roles AS role
      WHERE role.organization_id = p_organization_id
        AND role.account_id = p_account_id
        AND NOT app_private.finance_account_role_is_compatible(
          role.role_code,
          v_replacement.account_class,
          v_replacement.account_subtype,
          v_replacement.use_for_lease_charges,
          v_replacement.use_for_lease_deposits
        )
    ) THEN
      RAISE EXCEPTION 'Replacement account is incompatible with the required default'
        USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.finance_account_source_links AS link
      WHERE link.organization_id = p_organization_id
        AND link.account_id = p_account_id
    ) AND EXISTS (
      SELECT 1 FROM public.finance_account_source_links AS link
      WHERE link.organization_id = p_organization_id
        AND link.account_id = p_replacement_account_id
    ) THEN
      RAISE EXCEPTION 'Replacement account already has a cash source'
        USING ERRCODE = '22023';
    END IF;

    UPDATE public.finance_account_source_links AS link
    SET account_id = p_replacement_account_id
    WHERE link.organization_id = p_organization_id
      AND link.account_id = p_account_id;

    UPDATE public.finance_account_category_links AS link
    SET account_id = p_replacement_account_id
    WHERE link.organization_id = p_organization_id
      AND link.account_id = p_account_id;

    UPDATE public.finance_account_roles AS role
    SET account_id = p_replacement_account_id
    WHERE role.organization_id = p_organization_id
      AND role.account_id = p_account_id;

    IF v_account.system_role IS NOT NULL THEN
      IF v_replacement.system_role IS NOT NULL THEN
        RAISE EXCEPTION 'Replacement account is already a protected default'
          USING ERRCODE = '22023';
      END IF;

      UPDATE public.finance_accounts AS account
      SET system_role = NULL,
          updated_by = v_actor_id
      WHERE account.organization_id = p_organization_id
        AND account.id = p_account_id;

      UPDATE public.finance_accounts AS account
      SET system_role = v_account.system_role,
          updated_by = v_actor_id
      WHERE account.organization_id = p_organization_id
        AND account.id = p_replacement_account_id;
    END IF;
  END IF;

  UPDATE public.finance_accounts AS account
  SET archived_at = now(),
      archived_by = v_actor_id,
      updated_by = v_actor_id
  WHERE account.organization_id = p_organization_id
    AND account.id = p_account_id;

  RETURN p_account_id;
END;
$$;

REVOKE ALL ON FUNCTION app_private.finance_account_role_is_compatible(text, text, text, boolean, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.finance_account_source_is_compatible(text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.enforce_finance_account_parent()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.enforce_finance_account_role_link()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.enforce_finance_account_source_link()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.enforce_finance_account_category_link()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.ensure_finance_account_categories(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.ensure_finance_account_source(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.seed_finance_account_catalog(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.ensure_inserted_finance_source_account_link()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.ensure_inserted_finance_category_account_link()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.ensure_default_finance_accounts()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.can_read_finance_account(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION app_private.can_read_finance_account(uuid, uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION public.create_finance_account(uuid, text, text, text, text, text, uuid, uuid, boolean, boolean, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_finance_account(uuid, uuid, text, text, text, uuid, uuid, boolean, boolean, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_finance_account_archived(uuid, uuid, boolean, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.create_finance_account(uuid, text, text, text, text, text, uuid, uuid, boolean, boolean, boolean)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_finance_account(uuid, uuid, text, text, text, uuid, uuid, boolean, boolean, boolean)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_finance_account_archived(uuid, uuid, boolean, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.create_finance_account(uuid, text, text, text, text, text, uuid, uuid, boolean, boolean, boolean) IS
  'Creates one compatible Chart of Accounts row and its preserved operational mappings through a Super Admin-only checked boundary.';
COMMENT ON FUNCTION public.update_finance_account(uuid, uuid, text, text, text, uuid, uuid, boolean, boolean, boolean) IS
  'Updates editable account details and creates required stable mappings without replacing existing category identities.';
COMMENT ON FUNCTION public.set_finance_account_archived(uuid, uuid, boolean, uuid) IS
  'Archives or restores an account while requiring compatible replacements for live defaults and preserved operational mappings.';
