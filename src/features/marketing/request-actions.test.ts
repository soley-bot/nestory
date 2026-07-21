import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseAdminClient, insert } = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("@/lib/db/admin", () => ({ createSupabaseAdminClient }));

import { submitPublicInterestRequest } from "@/features/marketing/request-actions";

describe("submitPublicInterestRequest", () => {
  beforeEach(() => {
    insert.mockReset();
    createSupabaseAdminClient.mockReset();
    createSupabaseAdminClient.mockReturnValue({
      from: () => ({ insert }),
    });
    insert.mockResolvedValue({ error: null });
  });

  it("normalizes and stores a valid request through the admin client", async () => {
    const state = await submitPublicInterestRequest(
      {},
      validFormData({ workEmail: "  MARA@Example.com " }),
    );

    expect(state.status).toBe("success");
    expect(insert).toHaveBeenCalledWith({
      company_name: "Central Property Group",
      full_name: "Mara Sok",
      message: "Show us the operating record.",
      portfolio_size: "101-500",
      request_type: "demo",
      work_email: "mara@example.com",
    });
  });

  it("returns field errors without touching the database", async () => {
    const state = await submitPublicInterestRequest(
      {},
      validFormData({ workEmail: "not-an-email" }),
    );

    expect(state.status).toBe("error");
    expect(state.fieldErrors?.workEmail?.[0]).toBe("Enter a valid work email.");
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("silently accepts honeypot submissions without storing them", async () => {
    const state = await submitPublicInterestRequest(
      {},
      validFormData({ website: "https://spam.example" }),
    );

    expect(state.status).toBe("success");
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("treats the daily duplicate constraint as a neutral success", async () => {
    insert.mockResolvedValue({ error: { code: "23505" } });

    const state = await submitPublicInterestRequest({}, validFormData());

    expect(state.status).toBe("success");
  });

  it("does not expose storage errors to the public caller", async () => {
    insert.mockResolvedValue({
      error: { code: "42501", message: "permission denied for table" },
    });

    const state = await submitPublicInterestRequest({}, validFormData());

    expect(state).toEqual({
      message: "We could not save your request. Please try again.",
      status: "error",
    });
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
