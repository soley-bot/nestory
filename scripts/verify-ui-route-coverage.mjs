import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = join(projectRoot, "src", "app");
const manifestPath = join(projectRoot, "config", "ui-route-coverage.json");
const evidencePath = join(
  projectRoot,
  "docs",
  "verification",
  "ui-redesign-evidence.md",
);

async function findPageSources(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const sources = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = join(directory, entry.name);

      if (entry.isDirectory()) {
        return findPageSources(entryPath);
      }

      if (entry.name !== "page.tsx") {
        return [];
      }

      return [relative(projectRoot, entryPath).split(sep).join("/")];
    }),
  );

  return sources.flat();
}

function normalizePageRoute(source) {
  const segments = source
    .replace(/^src\/app\//, "")
    .replace(/(^|\/)page\.tsx$/, "")
    .split("/")
    .filter((segment) => !/^\(.+\)$/.test(segment));

  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

function printList(label, routes) {
  console.error(`${label}:`);

  for (const route of routes) {
    console.error(`  - ${route}`);
  }
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const evidenceDocument = await readFile(evidencePath, "utf8").catch(() => "");
const pageSources = await findPageSources(appRoot);
const pageRoutes = new Set(pageSources.map(normalizePageRoute));
const manifestRoutes = new Set(manifest.map(({ route }) => route));

const missingRoutes = [...pageRoutes]
  .filter((route) => !manifestRoutes.has(route))
  .sort();
const staleRoutes = [...manifestRoutes]
  .filter((route) => !pageRoutes.has(route))
  .sort();
const manifestIssues = manifest.flatMap((entry) => {
  const issues = [];
  const allowedAccessResults = new Set([
    "accessible",
    "login-required",
    "permission-blocked",
    "redirected",
    "setup-required",
  ]);
  const allowedQueryContracts = new Set([
    "not-applicable",
    "preserved",
    "redirect-preserved",
  ]);
  const expectedRoles = ["admin", "anonymous", "manager", "member"];

  if (
    !entry.smoke?.path?.startsWith("/") ||
    /\[[^\]]+\]/.test(entry.smoke.path)
  ) {
    issues.push(`${entry.route}: missing concrete smoke path`);
  }
  if (
    expectedRoles.some(
      (role) =>
        !allowedAccessResults.has(entry.smoke?.expectedAccess?.[role]),
    )
  ) {
    issues.push(`${entry.route}: incomplete role expectations`);
  }
  if (!allowedQueryContracts.has(entry.smoke?.queryContract)) {
    issues.push(`${entry.route}: missing query contract`);
  }
  if (
    !Array.isArray(entry.smoke?.workflowEvidence) ||
    entry.smoke.workflowEvidence.length === 0
  ) {
    issues.push(`${entry.route}: missing workflow evidence`);
  }
  if (!Array.isArray(entry.smoke?.limitations)) {
    issues.push(`${entry.route}: missing limitations list`);
  }

  const marker = `<!-- route-evidence:${entry.route} -->`;
  if (evidenceDocument.split(marker).length - 1 !== 1) {
    issues.push(`${entry.route}: missing or duplicate evidence document row`);
  }

  return issues;
});

if (
  missingRoutes.length > 0 ||
  staleRoutes.length > 0 ||
  manifestIssues.length > 0
) {
  console.error("UI route coverage verification failed.");

  if (missingRoutes.length > 0) {
    printList("missing from manifest", missingRoutes);
  }

  if (staleRoutes.length > 0) {
    printList("stale manifest entry", staleRoutes);
  }
  if (manifestIssues.length > 0) {
    printList("manifest or evidence issue", manifestIssues);
  }

  process.exitCode = 1;
} else {
  console.log(`${pageRoutes.size}/${pageRoutes.size} page routes covered`);
}
