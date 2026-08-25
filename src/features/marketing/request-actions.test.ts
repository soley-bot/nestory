import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseAdminClient, headers, rpc } = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  headers: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/db/admin", () => ({ createSupabaseAdminClient }));
vi.mock("next/headers", () => ({ headers }));

import { submitPublicInterestRequest } from "@/features/marketing/request-actions";

describe("submitPublicInterestRequest", () => {
  beforeEach(() => {
    process.env.PUBLIC_INTEREST_RATE_LIMIT_SECRET =
      "test-only-public-interest-secret-32-bytes";
    delete process.env.VERCEL;
    rpc.mockReset();
    headers.mockReset();
    createSupabaseAdminClient.mockReset();
    createSupabaseAdminClient.mockReturnValue({ rpc });
    headers.mockResolvedValue(new Headers());
    rpc.mockResolvedValue({ data: "accepted", error: null });
  });

  it("normalizes and submits a valid request through the atomic limiter RPC", async () => {
    const state = await submitPublicInterestRequest(
      {},
      validFormData({ workEmail: "  MARA@Example.com " }),
    );

    expect(state.status).toBe("success");
    expect(rpc).toHaveBeenCalledWith(
      "submit_public_interest_request_limited",
      expect.objectContaining({
        p_company_name: "Central Property Group",
        p_full_name: "Mara Sok",
        p_message: "Show us the operating record.",
        p_portfolio_size: "101-500",
        p_request_type: "demo",
        p_subject_digest: expect.stringMatching(/^\\x[0-9a-f]{64}$/),
        p_work_email: "mara@example.com",
      }),
    );
  });

  it("returns field errors without touching the database", async () => {
    const state = await submitPublicInterestRequest(
      {},
      validFormData({ workEmail: "not-an-email" }),
    );

    expect(state.status).toBe("error");
    expect(state.fieldErrors?.workEmail?.[0]).toBe("Enter a valid work email.");
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(headers).not.toHaveBeenCalled();
  });

  it("silently accepts honeypot submissions without storing them", async () => {
    const state = await submitPublicInterestRequest(
      {},
      validFormData({ website: "https://spam.example" }),
    );

    expect(state.status).toBe("success");
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(headers).not.toHaveBeenCalled();
  });

  it.each(["duplicate", "limited"])(
    "treats a %s result as the same neutral success",
    async (result) => {
      rpc.mockResolvedValue({ data: result, error: null });

      const state = await submitPublicInterestRequest({}, validFormData());

      expect(state).toEqual({
        message: "Your request is in. We will follow up at your work email.",
        status: "success",
      });
    },
  );

  it("does not expose storage errors to the public caller", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "permission denied for table" },
    });

    const state = await submitPublicInterestRequest({}, validFormData());

    expect(state).toEqual({
      message: "We could not save your request. Please try again.",
      status: "error",
    });
  });

  it("never passes the trusted source address to the database", async () => {
    process.env.VERCEL = "1";
    headers.mockResolvedValue(
      new Headers({ "x-vercel-forwarded-for": "203.0.113.17" }),
    );

    await submitPublicInterestRequest({}, validFormData());

    expect(JSON.stringify(rpc.mock.calls)).not.toContain("203.0.113.17");
  });

  it("fails safely when the production client identity is untrusted", async () => {
    process.env.VERCEL = "1";
    headers.mockResolvedValue(
      new Headers({
        "x-vercel-forwarded-for": "203.0.113.17, 198.51.100.99",
      }),
    );

    const state = await submitPublicInterestRequest({}, validFormData());

    expect(state).toEqual({
      message: "We could not save your request. Please try again.",
      status: "error",
    });
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });
});

function validFormData(overrides: Record<string, string> = {}) {
  const values = {
    companyName: "Central Property Group",
    fullName: "Mara Sok",
    message: "Show us the operating record.",
    portfolioSize: "101-500",
    requestType: "demo",
    website: "",
    workEmail: "mara@example.com",
    ...overrides,
  };
  const formData = new FormData();

  Object.entries(values).forEach(([key, value]) => formData.set(key, value));
  return formData;
}
