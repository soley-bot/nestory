import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { findLocalDatabaseContainer } from "./reset-demo-data.mjs";

export const MANIFEST_SQL = String.raw`
SELECT jsonb_build_object(
  'schemaVersion', 1,
  'referenceDate', coalesce(
    nullif(current_setting('app.demo_seed_reference_date', true), '')::date,
    (
      SELECT lease_start_date + 300
      FROM public.leases
      WHERE id = '30000000-0000-0000-0000-000000000001'
    )
  ),
  'visibleIds', jsonb_build_object(
    'properties', (
      SELECT jsonb_agg(id ORDER BY id)
      FROM public.properties
      WHERE organization_id = '00000000-0000-0000-0000-000000000001'
        AND archived_at IS NULL
    ),
    'units', (
      SELECT jsonb_agg(id ORDER BY id)
      FROM public.units
      WHERE organization_id = '00000000-0000-0000-0000-000000000001'
        AND archived_at IS NULL
    ),
    'leases', (
      SELECT jsonb_agg(id ORDER BY id)
      FROM public.leases
      WHERE organization_id = '00000000-0000-0000-0000-000000000001'
        AND archived_at IS NULL
    ),
    'incomeItems', (
      SELECT jsonb_agg(id ORDER BY id)
      FROM public.finance_income_items
      WHERE organization_id = '00000000-0000-0000-0000-000000000001'
        AND archived_at IS NULL
    ),
    'expenseItems', (
      SELECT jsonb_agg(id ORDER BY id)
      FROM public.finance_expense_items
      WHERE organization_id = '00000000-0000-0000-0000-000000000001'
        AND archived_at IS NULL
    )
  ),
  'counts', jsonb_build_object(
    'activeOwners', (
      SELECT count(DISTINCT owners.person_id)
      FROM public.property_owners AS owners
      JOIN public.properties AS properties ON properties.id = owners.property_id
      WHERE owners.organization_id = '00000000-0000-0000-0000-000000000001'
        AND owners.archived_at IS NULL
        AND owners.ended_on IS NULL
        AND properties.archived_at IS NULL
    ),
    'receipts', (
      SELECT count(*)
      FROM public.finance_receipts
      WHERE organization_id = '00000000-0000-0000-0000-000000000001'
    ),
    'payments', (
      SELECT count(*)
      FROM public.finance_payments
      WHERE organization_id = '00000000-0000-0000-0000-000000000001'
    ),
    'depositEvents', (
      SELECT count(*)
      FROM public.lease_deposit_events
      WHERE organization_id = '00000000-0000-0000-0000-000000000001'
    ),
    'pettyCashEntries', (
      SELECT count(*)
      FROM public.petty_cash_entries
      WHERE organization_id = '00000000-0000-0000-0000-000000000001'
        AND archived_at IS NULL
    ),
    'tasks', (
      SELECT count(*)
      FROM public.tasks
      WHERE organization_id = '00000000-0000-0000-0000-000000000001'
        AND archived_at IS NULL
    ),
    'documents', (
      SELECT count(*)
      FROM public.documents
      WHERE organization_id = '00000000-0000-0000-0000-000000000001'
    ),
    'assetPhotos', (
      SELECT count(*)
      FROM public.asset_photos
      WHERE organization_id = '00000000-0000-0000-0000-000000000001'
    ),
    'demoProperties', (
      SELECT count(*)
      FROM public.properties
      WHERE organization_id = '00000000-0000-0000-0000-000000000002'
    )
  )
)::text;
`;

export function parseManifestArgs(args) {
  if (args.length === 0) {
    return { outputPath: null };
  }
  if (args.length === 2 && args[0] === "--output" && args[1]) {
    return { outputPath: args[1] };
  }
  throw new Error("Usage: npm run demo:seed:manifest -- [--output PATH]");
}

export async function main(args = process.argv.slice(2)) {
  const options = parseManifestArgs(args);
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const cwd = path.resolve(scriptDirectory, "..");
  const container = findLocalDatabaseContainer(cwd);
  const result = spawnSync(
    "docker",
    [
      "exec",
      container,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-A",
      "-t",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      MANIFEST_SQL,
    ],
    { cwd, encoding: "utf8", shell: false },
  );

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "Could not read the local seed manifest.");
  }

  const manifest = JSON.parse(result.stdout.trim());
  const output = `${JSON.stringify(manifest, null, 2)}\n`;
  if (options.outputPath) {
    await writeFile(path.resolve(options.outputPath), output, {
      encoding: "utf8",
      flag: "wx",
    });
  } else {
    process.stdout.write(output);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
