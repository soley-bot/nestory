#!/usr/bin/env node

const PROTECTED_PREFIXES = [
  "supabase",
  "migration",
  "rls",
  "policy",
  "auth",
  "invite",
  "permission",
  "role",
  "access",
  "setting",
  "member",
  "team",
  "staff",
  "admin",
  "workspace",
  "user",
  "organization",
  "branch",
  "finance",
  "financial",
  "report",
  "cash",
  "amount",
  "currency",
  "rent",
  "invoice",
  "payment",
  "expense",
  "balance",
  "owner",
  "statement",
  "deposit",
  "ledger",
  "reversal",
  "lease",
  "tenant",
  "property",
  "unit",
  "people",
  "person",
  "document",
  "storage",
  "secret",
  "environment",
  "vercel",
  "sentry",
  "delete",
  "archive",
  "restore",
];

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "next") {
    requireCredentials();
    await nextIssue(args);
    return;
  }
  if (command === "resolve") {
    requireCredentials();
    await resolveIssue(args);
    return;
  }
  throw new CliError("Usage: sentry-autofix <next [--dry-run] | resolve <issue-id> --release <sha>>", 2);
}

async function nextIssue(args) {
  if (args.some((argument) => argument !== "--dry-run")) {
    throw new CliError("Usage: sentry-autofix next [--dry-run]", 2);
  }

  const query = new URLSearchParams({
    environment: "production",
    limit: "10",
    query: "is:unresolved",
    sort: "recommended",
  });
  const issues = await sentryRequest(
    `/api/0/projects/${encodeURIComponent(sentryOrg())}/${encodeURIComponent(sentryProject())}/issues/?${query}`,
  );
  if (!Array.isArray(issues) || issues.length === 0) {
    writeJson({ disposition: "no_candidate" });
    return;
  }

  const issue = issues[0];
  const event = await sentryRequest(
    `/api/0/organizations/${encodeURIComponent(sentryOrg())}/issues/${encodeURIComponent(String(issue.id))}/events/latest/`,
  );
  const summary = safeSummary(issue, event);
  writeJson(summary);
}

async function resolveIssue(args) {
  const issueId = args[0];
  const releaseFlag = args[1];
  const releaseSha = args[2];
  if (!/^\d+$/.test(issueId ?? "") || releaseFlag !== "--release" || !/^[0-9a-f]{40}$/.test(releaseSha ?? "")) {
    throw new CliError("resolve requires a numeric issue id and --release with an exact 40-character lowercase SHA.", 2);
  }

  await sentryRequest(
    `/api/0/organizations/${encodeURIComponent(sentryOrg())}/issues/${encodeURIComponent(issueId)}/`,
    {
      body: JSON.stringify({
        status: "resolved",
        statusDetails: { inRelease: releaseSha },
      }),
      method: "PUT",
    },
  );
  writeJson({ id: issueId, release: releaseSha, status: "resolved" });
}

function requireCredentials() {
  if (!process.env.SENTRY_AUTOFIX_TOKEN?.trim()) {
    throw new CliError("SENTRY_AUTOFIX_TOKEN is required.", 2);
  }
  if (!sentryOrg()) {
    throw new CliError("NESTORY_SENTRY_ORG is required.", 2);
  }
  if (!sentryProject()) {
    throw new CliError("NESTORY_SENTRY_PROJECT is required.", 2);
  }
}

function sentryOrg() {
  return process.env.NESTORY_SENTRY_ORG?.trim() || process.env.SENTRY_ORG?.trim();
}

function sentryProject() {
  return process.env.NESTORY_SENTRY_PROJECT?.trim() || process.env.SENTRY_PROJECT?.trim();
}

async function sentryRequest(path, init = {}) {
  const base = (process.env.SENTRY_AUTOFIX_API_BASE || "https://sentry.io").replace(/\/$/, "");
  let response;
  try {
    response = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${process.env.SENTRY_AUTOFIX_TOKEN}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
    });
  } catch {
    throw new CliError("Unable to reach the Sentry API.", 1);
  }
  if (!response.ok) {
    throw new CliError(`Sentry API request failed with status ${response.status}.`, 1);
  }
  return response.json();
}

function safeSummary(issue, event) {
  const exceptions = exceptionValues(event);
  const rawFrames = exceptions
    .flatMap((exception) => exception.stacktrace?.frames ?? [])
    .filter((frame) => frame?.inApp !== false)
    .slice(-10);
  const frames = rawFrames
    .map((frame) => ({ filename: safeSourcePath(frame.filename) }))
    .filter((frame) => frame.filename !== undefined);
  const protectedText = [
    issue.title,
    issue.culprit,
    ...exceptions.map((exception) => exception.value),
    ...rawFrames.flatMap((frame) => [frame.filename, frame.function]),
  ]
    .filter((value) => typeof value === "string")
    .join(" ");

  return {
    count: safeInteger(issue.count),
    disposition: containsProtectedDomain(protectedText)
      ? "requires_authorization"
      : "candidate",
    firstSeen: safeTimestamp(issue.firstSeen),
    frames,
    id: String(issue.id),
    lastSeen: safeTimestamp(issue.lastSeen),
    permalink: safePermalink(issue.permalink),
    shortId: safeShortId(issue.shortId),
    userCount: safeInteger(issue.userCount),
  };
}

function exceptionValues(event) {
  const exceptionEntry = Array.isArray(event?.entries)
    ? event.entries.find((entry) => entry?.type === "exception")
    : undefined;
  return Array.isArray(exceptionEntry?.data?.values) ? exceptionEntry.data.values : [];
}

function containsProtectedDomain(value) {
  const tokens = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  return tokens.some((token) =>
    PROTECTED_PREFIXES.some((prefix) => token.startsWith(prefix)),
  );
}

function safeSourcePath(value) {
  if (typeof value !== "string") return undefined;
  const normalized = value.replaceAll("\\", "/");
  return /^(?:src|app|scripts)\/[A-Za-z0-9_@./()[\]-]{1,300}$/.test(normalized)
    ? normalized
    : undefined;
}

function safeShortId(value) {
  return typeof value === "string" && /^[A-Z0-9_-]{1,64}$/i.test(value)
    ? value
    : undefined;
}

function safeInteger(value) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function safeTimestamp(value) {
  if (typeof value !== "string") return undefined;
  return Number.isNaN(Date.parse(value)) ? undefined : value;
}

function safePermalink(value) {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return undefined;
    url.hash = "";
    url.search = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

class CliError extends Error {
  constructor(message, exitCode) {
    super(message);
    this.exitCode = exitCode;
  }
}

main().catch((error) => {
  const message = error instanceof CliError ? error.message : "Sentry autofix request failed.";
  process.stderr.write(`${message}\n`);
  process.exitCode = error instanceof CliError ? error.exitCode : 1;
});
