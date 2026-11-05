import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { measureWorkspaceRead } from "./workspace-performance.server";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NESTORY_PERFORMANCE_SAMPLE_RATE", "");
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(Math, "random").mockReturnValue(0.01);
  vi.spyOn(performance, "now").mockReturnValueOnce(100).mockReturnValue(340);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("workspace read performance", () => {
  it("returns the original result and logs only fixed dimensions and elapsed time", async () => {
    const result = { tenant: "private@example.test", balance: 1250 };
    expect(await measureWorkspaceRead("leases", async () => result)).toBe(result);
    expect(console.info).toHaveBeenCalledExactlyOnceWith(JSON.stringify({
      event: "nestory.workspace_read", workspace: "leases", duration_ms: 240,
      outcome: "success", sampled: true,
    }));
  });

  it("skips fast reads outside the representative sample", async () => {
    vi.mocked(Math.random).mockReturnValue(0.5);
    await measureWorkspaceRead("overview", async () => null);
    expect(console.info).not.toHaveBeenCalled();
  });

  it("retains slow reads without marking them as representative samples", async () => {
    vi.mocked(Math.random).mockReturnValue(0.5);
    vi.mocked(performance.now).mockReset().mockReturnValueOnce(100).mockReturnValue(1200);
    await measureWorkspaceRead("finance", async () => null);
    expect(console.info).toHaveBeenCalledExactlyOnceWith(JSON.stringify({
      event: "nestory.workspace_read", workspace: "finance", duration_ms: 1100,
      outcome: "success", sampled: false,
    }));
  });

  it("retains failures without logging the error or changing its identity", async () => {
    vi.mocked(Math.random).mockReturnValue(0.5);
    const error = new Error("Private invoice and bearer token");
    await expect(measureWorkspaceRead("finance", async () => { throw error; })).rejects.toBe(error);
    expect(console.info).toHaveBeenCalledExactlyOnceWith(JSON.stringify({
      event: "nestory.workspace_read", workspace: "finance", duration_ms: 240,
      outcome: "error", sampled: false,
    }));
  });

  it.each(["0", "development", "test"])("disables logging for %s", async (setting) => {
    if (setting === "0") vi.stubEnv("NESTORY_PERFORMANCE_SAMPLE_RATE", setting);
    else vi.stubEnv("NODE_ENV", setting);
    const read = vi.fn().mockResolvedValue("result");
    expect(await measureWorkspaceRead("overview", read)).toBe("result");
    expect(read).toHaveBeenCalledTimes(1);
    expect(console.info).not.toHaveBeenCalled();
    expect(performance.now).not.toHaveBeenCalled();
  });

  it("allows a complete diagnostic sample without changing application results", async () => {
    vi.stubEnv("NESTORY_PERFORMANCE_SAMPLE_RATE", "1");
    vi.mocked(Math.random).mockReturnValue(0.9);
    await measureWorkspaceRead("overview", async () => 1);
    expect(console.info).toHaveBeenCalledTimes(1);
  });

  it.each(["invalid", "Infinity", "-1", "2"])("uses the bounded default for invalid rate %s", async (setting) => {
    vi.stubEnv("NESTORY_PERFORMANCE_SAMPLE_RATE", setting);
    vi.mocked(Math.random).mockReturnValue(0.5);
    await measureWorkspaceRead("overview", async () => null);
    expect(console.info).not.toHaveBeenCalled();
  });

  it("keeps logger failures from replacing success or the original failure", async () => {
    vi.mocked(console.info).mockImplementation(() => { throw new Error("Log transport failed"); });
    expect(await measureWorkspaceRead("leases", async () => "result")).toBe("result");
    const error = new Error("Read failed");
    await expect(measureWorkspaceRead("leases", async () => { throw error; })).rejects.toBe(error);
  });
});
