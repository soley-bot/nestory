import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = join(projectRoot, "src", "app");
const manifestPath = join(projectRoot, "config", "ui-route-coverage.json");

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
const pageSources = await findPageSources(appRoot);
const pageRoutes = new Set(pageSources.map(normalizePageRoute));
const manifestRoutes = new Set(manifest.map(({ route }) => route));

const missingRoutes = [...pageRoutes]
  .filter((route) => !manifestRoutes.has(route))
  .sort();
const staleRoutes = [...manifestRoutes]
  .filter((route) => !pageRoutes.has(route))
  .sort();

if (missingRoutes.length > 0 || staleRoutes.length > 0) {
  console.error("UI route coverage verification failed.");

  if (missingRoutes.length > 0) {
    printList("missing from manifest", missingRoutes);
  }

  if (staleRoutes.length > 0) {
    printList("stale manifest entry", staleRoutes);
  }

  process.exitCode = 1;
} else {
  console.log(`${pageRoutes.size}/${pageRoutes.size} page routes covered`);
}
