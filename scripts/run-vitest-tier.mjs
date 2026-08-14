import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import {
  classifyVitestFiles,
  discoverVitestFiles,
} from "./vitest-tier-core.mjs";

const tier = process.argv[2];
if (tier !== "unit" && tier !== "ui") {
  process.stderr.write("Usage: node scripts/run-vitest-tier.mjs <unit|ui> [vitest options]\n");
  process.exit(2);
}

const projectRoot = process.cwd();
const files = await discoverVitestFiles(projectRoot);
const tiers = await classifyVitestFiles(files);
const selected = tiers[tier];

if (selected.length === 0) {
  process.stderr.write(`No ${tier} Vitest files found.\n`);
  process.exit(1);
}

process.stdout.write(
  `Running ${selected.length} ${tier} Vitest files (${files.length} total discovered).\n`,
);

const result = spawnSync(
  process.execPath,
  [
    resolve(projectRoot, "node_modules", "vitest", "vitest.mjs"),
    "run",
    ...selected,
    ...process.argv.slice(3),
  ],
  { cwd: projectRoot, stdio: "inherit" },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
