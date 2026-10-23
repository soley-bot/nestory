// Reviewed reset dispositions. This is inventory policy, never executable SQL.
// Every public/app_private base table must have an explicit entry, even if empty.
const registry = {};
function add(schema, disposition, scope, names, reason) {
  for (const name of names.split(/\s+/).filter(Boolean)) {
    const table = `${schema}.${name}`;
    if (registry[table]) throw Error(`Duplicate reset classification: ${table}`);
    registry[table] = { disposition, scope, reason };
  }
}
add('public', 'preserve', 'organization_id', `activity_logs asset_photos documents
 finance_account_category_links finance_account_roles finance_account_source_links finance_accounts finance_categories financial_reconciliation_sources
 import_mappings lease_activation_schedules lease_billing_terms lease_lifecycle_events lease_occupancies lease_occupancy_participants lease_parties lease_terms leases
 maintenance_recurrence_revisions maintenance_recurrence_series organization_access_transition_manifest_items organization_access_transition_manifests
 organization_authorization_states organization_branches organization_invitations organization_members organization_role_permissions organization_roles organization_teams
 people person_branch_relationships person_contacts person_roles person_travel_documents petty_cash_accounts properties property_owners rent_policy_versions
 tenant_requests units vendor_profiles`, 'Preserve identity, contracts, configuration and historical audit evidence.');
add('public', 'preserve', 'id', 'organizations', 'Organization identity is the scope key; preserve it.');
add('public', 'preserve-global', null, 'public_interest_requests notification_delivery_attempts', 'Unscoped intake/delivery evidence; never include in financial deletion.');
add('public', 'retire-intent', 'organization_id', 'import_runs import_rows ips_cutover_batches ips_cutover_items ips_cutover_reconciliations ips_cutover_transitions notification_outbox', 'Retain provenance; old import/cutover/notification payload must not execute after reset.');
add('public', 'normalize-reviewed', 'organization_id', 'lease_deposits tasks timeline_events', 'Preserve contract/task identity; exact cash-status, task cost or timeline financial projection after-values need a separate reviewed row manifest.');
add('public', 'archive-remove', 'organization_id', `deposit_rent_allocations deposit_rent_applications deposit_rent_custody_confirmations deposit_rent_owner_bridges
 expense_customer_adjustments expense_legacy_replacements expense_submissions expense_transaction_lines expense_transaction_scopes expense_transactions
 fee_payment_date_corrections finance_expense_items finance_income_items finance_payment_allocations finance_payments finance_receipt_allocations finance_receipts
 financial_month_locks historical_rent_settlement_reapplications ips_expense_responsibilities lease_deposit_events ledger_entries management_fee_occurrences
 owner_balance_period_components owner_balance_periods owner_cash_events owner_cash_source_consumptions owner_charge_cash_allocations owner_close_corrections
 owner_close_line_sources owner_close_lines owner_close_revisions owner_close_series owner_collection_confirmation_allocations owner_collection_confirmations
 owner_component_movements owner_component_transfer_instructions owner_component_transfer_lines owner_event_allocation_sets owner_event_owner_allocations
 owner_invoice_lines owner_invoices owner_opening_balance_entries owner_opening_balance_requests owner_payment_allocations owner_payments
 owner_statement_artifacts owner_statement_publications petty_cash_entries petty_cash_periods property_withdrawals rent_generation_exceptions
 tenant_commercial_document_artifacts tenant_credit_occurrences tenant_invoice_corrections tenant_invoice_lines tenant_invoice_payment_allocations
 tenant_invoice_payments tenant_invoice_rent_segments tenant_invoices`, 'Archive exact original rows before removing active financial authority; no mutation authorized by this registry.');
add('app_private', 'archive-remove', 'organization_id', 'deferred_owner_cash deposit_rent_application_attestations deposit_rent_custody_attestations', 'Retire executable queue/custody dependencies before parent removal.');
add('app_private', 'retire-intent', 'organization_id', `deposit_rent_journal_intents deposit_rent_journal_slots finance_category_idempotency_result_seals financial_idempotency_requests paid_cost_evidence_cleanup_claims
 paid_cost_evidence_registrations tenant_commercial_document_cleanup_claims tenant_commercial_document_upload_attestations`, 'Retain retired evidence, reconcile unconfirmed attempts and external Storage effects; never replay.');
add('app_private', 'preserve', 'organization_id', `finance_account_activity_authority_history finance_account_generated_categories finance_account_internal_sources
 finance_category_idempotency_bindings finance_chart_workflow_idempotency_bindings financial_report_source_revisions
 financial_write_controls privileged_email_step_up_challenges privileged_email_step_up_events privileged_email_step_up_grants privileged_email_step_up_policies
 unit_creation_requests`, 'Preserve configuration, access and lifecycle evidence; secret values are not exported.');
add('app_private', 'must-be-empty', 'organization_id', `expense_operation_authority lease_checked_mutation_capabilities lease_lifecycle_authority_tokens lease_scope_terminal_recovery_tokens`, 'Transaction capabilities must be absent at a drained checkpoint.');
add('app_private', 'preserve-global', null, `auth_password_credential_proofs expense_transaction_capability finance_branch_authority_capability finance_settlement_context_capability
 financial_projection_context_capability financial_scheduler_capability invitation_password_challenges maintenance_automation_runs maintenance_branch_authority_capability
 property_branch_assignment_context_capability public_interest_rate_limit_windows tenant_invoice_settlement_context_capability`, 'Global/security infrastructure: count and hash only, no secrets, keys or tokens exported.');

// JSON is never silently traversed or sorted. These fields are retained audit or
// retired intent evidence; an executor still needs its own queue/slot disposition.
const opaque = {
 'public.activity_logs': ['previous_values', 'new_values'],
 'public.expense_customer_adjustments': ['audit_actors'], 'public.expense_submissions': ['audit_actors'], 'public.expense_transactions': ['audit_actors'],
 'public.fee_payment_date_corrections': ['audit_actors'], 'public.finance_expense_items': ['audit_actors'], 'public.finance_income_items': ['audit_actors'],
 'public.finance_payment_allocations': ['audit_actors'], 'public.finance_payments': ['audit_actors'], 'public.finance_receipt_allocations': ['audit_actors'], 'public.finance_receipts': ['audit_actors'],
 'public.historical_rent_settlement_reapplications': ['original_allocation_snapshot', 'replacement_allocation_snapshot'],
 'public.import_mappings': ['mapping', 'headers'], 'public.import_rows': ['raw_data', 'normalized_data', 'issues'], 'public.import_runs': ['headers', 'mapping'],
 'public.ips_cutover_batches': ['manifest', 'reconciliation_differences'], 'public.ips_cutover_items': ['payload', 'issue_detail'],
 'public.ips_cutover_reconciliations': ['expected_totals', 'actual_totals', 'differences', 'expected_counts', 'actual_counts'],
 'public.lease_deposit_events': ['audit_actors'], 'public.ledger_entries': ['audit_actors'], 'public.maintenance_recurrence_revisions': ['checklist'],
 'public.management_fee_occurrences': ['audit_actors'], 'public.notification_outbox': ['payload'], 'public.owner_balance_periods': ['blocked_reason_detail'],
 'public.owner_cash_events': ['audit_actors'], 'public.owner_charge_cash_allocations': ['audit_actors'], 'public.owner_collection_confirmation_allocations': ['audit_actors'],
 'public.owner_collection_confirmations': ['audit_actors'], 'public.owner_invoice_lines': ['audit_actors'], 'public.owner_invoices': ['audit_actors'],
 'public.owner_payment_allocations': ['audit_actors'], 'public.owner_payments': ['audit_actors'], 'public.property_withdrawals': ['audit_actors'],
 'public.tasks': ['checklist'], 'public.tenant_commercial_document_artifacts': ['presentation_snapshot'], 'public.tenant_invoice_corrections': ['source_identity'],
 'public.tenant_invoice_lines': ['audit_actors'], 'public.tenant_invoice_payment_allocations': ['audit_actors'], 'public.tenant_invoice_payments': ['audit_actors'],
 'public.tenant_invoices': ['audit_actors'], 'app_private.deposit_rent_journal_intents': ['payload'],
 'app_private.financial_idempotency_requests': ['result_ids'], 'app_private.privileged_email_step_up_events': ['metadata'], 'app_private.unit_creation_requests': ['request_payload'],
};
for (const [table, rule] of Object.entries(registry)) rule.opaqueColumns = opaque[table] ?? [];

// Source-type vocabularies are intentionally closed. New values need review,
// including when they are found only in old/reversed rows.
const sourceTargets = {
 tenant_invoice: 'public.tenant_invoices', tenant_invoice_line: 'public.tenant_invoice_lines',
 tenant_invoice_payment: 'public.tenant_invoice_payments', tenant_invoice_payment_allocation: 'public.tenant_invoice_payment_allocations',
 owner_invoice_line: 'public.owner_invoice_lines', owner_payment: 'public.owner_payments', owner_payment_allocation: 'public.owner_payment_allocations',
 owner_collection_confirmation: 'public.owner_collection_confirmations', owner_collection_allocation: 'public.owner_collection_confirmation_allocations',
 receipt: 'public.finance_receipts', receipt_allocation: 'public.finance_receipt_allocations', payment: 'public.finance_payments', payment_allocation: 'public.finance_payment_allocations',
 income_item: 'public.finance_income_items', expense_item: 'public.finance_expense_items', management_fee: 'public.management_fee_occurrences',
 lease_deposit_event: 'public.lease_deposit_events', deposit_rent_application: 'public.deposit_rent_applications',
  owner_cash_event: ['public.owner_cash_events', 'public.property_withdrawals', 'public.owner_payments'], owner_charge_cash_allocation: 'public.owner_charge_cash_allocations',
 owner_component_transfer: 'public.owner_component_transfer_instructions', property_withdrawal: 'public.property_withdrawals',
 petty_cash_entry: 'public.petty_cash_entries', task: 'public.tasks', maintenance_task: 'public.tasks',
  deposit_event: 'public.lease_deposit_events', management_fee_occurrence: 'public.management_fee_occurrences',
  owner_paid_cost: 'public.finance_expense_items', owner_expense: 'public.ips_expense_responsibilities',
  owner_contribution: 'public.owner_cash_events', owner_reimbursement: 'public.owner_cash_events', owner_distribution: 'public.property_withdrawals',
  owner_direct_rent_receipt: 'public.owner_collection_confirmations', tenant_rent_receipt: 'public.tenant_invoice_payments',
  owner_invoice_payment: ['public.owner_payments', 'public.owner_invoices'],
  security_deposit_receipt: 'public.lease_deposits', security_deposit_refund: 'public.lease_deposits',
  owner_close_correction: 'public.owner_close_corrections', opening_balance_entry: 'public.owner_opening_balance_requests', period_component: 'public.owner_balance_periods',
  reversal: ['public.expense_submissions', 'public.owner_invoices', 'public.tenant_invoice_payments', 'public.owner_collection_confirmations', 'public.lease_deposits', 'public.owner_payments', 'public.property_withdrawals', 'public.owner_cash_events', 'public.owner_charge_cash_allocations', 'public.expense_customer_adjustments'],
};
const lineTargets = { ...sourceTargets, tenant_rent_receipt: 'public.tenant_invoice_payment_allocations', owner_direct_rent_receipt: 'public.owner_collection_confirmation_allocations',
  owner_paid_cost: 'public.ips_expense_responsibilities', owner_invoice_payment: ['public.owner_payment_allocations', 'public.owner_charge_cash_allocations'],
  security_deposit_receipt: 'public.lease_deposit_events', security_deposit_refund: 'public.lease_deposit_events', owner_component_transfer: 'public.owner_component_transfer_lines',
  opening_balance_entry: 'public.owner_opening_balance_entries', period_component: 'public.owner_balance_period_components',
  reversal: ['public.tenant_invoice_payment_allocations', 'public.owner_collection_confirmation_allocations', 'public.lease_deposit_events', 'public.owner_payment_allocations', 'public.property_withdrawals', 'public.owner_cash_events', 'public.owner_charge_cash_allocations', 'public.expense_customer_adjustments'] };
export const POLYMORPHIC_REFERENCES = Object.freeze([
 { table: 'app_private.finance_category_idempotency_result_seals', typeColumn: 'operation', idColumn: 'result_id', targets: { submit_expense: 'public.expense_submissions', create_manual_tenant_charge: 'public.tenant_invoice_lines' } },
 ...['ledger_entries', 'owner_event_allocation_sets', 'owner_invoice_lines', 'owner_close_line_sources', 'expense_submissions'].map(table => ({ table: `public.${table}`, typeColumn: 'source_type', idColumn: 'source_id', targets: sourceTargets })),
 ...['public.tenant_commercial_document_artifacts', 'app_private.tenant_commercial_document_upload_attestations', 'app_private.tenant_commercial_document_cleanup_claims'].map(table => ({ table, typeColumn: 'source_kind', idColumn: 'source_id', targets: { invoice: 'public.tenant_invoices', receipt: 'public.tenant_invoice_payments' } })),
  ...['public.owner_event_allocation_sets', 'public.owner_close_line_sources'].map(table => ({ table, typeColumn: 'source_type', idColumn: 'source_line_id', targets: lineTargets, historicalKinds: table === 'public.owner_close_line_sources' ? ['period_component'] : [] })),
  { table: 'public.tenant_credit_occurrences', typeColumn: 'source_settlement_kind', idColumn: 'source_settlement_id', targets: { ips_payment: 'public.tenant_invoice_payments', owner_confirmation: 'public.owner_collection_confirmations' } },
  ...['original_settlement_id', 'reversal_settlement_id', 'replacement_settlement_id'].map(idColumn => ({ table: 'public.historical_rent_settlement_reapplications', typeColumn: 'settlement_kind', idColumn, targets: { ips_payment: 'public.tenant_invoice_payments', owner_confirmation: 'public.owner_collection_confirmations' } })),
  { table: 'public.organization_access_transition_manifest_items', typeColumn: 'source_kind', idColumn: 'source_id', targets: { member: 'public.organization_members', invitation: 'public.organization_invitations' } },
]);
export const STORAGE_REFERENCES = Object.freeze([
 ...['public.asset_photos', 'public.documents', 'public.owner_statement_artifacts', 'public.tenant_commercial_document_artifacts',
 'app_private.paid_cost_evidence_registrations', 'app_private.paid_cost_evidence_cleanup_claims', 'app_private.tenant_commercial_document_upload_attestations',
 'app_private.tenant_commercial_document_cleanup_claims'].map(table => ({ table, pathColumn: 'storage_path', objectColumn: 'storage_object_id',
   bucket: table.includes('tenant_commercial') ? 'tenant-commercial-documents' : table.includes('owner_statement') ? 'owner-statements' : table === 'public.asset_photos' ? 'nestory-photos' : 'nestory-documents' })),
 { table: 'public.organizations', pathColumn: 'logo_storage_path', bucket: 'organization-assets' },
]);
export const STATIC_REFERENCES = Object.freeze([
 ...Object.entries({ lease_id: 'public.leases', property_id: 'public.properties', unit_id: 'public.units', deposit_id: 'public.lease_deposits', invoice_id: 'public.tenant_invoices', actor_id: 'auth.users' }).map(([column, target]) => ({ table: 'app_private.deposit_rent_journal_intents', column, target })),

 ...Object.entries({ property_id: 'public.properties', actor_id: 'auth.users' }).map(([column, target]) => ({ table: 'app_private.paid_cost_evidence_registrations', column, target })),
 ...Object.entries({ actor_id: 'auth.users', property_id: 'public.properties', branch_id: 'public.organization_branches', unit_id: 'public.units' }).map(([column, target]) => ({ table: 'app_private.unit_creation_requests', column, target })),
 ...['public.expense_legacy_replacements', 'public.finance_accounts', 'public.finance_categories', 'public.person_travel_documents'].flatMap(table => ['created_by', 'updated_by', 'archived_by'].map(column => ({ table, column, target: 'auth.users', optionalColumn: true, allowOrganizationSeedActor: ['public.finance_accounts','public.finance_categories'].includes(table) }))),
 { table: 'public.activity_logs', column: 'recorded_actor_id', target: 'auth.users' },
 { table: 'public.tenant_invoices', column: 'unit_id', target: 'public.units' },
 { table: 'public.owner_balance_periods', column: 'closed_revision_id', target: 'public.owner_close_revisions' },
 { table: 'public.owner_close_line_sources', column: 'owner_balance_period_component_id', target: 'public.owner_balance_period_components', historicalSnapshot: 'Period components are rebuilt by recompute_owner_balance_period; close rows retain original evidence IDs.' },
]);
// Exact unconstrained UUID fields that carry correlation/snapshot evidence, not
// a live database parent. Their hashes are retained; this module cannot replay it.
export const RETAINED_IDENTITY_FIELDS = Object.freeze({
 'app_private.deposit_rent_journal_intents': ['idempotency_key', 'result_id'],
 'app_private.expense_operation_authority': ['source_id', 'target_id'],
 'app_private.lease_checked_mutation_capabilities': ['lease_id'],
 'public.activity_logs': ['entity_id'],
 'public.finance_receipt_allocations': ['unit_id', 'lease_id', 'payer_person_id_snapshot', 'charge_occurrence_id', 'lease_term_id_snapshot', 'invoice_header_id', 'invoice_version_id', 'invoice_line_id'],
 'public.lease_occupancies': ['correction_request_id'], 'public.lease_occupancy_participants': ['correction_request_id'], 'public.lease_parties': ['correction_request_id'],
 'public.properties': ['edit_version'],
});
export const REBUILD_REQUIREMENTS = Object.freeze([
 { table: 'public.owner_opening_balance_entries', phase: 'zero-checkpoint', components: ['ips_held_owner_cash', 'owner_due_to_ips', 'ips_due_to_owner', 'security_deposit_custody'], amount: '0', evidenceRequired: true },
 { table: 'public.petty_cash_periods', phase: 'zero-checkpoint', openingAmount: '0', advanceAmount: '0' },
 { table: 'public.tenant_invoices', phase: 'after-zero-checkpoint', month: '2026-10-01', exactLeaseRuleManifestRequired: true },
]);
export const RESET_REGISTRY = Object.freeze(Object.fromEntries(Object.entries(registry).map(([key, value]) => [key, Object.freeze(value)])));
