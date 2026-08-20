import type {
  ErrorEvent,
  Event,
  init,
} from "@sentry/nextjs";

type SentryOptions = Parameters<typeof init>[0];
type SpanJSON = Parameters<NonNullable<SentryOptions["beforeSendSpan"]>>[0];
type TransactionEvent = Parameters<
  NonNullable<SentryOptions["beforeSendTransaction"]>
>[0];

type SentryRuntime = "client" | "edge" | "server";

const ROUTE_IDENTIFIERS: Record<string, string> = {
  leases: "leaseId",
  people: "personId",
  properties: "propertyId",
  units: "unitId",
};

const SAFE_TAGS = new Set(["organization_id", "role", "route"]);
const SAFE_SPAN_SOURCES = new Set(["component", "custom", "route", "task", "url", "view"]);
const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_TECHNICAL_TOKEN = /^[a-z0-9_.-]{1,80}$/i;

export function buildSentryOptions(runtime: SentryRuntime) {
  const dsn = process.env.NEXT_PUBLIC_NESTORY_SENTRY_DSN;
  const clientRuntime = runtime === "client";

  return {
    beforeSend: scrubSentryEvent,
    beforeSendSpan: scrubSentrySpan,
    beforeSendTransaction: scrubSentryTransaction,
    debug: false,
    dsn,
    enabled: Boolean(dsn),
    environment: clientRuntime
      ? (process.env.NEXT_PUBLIC_VERCEL_ENV ?? "unknown")
      : (process.env.VERCEL_ENV ?? process.env.NODE_ENV),
    release: clientRuntime
      ? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA
      : process.env.VERCEL_GIT_COMMIT_SHA,
    sendDefaultPii: false,
    tracesSampleRate: parseSampleRate(
      clientRuntime
        ? process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE
        : process.env.SENTRY_TRACES_SAMPLE_RATE,
    ),
  };
}

export function scrubSentryEvent(event: ErrorEvent): ErrorEvent | null {
  return scrubEventPayload(event);
}

export function scrubSentryTransaction(event: TransactionEvent): TransactionEvent | null {
  const scrubbed = scrubEventPayload(event);
  scrubbed.transaction = scrubbed.transaction
    ? normalizeTransactionName(scrubbed.transaction)
    : "[transaction]";
  scrubbed.spans = scrubbed.spans?.map(scrubSentrySpan);
  return scrubbed;
}

export function scrubSentrySpan(span: SpanJSON): SpanJSON {
  const scrubbed = { ...span };
  const operation = safeTechnicalToken(span.op) ?? "operation";
  const safeData: SpanJSON["data"] = {};
  const spanOperation = safeTechnicalToken(span.data?.["sentry.op"]);
  const spanOrigin = safeTechnicalToken(span.data?.["sentry.origin"]);
  const spanSource = span.data?.["sentry.source"];
  const sampleRate = span.data?.["sentry.sample_rate"];

  if (spanOperation) safeData["sentry.op"] = spanOperation;
  if (spanOrigin) safeData["sentry.origin"] = spanOrigin;
  if (typeof spanSource === "string" && SAFE_SPAN_SOURCES.has(spanSource)) {
    safeData["sentry.source"] = spanSource;
  }
  if (typeof sampleRate === "number" && sampleRate >= 0 && sampleRate <= 1) {
    safeData["sentry.sample_rate"] = sampleRate;
  }

  scrubbed.data = safeData;
  scrubbed.description = `[${operation}]`;
  Reflect.deleteProperty(scrubbed, "links");
  return scrubbed;
}

function scrubEventPayload<T extends Event>(event: T): T {
  const scrubbed = { ...event } as T;

  delete scrubbed.contexts;
  delete scrubbed.extra;
  delete scrubbed.fingerprint;
  delete scrubbed.logentry;

  if (scrubbed.message) {
    scrubbed.message = "[redacted]";
  }

  if (scrubbed.exception?.values) {
    scrubbed.exception = {
      ...scrubbed.exception,
      values: scrubbed.exception.values.map((value) => {
        const errorType = safeTechnicalToken(value.type) ?? "Error";
        return {
          ...value,
          type: errorType,
          ...(value.value ? { value: "[redacted]" } : {}),
          ...(value.stacktrace
            ? {
                stacktrace: {
                  ...value.stacktrace,
                  frames: value.stacktrace.frames?.map((frame) => {
                    const safeFrame = { ...frame };
                    Reflect.deleteProperty(safeFrame, "vars");
                    return safeFrame;
                  }),
                },
              }
            : {}),
        };
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

function normalizeTransactionName(value: string) {
  return value.startsWith("/") || /^https?:\/\//i.test(value)
    ? normalizeSentryRoute(value)
    : "[transaction]";
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

function parseSampleRate(value: string | undefined) {
  const parsed = value === undefined ? Number.NaN : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 0.1;
}

function safeTechnicalToken(value: unknown) {
  return typeof value === "string" && SAFE_TECHNICAL_TOKEN.test(value)
    ? value
    : undefined;
}
