import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

import { buildScriptInventory } from "./script-inventory-core.mjs";

const projectRoot = process.cwd();
const packageJson = JSON.parse(await readFile(resolve(projectRoot, "package.json"), "utf8"));
const scriptPaths = (await collectFiles(resolve(projectRoot, "scripts")))
  .map((path) => normalize(relative(projectRoot, path)))
  .filter((path) => /\.(?:[cm]?js|ts)$/.test(path) && !path.startsWith("scripts/archive/"));
const documentPaths = [
  ...(await collectFiles(resolve(projectRoot, "scripts"))),
  ...(await collectFiles(resolve(projectRoot, "docs"))),
  ...(await collectFiles(resolve(projectRoot, "src"))),
  ...["README.md", "PROJECT.md"]
    .map((path) => resolve(projectRoot, path))
    .filter((path) => path),
];
const documents = new Map();

for (const path of documentPaths) {
  if (![".js", ".jsx", ".md", ".mjs", ".ts", ".tsx"].includes(extname(path))) {
    continue;
  }
  try {
    documents.set(normalize(relative(projectRoot, path)), await readFile(path, "utf8"));
  } catch {
    // Optional root documents are absent in some checkouts.
  }
}

const workflowTexts = [];
for (const path of await collectFiles(resolve(projectRoot, ".github", "workflows"))) {
  workflowTexts.push([
    normalize(relative(projectRoot, path)),
    await readFile(path, "utf8"),
  ]);
}

const inventory = buildScriptInventory({
  documents,
  packageScripts: packageJson.scripts ?? {},
  scriptPaths,
  workflowTexts,
});
const outputPath = resolve(projectRoot, "docs", "repository", "script-inventory.md");
await mkdir(resolve(outputPath, ".."), { recursive: true });
await writeFile(outputPath, renderInventory(inventory), "utf8");
process.stdout.write(
  `Wrote ${scriptPaths.length} script classifications to ${normalize(relative(projectRoot, outputPath))}.\n`,
);

async function collectFiles(root) {
  const files = [];
  try {
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if ([".git", ".next", ".worktrees", "node_modules"].includes(entry.name)) continue;
      const path = join(root, entry.name);
      if (entry.isDirectory()) files.push(...(await collectFiles(path)));
      else files.push(path);
    }
  } catch {
    return [];
  }
  return files;
}

function normalize(path) {
  return path.replaceAll("\\", "/");
}

function renderInventory({ entries, summary }) {
  const unreferenced = entries.filter(
    (entry) => entry.classification === "unreferenced",
  );
  return `# Script lifecycle inventory

Generated from package commands, GitHub workflows, script imports, source references, and documentation mentions. A missing reference is an audit signal, not automatic permission to delete an operator tool.

## Summary

${Object.entries(summary)
  .map(([classification, count]) => `- ${classification}: ${count}`)
  .join("\n")}

## Inventory

| Script | Classification | Reference evidence |
| --- | --- | --- |
${entries
  .map(
    ({ classification, path, references }) =>
      `| \`${path}\` | ${classification} | ${
        references.length > 0
          ? references.map((reference) => `\`${reference}\``).join(", ")
          : "None found"
      } |`,
  )
  .join("\n")}

## Unreferenced review queue

${
  unreferenced.length > 0
    ? unreferenced
        .map(({ path }) => `- \`${path}\` - inspect purpose and operator history before archival.`)
        .join("\n")
    : "No unreferenced scripts."
}
`;
}
