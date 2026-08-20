#!/usr/bin/env node

const PROTECTED_TERMS = [
  "supabase",
  "migration",
  "rls",
  "policy",
  "auth",
  "invite",
  "permission",
  "role",
  "organization",
  "branch",
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
  "secret",
  "environment",
  "vercel",
  "sentry",
  "delete",
  "archive",
  "restore",
];

const protectedPattern = new RegExp(
  `\\b(?:${PROTECTED_TERMS.map(escapeRegExp).join("|")})\\b`,
  "i",
);

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
    project: process.env.SENTRY_PROJECT,
    query: "is:unresolved",
    sort: "recommended",
  });
  const issues = await sentryRequest(
    `/api/0/organizations/${encodeURIComponent(process.env.SENTRY_ORG)}/issues/?${query}`,
  );
  if (!Array.isArray(issues) || issues.length === 0) {
    writeJson({ disposition: "no_candidate" });
    return;
  }

  const issue = issues[0];
  const event = await sentryRequest(
    `/api/0/issues/${encodeURIComponent(String(issue.id))}/events/latest/`,
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
    `/api/0/organizations/${encodeURIComponent(process.env.SENTRY_ORG)}/issues/${encodeURIComponent(issueId)}/`,
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
  for (const name of ["SENTRY_AUTOFIX_TOKEN", "SENTRY_ORG", "SENTRY_PROJECT"]) {
    if (!process.env[name]?.trim()) {
      throw new CliError(`${name} is required.`, 2);
    }
  }
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
  const frames = exceptions
    .flatMap((exception) => exception.stacktrace?.frames ?? [])
    .filter((frame) => frame?.inApp !== false)
    .slice(-10)
    .map((frame) => ({
      ...(typeof frame.filename === "string" ? { filename: frame.filename } : {}),
      ...(typeof frame.function === "string" ? { function: frame.function } : {}),
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
    culprit: safeText(issue.culprit),
    disposition: protectedPattern.test(protectedText) ? "requires_authorization" : "candidate",
    environment: safeEnvironment(event),
    firstSeen: safeTimestamp(issue.firstSeen),
    frames,
    id: String(issue.id),
    lastSeen: safeTimestamp(issue.lastSeen),
    permalink: safePermalink(issue.permalink),
    release: safeRelease(event?.release),
    shortId: safeText(issue.shortId),
    title: safeText(issue.title),
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
  if (typeof event?.environment === "string") return event.environment;
  const tag = Array.isArray(event?.tags)
    ? event.tags.find((candidate) => candidate?.key === "environment")
    : undefined;
  return safeText(tag?.value);
}

function safeRelease(release) {
  if (typeof release === "string") return safeText(release);
  return safeText(release?.version);
}

function safeText(value) {
  return typeof value === "string" ? value.slice(0, 500) : undefined;
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
    return url.protocol === "https:" ? url.toString() : undefined;
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
