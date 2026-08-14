import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildDeniedGlobalEntryChecks,
  validateDiscoverabilityEvidence,
} from "./smoke-authenticated-route-discoverability-core.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dashboardRoot = join(projectRoot, "src", "app", "(dashboard)");
const contractPath = join(
  projectRoot,
  "config",
  "authenticated-route-discoverability.json",
);
const uiCoveragePath = join(projectRoot, "config", "ui-route-coverage.json");
const reportPath = join(
  projectRoot,
  "docs",
  "verification",
  "authenticated-route-discoverability.md",
);
const roles = [
  "super_admin",
  "finance_manager",
  "finance_member",
  "operations_manager",
  "operations_member",
];
const capabilityRoles = {
  workspace: roles,
  canManageAccess: ["super_admin"],
  canConfigureLeases: ["super_admin", "finance_manager"],
  canReadFinance: ["super_admin", "finance_manager", "finance_member"],
  canReadFinanceReports: ["super_admin", "finance_manager"],
  canManageOperations: ["super_admin", "operations_manager"],
  canExecuteOperations: [
    "super_admin",
    "operations_manager",
    "operations_member",
  ],
};
const classifications = new Set([
  "global",
  "context",
  "profile",
  "arrival",
  "inaccessible",
]);

const contractText = await readFile(contractPath, "utf8");
const contract = JSON.parse(contractText);
const uiCoverage = JSON.parse(await readFile(uiCoveragePath, "utf8"));
const contractHash = createHash("sha256")
  .update(`${JSON.stringify(contract)}\n`)
  .digest("hex");

if (process.argv.includes("--write-report")) {
  const evidenceArgument = process.argv.find((argument) =>
    argument.startsWith("--evidence="),
  );
  const evidencePath = evidenceArgument
    ? resolve(projectRoot, evidenceArgument.slice("--evidence=".length))
    : undefined;
  const evidence = evidencePath && existsSync(evidencePath)
    ? JSON.parse(await readFile(evidencePath, "utf8"))
    : undefined;
  if (evidence) {
    const evidenceIssues = validateDiscoverabilityEvidence(contract, evidence);
    if (evidenceIssues.length > 0) {
      throw new Error(
        `Refusing invalid discoverability evidence:\n${evidenceIssues.join("\n")}`,
      );
    }
  }
  await writeFile(reportPath, buildReport(contract, contractHash, evidence), "utf8");
}

const issues = [];
const pageSources = await findPageSources(dashboardRoot);
const dashboardRoutes = new Map(
  pageSources.map((source) => [normalizeDashboardRoute(source), source]),
);
const contractRoutes = new Map(
  contract.routes.map((entry) => [entry.route, entry]),
);

if (contract.version !== 1) issues.push("contract: version must be 1");
if (JSON.stringify(contract.roles) !== JSON.stringify(roles)) {
  issues.push("contract: role order or role set differs from the five fixed roles");
}
if (contract.arrival?.route !== "/workspace") {
  issues.push("contract: /workspace must be the authenticated arrival route");
}
if (!existsSync(join(projectRoot, contract.arrival?.source ?? "missing"))) {
  issues.push("contract: authenticated arrival source is missing");
}

for (const [route] of dashboardRoutes) {
  if (!contractRoutes.has(route)) issues.push(`${route}: live route missing from contract`);
}
for (const [route] of contractRoutes) {
  if (!dashboardRoutes.has(route)) issues.push(`${route}: obsolete or stale contract route`);
}

const journeyIds = new Set();
for (const routeContract of contract.routes) {
  const expectedSource = dashboardRoutes.get(routeContract.route);
  if (expectedSource !== routeContract.source) {
    issues.push(`${routeContract.route}: source does not match the live page`);
  }
  const allowedByCapability = capabilityRoles[routeContract.capability];
  if (!allowedByCapability) {
    issues.push(`${routeContract.route}: unknown capability ${routeContract.capability}`);
    continue;
  }
  const guardSourcePath = join(projectRoot, routeContract.guardSource ?? "missing");
  const guardSource = existsSync(guardSourcePath)
    ? await readFile(guardSourcePath, "utf8")
    : "";
  if (!guardSource.includes(routeContract.guard)) {
    issues.push(`${routeContract.route}: guard ${routeContract.guard} not found in ${routeContract.guardSource}`);
  }

  const allowedFromContract = [];
  for (const role of roles) {
    const access = routeContract.roleAccess?.[role];
    if (!Array.isArray(access) || access.length < 2) {
      issues.push(`${routeContract.route}: ${role} has no complete classification`);
      continue;
    }
    const [classification, entryOrReason, journeyId] = access;
    if (!classifications.has(classification)) {
      issues.push(`${routeContract.route}: ${role} has invalid classification ${classification}`);
      continue;
    }
    if (classification === "inaccessible") {
      if (!String(entryOrReason).trim()) {
        issues.push(`${routeContract.route}: ${role} denial reason is missing`);
      }
      continue;
    }

    allowedFromContract.push(role);
    const entry = contract.entries?.[entryOrReason];
    if (!entry) {
      issues.push(`${routeContract.route}: ${role} entry ${entryOrReason} is missing`);
      continue;
    }
    if (entry.kind !== classification) {
      issues.push(`${routeContract.route}: ${role} classification does not match entry kind`);
    }
    if (
      entry.kind === "global" &&
      (typeof entry.href !== "string" || !entry.href.startsWith("/"))
    ) {
      issues.push(`${routeContract.route}: global entry ${entryOrReason} has no canonical href`);
    }
    if (entry.kind === "global" && entry.href !== routeContract.route) {
      issues.push(
        `${routeContract.route}: global entry ${entryOrReason} href does not match the route`,
      );
    }
    const entrySourcePath = join(projectRoot, entry.source ?? "missing");
    const entrySource = existsSync(entrySourcePath)
      ? await readFile(entrySourcePath, "utf8")
      : "";
    if (!entrySource.includes(entry.hrefToken) || !entrySource.includes(entry.labelToken)) {
      issues.push(`${routeContract.route}: visible entry ${entryOrReason} is not present in ${entry.source}`);
    }
    if (!String(journeyId ?? "").trim()) {
      issues.push(`${routeContract.route}: ${role} browser journey ID is missing`);
    } else if (journeyIds.has(journeyId)) {
      issues.push(`${routeContract.route}: duplicate browser journey ID ${journeyId}`);
    } else {
      journeyIds.add(journeyId);
    }
  }

  if (!sameSet(allowedFromContract, allowedByCapability)) {
    issues.push(`${routeContract.route}: role classifications differ from ${routeContract.capability}`);
  }

  const uiEntry = uiCoverage.find((entry) => entry.route === routeContract.route);
  if (!uiEntry) {
    issues.push(`${routeContract.route}: missing from config/ui-route-coverage.json`);
  } else {
    if (!sameSet(uiEntry.roles, allowedFromContract)) {
      issues.push(`${routeContract.route}: UI coverage roles differ from the discoverability contract`);
    }
    for (const role of roles) {
      const expected = allowedFromContract.includes(role)
        ? "accessible"
        : "permission-blocked";
      if (uiEntry.smoke?.expectedAccess?.[role] !== expected) {
        issues.push(`${routeContract.route}: UI coverage expects ${uiEntry.smoke?.expectedAccess?.[role]} for ${role}, expected ${expected}`);
      }
    }
  }
}

for (const role of roles) {
  try {
    buildDeniedGlobalEntryChecks(contract, role);
  } catch (error) {
    issues.push(
      `contract: ${role} denied-global checks are invalid: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

await verifyFinanceSafeLinks(issues);

const report = await readFile(reportPath, "utf8").catch(() => "");
if (!report.includes(`<!-- contract-sha256:${contractHash} -->`)) {
  issues.push("report: contract hash is missing or stale");
}
for (const route of contract.routes) {
  const marker = `<!-- authenticated-route:${route.route} -->`;
  if (report.split(marker).length - 1 !== 1) {
    issues.push(`${route.route}: report row is missing or duplicated`);
  }
}

if (issues.length > 0) {
  console.error("Authenticated route discoverability verification failed.");
  for (const issue of [...new Set(issues)]) console.error(`  - ${issue}`);
  process.exitCode = 1;
} else {
  console.log(`${dashboardRoutes.size}/${dashboardRoutes.size} authenticated routes discoverable`);
}

async function findPageSources(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return findPageSources(path);
    if (entry.name !== "page.tsx") return [];
    return [relative(projectRoot, path).split(sep).join("/")];
  }));
  return nested.flat();
}

function normalizeDashboardRoute(source) {
  const path = source
    .replace(/^src\/app\/\(dashboard\)\//, "")
    .replace(/\/page\.tsx$/, "");
  return `/${path}`;
}

function sameSet(first, second) {
  return first.length === second.length && first.every((value) => second.includes(value));
}

async function verifyFinanceSafeLinks(result) {
  const sources = [
    "src/features/leases/components/leases-table.tsx",
    "src/features/leases/components/lease-inspector.tsx",
    "src/features/petty-cash/components/petty-cash-screen.tsx",
    "src/features/ledger/components/ledger-table.tsx",
    "src/features/ledger/components/ledger-inspector.tsx",
  ];
  for (const source of sources) {
    const text = await readFile(join(projectRoot, source), "utf8");
    if (/href=\{`\/units\//.test(text) || /href=\{`\/people\//.test(text)) {
      result.push(`${source}: finance-visible record link targets an admin-only unit or person route`);
    }
    const propertyLinks = [...text.matchAll(/href=\{`(\/properties\/\$\{[^`]+)`\}/g)];
    for (const match of propertyLinks) {
      if (!match[1].includes("/account")) {
        result.push(`${source}: finance-visible property link does not use the property account route`);
      }
    }
  }
  const reportsData = await readFile(
    join(projectRoot, "src/features/reports/data/reports.ts"),
    "utf8",
  );
  const reportPage = await readFile(
    join(projectRoot, "src/app/(dashboard)/reports/[reportKind]/page.tsx"),
    "utf8",
  );
  if (!reportsData.includes("financeSafeRecords") || !reportPage.includes("financeSafeRecords: true")) {
    result.push("reports: Finance Manager record links are not sanitized to finance-safe routes");
  }
}

function buildReport(currentContract, hash, evidence) {
  const evidenceByJourney = new Map(
    (evidence?.journeys ?? []).map((journey) => [journey.id, journey]),
  );
  const rows = currentContract.routes.map((route) => {
    const cells = roles.map((role) => {
      const [classification, entryOrReason, journeyId] = route.roleAccess[role];
      if (classification === "inaccessible") {
        return `Intentionally inaccessible — ${entryOrReason}`;
      }
      const journey = evidenceByJourney.get(journeyId);
      const status = journey?.status === "passed" ? `passed ${journeyId}` : `pending ${journeyId}`;
      return `${classification} via ${entryOrReason}; ${status}`;
    });
    return `<!-- authenticated-route:${route.route} -->\n| \`${route.route}\` | \`${route.guard}\` / \`${route.capability}\` | ${cells.join(" | ")} | ${route.deadEndChecks.length ? route.deadEndChecks.join(", ") : "none"} |`;
  });
  const evidenceSection = evidence
    ? [
        `- Tested implementation SHA: \`${evidence.head}\``,
        `- Local base URL: \`${evidence.baseUrl}\``,
        `- Result: ${evidence.passed}/${evidence.total} visible-link journeys passed`,
        `- Role sessions: ${evidence.sessionStarts.length}/${roles.length} started at \`/workspace\` and resolved to the role home once.`,
        `- Denied global anchors: ${evidence.deniedGlobalAbsence.reduce((total, result) => total + result.checked, 0)} role/entry absence checks passed.`,
        `- Direct denials: ${evidence.denials.length} separate probes passed; these are authorization evidence, not discoverability journeys.`,
        "",
        "### Role session starts",
        "",
        ...evidence.sessionStarts.map(
          (session) =>
            `- \`${session.role}\`: ${session.status} — ${session.chain.join(" → ")} → ${session.destination}`,
        ),
        "",
        "### Denied global entry absence",
        "",
        ...evidence.deniedGlobalAbsence.map(
          (result) =>
            `- \`${result.role}\`: ${result.status} — ${result.checked} forbidden global hrefs checked`,
        ),
        "",
        "### Visible-link journeys from the current shell/context",
        "",
        ...evidence.journeys.map(
          (journey) => `- \`${journey.id}\`: ${journey.status} — ${journey.chain.join(" → ")}`,
        ),
      ].join("\n")
    : "Browser evidence pending the exact-HEAD local fixture run.";

  return `# Authenticated route discoverability\n\n<!-- contract-sha256:${hash} -->\n\nThis report is generated from \`config/authenticated-route-discoverability.json\`. The contract covers all ${currentContract.routes.length} production pages inside the authenticated dashboard layout. \`/workspace\` is the authenticated arrival router and is verified once per role as the shell entry.\n\nClassifications are \`global\`, \`context\`, \`profile\`, or \`intentionally inaccessible\`. An authorized page is incomplete unless its visible entry and browser journey from the current shell or contextual origin both exist.\n\n| Route | Guard / capability | Super Admin | Finance Manager | Finance Member | Operations Manager | Operations Member | Dead-end checks |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n${rows.join("\n")}\n\n## Browser evidence\n\n${evidenceSection}\n\n## Known scope\n\n- Public, authentication, invitation, API, and error routes are outside this authenticated dashboard inventory.\n- Direct-denial checks prove authorization only; they are not counted as discoverability evidence.\n- Hosted Supabase, Vercel, email, real IPS data, and production deployment remain unchanged.\n`;
}
