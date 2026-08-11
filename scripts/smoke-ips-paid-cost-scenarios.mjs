import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";

import { selectLocalDatabaseContainer } from "./load-test-fixture.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const organizationId = "00000000-0000-0000-0000-000000000001";
const closePropertyId = "10000000-0000-0000-0000-000000000004";

function databaseContainer() {
  const result = spawnSync(
    "docker",
    ["ps", "--filter", "name=^/supabase_db_", "--format", "{{.Names}}"],
    { cwd: repoRoot, encoding: "utf8", shell: false },
  );
  assert.equal(result.status, 0, result.stderr);
  return selectLocalDatabaseContainer(
    repoRoot,
    result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
  );
}

const container = databaseContainer();

function query(sql) {
  const result = spawnSync(
    "docker",
    [
      "exec",
      container,
      "psql",
      "-X",
      "-qAt",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      sql,
    ],
    { cwd: repoRoot, encoding: "utf8", shell: false, timeout: 30_000 },
  );
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

assert.equal(
  query(`
    SELECT pg_catalog.string_agg(
      submission.reference || ':' || submission.status,
      ',' ORDER BY submission.reference
    )
    FROM public.expense_submissions AS submission
    WHERE submission.organization_id = '${organizationId}'
      AND submission.source_type = 'general'
      AND (
        submission.reference LIKE 'TRACK6-%'
        OR submission.reference = 'GDN-PUMP-2088'
      );
  `),
  [
    "GDN-PUMP-2088:submitted",
    "TRACK6-APPROVED-REVERSED:reversed",
    "TRACK6-CORRECTED-50:approved",
    "TRACK6-OWNER-APPROVED:approved",
    "TRACK6-PETTY-APPROVED:approved",
    "TRACK6-REJECTED:rejected",
    "TRACK6-REJECTED-CORRECTED:approved",
    "TRACK6-TENANT-APPROVED:approved",
    "TRACK6-WRONG-60:reversed",
  ].join(","),
  "all persisted paid-cost scenario states must remain literal",
);

assert.equal(
  query(`
    SELECT count(*)::text || '|' ||
      pg_catalog.bool_and(document.content_sha256 ~ '^[0-9a-f]{64}$')::text || '|' ||
      pg_catalog.bool_and(document.size_bytes > 0)::text || '|' ||
      pg_catalog.bool_and(object.id IS NOT NULL)::text
    FROM public.expense_submissions AS submission
    JOIN public.documents AS document
      ON document.id = submission.supporting_document_id
     AND document.organization_id = submission.organization_id
    JOIN storage.objects AS object
      ON object.bucket_id = 'nestory-documents'
     AND object.name = document.storage_path
    WHERE submission.organization_id = '${organizationId}'
      AND submission.source_type = 'general'
      AND (
        submission.reference LIKE 'TRACK6-%'
        OR submission.reference = 'GDN-PUMP-2088'
      );
  `),
  "9|true|true|true",
  "all persisted general paid costs must retain verified Storage evidence",
);

assert.equal(
  query(`
    SELECT count(*)::text || '|' ||
      pg_catalog.bool_and(submission.approved_payment_id IS NOT NULL)::text || '|' ||
      pg_catalog.bool_and(submission.approved_payment_allocation_id IS NOT NULL)::text || '|' ||
      pg_catalog.bool_and(submission.approved_responsibility_id IS NOT NULL)::text || '|' ||
      pg_catalog.bool_and(submission.approved_ledger_entry_id IS NOT NULL)::text
    FROM public.expense_submissions AS submission
    WHERE submission.organization_id = '${organizationId}'
      AND submission.source_type = 'general'
      AND submission.status IN ('approved', 'reversed')
      AND (
        submission.reference LIKE 'TRACK6-%'
        OR submission.reference = 'TRACK6-APPROVED-REVERSED'
      );
  `),
  "7|true|true|true|true",
  "each accepted paid cost must retain one payment, allocation, responsibility, and Ledger identity",
);

assert.equal(
  query(`
    SELECT responsibility.responsibility || '|' ||
      to_char(responsibility.internal_cost_amount, 'FM999999999990.00') || '|' ||
      to_char(responsibility.customer_total_amount, 'FM999999999990.00') || '|' ||
      (responsibility.tenant_invoice_line_id IS NOT NULL)::text
    FROM public.ips_expense_responsibilities AS responsibility
    JOIN public.expense_submissions AS submission
      ON submission.approved_responsibility_id = responsibility.id
    WHERE submission.reference = 'TRACK6-TENANT-APPROVED';
  `),
  "tenant|30.00|35.00|true",
  "tenant responsibility must create the exact customer charge line",
);

assert.equal(
  query(`
    SELECT source.source_kind || '|' ||
      to_char(payment.amount, 'FM999999999990.00') || '|' ||
      to_char(allocation.signed_amount, 'FM999999999990.00') || '|' ||
      to_char(ledger.amount, 'FM999999999990.00')
    FROM public.expense_submissions AS submission
    JOIN public.financial_reconciliation_sources AS source
      ON source.id = submission.reconciliation_source_id
    JOIN public.finance_payments AS payment
      ON payment.id = submission.approved_payment_id
    JOIN public.finance_payment_allocations AS allocation
      ON allocation.id = submission.approved_payment_allocation_id
    JOIN public.ledger_entries AS ledger
      ON ledger.id = submission.approved_ledger_entry_id
    WHERE submission.reference = 'TRACK6-PETTY-APPROVED';
  `),
  "petty_cash|25.00|-25.00|25.00",
  "petty-cash-funded approval must retain the exact source/payment/Ledger outflow",
);

assert.equal(
  query(`
    SELECT count(*)::text || '|' ||
      to_char(sum(adjustment.amount), 'FM999999999990.00')
    FROM public.expense_customer_adjustments AS adjustment
    JOIN public.expense_submissions AS submission
      ON submission.id = adjustment.submission_id
    WHERE submission.reference IN ('TRACK6-APPROVED-REVERSED', 'TRACK6-WRONG-60');
  `),
  "2|-160.00",
  "both reversed paid costs must retain exact opposite customer effects",
);

assert.equal(
  query(`
    SELECT count(*)::text
    FROM public.expense_submissions
    WHERE organization_id = '${organizationId}'
      AND reference = 'TRACK6-MISSING-EVIDENCE';
  `),
  "0",
  "missing evidence must leave no submission residue",
);

assert.equal(
  query(`
    SELECT component::text || ':' ||
      to_char(opening_amount, 'FM999999999990.00') || ':' ||
      to_char(movement_amount, 'FM999999999990.00') || ':' ||
      to_char(closing_amount, 'FM999999999990.00')
    FROM public.owner_balance_period_components AS component_row
    JOIN public.owner_balance_periods AS period
      ON period.id = component_row.owner_balance_period_id
    WHERE period.property_id = '${closePropertyId}'
      AND period.status = 'ready'
    ORDER BY component;
  `),
  [
    "ips_held_owner_cash:1000.00:-25.00:975.00",
    "owner_due_to_ips:0.00:235.00:235.00",
    "ips_due_to_owner:0.00:0.00:0.00",
    "security_deposit_custody:0.00:0.00:0.00",
  ].join("\n"),
  "owner balance must include accepted and reversed paid costs exactly once",
);

assert.equal(
  query(`
    SELECT count(DISTINCT line.id)::text || '|' ||
      count(DISTINCT source.id)::text || '|' ||
      to_char(sum(
        CASE
          WHEN line.line_kind IN ('opening', 'movement', 'activity')
            THEN line.signed_amount
          WHEN line.line_kind = 'closing' THEN -line.signed_amount
          ELSE 0
        END
      ), 'FM999999999990.00') || '|' ||
      count(*) FILTER (WHERE source.source_type = 'owner_paid_cost')::text || '|' ||
      count(*) FILTER (WHERE source.source_type = 'reversal')::text
    FROM public.owner_statement_publications AS publication
    JOIN public.owner_close_revisions AS revision
      ON revision.id = publication.owner_close_revision_id
    JOIN public.owner_close_lines AS line
      ON line.owner_close_revision_id = revision.id
    LEFT JOIN public.owner_close_line_sources AS source
      ON source.owner_close_revision_id = revision.id
     AND source.close_line_id = line.id
    WHERE revision.property_id = '${closePropertyId}';
  `),
  "17|17|0.00|6|2",
  "official Owner Statement must reconcile and retain six paid-cost plus two reversal source links",
);

assert.equal(
  query(`
    SELECT count(*)::text || '|' ||
      pg_catalog.bool_and(artifact.sha256 ~ '^[0-9a-f]{64}$')::text || '|' ||
      pg_catalog.bool_and(artifact.size_bytes > 0)::text
    FROM public.owner_statement_artifacts AS artifact
    JOIN public.owner_statement_publications AS publication
      ON publication.id = artifact.publication_id
    JOIN public.owner_close_revisions AS revision
      ON revision.id = publication.owner_close_revision_id
    WHERE revision.property_id = '${closePropertyId}';
  `),
  "2|true|true",
  "official PDF and XLSX artifacts must remain hashed and nonempty",
);

assert.equal(
  query(`
    SELECT count(*)::text
    FROM app_private.financial_idempotency_requests
    WHERE organization_id = '${organizationId}'
      AND status = 'pending';
  `),
  "0",
  "paid-cost fixture must leave no pending financial idempotency request",
);

process.stdout.write(
  "PASS Track 6 paid-cost scenarios: verified evidence, 9 submissions, 7 accepted effects, 2 reversals, 4 owner components, 17 statement lines/sources, PDF+XLSX, 0.00 difference.\n",
);
