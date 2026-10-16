import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { captureException, createSupabaseAdminClient, rpc } = vi.hoisted(() => ({
  captureException: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/db/admin", () => ({ createSupabaseAdminClient }));
vi.mock("@sentry/nextjs", () => ({ captureException }));

import { GET } from "@/app/api/cron/maintenance/route";

const RUN_ID = "f04b0655-7b7b-4207-b65b-c603e82eec19";
const OTHER_RUN_ID = "df4cbd55-b54a-4731-90b1-6a280061b942";
const RUN_AT = "2030-01-15T09:00:00+00:00";
const FINISHED_AT = "2030-01-15T09:00:01+00:00";

function registered(runId = RUN_ID) {
  return {
    run_id: runId, status: "registered", run_at: RUN_AT, registered_at: RUN_AT,
    finished_at: null, generated: null, delivered: null, failure_code: null,
  };
}

function succeeded(runId = RUN_ID) {
  return {
    ...registered(runId), status: "succeeded", finished_at: FINISHED_AT,
    generated: 3, delivered: 2,
  };
}

function failed() {
  return {
    ...registered(), status: "failed", finished_at: FINISHED_AT,
    failure_code: "maintenance_execution_failed",
  };
}

function successResponse(runId = RUN_ID, generated = 3, delivered = 2) {
  return {
    run_id: runId, outcome: "succeeded", generated, delivered,
    run_at: RUN_AT, completed_at: FINISHED_AT,
  };
}

describe("maintenance automation cron route", () => {
  beforeEach(() => {
    captureException.mockReset();
    createSupabaseAdminClient.mockReset();
    createSupabaseAdminClient.mockReturnValue({ rpc });
    rpc.mockReset();
    rpc.mockImplementation(async (name, args) => ({
      data: name === "begin_maintenance_automation_run"
        ? { ...registered(args.p_run_id), created: true }
        : succeeded(args.p_run_id),
      error: null,
    }));
    vi.stubEnv("CRON_SECRET", "maintenance-cron-secret-123");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([undefined, "Bearer wrong"])("fails closed before run ID validation when authorization is %s", async (authorization) => {
    const response = await GET(new Request("https://example.test/api/cron/maintenance", {
      headers: {
        ...(authorization ? { authorization } : {}),
        "x-maintenance-run-id": "private-invalid-id",
      },
    }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it("returns unavailable when no secret is configured", async () => {
    delete process.env.CRON_SECRET;
    const response = await GET(authorizedRequest());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Maintenance automation is not configured." });
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it.each(["", "private-invalid-id", `${RUN_ID}-extra`])("rejects invalid run ID %s before database work", async (runId) => {
    const response = await GET(authorizedRequest(runId));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid maintenance run ID." });
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it("registers once before executing once and returns only the success contract", async () => {
    rpc.mockResolvedValueOnce({ data: { ...registered(), created: true }, error: null });
    rpc.mockResolvedValueOnce({
      data: { ...succeeded(), payload: "private-payload", secret: "maintenance-cron-secret-123" },
      error: null,
    });

    const response = await GET(authorizedRequest(RUN_ID.toUpperCase()));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(successResponse());
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenNthCalledWith(1, "begin_maintenance_automation_run", {
      p_run_id: RUN_ID, p_limit: 100,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "execute_maintenance_automation_run", {
      p_run_id: RUN_ID,
    });
    expect(captureException).not.toHaveBeenCalled();
  });

  it("generates a UUID for existing callers without a run header", async () => {
    const response = await GET(authorizedRequest(null));
    const body = await response.json();
    expect(body.run_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(body).toEqual(successResponse(body.run_id));
    expect(rpc).toHaveBeenNthCalledWith(2, "execute_maintenance_automation_run", {
      p_run_id: body.run_id,
    });
  });

  it("preserves a valid zero-work result and database timestamps", async () => {
    rpc.mockResolvedValueOnce({ data: { ...registered(), created: true }, error: null });
    rpc.mockResolvedValueOnce({ data: { ...succeeded(), generated: 0, delivered: 0 }, error: null });
    const response = await GET(authorizedRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(successResponse(RUN_ID, 0, 0));
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("returns an existing success without executing again", async () => {
    rpc.mockResolvedValueOnce({ data: { ...succeeded(), created: false }, error: null });
    const response = await GET(authorizedRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(successResponse());
    expect(rpc).toHaveBeenCalledOnce();
    expect(captureException).not.toHaveBeenCalled();
  });

  it.each([
    { snapshot: registered(), outcome: "unknown" },
    { snapshot: failed(), outcome: "failed" },
  ] as const)("returns an existing $outcome result without executing", async ({ snapshot, outcome }) => {
    rpc.mockResolvedValueOnce({ data: { ...snapshot, created: false }, error: null });
    await expectSanitizedFailure(await GET(authorizedRequest()), outcome);
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("reports failed only for a validated durable execution failure", async () => {
    rpc.mockResolvedValueOnce({ data: { ...registered(), created: true }, error: null });
    rpc.mockResolvedValueOnce({ data: { ...failed(), details: "private-payload" }, error: null });
    await expectSanitizedFailure(await GET(authorizedRequest()), "failed");
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it.each([
    null, [], { ...registered() }, { ...registered(), created: "true" },
    { ...registered(), created: true, run_id: OTHER_RUN_ID },
    { ...registered(), created: true, run_at: "private-timestamp" },
    { ...registered(), created: true, generated: 0 },
    { ...succeeded(), created: true },
    { ...failed(), created: true },
  ])("does not execute an invalid registration %#", async (data) => {
    rpc.mockResolvedValueOnce({ data, error: null });
    await expectSanitizedFailure(await GET(authorizedRequest()));
    expect(rpc).toHaveBeenCalledOnce();
  });

  it.each([
    null, [], { ...succeeded(), run_id: OTHER_RUN_ID },
    { ...succeeded(), generated: undefined }, { ...succeeded(), generated: "1" },
    { ...succeeded(), generated: -1 }, { ...succeeded(), delivered: 0.5 },
    { ...succeeded(), generated: Number.MAX_SAFE_INTEGER + 1 },
    { ...succeeded(), run_at: "private-payload" },
    { ...succeeded(), finished_at: null },
    { ...succeeded(), finished_at: "2030-01-15T08:00:00Z" },
    { ...succeeded(), failure_code: "maintenance_execution_failed" },
    { ...failed(), failure_code: "private-error" },
    { ...failed(), generated: 0 },
    registered(),
  ])("treats malformed or unfinished execution result %# as unknown", async (data) => {
    rpc.mockResolvedValueOnce({ data: { ...registered(), created: true }, error: null });
    rpc.mockResolvedValueOnce({ data, error: null });
    await expectSanitizedFailure(await GET(authorizedRequest()));
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it.each(["begin", "execute"])("treats a returned %s RPC error as unknown even with failed-looking data", async (stage) => {
    if (stage === "execute") {
      rpc.mockResolvedValueOnce({ data: { ...registered(), created: true }, error: null });
    }
    rpc.mockResolvedValueOnce({
      data: { ...failed(), created: false },
      error: {
        message: "private-owner maintenance-cron-secret-123",
        details: "private-payload", hint: "private-nonce",
      },
    });
    await expectSanitizedFailure(await GET(authorizedRequest()));
    expect(rpc).toHaveBeenCalledTimes(stage === "begin" ? 1 : 2);
  });

  it.each(["begin", "execute"])("treats a thrown %s RPC error as unknown without retrying", async (stage) => {
    if (stage === "execute") {
      rpc.mockResolvedValueOnce({ data: { ...registered(), created: true }, error: null });
    }
    rpc.mockRejectedValueOnce({ message: "private-payload maintenance-cron-secret-123" });
    await expectSanitizedFailure(await GET(authorizedRequest()));
    expect(rpc).toHaveBeenCalledTimes(stage === "begin" ? 1 : 2);
  });

  it("retains a committed success when its execution response was lost", async () => {
    rpc.mockResolvedValueOnce({ data: { ...registered(), created: true }, error: null });
    rpc.mockRejectedValueOnce(new Error("private-response-lost-after-commit"));
    rpc.mockResolvedValueOnce({ data: { ...succeeded(), created: false }, error: null });

    await expectSanitizedFailure(await GET(authorizedRequest()));
    const response = await GET(authorizedRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(successResponse());
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "begin_maintenance_automation_run",
      "execute_maintenance_automation_run",
      "begin_maintenance_automation_run",
    ]);
    expect(captureException).toHaveBeenCalledOnce();
  });

  it("reports setup failure with a safe run ID before RPC execution", async () => {
    createSupabaseAdminClient.mockImplementation(() => {
      throw new Error("private-service-key maintenance-cron-secret-123");
    });
    await expectSanitizedFailure(await GET(authorizedRequest()));
    expect(createSupabaseAdminClient).toHaveBeenCalledOnce();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("preserves unknown outcome if reporting throws", async () => {
    rpc.mockRejectedValueOnce(new Error("private-payload"));
    captureException.mockImplementation(() => { throw new Error("private-telemetry-failure"); });
    await expectSanitizedFailure(await GET(authorizedRequest()));
    expect(rpc).toHaveBeenCalledOnce();
  });
});

function authorizedRequest(runId: string | null = RUN_ID) {
  return new Request("https://example.test/api/cron/maintenance?nonce=private-nonce", {
    headers: {
      authorization: "Bearer maintenance-cron-secret-123",
      cookie: "session=private-cookie",
      "x-request-nonce": "private-nonce",
      ...(runId === null ? {} : { "x-maintenance-run-id": runId }),
    },
  });
}

async function expectSanitizedFailure(response: Response, outcome = "unknown") {
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({
    error: "Maintenance automation failed.", run_id: RUN_ID, outcome,
  });
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
