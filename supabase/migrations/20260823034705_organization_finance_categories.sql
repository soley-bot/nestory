CREATE TABLE public.finance_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  namespace text NOT NULL,
  code text NOT NULL,
  display_label text NOT NULL,
  normalized_label text GENERATED ALWAYS AS (
    lower(regexp_replace(btrim(display_label), '[[:space:]]+', ' ', 'g'))
  ) STORED,
  reporting_group text NOT NULL,
  sort_order integer NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  archived_at timestamptz,
  archived_by uuid,
  is_active boolean GENERATED ALWAYS AS (archived_at IS NULL) STORED,
  CONSTRAINT finance_categories_namespace_check
    CHECK (namespace IN ('owner_expense', 'tenant_billing')),
  CONSTRAINT finance_categories_code_check
    CHECK (code ~ '^[a-z][a-z0-9_]{1,63}$'),
  CONSTRAINT finance_categories_label_check
    CHECK (length(normalized_label) BETWEEN 2 AND 80),
  CONSTRAINT finance_categories_sort_order_check
    CHECK (sort_order > 0),
  CONSTRAINT finance_categories_archive_actor_check
    CHECK (
      (archived_at IS NULL AND archived_by IS NULL)
      OR (archived_at IS NOT NULL AND archived_by IS NOT NULL)
    ),
  CONSTRAINT finance_categories_reporting_group_check
    CHECK (
      (
        namespace = 'owner_expense'
        AND reporting_group IN (
          'vendor_bill',
          'maintenance',
          'utilities',
          'supplies',
          'other'
        )
      )
      OR (
        namespace = 'tenant_billing'
        AND reporting_group IN (
          'utility_reimbursement',
          'parking',
          'late_fee',
          'service_fee',
          'other'
        )
      )
    ),
  CONSTRAINT finance_categories_org_namespace_code_key
    UNIQUE (organization_id, namespace, code),
  CONSTRAINT finance_categories_org_namespace_label_key
    UNIQUE (organization_id, namespace, normalized_label)
);

COMMENT ON TABLE public.finance_categories IS
  'Organization-owned Finance category authority. Owner expenses and tenant billing are separate namespaces; archive preserves historical meaning.';
COMMENT ON COLUMN public.finance_categories.code IS
  'Stable category identity code. Display-label edits never change it.';
COMMENT ON COLUMN public.finance_categories.reporting_group IS
  'Stable mapping into the existing owner-expense or tenant-income reporting vocabulary.';

CREATE INDEX finance_categories_active_order_idx
  ON public.finance_categories (
    organization_id,
    namespace,
    sort_order,
    normalized_label,
    code,
    id
  )
  WHERE archived_at IS NULL;

CREATE FUNCTION app_private.normalize_finance_category_legacy_code(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE trim(both '_' FROM regexp_replace(
    lower(btrim(coalesce(p_value, ''))),
    '[^a-z0-9]+',
    '_',
    'g'
  ))
    WHEN 'utility' THEN 'utilities'
    WHEN 'repairs_and_maintenance' THEN 'repairs_maintenance'
    ELSE trim(both '_' FROM regexp_replace(
      lower(btrim(coalesce(p_value, ''))),
      '[^a-z0-9]+',
      '_',
      'g'
    ))
  END;
$$;

CREATE FUNCTION app_private.can_read_finance_category_catalog(
  p_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    app_private.is_super_admin(p_organization_id)
    OR app_private.has_org_permission(p_organization_id, 'finance.view'),
    false
  );
$$;

CREATE FUNCTION app_private.seed_default_finance_categories(
  p_organization_id uuid
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.finance_categories (
    organization_id,
    namespace,
    code,
    display_label,
    reporting_group,
    sort_order,
    is_default
  )
  SELECT
    p_organization_id,
    defaults.namespace,
    defaults.code,
    defaults.display_label,
    defaults.reporting_group,
    defaults.sort_order,
    true
  FROM (
    VALUES
      ('owner_expense'::text, 'cleaning'::text, 'Cleaning'::text, 'maintenance'::text, 10),
      ('owner_expense'::text, 'utilities'::text, 'Utilities'::text, 'utilities'::text, 20),
      ('owner_expense'::text, 'repairs_maintenance'::text, 'Repairs and maintenance'::text, 'maintenance'::text, 30),
      ('owner_expense'::text, 'other'::text, 'Other'::text, 'other'::text, 40),
      ('tenant_billing'::text, 'cleaning'::text, 'Cleaning'::text, 'other'::text, 10),
      ('tenant_billing'::text, 'utilities'::text, 'Utilities'::text, 'utility_reimbursement'::text, 20),
      ('tenant_billing'::text, 'repairs_maintenance'::text, 'Repairs and maintenance'::text, 'other'::text, 30),
      ('tenant_billing'::text, 'other'::text, 'Other'::text, 'other'::text, 40)
  ) AS defaults(namespace, code, display_label, reporting_group, sort_order)
  ON CONFLICT (organization_id, namespace, code) DO NOTHING;
$$;

CREATE FUNCTION app_private.ensure_default_finance_categories()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app_private.seed_default_finance_categories(NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER ensure_default_finance_categories
AFTER INSERT ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION app_private.ensure_default_finance_categories();

SELECT app_private.seed_default_finance_categories(organization.id)
FROM public.organizations AS organization;

CREATE FUNCTION app_private.finance_category_is_used(p_category_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH category_record AS (
    SELECT category.organization_id, category.namespace, category.code
    FROM public.finance_categories AS category
    WHERE category.id = p_category_id
  )
  SELECT coalesce(bool_or(
    CASE category.namespace
      WHEN 'owner_expense' THEN
        EXISTS (
          SELECT 1
          FROM public.expense_submissions AS submission
          WHERE submission.organization_id = category.organization_id
            AND app_private.normalize_finance_category_legacy_code(
              submission.customer_category
            ) = category.code
        )
        OR EXISTS (
          SELECT 1
          FROM public.ips_expense_responsibilities AS responsibility
          WHERE responsibility.organization_id = category.organization_id
            AND app_private.normalize_finance_category_legacy_code(
              responsibility.customer_category
            ) = category.code
        )
        OR EXISTS (
          SELECT 1
          FROM public.finance_expense_items AS expense
          WHERE expense.organization_id = category.organization_id
            AND app_private.normalize_finance_category_legacy_code(
              expense.category
            ) = category.code
        )
        OR EXISTS (
          SELECT 1
          FROM public.petty_cash_entries AS entry
          WHERE entry.organization_id = category.organization_id
            AND app_private.normalize_finance_category_legacy_code(
              entry.category
            ) = category.code
        )
      WHEN 'tenant_billing' THEN
        EXISTS (
          SELECT 1
          FROM public.tenant_invoice_lines AS line
          WHERE line.organization_id = category.organization_id
            AND app_private.normalize_finance_category_legacy_code(
              line.line_type
            ) = category.code
        )
      ELSE false
    END
  ), false)
  FROM category_record AS category;
$$;

CREATE FUNCTION app_private.guard_finance_category_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Finance categories must be archived, not deleted'
      USING ERRCODE = '55000', DETAIL = 'finance_category_archive_required';
  END IF;

  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.namespace IS DISTINCT FROM OLD.namespace
    OR NEW.code IS DISTINCT FROM OLD.code
    OR NEW.is_default IS DISTINCT FROM OLD.is_default THEN
    RAISE EXCEPTION 'Finance category identity is immutable'
      USING ERRCODE = '55000', DETAIL = 'finance_category_identity_immutable';
  END IF;

  IF NEW.reporting_group IS DISTINCT FROM OLD.reporting_group THEN
    IF app_private.finance_category_is_used(OLD.id) THEN
      RAISE EXCEPTION 'Used Finance categories cannot change reporting group'
        USING ERRCODE = '55000', DETAIL = 'finance_category_reporting_group_used';
    END IF;

    IF OLD.is_default THEN
      RAISE EXCEPTION 'Default Finance category reporting groups are immutable'
        USING ERRCODE = '55000', DETAIL = 'finance_category_default_mapping_immutable';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_finance_category_history
BEFORE UPDATE OR DELETE ON public.finance_categories
FOR EACH ROW
EXECUTE FUNCTION app_private.guard_finance_category_history();

CREATE TRIGGER set_finance_categories_updated_at
BEFORE UPDATE ON public.finance_categories
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.finance_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY finance_categories_select
ON public.finance_categories
FOR SELECT
TO authenticated
USING (app_private.can_read_finance_category_catalog(organization_id));

REVOKE ALL ON TABLE public.finance_categories FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.finance_categories TO authenticated;

CREATE FUNCTION public.get_finance_categories(
  p_organization_id uuid,
  p_namespace text,
  p_include_archived boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  namespace text,
  code text,
  display_label text,
  normalized_label text,
  reporting_group text,
  sort_order integer,
  is_default boolean,
  is_active boolean,
  archived_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL
    OR NOT app_private.can_read_finance_category_catalog(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_namespace NOT IN ('owner_expense', 'tenant_billing') THEN
    RAISE EXCEPTION 'Choose a valid Finance category namespace'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    category.id,
    category.organization_id,
    category.namespace,
    category.code,
    category.display_label,
    category.normalized_label,
    category.reporting_group,
    category.sort_order,
    category.is_default,
    category.is_active,
    category.archived_at
  FROM public.finance_categories AS category
  WHERE category.organization_id = p_organization_id
    AND category.namespace = p_namespace
    AND (coalesce(p_include_archived, false) OR category.archived_at IS NULL)
  ORDER BY
    category.sort_order,
    category.normalized_label,
    category.code,
    category.id;
END;
$$;

CREATE FUNCTION public.resolve_finance_category(
  p_organization_id uuid,
  p_namespace text,
  p_legacy_code text
)
RETURNS TABLE (
  category_id uuid,
  organization_id uuid,
  namespace text,
  canonical_code text,
  display_label text,
  reporting_group text,
  is_active boolean,
  authority_kind text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_legacy_code text := app_private.normalize_finance_category_legacy_code(
    p_legacy_code
  );
BEGIN
  IF auth.uid() IS NULL
    OR NOT app_private.can_read_finance_category_catalog(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_namespace NOT IN ('owner_expense', 'tenant_billing') THEN
    RAISE EXCEPTION 'Choose a valid Finance category namespace'
      USING ERRCODE = '22023';
  END IF;

  IF p_namespace = 'tenant_billing' AND v_legacy_code = 'manual_rent' THEN
    RETURN QUERY SELECT
      NULL::uuid,
      p_organization_id,
      p_namespace,
      'base_rent'::text,
      'Base rent'::text,
      'rent'::text,
      true,
      'lease_rent'::text;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    category.id,
    category.organization_id,
    category.namespace,
    category.code,
    category.display_label,
    category.reporting_group,
    category.is_active,
    'category'::text
  FROM public.finance_categories AS category
  WHERE category.organization_id = p_organization_id
    AND category.namespace = p_namespace
    AND category.code = v_legacy_code
  ORDER BY category.id
  LIMIT 1;
END;
$$;

CREATE FUNCTION public.create_finance_category(
  p_organization_id uuid,
  p_namespace text,
  p_display_label text,
  p_reporting_group text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_code text;
  v_id uuid;
  v_normalized_label text := lower(regexp_replace(
    btrim(coalesce(p_display_label, '')),
    '[[:space:]]+',
    ' ',
    'g'
  ));
  v_sort_order integer;
BEGIN
  IF v_actor_id IS NULL OR NOT app_private.is_super_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_namespace NOT IN ('owner_expense', 'tenant_billing')
    OR length(v_normalized_label) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'Finance category inputs are incomplete or invalid'
      USING ERRCODE = '22023';
  END IF;

  IF NOT (
    (
      p_namespace = 'owner_expense'
      AND p_reporting_group IN (
        'vendor_bill', 'maintenance', 'utilities', 'supplies', 'other'
      )
    )
    OR (
      p_namespace = 'tenant_billing'
      AND p_reporting_group IN (
        'utility_reimbursement', 'parking', 'late_fee', 'service_fee', 'other'
      )
    )
  ) THEN
    RAISE EXCEPTION 'Reporting group does not belong to this Finance namespace'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':',
        'finance_category_v1',
        p_organization_id,
        p_namespace
      ),
      0
    )
  );

  IF EXISTS (
    SELECT 1
    FROM public.finance_categories AS category
    WHERE category.organization_id = p_organization_id
      AND category.namespace = p_namespace
      AND category.normalized_label = v_normalized_label
  ) THEN
    RAISE EXCEPTION 'Finance category label already exists in this namespace'
      USING ERRCODE = '23505', DETAIL = 'finance_category_label_duplicate';
  END IF;

  v_code := 'custom_' || substr(
    pg_catalog.encode(
      extensions.digest(
        pg_catalog.concat_ws(
          ':',
          p_organization_id::text,
          p_namespace,
          v_normalized_label
        ),
        'sha256'
      ),
      'hex'
    ),
    1,
    20
  );

  SELECT coalesce(max(category.sort_order), 40) + 10
  INTO v_sort_order
  FROM public.finance_categories AS category
  WHERE category.organization_id = p_organization_id
    AND category.namespace = p_namespace;

  INSERT INTO public.finance_categories (
    organization_id,
    namespace,
    code,
    display_label,
    reporting_group,
    sort_order,
    created_by,
    updated_by
  ) VALUES (
    p_organization_id,
    p_namespace,
    v_code,
    btrim(regexp_replace(p_display_label, '[[:space:]]+', ' ', 'g')),
    p_reporting_group,
    v_sort_order,
    v_actor_id,
    v_actor_id
  )
  RETURNING finance_categories.id INTO v_id;

  RETURN v_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Finance category label already exists in this namespace'
      USING ERRCODE = '23505', DETAIL = 'finance_category_label_duplicate';
END;
$$;

CREATE FUNCTION public.update_finance_category(
  p_organization_id uuid,
  p_category_id uuid,
  p_display_label text,
  p_reporting_group text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_category public.finance_categories%ROWTYPE;
  v_normalized_label text := lower(regexp_replace(
    btrim(coalesce(p_display_label, '')),
    '[[:space:]]+',
    ' ',
    'g'
  ));
BEGIN
  IF v_actor_id IS NULL OR NOT app_private.is_super_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT category.*
  INTO v_category
  FROM public.finance_categories AS category
  WHERE category.organization_id = p_organization_id
    AND category.id = p_category_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF length(v_normalized_label) NOT BETWEEN 2 AND 80
    OR NOT (
      (
        v_category.namespace = 'owner_expense'
        AND p_reporting_group IN (
          'vendor_bill', 'maintenance', 'utilities', 'supplies', 'other'
        )
      )
      OR (
        v_category.namespace = 'tenant_billing'
        AND p_reporting_group IN (
          'utility_reimbursement', 'parking', 'late_fee', 'service_fee', 'other'
        )
      )
    ) THEN
    RAISE EXCEPTION 'Finance category inputs are incomplete or invalid'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.finance_categories AS category
  SET display_label = btrim(regexp_replace(
        p_display_label,
        '[[:space:]]+',
        ' ',
        'g'
      )),
    reporting_group = p_reporting_group,
    updated_by = v_actor_id
  WHERE category.organization_id = p_organization_id
    AND category.id = p_category_id;

  RETURN p_category_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Finance category label already exists in this namespace'
      USING ERRCODE = '23505', DETAIL = 'finance_category_label_duplicate';
END;
$$;

CREATE FUNCTION public.set_finance_category_archived(
  p_organization_id uuid,
  p_category_id uuid,
  p_archived boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
BEGIN
  IF v_actor_id IS NULL OR NOT app_private.is_super_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.finance_categories AS category
  WHERE category.organization_id = p_organization_id
    AND category.id = p_category_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.finance_categories AS category
  SET archived_at = CASE
        WHEN coalesce(p_archived, true) THEN coalesce(category.archived_at, now())
        ELSE NULL
      END,
    archived_by = CASE
      WHEN coalesce(p_archived, true) THEN coalesce(category.archived_by, v_actor_id)
      ELSE NULL
    END,
    updated_by = v_actor_id
  WHERE category.organization_id = p_organization_id
    AND category.id = p_category_id;

  RETURN p_category_id;
END;
$$;

REVOKE ALL ON FUNCTION app_private.normalize_finance_category_legacy_code(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.can_read_finance_category_catalog(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.seed_default_finance_categories(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.ensure_default_finance_categories()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.finance_category_is_used(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.guard_finance_category_history()
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION app_private.can_read_finance_category_catalog(uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION public.get_finance_categories(uuid, text, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.resolve_finance_category(uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_finance_category(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_finance_category(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_finance_category_archived(uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_finance_categories(uuid, text, boolean)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_finance_category(uuid, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_finance_category(uuid, text, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_finance_category(uuid, uuid, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_finance_category_archived(uuid, uuid, boolean)
  TO authenticated;

COMMENT ON FUNCTION public.get_finance_categories(uuid, text, boolean) IS
  'Returns one authorized organization Finance namespace in deterministic operational order.';
COMMENT ON FUNCTION public.resolve_finance_category(uuid, text, text) IS
  'Resolves legacy Finance category codes without making lease-owned base rent customizable.';
COMMENT ON FUNCTION public.create_finance_category(uuid, text, text, text) IS
  'Creates one organization-owned custom Finance category with stable identity and code.';
COMMENT ON FUNCTION public.update_finance_category(uuid, uuid, text, text) IS
  'Renames a Finance category and permits reporting remapping only before custom-category use.';
COMMENT ON FUNCTION public.set_finance_category_archived(uuid, uuid, boolean) IS
  'Archives or restores a Finance category without deleting historical identity.';
