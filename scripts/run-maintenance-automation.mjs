import { pathToFileURL } from "node:url";

export async function runMaintenanceAutomation({
  baseUrl,
  secret,
  fetchImpl = fetch,
}) {
  const normalizedBaseUrl = requiredBaseUrl(baseUrl);
  if (typeof secret !== "string" || secret.length < 16) {
    throw new Error("CRON_SECRET must contain at least 16 characters.");
  }

  const response = await fetchImpl(
    new URL("/api/cron/maintenance", normalizedBaseUrl),
    { headers: { authorization: `Bearer ${secret}` } },
  );
  if (!response.ok) {
    throw new Error(`Maintenance automation returned HTTP ${response.status}.`);
  }

  const result = await response.json();
  if (
    !result ||
    typeof result !== "object" ||
    !Number.isInteger(result.generated) ||
    !Number.isInteger(result.delivered)
  ) {
    throw new Error("Maintenance automation returned an invalid result.");
  }
  return { delivered: result.delivered, generated: result.generated };
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
  return parsed;
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
