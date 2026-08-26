"use server";

import { Resend } from "resend";
import { z } from "zod";
import { requireWorkspaceContext } from "@/lib/auth/context";
import {
  createPrivilegedStepUpDigest,
  generatePrivilegedStepUpCode,
} from "@/lib/auth/privileged-step-up-crypto";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { createSupabaseServerClient } from "@/lib/db/server";

const GENERIC_ERROR = "We could not complete email verification. Try again.";
const challengeIdSchema = z.uuid();
const codeSchema = z.string().trim().regex(/^\d{8}$/);

export type PrivilegedEmailStepUpState = {
  challengeId?: string;
  message?: string;
  status?: "error" | "success";
};

export type PrivilegedEmailStepUpStatus = {
  canRequestAt: string | null;
  email: string;
  enforcementEnabled: boolean;
  required: boolean;
  verifiedUntil: string | null;
};

type WorkspaceStepUpContext = {
  organizationId: string;
  organizationName: string;
  userId: string;
};

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export async function requestPrivilegedEmailStepUpAction(
  _state: PrivilegedEmailStepUpState,
  _formData: FormData,
): Promise<PrivilegedEmailStepUpState> {
  void _state;
  void _formData;
  let challengeId: string | null = null;
  let admin: AdminClient | null = null;

  try {
    const context = await requireWorkspaceContext();
    const delivery = readDeliveryConfiguration();
    const identity = await getCurrentSessionIdentity(context.userId);
    if (!delivery || !identity) return genericError();

    const code = generatePrivilegedStepUpCode();
    admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc(
      "prepare_privileged_email_step_up",
      {
        p_code_digest: createBoundDigest({
          context,
          purpose: "code",
          secret: delivery.hmacSecret,
          sessionId: identity.sessionId,
          value: code,
        }),
        p_email_digest: createBoundDigest({
          context,
          purpose: "email",
          secret: delivery.hmacSecret,
          sessionId: identity.sessionId,
          value: identity.email.toLowerCase(),
        }),
        p_organization_id: context.organizationId,
        p_session_id: identity.sessionId,
        p_user_id: context.userId,
      },
    );
    challengeId = readChallengeId(data);
    if (error || !challengeId) return genericError();

    const resend = new Resend(delivery.apiKey);
    const sendResult = await resend.emails.send(
      {
        from: delivery.from,
        subject: "Your Nestory privileged verification code",
        text: buildEmailText({
          code,
          organizationName: context.organizationName,
        }),
        to: identity.email,
      },
      { idempotencyKey: `nestory-privileged-step-up-${challengeId}` },
    );
    if (sendResult.error) {
      await markDeliveryFailed(admin, challengeId);
      return genericError();
    }

    const marked = await admin.rpc("mark_privileged_email_step_up_sent", {
      p_challenge_id: challengeId,
    });
    if (marked.error || marked.data !== true) {
      await markDeliveryFailed(admin, challengeId);
      return genericError();
    }

    return {
      challengeId,
      message: "A verification code was sent to your account email.",
      status: "success",
    };
  } catch {
    if (admin && challengeId) await markDeliveryFailed(admin, challengeId);
    return genericError();
  }
}

export async function verifyPrivilegedEmailStepUpAction(
  _state: PrivilegedEmailStepUpState,
  formData: FormData,
): Promise<PrivilegedEmailStepUpState> {
  void _state;
  const challengeId = challengeIdSchema.safeParse(formData.get("challengeId"));
  const code = codeSchema.safeParse(formData.get("code"));
  if (!challengeId.success || !code.success) return genericError();

  try {
    const context = await requireWorkspaceContext();
    const delivery = readDeliveryConfiguration();
    const identity = await getCurrentSessionIdentity(context.userId);
    if (!delivery || !identity) return genericError();

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc(
      "verify_privileged_email_step_up",
      {
        p_challenge_id: challengeId.data,
        p_code_digest: createBoundDigest({
          context,
          purpose: "code",
          secret: delivery.hmacSecret,
          sessionId: identity.sessionId,
          value: code.data,
        }),
        p_email_digest: createBoundDigest({
          context,
          purpose: "email",
          secret: delivery.hmacSecret,
          sessionId: identity.sessionId,
          value: identity.email.toLowerCase(),
        }),
        p_organization_id: context.organizationId,
        p_session_id: identity.sessionId,
        p_user_id: context.userId,
      },
    );
    if (error || data !== true) return genericError();

    return {
      message: "Privileged email verification is active for this session.",
      status: "success",
    };
  } catch {
    return genericError();
  }
}

export async function getPrivilegedEmailStepUpStatus(): Promise<PrivilegedEmailStepUpStatus | null> {
  try {
    const context = await requireWorkspaceContext();
    const identity = await getCurrentSessionIdentity(context.userId);
    if (!identity) return null;
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc(
      "get_privileged_email_step_up_status",
      {
        p_organization_id: context.organizationId,
        p_session_id: identity.sessionId,
        p_user_id: context.userId,
      },
    );
    return error ? null : readStatus(data, identity.email);
  } catch {
    return null;
  }
}

async function getCurrentSessionIdentity(expectedUserId: string) {
  const supabase = await createSupabaseServerClient();
  const [claimsResult, userResult] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.auth.getUser(),
  ]);
  const claims = claimsResult.data?.claims as
    | { session_id?: unknown; sub?: unknown }
    | undefined;
  const user = userResult.data.user;
  if (
    claimsResult.error ||
    userResult.error ||
    !user ||
    user.id !== expectedUserId ||
    claims?.sub !== expectedUserId ||
    typeof claims.session_id !== "string" ||
    !z.uuid().safeParse(claims.session_id).success ||
    typeof user.email !== "string" ||
    !user.email_confirmed_at
  ) {
    return null;
  }
  return { email: user.email, sessionId: claims.session_id };
}

function readDeliveryConfiguration() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.NESTORY_EMAIL_FROM?.trim();
  const hmacSecret = process.env.PRIVILEGED_STEP_UP_HMAC_SECRET?.trim();
  if (!apiKey || !from || !hmacSecret || hmacSecret.length < 32) return null;
  return { apiKey, from, hmacSecret };
}

function createBoundDigest({
  context,
  purpose,
  secret,
  sessionId,
  value,
}: {
  context: WorkspaceStepUpContext;
  purpose: "code" | "email";
  secret: string;
  sessionId: string;
  value: string;
}) {
  return createPrivilegedStepUpDigest({
    organizationId: context.organizationId,
    purpose,
    secret,
    sessionId,
    userId: context.userId,
    value,
  });
}

function readChallengeId(data: unknown) {
  const row = Array.isArray(data) ? data[0] : null;
  if (!isRecord(row)) return null;
  return typeof row.challenge_id === "string" &&
    challengeIdSchema.safeParse(row.challenge_id).success
    ? row.challenge_id
    : null;
}

function readStatus(
  data: unknown,
  email: string,
): PrivilegedEmailStepUpStatus | null {
  if (!isRecord(data)) return null;
  if (
    typeof data.required !== "boolean" ||
    typeof data.enforcementEnabled !== "boolean"
  ) {
    return null;
  }
  return {
    canRequestAt: readNullableDate(data.canRequestAt),
    email,
    enforcementEnabled: data.enforcementEnabled,
    required: data.required,
    verifiedUntil: readNullableDate(data.verifiedUntil),
  };
}

function readNullableDate(value: unknown) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value))
    ? value
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function markDeliveryFailed(admin: AdminClient, challengeId: string) {
  try {
    await admin.rpc("mark_privileged_email_step_up_failed", {
      p_challenge_id: challengeId,
    });
  } catch {
    // Delivery already failed; never expose provider or database detail.
  }
}

function buildEmailText({
  code,
  organizationName,
}: {
  code: string;
  organizationName: string;
}) {
  return [
    `Use ${code} to verify a privileged action in ${organizationName}.`,
    "The code expires in 10 minutes and can be used once.",
    "If you did not request this code, you can ignore this email.",
  ].join("\n\n");
}

function genericError(): PrivilegedEmailStepUpState {
  return { message: GENERIC_ERROR, status: "error" };
}
