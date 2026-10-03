import { pathToFileURL } from "node:url";

export async function runMaintenanceAutomation({
  baseUrl,
  secret,
  fetchImpl = fetch,
  timeoutMs = 30_000,
}) {
  const normalizedBaseUrl = requiredBaseUrl(baseUrl);
  if (typeof secret !== "string" || secret.length < 16) {
    throw new Error("CRON_SECRET must contain at least 16 characters.");
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) {
    throw new Error("Maintenance automation timeout must be between 1 and 120000 milliseconds.");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response;
    try {
      response = await fetchImpl(
        new URL("/api/cron/maintenance", normalizedBaseUrl),
        {
          headers: { authorization: `Bearer ${secret}` },
          redirect: "error",
          signal: controller.signal,
        },
      );
    } catch {
      throw new Error(controller.signal.aborted
        ? "Maintenance automation timed out; outcome is unknown."
        : "Maintenance automation request failed; outcome is unknown.");
    }
    if (!response.ok) {
      throw new Error(`Maintenance automation returned HTTP ${response.status}.`);
    }
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error(controller.signal.aborted
        ? "Maintenance automation timed out; outcome is unknown."
        : "Maintenance automation returned an invalid result.");
    }
    if (
      !result ||
      typeof result !== "object" ||
      !Number.isSafeInteger(result.generated) || result.generated < 0 ||
      !Number.isSafeInteger(result.delivered) || result.delivered < 0
    ) {
      throw new Error("Maintenance automation returned an invalid result.");
    }
    return { delivered: result.delivered, generated: result.generated };
  } finally {
    clearTimeout(timer);
  }
}
function requiredBaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("APP_BASE_URL must be an absolute HTTP(S) URL.");
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error("APP_BASE_URL must be an absolute HTTP(S) URL.");
  }
  if (
    parsed.username
    || parsed.password
    || parsed.pathname !== "/"
    || parsed.search
    || parsed.hash
  ) {
    throw new Error("APP_BASE_URL must contain only an origin.");
  }

  const hostname = parsed.hostname
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "");
  const isLocalHost = [
    "localhost",
    "127.0.0.1",
    "::1",
    "host.docker.internal",
  ].includes(hostname);
  if (parsed.protocol !== "https:" && !isLocalHost) {
    throw new Error("APP_BASE_URL must use HTTPS for non-local hosts.");
  }

  return new URL(parsed.origin);
}

async function main() {
  const result = await runMaintenanceAutomation({
    baseUrl: process.env.APP_BASE_URL,
    secret: process.env.CRON_SECRET,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Maintenance automation failed."}\n`);
    process.exitCode = 1;
  });
}
