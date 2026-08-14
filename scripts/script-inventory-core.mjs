import { dirname, posix } from "node:path";

const defaultGateCommands = new Set([
  "test:all",
  "test:contracts",
  "test:database",
  "test:ui",
  "test:unit",
]);

function mentionsScript(text, referrer, scriptPath) {
  if (text.includes(scriptPath)) return true;
  if (!referrer.startsWith("scripts/")) return false;
  if (text.includes(posix.basename(scriptPath))) return true;

  let relative = posix.relative(dirname(referrer), scriptPath);
  if (!relative.startsWith(".")) relative = `./${relative}`;
  return text.includes(relative);
}

export function buildScriptInventory({
  documents,
  packageScripts,
  scriptPaths,
  workflowTexts,
}) {
  const entries = scriptPaths.sort().map((path) => {
    const packageReferences = Object.entries(packageScripts)
      .filter(([, command]) => command.includes(path))
      .map(([name]) => `package:${name}`);
    const workflowReferences = workflowTexts
      .filter(([, text]) => text.includes(path))
      .map(([workflowPath]) => workflowPath);
    const documentReferences = [...documents]
      .filter(
        ([documentPath, text]) =>
          documentPath !== path && mentionsScript(text, documentPath, path),
      )
      .map(([documentPath]) => documentPath);
    const references = [
      ...packageReferences,
      ...workflowReferences,
      ...documentReferences,
    ].sort();

    let classification = "unreferenced";
    if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path)) {
      classification = "default-gate";
    } else if (
      packageReferences.some((reference) =>
        defaultGateCommands.has(reference.slice("package:".length)),
      )
    ) {
      classification = "default-gate";
    } else if (workflowReferences.length > 0) {
      classification = "workflow-gate";
    } else if (packageReferences.length > 0) {
      classification = "specialist-command";
    } else if (documentReferences.some((reference) => reference.startsWith("scripts/"))) {
      classification = "reusable-support";
    } else if (documentReferences.length > 0) {
      classification = "documented-operator";
    }

    return { classification, path, references };
  });

  return {
    entries,
    summary: Object.fromEntries(
      [...new Set(entries.map((entry) => entry.classification))]
        .sort()
        .map((classification) => [
          classification,
          entries.filter((entry) => entry.classification === classification)
            .length,
        ]),
    ),
  };
}
