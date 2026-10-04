import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, captureException } = vi.hoisted(() => ({ rpc: vi.fn(), captureException: vi.fn() }));

vi.mock("@sentry/nextjs", () => ({ captureException }));

vi.mock("@/lib/db/admin", () => ({
  createSupabaseAdminClient: () => ({ rpc }),
}));

import { GET } from "@/app/api/cron/maintenance/route";

describe("maintenance automation cron route", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2035-02-14T09:00:00.000Z"));
    rpc.mockReset();
    captureException.mockReset();
    rpc.mockResolvedValue({
      data: { delivered: 2, generated: 3 },
      error: null,
    });
    process.env.CRON_SECRET = "maintenance-cron-secret-123";
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.CRON_SECRET;
  });

  it("fails closed before touching the database when the bearer secret is wrong", async () => {
    const response = await GET(
      new Request("https://example.test/api/cron/maintenance", {
        headers: { authorization: "Bearer wrong" },
      }),
    );

    expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it("passes the scheduler clock to the idempotent database boundary", async () => {
    const response = await GET(
      new Request("https://example.test/api/cron/maintenance", {
        headers: { authorization: "Bearer maintenance-cron-secret-123" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ delivered: 2, generated: 3 });
    expect(rpc).toHaveBeenCalledOnce();
    expect(captureException).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("run_maintenance_automation", {
      p_limit: 100,
      p_run_at: "2035-02-14T09:00:00.000Z",
    });
  });

  it("returns a retryable failure without exposing database details", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "private database error" } });
    const response = await GET(
      new Request("https://example.test/api/cron/maintenance", {
        headers: { authorization: "Bearer maintenance-cron-secret-123" },
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Maintenance automation failed." });
  });

  it("returns an unavailable response when no production secret is configured", async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(
      new Request("https://example.test/api/cron/maintenance"),
    );

    expect(response.status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it("captures handled RPC failure once without sending its error or data", async () => {
    const privateError = {
      message: "synthetic private customer invoice",
      details: "private RPC detail",
      hint: "private backend hint",
      code: "private_code",
    };
    rpc.mockResolvedValue({ error: privateError, data: { secret: "private RPC payload" } });
    const response = await GET(new Request("https://example.test/api/cron/maintenance", {
      headers: { authorization: "Bearer maintenance-cron-secret-123" },
    }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Maintenance automation failed." });
    expect(rpc).toHaveBeenCalledOnce();
    expect(captureException).toHaveBeenCalledOnce();
    const [captured, context] = captureException.mock.calls[0];
    expect(captured).toBeInstanceOf(Error);
    expect(captured.message).toBe("Maintenance automation RPC failed.");
    expect(captured).not.toHaveProperty("cause");
    expect(Object.keys(captured)).toEqual([]);
    expect(context).toEqual({ tags: {
      error_code: "maintenance_automation_rpc_failed",
      handled: "true",
      operation: "maintenance_automation",
      route: "/api/cron/maintenance",
    } });
    expect(`${captured.stack} ${JSON.stringify(context)}`).not.toMatch(/synthetic private|private RPC|private backend|private_code|maintenance-cron-secret-123/);
  });
});
