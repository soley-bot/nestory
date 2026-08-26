import { createHmac, randomInt } from "node:crypto";

type PrivilegedStepUpDigestInput = {
  organizationId: string;
  purpose: "code" | "email";
  secret: string;
  sessionId: string;
  userId: string;
  value: string;
};

export function generatePrivilegedStepUpCode() {
  return randomInt(0, 100_000_000).toString().padStart(8, "0");
}

export function createPrivilegedStepUpDigest({
  organizationId,
  purpose,
  secret,
  sessionId,
  userId,
  value,
}: PrivilegedStepUpDigestInput) {
  return createHmac("sha256", secret)
    .update(
      [
        "nestory-privileged-email-step-up-v1",
        purpose,
        organizationId,
        userId,
        sessionId,
        value,
      ].join("\u0000"),
      "utf8",
    )
    .digest("hex");
}
