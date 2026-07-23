import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  createRecoveryMarker,
  RECOVERY_MARKER_COOKIE,
  RECOVERY_MARKER_MAX_AGE_SECONDS,
} from "@/lib/auth/recovery-marker";
import { createSupabaseAuthRouteClient } from "@/lib/db/auth-route";

const tokenSchema = z
  .string()
  .min(1)
  .max(16_384)
  .regex(/^[\x21-\x7E]+$/);

const sessionSchema = z
  .object({
    access_token: tokenSchema,
    refresh_token: tokenSchema,
    type: z.string().regex(/^[a-z_]{1,32}$/i).optional(),
  })
  .strict();

const ERROR_MESSAGE = "This email link is invalid or has expired.";

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return errorResponse(403);
  }

  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return errorResponse(415);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400);
  }

  const parsed = sessionSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400);
  }

  const response = NextResponse.json({ ok: true });
  response.headers.set("cache-control", "no-store");

  const supabase = createSupabaseAuthRouteClient(request, response);
  const { data, error } = await supabase.auth.setSession({
    access_token: parsed.data.access_token,
    refresh_token: parsed.data.refresh_token,
  });

  if (error || !data.user) {
    return errorResponse(401);
  }

  if (parsed.data.type === "recovery") {
    response.cookies.set(
      RECOVERY_MARKER_COOKIE,
      createRecoveryMarker(data.user.id),
      {
        httpOnly: true,
        maxAge: RECOVERY_MARKER_MAX_AGE_SECONDS,
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
    );
  }

  return response;
}

function errorResponse(status: number) {
  return NextResponse.json(
    { error: ERROR_MESSAGE },
    {
      headers: { "cache-control": "no-store" },
      status,
    },
  );
}
