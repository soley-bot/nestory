export const BROWSER_SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
  { key: "X-Frame-Options", value: "DENY" },
] as const;

type ContentSecurityPolicyOptions = {
  environment: "development" | "production" | "test";
  nonce: string;
  requestUrl: string;
  sentryDsn?: string;
  supabaseUrl?: string;
};

export function buildContentSecurityPolicy({
  environment,
  nonce,
  requestUrl,
  sentryDsn,
  supabaseUrl,
}: ContentSecurityPolicyOptions) {
  const isDevelopment = environment === "development";
  const supabaseOrigin = readHttpOrigin(supabaseUrl);
  const sentryOrigin = readHttpOrigin(sentryDsn);
  const connectSources = [
    "'self'",
    supabaseOrigin,
    websocketOrigin(supabaseOrigin),
    sentryOrigin,
    ...(isDevelopment
      ? ["ws://127.0.0.1:*", "ws://localhost:*", "http://127.0.0.1:*"]
      : []),
  ].filter(isPresent);
  const imageSources = [
    "'self'",
    "data:",
    "blob:",
    supabaseOrigin,
  ].filter(isPresent);
  const scriptSources = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(isDevelopment ? ["'unsafe-eval'"] : []),
  ];
  const directives = [
    "default-src 'self'",
    `script-src ${scriptSources.join(" ")}`,
    "script-src-attr 'none'",
    `style-src 'self' 'nonce-${nonce}'`,
    // Current Radix, Recharts, and generated React style props require this.
    "style-src-attr 'unsafe-inline'",
    `img-src ${imageSources.join(" ")}`,
    "font-src 'self'",
    `connect-src ${connectSources.join(" ")}`,
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
  ];

  if (requestUrl.startsWith("https://")) {
    directives.push("upgrade-insecure-requests");
  }

  return directives.join("; ");
}

function readHttpOrigin(value?: string) {
  if (!value?.trim()) return null;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

function websocketOrigin(origin: string | null) {
  if (!origin) return null;
  const url = new URL(origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.origin;
}

function isPresent(value: string | null): value is string {
  return value !== null;
}
