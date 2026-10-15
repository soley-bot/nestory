import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { captureException, createSupabaseAdminClient, rpc } = vi.hoisted(() => ({
  captureException: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/db/admin", () => ({
  createSupabaseAdminClient,
}));
vi.mock("@sentry/nextjs", () => ({ captureException }));

import { GET } from "@/app/api/cron/maintenance/route";

describe("maintenance automation cron route", () => {
  beforeEach(() => {
    captureException.mockReset();
    createSupabaseAdminClient.mockReset();
    createSupabaseAdminClient.mockReturnValue({ rpc });
    rpc.mockReset();
    rpc.mockResolvedValue({
      data: { delivered: 2, generated: 3 },
      error: null,
    });
    vi.stubEnv("CRON_SECRET", "maintenance-cron-secret-123");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([undefined, "Bearer wrong"])("fails closed without reporting when authorization is %s", async (authorization) => {
    const response = await GET(
      new Request("https://example.test/api/cron/maintenance", {
        headers: authorization ? { authorization } : {},
      }),
    );

    expect(response.status).toBe(401);
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it("runs the idempotent database boundary for a valid Vercel cron request", async () => {
    const response = await GET(
      new Request("https://example.test/api/cron/maintenance", {
        headers: { authorization: "Bearer maintenance-cron-secret-123" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ delivered: 2, generated: 3 });
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("run_maintenance_automation", {
      p_limit: 100,
      p_run_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
    expect(captureException).not.toHaveBeenCalled();
  });

  it("returns an unavailable response when no production secret is configured", async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(
      new Request("https://example.test/api/cron/maintenance"),
    );

    expect(response.status).toBe(503);
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it.each([
    { label: "null", data: null },
    { label: "array", data: [] },
    { label: "missing counter", data: { generated: 0, payload: "private-payload" } },
    { label: "string counter", data: { generated: "1", delivered: 0 } },
    { label: "negative counter", data: { generated: -1, delivered: 0 } },
    { label: "fractional counter", data: { generated: 0, delivered: 0.5 } },
    { label: "unsafe counter", data: { generated: Number.MAX_SAFE_INTEGER + 1, delivered: 0 } },
  ])("reports a malformed successful RPC result: $label", async ({ data }) => {
    rpc.mockResolvedValue({ data, error: null });

    const response = await GET(authorizedRequest());

    await expectSanitizedFailure(response);
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("preserves a valid zero-work result and its database run timestamp", async () => {
    const data = { generated: 0, delivered: 0, run_at: "2030-01-15T09:00:00+00:00" };
    rpc.mockResolvedValue({ data, error: null });

    const response = await GET(authorizedRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(data);
    expect(rpc).toHaveBeenCalledOnce();
    expect(captureException).not.toHaveBeenCalled();
  });

  it("reports a handled RPC failure without capturing its payload or request credentials", async () => {
    rpc.mockResolvedValue({
      data: { payload: "private-payload" },
      error: {
        message: "private-owner maintenance-cron-secret-123",
        details: "private-payload",
        hint: "private-nonce",
      },
    });

    const response = await GET(authorizedRequest());

    await expectSanitizedFailure(response);
    expect(createSupabaseAdminClient).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledOnce();
  });

  it.each([
    new Error("private-payload maintenance-cron-secret-123"),
    { message: "private-payload", nonce: "private-nonce" },
  ])("reports a thrown RPC failure without retrying or retaining the thrown value", async (failure) => {
    rpc.mockRejectedValue(failure);

    const response = await GET(authorizedRequest());

    await expectSanitizedFailure(response);
    expect(createSupabaseAdminClient).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("reports client setup failure before RPC execution without exposing configuration", async () => {
    createSupabaseAdminClient.mockImplementation(() => {
      throw new Error("private-service-key maintenance-cron-secret-123");
    });

    const response = await GET(authorizedRequest());

    await expectSanitizedFailure(response);
    expect(createSupabaseAdminClient).toHaveBeenCalledOnce();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("preserves the generic failure response if reporting itself throws", async () => {
    rpc.mockRejectedValue(new Error("private-payload"));
    captureException.mockImplementation(() => {
      throw new Error("private-telemetry-failure");
    });

    const response = await GET(authorizedRequest());

    await expectSanitizedFailure(response);
    expect(rpc).toHaveBeenCalledOnce();
  });
});

function authorizedRequest() {
  return new Request("https://example.test/api/cron/maintenance?nonce=private-nonce", {
    headers: {
      authorization: "Bearer maintenance-cron-secret-123",
      cookie: "session=private-cookie",
      "x-request-nonce": "private-nonce",
    },
  });
}

async function expectSanitizedFailure(response: Response) {
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: "Maintenance automation failed." });
  expect(captureException).toHaveBeenCalledOnce();
  const [error, context] = captureException.mock.calls[0] as [Error, unknown];
  expect(error).toBeInstanceOf(Error);
  expect(error.message).toBe("Maintenance automation failed.");
  expect(Object.getOwnPropertyNames(error).sort()).toEqual(["message", "stack"]);
  expect(context).toEqual({
    tags: {
      error_code: "maintenance_automation_failed",
      handled: "true",
      operation: "maintenance_automation",
      route: "/api/cron/maintenance",
    },
  });
  expect(JSON.stringify({ message: error.message, stack: error.stack, context }))
    .not.toMatch(/private-|maintenance-cron-secret-123/);
}
