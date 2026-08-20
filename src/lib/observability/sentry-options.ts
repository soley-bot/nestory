import type { ErrorEvent } from "@sentry/nextjs";

type SentryRuntime = "client" | "edge" | "server";

const ROUTE_IDENTIFIERS: Record<string, string> = {
  leases: "leaseId",
  people: "personId",
  properties: "propertyId",
  units: "unitId",
};

const SAFE_TAGS = new Set(["organization_id", "role", "route"]);
const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function buildSentryOptions(runtime: SentryRuntime) {
  void runtime;
  const dsn = process.env.NEXT_PUBLIC_NESTORY_SENTRY_DSN;

  return {
    beforeSend: scrubSentryEvent,
    debug: false,
    dsn,
    enabled: Boolean(dsn),
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    sendDefaultPii: false,
    tracesSampleRate: 0,
  };
}

export function scrubSentryEvent(event: ErrorEvent): ErrorEvent | null {
  const scrubbed: ErrorEvent = { ...event };

  delete scrubbed.contexts;
  delete scrubbed.extra;

  delete scrubbed.message;

  if (scrubbed.exception?.values) {
    scrubbed.exception = {
      ...scrubbed.exception,
      values: scrubbed.exception.values.map((value) => {
        const safe = { ...value };
        delete safe.value;
        return safe;
      }),
    };
  }

  if (scrubbed.breadcrumbs) {
    scrubbed.breadcrumbs = scrubbed.breadcrumbs.map((breadcrumb) => {
      const safe = { ...breadcrumb };
      Reflect.deleteProperty(safe, "data");
      Reflect.deleteProperty(safe, "message");
      return safe;
    });
  }

  if (scrubbed.request) {
    const safeHeaders = Object.fromEntries(
      Object.entries(scrubbed.request.headers ?? {}).filter(
        ([name]) => name.toLowerCase() === "user-agent",
      ),
    );
    scrubbed.request = {
      ...(Object.keys(safeHeaders).length > 0 ? { headers: safeHeaders } : {}),
      ...(scrubbed.request.url
        ? { url: normalizeSentryRoute(scrubbed.request.url) }
        : {}),
    };
  }

  scrubbed.tags = Object.fromEntries(
    Object.entries(scrubbed.tags ?? {}).filter(([name]) => SAFE_TAGS.has(name)),
  );

  scrubbed.user =
    typeof scrubbed.user?.id === "string" ? { id: scrubbed.user.id } : undefined;

  return scrubbed;
}

export function normalizeSentryRoute(input: string) {
  const pathname = routePathname(input);
  const segments = pathname.split("/").filter(Boolean);

  const normalized = segments.map((segment, index) => {
    const parent = segments[index - 1];
    const identifier = parent ? ROUTE_IDENTIFIERS[parent] : undefined;
    return identifier && UUID_SEGMENT.test(segment) ? `[${identifier}]` : segment;
  });

  return `/${normalized.join("/")}`;
}

function routePathname(input: string) {
  try {
    return new URL(input, "https://nestory.invalid").pathname;
  } catch {
    return "/unknown";
  }
}
