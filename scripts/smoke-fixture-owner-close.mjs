import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { findLocalDatabaseContainer } from "./load-test-fixture.mjs";

const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const container = findLocalDatabaseContainer(cwd);
const organizationId = "00000000-0000-0000-0000-000000000001";
const propertyId = "10000000-0000-0000-0000-000000000004";
const ownerId = "80000000-0000-0000-0000-000000000014";

export function queryOwnerCloseFixture() {
  const result = spawnSync(
    "docker",
    [
      "exec", container, "psql", "-X", "-qAt", "-U", "postgres", "-d", "postgres",
      "-v", "ON_ERROR_STOP=1", "-c", querySql(),
    ],
    { cwd, encoding: "utf8", shell: false },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "Owner close fixture query failed");
  }
  const row = result.stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean).at(-1);
  return JSON.parse(row ?? "null");
}

export function validateOwnerCloseFixture(report) {
  assert.deepEqual(report, {
    correction: {
      component: "ips_held_owner_cash",
      evidenceSha256: "9".repeat(64),
      signedAmount: "-25.00",
      sourceReference: "FIXTURE-CLOSE-CORRECTION-001",
    },
    period: {
      componentCount: 4,
      heldCashClosing: "975.00",
      status: "ready",
    },
    revisions: [
      { contentHashValid: true, inputHashValid: true, lineCount: 8, revisionNumber: 1, sourceCount: 8, status: "closed", supersedesRevisionNumber: null },
      { contentHashValid: true, inputHashValid: true, lineCount: 9, revisionNumber: 2, sourceCount: 9, status: "closed", supersedesRevisionNumber: 1 },
      { contentHashValid: false, inputHashValid: false, lineCount: 0, revisionNumber: 3, sourceCount: 0, status: "preparing", supersedesRevisionNumber: 2 },
    ],
    series: {
      activeRevisionNumber: 3,
      closedRevisionNumber: 2,
      fixtureMonthLocked: true,
      isolatedFromOperatingMonth: true,
      operatingMonthOpen: true,
      state: "preparing",
    },
  });
}

export async function main() {
  const report = queryOwnerCloseFixture();
  validateOwnerCloseFixture(report);
  process.stdout.write(
    "Owner-close fixture reconciled: immutable R1, corrected R2, and ready preparing R3\n",
  );
}

function querySql() {
  return String.raw`
WITH series_row AS (
  SELECT series.*
  FROM public.owner_close_series AS series
  WHERE series.organization_id = '${organizationId}'
    AND series.property_id = '${propertyId}'
    AND series.owner_person_id = '${ownerId}'
    AND series.currency = 'USD'
), revisions AS (
  SELECT revision.*,
    superseded.revision_number AS supersedes_revision_number
  FROM public.owner_close_revisions AS revision
  LEFT JOIN public.owner_close_revisions AS superseded
    ON superseded.organization_id = revision.organization_id
   AND superseded.id = revision.supersedes_revision_id
  JOIN series_row AS series
    ON series.organization_id = revision.organization_id
   AND series.id = revision.owner_close_series_id
), revision_report AS (
  SELECT json_agg(json_build_object(
    'contentHashValid', coalesce(revision.content_hash ~ '^[0-9a-f]{64}$', false),
    'inputHashValid', coalesce(revision.input_hash ~ '^[0-9a-f]{64}$', false),
    'lineCount', (SELECT count(*)::integer FROM public.owner_close_lines AS line
      WHERE line.owner_close_revision_id = revision.id),
    'revisionNumber', revision.revision_number,
    'sourceCount', (SELECT count(*)::integer FROM public.owner_close_line_sources AS source
      WHERE source.owner_close_revision_id = revision.id),
    'status', revision.status,
    'supersedesRevisionNumber', revision.supersedes_revision_number
  ) ORDER BY revision.revision_number) AS value
  FROM revisions AS revision
), period_report AS (
  SELECT json_build_object(
    'componentCount', count(component.id)::integer,
    'heldCashClosing', to_char(max(component.closing_amount) FILTER (
      WHERE component.component = 'ips_held_owner_cash'
    ), 'FM999999999990.00'),
    'status', min(period.status)
  ) AS value
  FROM public.owner_balance_periods AS period
  JOIN public.owner_balance_period_components AS component
    ON component.organization_id = period.organization_id
   AND component.owner_balance_period_id = period.id
  JOIN series_row AS series
    ON series.organization_id = period.organization_id
   AND series.property_id = period.property_id
   AND series.owner_person_id = period.owner_person_id
   AND series.currency = period.currency
   AND series.month_start = period.month_start
  WHERE period.organization_id = '${organizationId}'
    AND period.property_id = '${propertyId}'
    AND period.owner_person_id = '${ownerId}'
    AND period.currency = 'USD'
), correction_report AS (
  SELECT json_build_object(
    'component', correction.component,
    'evidenceSha256', correction.evidence_sha256,
    'signedAmount', to_char(correction.signed_amount, 'FM999999999990.00'),
    'sourceReference', correction.source_reference
  ) AS value
  FROM public.owner_close_corrections AS correction
  JOIN series_row AS series
    ON series.organization_id = correction.organization_id
   AND series.id = correction.owner_close_series_id
), series_report AS (
  SELECT json_build_object(
    'activeRevisionNumber', active.revision_number,
    'closedRevisionNumber', closed.revision_number,
    'fixtureMonthLocked', EXISTS (
      SELECT 1
      FROM public.financial_month_locks AS month_lock
      WHERE month_lock.organization_id = series.organization_id
        AND month_lock.month_start = series.month_start
        AND month_lock.is_locked
    ),
    'isolatedFromOperatingMonth',
      series.month_start =
        (date_trunc('month', current_date) + interval '24 months')::date,
    'operatingMonthOpen', NOT EXISTS (
      SELECT 1
      FROM public.financial_month_locks AS month_lock
      WHERE month_lock.organization_id = series.organization_id
        AND month_lock.month_start = date_trunc('month', current_date)::date
        AND month_lock.is_locked
    ),
    'state', series.state
  ) AS value
  FROM series_row AS series
  LEFT JOIN revisions AS active ON active.id = series.active_revision_id
  LEFT JOIN revisions AS closed ON closed.id = series.current_closed_revision_id
)
SELECT json_build_object(
  'correction', (SELECT value FROM correction_report),
  'period', (SELECT value FROM period_report),
  'revisions', (SELECT value FROM revision_report),
  'series', (SELECT value FROM series_report)
)::text;`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  });
}
