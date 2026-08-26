import { createHmac } from "node:crypto";
import { isIP } from "node:net";

type PublicDeploymentContext = {
  nodeEnv: string | undefined;
  vercel: string | undefined;
};

export function getTrustedPublicClientSubject(
  requestHeaders: Headers,
  deployment: PublicDeploymentContext,
) {
  if (deployment.vercel === "1") {
    const candidate = requestHeaders.get("x-vercel-forwarded-for")?.trim() ?? "";
    if (!candidate || candidate.includes(",") || isIP(candidate) === 0) {
      return null;
    }
    return normalizeIp(candidate);
  }

  if (deployment.nodeEnv !== "production") {
    return "local-development";
  }

  return null;
}

export function createPublicInterestRateLimitKey(
  subject: string,
  secret: string,
  now = new Date(),
) {
  const normalizedSecret = secret.trim();
  if (new TextEncoder().encode(normalizedSecret).byteLength < 32) {
    throw new Error(
      "PUBLIC_INTEREST_RATE_LIMIT_SECRET must contain at least 32 bytes.",
    );
  }

  const utcDay = now.toISOString().slice(0, 10);
  const digest = createHmac("sha256", normalizedSecret)
    .update(`public-interest-v1\0${utcDay}\0${subject}`)
    .digest("hex");
  return `\\x${digest}`;
}

function normalizeIp(candidate: string) {
  if (isIP(candidate) === 4) return candidate;
  return new URL(`http://[${candidate}]`).hostname.slice(1, -1).toLowerCase();
}
