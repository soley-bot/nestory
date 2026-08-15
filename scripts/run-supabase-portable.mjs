import path from "node:path";
import { fileURLToPath } from "node:url";

import { runSupabaseWithPortableMigrations } from "./supabase-portable-migrations.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const cliEntryPoint = path.join(
  repositoryRoot,
  "node_modules",
  "supabase",
  "dist",
  "supabase.js",
);
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("Usage: node scripts/run-supabase-portable.mjs <supabase arguments>");
  process.exitCode = 2;
} else {
  process.exitCode = runSupabaseWithPortableMigrations({
    repositoryRoot,
    cliEntryPoint,
    args,
  });
}
