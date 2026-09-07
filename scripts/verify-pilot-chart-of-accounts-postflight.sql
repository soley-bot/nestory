WITH pilot AS (
  SELECT organization.id
  FROM public.organizations AS organization
  WHERE organization.slug = 'pilot'
),
required_starter(account_class, account_subtype, display_name, system_role) AS (
  VALUES
    ('asset', 'bank', 'Operating account', 'operating_bank'),
    ('asset', 'bank', 'Trust account', 'trust_bank'),
    ('asset', 'other_current_asset', 'Undeposited funds', 'undeposited_funds'),
    ('asset', 'accounts_receivable', 'Accounts receivable', 'accounts_receivable'),
    ('asset', 'petty_cash', 'Petty cash', NULL),
    ('liability', 'accounts_payable', 'Accounts payable', 'accounts_payable'),
    ('liability', 'current_liability', 'Security deposits', 'security_deposits'),
    ('equity', 'equity', 'Opening balance', 'opening_balance'),
    ('equity', 'equity', 'Owner contributions', 'owner_contributions'),
    ('equity', 'equity', 'Owner distributions', 'owner_distributions'),
    ('equity', 'equity', 'Retained earnings', 'retained_earnings'),
    ('income', 'income', 'Rental income', 'rental_income'),
    ('income', 'income', 'Late fees', NULL),
    ('income', 'income', 'Application fees', NULL),
    ('income', 'other_income', 'Other income', NULL),
    ('expense', 'expense', 'Cleaning', NULL),
    ('expense', 'expense', 'Management fees', NULL),
    ('expense', 'expense', 'Repairs and maintenance', NULL),
    ('expense', 'expense', 'Utilities', NULL),
    ('expense', 'other_expense', 'Other expenses', NULL)
),
required_default(role_code, account_class, account_subtype) AS (
  VALUES
    ('operating_bank', 'asset', 'bank'),
    ('trust_bank', 'asset', 'bank'),
    ('undeposited_funds', 'asset', 'other_current_asset'),
    ('accounts_receivable', 'asset', 'accounts_receivable'),
    ('accounts_payable', 'liability', 'accounts_payable'),
    ('security_deposits', 'liability', 'current_liability'),
    ('opening_balance', 'equity', 'equity'),
    ('owner_contributions', 'equity', 'equity'),
    ('owner_distributions', 'equity', 'equity'),
    ('retained_earnings', 'equity', 'equity'),
    ('rental_income', 'income', 'income')
),
observed AS (
  SELECT jsonb_build_object(
    'organizationCount', (SELECT count(*) FROM pilot),
    'requiredStarterAccountCount', (
      SELECT count(*)
      FROM pilot
      CROSS JOIN required_starter AS required
      WHERE (
        SELECT count(*)
        FROM public.finance_accounts AS account
        WHERE account.organization_id = pilot.id
          AND account.account_class = required.account_class
          AND account.account_subtype = required.account_subtype
          AND account.display_name = required.display_name
          AND account.system_role IS NOT DISTINCT FROM required.system_role
          AND account.archived_at IS NULL
      ) = 1
    ),
    'requiredDefaultCount', (
      SELECT count(*)
      FROM pilot
      JOIN public.finance_account_roles AS role
        ON role.organization_id = pilot.id
      JOIN required_default AS required
        ON required.role_code = role.role_code
      JOIN public.finance_accounts AS account
        ON account.organization_id = role.organization_id
       AND account.id = role.account_id
       AND account.system_role = required.role_code
       AND account.account_class = required.account_class
       AND account.account_subtype = required.account_subtype
       AND account.archived_at IS NULL
       AND (required.role_code <> 'rental_income' OR account.use_for_lease_charges)
       AND (required.role_code <> 'security_deposits' OR account.use_for_lease_deposits)
       AND (required.role_code <> 'operating_bank' OR EXISTS (
         SELECT 1 FROM public.finance_account_source_links AS bank_link
         JOIN public.financial_reconciliation_sources AS bank_source
           ON bank_source.organization_id = bank_link.organization_id
          AND bank_source.id = bank_link.source_id
         WHERE bank_link.organization_id = account.organization_id
           AND bank_link.account_id = account.id
           AND bank_source.source_kind = 'bank'
           AND bank_source.archived_at IS NULL
           AND bank_source.property_id IS NOT DISTINCT FROM account.property_id
       ))
    ),
    'activeSourceMappingViolationCount', (
      SELECT count(*)
      FROM pilot
      JOIN public.financial_reconciliation_sources AS source
        ON source.organization_id = pilot.id
       AND source.archived_at IS NULL
      WHERE (
        SELECT count(*)
        FROM public.finance_account_source_links AS link
        JOIN public.finance_accounts AS account
          ON account.organization_id = link.organization_id
         AND account.id = link.account_id
         AND account.archived_at IS NULL
        WHERE link.organization_id = source.organization_id
          AND link.source_id = source.id
      ) <> 1
    ),
    'activeCategoryMappingViolationCount', (
      SELECT count(*)
      FROM pilot
      JOIN public.finance_categories AS category
        ON category.organization_id = pilot.id
       AND category.archived_at IS NULL
      WHERE (
        SELECT count(*)
        FROM public.finance_account_category_links AS link
        JOIN public.finance_accounts AS account
          ON account.organization_id = link.organization_id
         AND account.id = link.account_id
         AND account.archived_at IS NULL
        WHERE link.organization_id = category.organization_id
          AND link.category_id = category.id
      ) <> 1
    ),
    'privilegedTriggerCount', (
      SELECT count(*)
      FROM pg_catalog.pg_trigger AS trigger_record
      JOIN pg_catalog.pg_class AS relation ON relation.oid = trigger_record.tgrelid
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname IN (
          'finance_accounts',
          'finance_account_roles',
          'finance_account_source_links',
          'finance_account_category_links'
        )
        AND trigger_record.tgname = 'privileged_email_step_up_enforcement'
        AND trigger_record.tgenabled IN ('O', 'A')
        AND trigger_record.tgtype = 31
        AND trigger_record.tgfoid = 'app_private.enforce_privileged_email_step_up_on_organization_mutation()'::regprocedure
        AND trigger_record.tgqual IS NULL
        AND trigger_record.tgnargs = 0
        AND trigger_record.tgattr = ''::int2vector
        AND NOT trigger_record.tgisinternal
    ),
    'policyCount', (
      SELECT count(*)
      FROM app_private.privileged_email_step_up_policies AS policy
      JOIN pilot ON pilot.id = policy.organization_id
    ),
    'enabledPolicyCount', (
      SELECT count(*)
      FROM app_private.privileged_email_step_up_policies AS policy
      JOIN pilot ON pilot.id = policy.organization_id
      WHERE policy.enforcement_enabled
    )
  ) AS value
)
SELECT value AS pilot_chart_of_accounts_postflight
FROM observed
WHERE (value ->> 'organizationCount')::integer = 1
  AND (value ->> 'requiredStarterAccountCount')::integer = 20
  AND (value ->> 'requiredDefaultCount')::integer = 11
  AND (value ->> 'activeSourceMappingViolationCount')::integer = 0
  AND (value ->> 'activeCategoryMappingViolationCount')::integer = 0
  AND (value ->> 'privilegedTriggerCount')::integer = 4
  AND (value ->> 'enabledPolicyCount')::integer = 0;
