import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { createSupabaseAuthRouteClient, setSession } = vi.hoisted(() => ({
  createSupabaseAuthRouteClient: vi.fn(),
  setSession: vi.fn(),
}));

vi.mock("@/lib/auth/recovery-marker", () => ({
  createRecoveryMarker: () => "signed-recovery-marker",
  RECOVERY_MARKER_COOKIE: "nestory_recovery",
  RECOVERY_MARKER_MAX_AGE_SECONDS: 600,
}));

vi.mock("@/lib/db/auth-route", () => ({
  createSupabaseAuthRouteClient,
}));

import { POST } from "@/app/auth/session/route";

describe("implicit auth session route", () => {
  beforeEach(() => {
    createSupabaseAuthRouteClient.mockReset();
    setSession.mockReset();
    createSupabaseAuthRouteClient.mockImplementation((_request, response) => ({
      auth: {
        setSession: async (tokens: unknown) => {
          response.cookies.set("sb-session", "created");
          return setSession(tokens);
        },
      },
    }));
    setSession.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
  });

  it("turns same-origin implicit tokens into HttpOnly session cookies", async () => {
    const response = await POST(
      request({
        access_token: "access.jwt",
        refresh_token: "refresh-token",
        type: "invite",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(setSession).toHaveBeenCalledWith({
      access_token: "access.jwt",
      refresh_token: "refresh-token",
    });
    expect(response.cookies.get("sb-session")?.value).toBe("created");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects cross-origin session injection before contacting Supabase", async () => {
    const response = await POST(
      request(
        { access_token: "access.jwt", refresh_token: "refresh-token" },
        "https://evil.example",
      ),
    );

    expect(response.status).toBe(403);
    expect(createSupabaseAuthRouteClient).not.toHaveBeenCalled();
  });

  it("rejects malformed token payloads without echoing them", async () => {
    const response = await POST(
      request({ access_token: "secret-token", refresh_token: "" }),
    );

    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).not.toContain("secret-token");
    expect(createSupabaseAuthRouteClient).not.toHaveBeenCalled();
  });

  it("marks a verified recovery session for the password-update boundary", async () => {
    const response = await POST(
      request({
        access_token: "access.jwt",
        refresh_token: "refresh-token",
        type: "recovery",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain(
      "nestory_recovery=signed-recovery-marker",
    );
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });
});

function request(body: unknown, origin = "http://localhost:3000") {
  return new NextRequest("http://localhost:3000/auth/session", {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      origin,
    },
    method: "POST",
  });
}
