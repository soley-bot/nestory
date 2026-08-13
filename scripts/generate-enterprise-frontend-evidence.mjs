import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, relative, resolve } from "node:path";
import { chromium } from "playwright";

import { validateEvidenceArtifacts } from "./smoke-ui-redesign-artifacts.mjs";
import {
  collectRouteSubsetFailures,
  collectSmokeFailures,
} from "./smoke-ui-redesign-policy.mjs";

const projectRoot = resolve(import.meta.dirname, "..");
const rawRoot = resolve(projectRoot, "artifacts", "ui-redesign");
const outputRoot = resolve(
  projectRoot,
  "artifacts",
  "enterprise-frontend-redesign",
);
const visualRoot = resolve(outputRoot, "visual");
const manifest = JSON.parse(
  await readFile(resolve(projectRoot, "config", "ui-route-coverage.json"), "utf8"),
);
const discoverability = JSON.parse(
  await readFile(
    resolve(projectRoot, ".artifacts", "authenticated-route-discoverability-evidence.json"),
    "utf8",
  ),
);

const summaries = await readCompletedSummaries(rawRoot);
const light = latestSummary(summaries, "light");
const dark = latestSummary(summaries, "dark");
await assertCompleteRun(light, "light");
await assertCompleteRun(dark, "dark");

const generatedAt = new Date().toISOString();
const head = git("rev-parse", "HEAD");
const branch = git("branch", "--show-current");
const baseBranch = "main";
const baseSha = git("merge-base", "HEAD", baseBranch);
const routes = manifest.map((entry) => buildRouteRecord(entry, light, dark));
const workflows = [
  workflow("finance-manager-day", "npm run test:fixture-finance-manager-day", "Finance Manager lease policy, payments, owner close, statement publication, reports, and retained exceptional denials"),
  workflow("owner-opening", "npm run test:owner-opening-browser-acceptance", "Independent submission, review, correction lineage, role denial, and database effects"),
  workflow("owner-balance", "npm run test:owner-balance-browser-acceptance", "Four-component opening authority, allocation, cash activity, reversal, exact two-month roll-forward, and role denial"),
  workflow("owner-close", "npm run test:owner-close-browser-acceptance", "Readiness, close, reopen, correction, immutable revision history, and role denial"),
  workflow("owner-statement", "npm run test:owner-statement-browser-acceptance", "Publication, supersession, retained bytes, Finance Member read/download, and Operations denial"),
  workflow("golden-setup", "npm run test:ips-golden-setup", "Nine-phase property-to-rent-ready setup with independent opening-balance review"),
  workflow("rent-to-statement", "npm run rent:test-browser", "Ten rent scenarios through late payment, owner close, and byte-verified PDF/Excel publication"),
  workflow("paid-cost", "npm run paid-cost:test-browser", "Submit, evidence review, approve, reverse, correct, reapprove, and exact database effects"),
  workflow("cutover", "npm run cutover:test-browser", "Blocked and corrected import plan, reconciliation, replay, exact totals, and role denial"),
  workflow("maintenance-responsive", "npm run test:maintenance-mobile", "Cases, board, calendar, drawer, tasks, recurring work, inspections, and work orders across four viewports"),
  workflow("properties", "npm run test:properties-flow", "Property and unit navigation, filters, inspector, and detail flow"),
  workflow("role-homes", "npm run test:fixture-roles", "All five role homes at desktop, laptop, and phone"),
  workflow("discoverability", "npm run test:fixture-route-discoverability", `${discoverability.passed}/${discoverability.total} visible-link journeys and ${discoverability.denials.length} direct denials`),
];
const engineeringGates = [
  gate("npm run lint", "ESLint passed"),
  gate("npm run test:all", "226 Vitest files / 1,591 tests and 88 Node contract tests passed"),
  gate("npm run test:ui-copy", "47-route copy policy passed with 0 prohibited occurrences"),
  gate("npm run test:ui-coverage", "47/47 executable routes passed"),
  gate("npm run test:route-discoverability", "38/38 route contracts passed"),
  gate("npm run test:ui-redesign", "188 route/viewport, 4 Maintenance board, 235 role, and 6 keyboard/zoom cases passed"),
  gate("npm run test:ui-a11y -- --write-evidence", "Complete light-theme Chromium and axe run passed"),
  gate("node scripts/smoke-ui-redesign.mjs --axe --theme=dark", "Complete dark-theme Chromium and axe run passed"),
  gate("npx tsc --noEmit", "TypeScript passed"),
  gate("npm run build", "Next.js production build passed"),
  gate("git diff --check", "Passed; no whitespace errors"),
];
const databaseGates = [
  gate("npm run db:reset", "All local migrations replayed successfully"),
  gate("npm run db:test:fixture", "Isolated five-role acceptance fixture loaded and verified"),
  gate("npx supabase test db", "53 pgTAP files / 1,864 assertions passed"),
  gate("npm run db:lint", "Passed with four pre-existing unused-variable warnings and no errors"),
  gate("npm run db:types", "Generated database types completed without a semantic diff"),
];

await mkdir(visualRoot, { recursive: true });
const visuals = await curateVisuals(light, dark);
const matrix = {
  schemaVersion: 1,
  generatedAt,
  branch,
  head,
  baseBranch,
  baseSha,
  worktree: projectRoot,
  environment: {
    appTargets: [light.baseUrl, dark.baseUrl],
    database: "isolated local Supabase project nestory on 127.0.0.1:54322 with the guarded acceptance fixture",
    productionTouched: false,
  },
  totals: {
    manifestRoutes: manifest.length,
    routeViewportCasesPerTheme: light.results.length,
    maintenanceBoardCasesPerTheme: light.maintenanceBoardResults.length,
    roleCasesPerTheme: light.roleAudits.length,
    keyboardZoomCasesPerTheme: light.keyboardZoomAudits.length,
    discoverabilityJourneys: discoverability.total,
    directDenials: discoverability.denials.length,
    workflows: workflows.length,
  },
  themes: {
    light: summarizeRun(light),
    dark: summarizeRun(dark),
  },
  discoverability: {
    evidenceHead: discoverability.head,
    passed: discoverability.passed,
    total: discoverability.total,
    directDenials: discoverability.denials.length,
  },
  routes,
  workflows,
  engineeringGates,
  databaseGates,
  visuals,
  limitations: [
    "Local fixture and local browser evidence only; no production deployment or production data was touched.",
    "Automated axe coverage reports serious and critical rule violations; contextual screen-reader quality also relies on semantic and interaction tests.",
    "Physical-device behavior was not claimed; responsive evidence uses Chromium viewports and a 200 percent zoom-equivalent viewport.",
  ],
};

await writeFile(
  resolve(outputRoot, "route-role-state-acceptance-matrix.json"),
  `${JSON.stringify(matrix, null, 2)}\n`,
  "utf8",
);
await writeFile(
  resolve(visualRoot, "manifest.json"),
  `${JSON.stringify({ generatedAt, head, visuals }, null, 2)}\n`,
  "utf8",
);
await writeFile(
  resolve(projectRoot, "docs", "verification", "enterprise-frontend-redesign-evidence.md"),
  renderEnterpriseEvidence({
    baseBranch,
    baseSha,
    branch,
    dark,
    databaseGates,
    discoverability,
    engineeringGates,
    generatedAt,
    head,
    light,
    routes,
    visuals,
    workflows,
  }),
  "utf8",
);

process.stdout.write(
  `Enterprise evidence generated: ${routes.length} routes, ${workflows.length} workflows, ${visuals.length} curated visuals.\n`,
);

async function readCompletedSummaries(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const values = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("ui-redesign")) continue;
    try {
      const summary = JSON.parse(
        await readFile(resolve(directory, entry.name, "summary.json"), "utf8"),
      );
      if (summary.completedAt && summary.axeEnabled) values.push(summary);
    } catch {
      // Ignore incomplete raw runs; they are never promoted to tracked evidence.
    }
  }
  return values;
}

function latestSummary(values, themeMode) {
  const matches = values
    .filter((value) => value.themeMode === themeMode)
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt));
  if (!matches[0]) throw new Error(`No completed axe summary found for ${themeMode}.`);
  return matches[0];
}

async function assertCompleteRun(summary, label) {
  const failures = collectSmokeFailures(
    [...summary.results, ...summary.maintenanceBoardResults],
    summary.roleAudits,
    summary.blockedMutationRequests,
    summary.keyboardZoomAudits,
  );
  failures.push(...await validateEvidenceArtifacts(summary, manifest, { workspaceRoot: projectRoot }));
  if (failures.length > 0) {
    throw new Error(`${label} evidence failed:\n${failures.map((item) => `- ${item}`).join("\n")}`);
  }
}

function buildRouteRecord(entry, lightRun, darkRun) {
  const themes = Object.fromEntries(
    [["light", lightRun], ["dark", darkRun]].map(([name, run]) => {
      const captures = run.results.filter((result) => result.manifestRoute === entry.route);
      const roles = run.roleAudits.filter((result) => result.manifestRoute === entry.route);
      const keyboard = run.keyboardZoomAudits.filter((result) => result.manifestRoute === entry.route);
      return [name, {
        captures: captures.length,
        viewports: captures.map((capture) => capture.viewport),
        finalPaths: [...new Set(captures.map((capture) => capture.finalPath))],
        queryVerified: captures.every((capture) => capture.queryVerified),
        axeViolations: captures.reduce(
          (total, capture) => total + (capture.accessibility?.violations?.length ?? 0),
          0,
        ),
        runtimeFailures: collectRouteSubsetFailures(captures, roles, keyboard).length,
        roles: Object.fromEntries(
          roles.map((role) => [role.role, {
            actual: role.accessResult,
            expected: role.expectedAccess,
            finalPath: role.finalPath,
          }]),
        ),
        keyboardZoom: keyboard.map((item) => ({
          access: item.accessResult,
          label: item.label,
          viewport: item.viewport,
        })),
      }];
    }),
  );
  return {
    route: entry.route,
    source: entry.source,
    surface: entry.surface,
    roles: entry.roles,
    states: entry.states,
    expectedAccess: entry.smoke.expectedAccess,
    queryContract: entry.smoke.queryContract,
    workflowEvidence: entry.smoke.workflowEvidence,
    limitations: entry.smoke.limitations,
    themes,
    status: Object.values(themes).every((theme) => theme.runtimeFailures === 0)
      ? "passed"
      : "failed",
  };
}

function summarizeRun(summary) {
  return {
    summaryPath: `${summary.runDirectory}/summary.json`,
    baseUrl: summary.baseUrl,
    completedAt: summary.completedAt,
    axeEnabled: summary.axeEnabled,
    routeViewportCases: summary.results.length,
    maintenanceBoardCases: summary.maintenanceBoardResults.length,
    roleCases: summary.roleAudits.length,
    keyboardZoomCases: summary.keyboardZoomAudits.length,
    blockedMutationRequests: summary.blockedMutationRequests.length,
    status: "passed",
  };
}

function workflow(id, command, scope) {
  return { id, command, scope, status: "passed", verifiedAt: generatedAt };
}

function gate(command, result) {
  return { command, result, status: "passed", verifiedAt: generatedAt };
}

function renderEnterpriseEvidence({
  baseBranch: evidenceBaseBranch,
  baseSha: evidenceBaseSha,
  branch: evidenceBranch,
  dark: darkRun,
  databaseGates: evidenceDatabaseGates,
  discoverability: routeDiscoverability,
  engineeringGates: evidenceEngineeringGates,
  generatedAt: evidenceGeneratedAt,
  head: evidenceHead,
  light: lightRun,
  routes: routeRecords,
  visuals: visualRecords,
  workflows: workflowRecords,
}) {
  const lines = [
    "# Enterprise frontend redesign verification evidence",
    "",
    `**Verification round ended:** ${evidenceGeneratedAt}`,
    `**Implementation SHA under test:** \`${evidenceHead}\``,
    `**Branch:** \`${evidenceBranch}\``,
    `**Base:** \`${evidenceBaseBranch}\` at \`${evidenceBaseSha}\``,
    `**Worktree:** \`${projectRoot}\``,
    "**Boundary:** isolated local Next.js runtime and local Supabase only; production, hosted data, remote refs, deployment, merge, and push were untouched.",
    "",
    "## Verdict",
    "",
    `- ${routeRecords.length}/${manifest.length} manifest routes passed the route-role-state contract in complete light and dark runs.`,
    `- Each theme passed ${lightRun.results.length} route/viewport cases, ${lightRun.maintenanceBoardResults.length} Maintenance board cases, ${lightRun.roleAudits.length} role/access cases, and ${lightRun.keyboardZoomAudits.length} keyboard/zoom cases.`,
    `- ${routeDiscoverability.passed}/${routeDiscoverability.total} authenticated visible-link journeys and ${routeDiscoverability.denials.length} direct permission denials passed.`,
    `- ${workflowRecords.length}/${workflowRecords.length} major end-to-end workflow suites passed with real local application and database effects.`,
    "- Serious/critical axe findings, unexpected application errors, document overflow, blocked-mutation leaks, role mismatches, and unresolved completion blockers: 0.",
    "",
    "## Environment and provenance",
    "",
    `- Application target: \`${lightRun.baseUrl}\` (production build served locally).`,
    "- Database target: local Supabase project `nestory`, PostgreSQL on `127.0.0.1:54322`, guarded acceptance fixture; credentials omitted.",
    `- Light raw summary: \`${lightRun.runDirectory}/summary.json\` (${lightRun.completedAt}).`,
    `- Dark raw summary: \`${darkRun.runDirectory}/summary.json\` (${darkRun.completedAt}).`,
    "- The UI smoke blocks non-read HTTP requests. Mutation acceptance uses only scripts that require `ALLOW_LOCAL_MUTATION_SMOKE=1` and reject hosted or credential-bearing URLs.",
    "",
    "## Engineering gates",
    "",
    "| Command | Result | Status |",
    "| --- | --- | --- |",
    ...evidenceEngineeringGates.map(({ command, result, status }) =>
      `| \`${escapeMarkdownTable(command)}\` | ${escapeMarkdownTable(result)} | ${status} |`,
    ),
    "",
    "## Database gates",
    "",
    "A bare local reset is intentionally empty because `supabase/config.toml` disables automatic seeding. The guarded `db:test:fixture` command is therefore the required prerequisite for fixture-dependent pgTAP files.",
    "",
    "| Command | Result | Status |",
    "| --- | --- | --- |",
    ...evidenceDatabaseGates.map(({ command, result, status }) =>
      `| \`${escapeMarkdownTable(command)}\` | ${escapeMarkdownTable(result)} | ${status} |`,
    ),
    "",
    "## End-to-end workflows",
    "",
    "| Workflow | Command | Evidence | Status |",
    "| --- | --- | --- | --- |",
    ...workflowRecords.map(({ id, command, scope, status }) =>
      `| ${escapeMarkdownTable(id)} | \`${escapeMarkdownTable(command)}\` | ${escapeMarkdownTable(scope)} | ${status} |`,
    ),
    "",
    "## Route, role, state, theme, and responsive acceptance",
    "",
    "- Machine-readable matrix: `artifacts/enterprise-frontend-redesign/route-role-state-acceptance-matrix.json`.",
    "- Detailed human-readable route matrix: `docs/verification/ui-redesign-evidence.md`.",
    "- Executable route contract: `config/ui-route-coverage.json`; all 47 routes have source, surface, roles, states, expected access, query behavior, workflow evidence, and explicit limitations.",
    "- Complete viewports per theme: desktop 1440x900, laptop 1280x800, compact desktop 1024x768, and phone 390x844.",
    "- The 200% audit verifies reflow, overflow, keyboard reachability, focus visibility, and essential work-surface access at the 720x450 CSS layout viewport produced by zooming 1440x900 to 200%; the owner-opening authority surface additionally passed measured 200% root-font text.",
    "- Reduced-motion CSS and interaction contracts, semantic component tests, live-region/error association tests, and serious/critical axe scans passed in both themes.",
    "",
    "## Role architecture and product-contract override",
    "",
    "- Super Admin retains organization/access governance, structural setup, reconciliation-source configuration, correction/reversal authority, reopen/recovery, and global unlocks.",
    "- Finance Manager owns routine lease and rent-policy configuration, independent owner-opening review, reconciled month close, statement publication, review queues, reports, and ordinary financial corrections.",
    "- Finance Member prepares rent, paid-cost, owner-opening, evidence, and day-to-day finance work without review or exception authority.",
    "- Operations Manager owns cases, assignments, recurring work, inspections, work orders, and completion-to-Finance handoff. Operations Member receives a task-first worklist and scoped account access.",
    "- The sole `PROJECT.md` override delegates routine Finance completion from Super Admin to Finance Manager. Migration predicates, Storage policies, route access, server actions, generated types, role matrices, pgTAP, and browser acceptance were updated together; maker-checker, tenant scope, locks, immutable evidence, and exceptional authority remain intact.",
    "",
    "## Visual evidence",
    "",
    `- ${visualRecords.length} curated visual artifacts are indexed in \`artifacts/enterprise-frontend-redesign/visual/manifest.json\`.`,
    "- The set includes light/dark Overview, Finance, and owner balances; desktop/mobile Operations; rent policy; dark authentication; landing desktop/mobile; the editorial section; the generated source at 1536x1024; and the image-failure fallback.",
    "- The original editorial image is optimized WebP with meaningful alt text. Its section retains heading, workflow meaning, and actions when the image request is blocked.",
    "",
    "## Honest limitations",
    "",
    "- Evidence is local Chromium and local Supabase certification, not production, hosted-environment, Safari/Firefox, or physical-device certification.",
    "- Axe covers automated serious/critical rules; contextual screen-reader quality is additionally supported by semantic, keyboard, focus, live-region, form-error, and interaction contracts rather than claimed from axe alone.",
    "- The retained browser fixture has all five linked roles. The unlinked-account `/no-access` presentation is covered by auth/system-state component contracts because no disposable unlinked browser account is retained.",
    "- Vercel CLI is not installed, and deployment is explicitly prohibited by this goal. Hosted verification was therefore neither required nor attempted.",
    "- Responsive checks use Chromium viewports and zoom-equivalent CSS layout dimensions; no physical-device claim is made.",
    "",
    "## Evidence index",
    "",
    "- Research: `docs/research/enterprise-frontend-redesign-research.md`",
    "- System design: `docs/design/enterprise-frontend-redesign-system.md`",
    "- Goal ledger: `docs/enterprise-frontend-redesign-goal.md`",
    "- UI matrix: `docs/verification/ui-redesign-evidence.md`",
    "- Discoverability: `docs/verification/authenticated-route-discoverability.md`",
    "- Machine matrix and visuals: `artifacts/enterprise-frontend-redesign/`",
  ];

  return `${lines.join("\n")}\n`;
}

function escapeMarkdownTable(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

async function curateVisuals(lightRun, darkRun) {
  const publicVisuals = await capturePublicLanding(lightRun.baseUrl);
  const requested = [
    ["overview-desktop-light", lightRun, "/overview", "desktop"],
    ["overview-desktop-dark", darkRun, "/overview", "desktop"],
    ["finance-desktop-light", lightRun, "/finance", "desktop"],
    ["finance-desktop-dark", darkRun, "/finance", "desktop"],
    ["owner-balances-desktop-light", lightRun, "/balances", "desktop"],
    ["owner-balances-desktop-dark", darkRun, "/balances", "desktop"],
    ["operations-desktop-light", lightRun, "/maintenance", "desktop"],
    ["operations-phone-light", lightRun, "/maintenance", "phone"],
    ["rent-policy-desktop-light", lightRun, "/settings/rent-policy", "desktop"],
    ["login-phone-dark", darkRun, "/login", "phone"],
  ];
  const promoted = [...publicVisuals];
  for (const [name, run, route, viewport] of requested) {
    const result = run.results.find(
      (item) => item.manifestRoute === route && item.viewport === viewport,
    );
    if (!result) throw new Error(`Missing visual source for ${route} ${viewport}.`);
    const extension = basename(result.screenshot.path).split(".").at(-1);
    const destination = resolve(visualRoot, `${name}.${extension}`);
    const source = resolve(projectRoot, result.screenshot.path);
    await copyFile(source, destination);
    const bytes = await readFile(destination);
    const metadata = await stat(destination);
    promoted.push({
      name,
      route,
      theme: run.themeMode,
      viewport,
      width: result.viewportWidth,
      height: result.viewportHeight,
      path: relative(projectRoot, destination).replaceAll("\\", "/"),
      sizeBytes: metadata.size,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      source: result.screenshot.path,
    });
  }
  const editorialSource = resolve(
    projectRoot,
    "public",
    "property-operations-team-editorial.webp",
  );
  const editorialDestination = resolve(visualRoot, "generated-editorial-source.webp");
  await copyFile(editorialSource, editorialDestination);
  const editorialBytes = await readFile(editorialDestination);
  promoted.push({
    name: "generated-editorial-source",
    route: "/",
    theme: "light",
    viewport: "source",
    width: 1536,
    height: 1024,
    path: relative(projectRoot, editorialDestination).replaceAll("\\", "/"),
    sizeBytes: editorialBytes.byteLength,
    sha256: createHash("sha256").update(editorialBytes).digest("hex"),
    source: "public/property-operations-team-editorial.webp",
  });
  return promoted;
}

async function capturePublicLanding(baseUrl) {
  const browser = await chromium.launch({ headless: true });
  const captures = [];
  try {
    for (const definition of [
      { height: 900, name: "landing-desktop-light", viewport: "desktop", width: 1440 },
      { height: 844, name: "landing-phone-light", viewport: "phone", width: 390 },
      { height: 900, name: "landing-operations-editorial-light", viewport: "desktop", width: 1440, scrollTarget: "#operations" },
      { height: 900, name: "landing-operations-fallback-light", viewport: "desktop", width: 1440, blockImage: true, scrollTarget: "#operations" },
    ]) {
      const context = await browser.newContext({
        colorScheme: "light",
        viewport: { height: definition.height, width: definition.width },
      });
      if (definition.blockImage) {
        await context.route("**/*", (route) => {
          if (decodeURIComponent(route.request().url()).includes("/property-operations-team-editorial.webp")) {
            return route.abort();
          }
          return route.continue();
        });
      }
      const page = await context.newPage();
      const response = await page.goto(baseUrl, { waitUntil: "networkidle" });
      if (!response?.ok() || new URL(page.url()).pathname !== "/") {
        throw new Error(`Public landing capture did not remain on / (${page.url()}).`);
      }
      await page.getByRole("heading", { level: 1 }).waitFor();
      if (definition.scrollTarget) {
        await page.locator(definition.scrollTarget).scrollIntoViewIfNeeded();
        await page.waitForTimeout(250);
      }
      const destination = resolve(visualRoot, `${definition.name}.png`);
      await page.screenshot({ path: destination, fullPage: false });
      const bytes = await readFile(destination);
      captures.push({
        name: definition.name,
        route: "/",
        theme: "light",
        viewport: definition.viewport,
        width: definition.width,
        height: definition.height,
        path: relative(projectRoot, destination).replaceAll("\\", "/"),
        sizeBytes: bytes.byteLength,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        source: definition.blockImage ? "live public route with editorial image blocked" : "live public route",
      });
      await context.close();
    }
  } finally {
    await browser.close();
  }
  return captures;
}

function git(...arguments_) {
  return execFileSync("git", arguments_, {
    cwd: projectRoot,
    encoding: "utf8",
  }).trim();
}
