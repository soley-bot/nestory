import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { exchangeCodeForSession, verifyOtp } = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
}));

vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: () => ({
    auth: { exchangeCodeForSession, verifyOtp },
  }),
}));

import { GET as callbackGet } from "@/app/auth/callback/route";
import { GET as confirmGet } from "@/app/auth/confirm/route";

describe("successful auth entry routes", () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset();
    verifyOtp.mockReset();
  });

  it("sends OAuth callback success through the workspace resolver", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const response = await callbackGet(
      new NextRequest("http://localhost:3000/auth/callback?code=valid"),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/workspace",
    );
  });

  it("sends email confirmation success through the workspace resolver", async () => {
    verifyOtp.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const response = await confirmGet(
      new NextRequest(
        "http://localhost:3000/auth/confirm?token_hash=valid&type=signup",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/workspace",
    );
  });
});
