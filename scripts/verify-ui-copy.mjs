import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { scanUiCopy } from "./verify-ui-copy-scanner.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rulesPath = join(projectRoot, "config", "ui-copy-rules.json");
const rules = JSON.parse(await readFile(rulesPath, "utf8"));
const violations = await scanUiCopy({ projectRoot, rules });

if (violations.length > 0) {
  console.error(
    `UI copy verification failed: ${violations.length} prohibited narration occurrence${violations.length === 1 ? "" : "s"}.`,
  );

  for (const violation of violations) {
    console.error(
      `${violation.projectPath}:${violation.lineNumber} [${violation.phrase}] ${violation.line}`,
    );
  }

  process.exitCode = 1;
} else {
  console.log("UI copy verification passed: 0 prohibited narration occurrences.");
}
