import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  evaluateHostedMigrationParity,
  readMigrationListOutput,
} from "./hosted-migration-parity-core.mjs";

const phase = readPhase(process.argv.slice(2));
const supabaseCli = fileURLToPath(
  new URL("../node_modules/supabase/dist/supabase.js", import.meta.url),
);
const result = spawnSync(
  process.execPath,
  [
    supabaseCli,
    "--output-format",
    "json",
    "migration",
    "list",
    "--linked",
  ],
  {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" },
    windowsHide: true,
  },
);

if (result.error) {
  console.error(`Unable to start the pinned Supabase CLI: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(
    `Supabase migration list failed with exit code ${result.status ?? "unknown"}.`,
  );
  const detail = redactCliOutput(result.stderr);
  if (detail) console.error(detail);
  process.exit(1);
}

let versions;
try {
  versions = readMigrationListOutput(result.stdout);
} catch (error) {
  console.error(`Unable to read Supabase migration-list JSON: ${error.message}`);
  process.exit(1);
}

const parity = evaluateHostedMigrationParity({ ...versions, phase });
if (parity.issues.length > 0) {
  console.error(
    `Hosted migration ${phase} failed (${parity.localCount} local, ${parity.remoteCount} remote):`,
  );
  for (const issue of parity.issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log(
  `Hosted migration ${phase} passed: ${parity.localCount} local, ${parity.remoteCount} remote, ${parity.pendingVersions.length} pending.`,
);
if (parity.pendingVersions.length > 0) {
  console.log(`Pending migration versions: ${parity.pendingVersions.join(", ")}`);
}

function readPhase(args) {
  const phaseIndex = args.indexOf("--phase");
  const value = phaseIndex === -1 ? undefined : args[phaseIndex + 1];
  if (value !== "preflight" && value !== "postflight") {
    console.error("Usage: node scripts/verify-hosted-migration-parity.mjs --phase <preflight|postflight>");
    process.exit(2);
  }
  return value;
}

function redactCliOutput(value) {
  return String(value ?? "")
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted database URL]")
    .replace(/(access_token|password|service_role)\s*[=:]\s*\S+/gi, "$1=[redacted]")
    .trim();
}
