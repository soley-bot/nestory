import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/db/admin", () => ({
  createSupabaseAdminClient: () => ({ rpc }),
}));

import { GET } from "@/app/api/cron/maintenance/route";

describe("maintenance automation cron route", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2035-02-14T09:00:00.000Z"));
    rpc.mockReset();
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
  });
});
