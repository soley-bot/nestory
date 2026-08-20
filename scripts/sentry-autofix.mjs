#!/usr/bin/env node

const PROTECTED_TERMS = [
  "supabase",
  "migration",
  "rls",
  "policy",
  "auth",
  "authentication",
  "invite",
  "permission",
  "permissions",
  "role",
  "roles",
  "organization",
  "organizations",
  "branch",
  "branches",
  "rent",
  "rents",
  "invoice",
  "invoices",
  "payment",
  "payments",
  "expense",
  "expenses",
  "balance",
  "balances",
  "owner",
  "owners",
  "statement",
  "statements",
  "deposit",
  "deposits",
  "ledger",
  "ledgers",
  "reversal",
  "reversals",
  "finance",
  "financial",
  "secret",
  "secrets",
  "environment",
  "environments",
  "vercel",
  "sentry",
  "delete",
  "deletes",
  "archive",
  "archives",
  "restore",
  "restores",
];

const protectedPattern = new RegExp(
  `\\b(?:${PROTECTED_TERMS.map(escapeRegExp).join("|")})\\b`,
  "i",
);
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const SAFE_ENVIRONMENTS = new Set(["development", "preview", "production", "unknown"]);
const SAFE_FRAME_PATH = /^[a-z0-9_./@\\-]{1,240}$/i;
const SAFE_FUNCTION = /^[a-z0-9_.$<>-]{1,120}$/i;
const SAFE_SHORT_ID = /^[A-Z0-9][A-Z0-9-]{0,79}$/;
const SAFE_TECHNICAL_TOKEN = /^[a-z0-9_.-]{1,80}$/i;
const UUID_SEGMENT = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

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

  let authorizationOnly;
  for (const issue of issues) {
    const event = await sentryRequest(
      `/api/0/organizations/${encodeURIComponent(sentryOrg())}/issues/${encodeURIComponent(String(issue.id))}/events/latest/`,
    );
    const summary = safeSummary(issue, event);
    if (summary.disposition === "candidate") {
      writeJson(summary);
      return;
    }
    authorizationOnly ??= summary;
  }

  writeJson(authorizationOnly ?? { disposition: "no_candidate" });
}

async function resolveIssue(args) {
  const issueId = args[0];
  const releaseFlag = args[1];
  const releaseSha = args[2];
  if (!/^\d+$/.test(issueId ?? "") || releaseFlag !== "--release" || !/^[0-9a-f]{40}$/.test(releaseSha ?? "")) {
    throw new CliError("resolve requires a numeric issue id and --release with an exact 40-character lowercase SHA.", 2);
  }

  const issuePath = `/api/0/organizations/${encodeURIComponent(sentryOrg())}/issues/${encodeURIComponent(issueId)}/`;
  const issue = await sentryRequest(issuePath);
  if (issue?.project?.slug !== sentryProject()) {
    throw new CliError("Refusing to resolve an issue outside the configured Sentry project.", 2);
  }
  if (issue?.status !== "unresolved") {
    throw new CliError("Refusing to resolve a Sentry issue that is not currently unresolved.", 2);
  }
  const event = await sentryRequest(`${issuePath}events/latest/`);
  const summary = safeSummary(issue, event);
  if (summary.environment !== "production") {
    throw new CliError("Refusing to resolve a non-production Sentry issue.", 2);
  }
  if (summary.disposition !== "candidate") {
    throw new CliError("Refusing to resolve a protected-domain Sentry issue without authorization.", 2);
  }

  await sentryRequest(
    issuePath,
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
  const base = sentryApiBase();
  let response;
  try {
    response = await fetch(`${base}${path}`, {
      ...init,
      signal: AbortSignal.timeout(requestTimeoutMs()),
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

function sentryApiBase() {
  const rawBase = process.env.SENTRY_AUTOFIX_API_BASE || "https://sentry.io";
  let base;
  try {
    base = new URL(rawBase);
  } catch {
    throw new CliError("SENTRY_AUTOFIX_API_BASE must be a valid trusted URL.", 2);
  }

  const trustedSentryHost =
    base.protocol === "https:" && /(^|\.)sentry\.io$/i.test(base.hostname);
  const testLocalhost =
    process.env.NODE_ENV === "test" &&
    base.protocol === "http:" &&
    ["127.0.0.1", "::1", "localhost"].includes(base.hostname);
  if (!trustedSentryHost && !testLocalhost) {
    throw new CliError("Refusing to send the Sentry token to an untrusted API host.", 2);
  }
  return base.toString().replace(/\/$/, "");
}

function requestTimeoutMs() {
  const parsed = Number.parseInt(process.env.SENTRY_AUTOFIX_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 100 && parsed <= 30_000
    ? parsed
    : DEFAULT_REQUEST_TIMEOUT_MS;
}

function safeSummary(issue, event) {
  const exceptions = exceptionValues(event);
  const frames = exceptions
    .flatMap((exception) => exception.stacktrace?.frames ?? [])
    .filter((frame) => frame?.inApp !== false)
    .slice(-10)
    .map((frame) => ({
      ...(safeFramePath(frame.filename) ? { filename: safeFramePath(frame.filename) } : {}),
      ...(safeFunction(frame.function) ? { function: safeFunction(frame.function) } : {}),
    }));
  const protectedText = [
    issue.title,
    issue.culprit,
    ...exceptions.map((exception) => exception.value),
    ...frames.flatMap((frame) => [frame.filename, frame.function]),
  ]
    .filter((value) => typeof value === "string")
    .join(" ");

  return {
    count: safeInteger(issue.count),
    disposition: protectedPattern.test(protectedText) ? "requires_authorization" : "candidate",
    environment: safeEnvironment(event),
    firstSeen: safeTimestamp(issue.firstSeen),
    frames,
    id: /^\d+$/.test(String(issue.id)) ? String(issue.id) : undefined,
    lastSeen: safeTimestamp(issue.lastSeen),
    permalink: safePermalink(issue.permalink),
    release: safeRelease(event?.release),
    shortId: typeof issue.shortId === "string" && SAFE_SHORT_ID.test(issue.shortId)
      ? issue.shortId
      : undefined,
    title: safeTechnicalToken(exceptions[0]?.type) ?? "Error",
    userCount: safeInteger(issue.userCount),
  };
}

function exceptionValues(event) {
  const exceptionEntry = Array.isArray(event?.entries)
    ? event.entries.find((entry) => entry?.type === "exception")
    : undefined;
  return Array.isArray(exceptionEntry?.data?.values) ? exceptionEntry.data.values : [];
}

function safeEnvironment(event) {
  if (typeof event?.environment === "string" && SAFE_ENVIRONMENTS.has(event.environment)) {
    return event.environment;
  }
  const tag = Array.isArray(event?.tags)
    ? event.tags.find((candidate) => candidate?.key === "environment")
    : undefined;
  return typeof tag?.value === "string" && SAFE_ENVIRONMENTS.has(tag.value)
    ? tag.value
    : "unknown";
}

function safeRelease(release) {
  const value = typeof release === "string" ? release : release?.version;
  return typeof value === "string" && /^[0-9a-f]{40}$/.test(value)
    ? value
    : undefined;
}

function safeTechnicalToken(value) {
  return typeof value === "string" && SAFE_TECHNICAL_TOKEN.test(value)
    ? value
    : undefined;
}

function safeFramePath(value) {
  if (typeof value !== "string") return undefined;
  const withoutQuery = value.split(/[?#]/, 1)[0];
  if (!SAFE_FRAME_PATH.test(withoutQuery)) return undefined;
  return withoutQuery.replace(UUID_SEGMENT, "[record-id]");
}

function safeFunction(value) {
  return typeof value === "string" && SAFE_FUNCTION.test(value)
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
    if (url.protocol !== "https:" || !/(^|\.)sentry\.io$/i.test(url.hostname)) {
      return undefined;
    }
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
