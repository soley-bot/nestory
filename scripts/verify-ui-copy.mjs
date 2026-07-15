import { readFile, readdir } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { instinctiveCopyRules } from "../src/lib/ui/copy-rules.ts";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoots = ["src/app", "src/components", "src/features"];
const sourceExtensions = new Set([".js", ".jsx", ".ts", ".tsx"]);

function toProjectPath(filePath) {
  return relative(projectRoot, filePath).split(sep).join("/");
}

function isExcluded(projectPath) {
  return instinctiveCopyRules.publicMarketingExclusions.some((prefix) =>
    projectPath.startsWith(prefix),
  );
}

async function findSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = join(directory, entry.name);

      if (entry.isDirectory()) {
        return findSourceFiles(entryPath);
      }

      const projectPath = toProjectPath(entryPath);

      if (!sourceExtensions.has(extname(entry.name)) || isExcluded(projectPath)) {
        return [];
      }

      return [entryPath];
    }),
  );

  return files.flat();
}

const sourceFiles = (
  await Promise.all(
    sourceRoots.map((sourceRoot) => findSourceFiles(join(projectRoot, sourceRoot))),
  )
)
  .flat()
  .sort();
const violations = [];

for (const filePath of sourceFiles) {
  const projectPath = toProjectPath(filePath);
  const lines = (await readFile(filePath, "utf8")).split(/\r?\n/);

  for (const [lineIndex, line] of lines.entries()) {
    for (const phrase of instinctiveCopyRules.prohibitedTutorialNarration) {
      if (line.toLowerCase().includes(phrase.toLowerCase())) {
        violations.push({
          line: line.trim(),
          lineNumber: lineIndex + 1,
          phrase,
          projectPath,
        });
      }
    }
  }
}

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
