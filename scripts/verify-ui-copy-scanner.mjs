import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";

const sourceRoots = ["src/app", "src/components", "src/features"];
const sourceExtensions = new Set([".js", ".jsx", ".ts", ".tsx"]);

function toProjectPath(projectRoot, filePath) {
  return relative(projectRoot, filePath).split(sep).join("/");
}

async function findSourceFiles({ directory, projectRoot, rules }) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = join(directory, entry.name);

      if (entry.isDirectory()) {
        return findSourceFiles({ directory: entryPath, projectRoot, rules });
      }

      const projectPath = toProjectPath(projectRoot, entryPath);
      const isExcluded = rules.publicMarketingExclusions.some((prefix) =>
        projectPath.startsWith(prefix),
      );

      if (!sourceExtensions.has(extname(entry.name)) || isExcluded) {
        return [];
      }

      return [entryPath];
    }),
  );

  return files.flat();
}

export async function scanUiCopy({ projectRoot, rules }) {
  const sourceFiles = (
    await Promise.all(
      sourceRoots.map((sourceRoot) =>
        findSourceFiles({
          directory: join(projectRoot, sourceRoot),
          projectRoot,
          rules,
        }),
      ),
    )
  )
    .flat()
    .sort();
  const findings = [];

  for (const filePath of sourceFiles) {
    const projectPath = toProjectPath(projectRoot, filePath);
    const lines = (await readFile(filePath, "utf8")).split(/\r?\n/);

    for (const [lineIndex, line] of lines.entries()) {
      for (const phrase of rules.prohibitedTutorialNarration) {
        if (line.toLowerCase().includes(phrase.toLowerCase())) {
          findings.push({
            line: line.trim(),
            lineNumber: lineIndex + 1,
            phrase,
            projectPath,
          });
        }
      }
    }
  }

  return findings;
}
