import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const RECOVERY_MARKER_COOKIE = "nestory_recovery";
export const RECOVERY_MARKER_MAX_AGE_SECONDS = 10 * 60;

export function createRecoveryMarker(userId: string, now = Date.now()) {
  const expiresAt = now + RECOVERY_MARKER_MAX_AGE_SECONDS * 1000;
  const payload = `${userId}.${expiresAt}.${randomUUID()}`;

  return `${payload}.${sign(payload)}`;
}

export function verifyRecoveryMarker(
  marker: string | undefined,
  userId: string,
  now = Date.now(),
) {
  if (!marker) {
    return false;
  }

  const parts = marker.split(".");
  if (parts.length !== 4) {
    return false;
  }

  const [markerUserId, expiresAtValue, nonce, signature] = parts;
  const expiresAt = Number(expiresAtValue);
  if (
    markerUserId !== userId ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= now ||
    expiresAt > now + RECOVERY_MARKER_MAX_AGE_SECONDS * 1000 ||
    !/^[0-9a-f-]{36}$/i.test(nonce)
  ) {
    return false;
  }

  const payload = `${markerUserId}.${expiresAtValue}.${nonce}`;
  const expected = Buffer.from(sign(payload));
  const received = Buffer.from(signature);

  return expected.length === received.length && timingSafeEqual(expected, received);
}

function sign(payload: string) {
  const secret =
    process.env.NESTORY_AUTH_COOKIE_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret || secret === "replace-with-service-role-key") {
    throw new Error(
      "Missing NESTORY_AUTH_COOKIE_SECRET or SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createHmac("sha256", secret)
    .update(`nestory-password-recovery:${payload}`)
    .digest("base64url");
}
