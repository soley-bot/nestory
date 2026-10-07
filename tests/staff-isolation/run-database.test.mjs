import { afterEach, describe, expect, it, vi } from "vitest";

const originalExitCode = process.exitCode;
afterEach(() => {
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
  vi.resetModules();
  vi.doUnmock("node:child_process");
  vi.doUnmock("node:fs");
  vi.doUnmock("node:os");
});

describe("optional disposable DB runner failure cleanup", () => {
  it.each([
    { owned: true, failure: "none" },
    { owned: false, failure: "none" },
    { owned: true, failure: "inspection" },
    { owned: true, failure: "container removal" },
    { owned: true, failure: "network removal" },
  ])("checks ownership and records cleanup failures: $owned / $failure", async ({ owned, failure }) => {
    let project;
    let container;
    const spawn = vi.fn((command, args) => {
      const ok = (stdout = "") => ({ status: 0, stdout, stderr: "" });
      if (command === "powershell") return ok(String(16 * 1024 ** 3));
      if (command !== "docker") throw new Error("Unexpected subprocess");
      if (args[0] === "exec") return ok("0|0");
      if (args[0] === "network" && args[1] === "create") {
        project = args.at(-1);
        return ok();
      }
      if (args[0] === "network" && args[1] === "inspect") {
        return ok(JSON.stringify([{ Labels: { "nestory.synthetic.project": project } }]));
      }
      if (args[0] === "run") {
        container = args[args.indexOf("--name") + 1];
        // The daemon created the container, but the client timed out before acknowledgement.
        return { status: null, stdout: "", stderr: "", error: new Error("ETIMEDOUT") };
      }
      if (args[0] === "inspect") {
        if (args[1] === container && failure === "inspection") return { status: null, stdout: "", stderr: "" };
        return ok(JSON.stringify([{ Config: {
          Image: "synthetic-postgres",
          Labels: args[1] === container
            ? { "nestory.synthetic.project": owned ? project : "another-project" }
            : { "com.supabase.cli.project": "nestory-restricted-task10-20261002" },
        } }]));
      }
      if (args[0] === "rm") return failure === "container removal" ? { status: null, stdout: "", stderr: "" } : ok();
      if (args[0] === "network" && args[1] === "rm") return failure === "network removal" ? { status: 1, stdout: "", stderr: "network busy" } : ok();
      throw new Error("Unexpected Docker operation");
    });
    const writeFile = vi.fn();
    vi.doMock("node:child_process", () => ({ spawnSync: spawn }));
    vi.doMock("node:fs", () => ({ readFileSync: vi.fn(), writeFileSync: writeFile }));
    vi.doMock("node:os", () => ({ freemem: () => 4 * 1024 ** 3 }));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await import("./run-database.mjs");

    expect(process.exitCode).toBe(1);
    expect(spawn.mock.calls.some(([, args]) => args[0] === "inspect" && args[1] === container)).toBe(true);
    expect(spawn.mock.calls.some(([, args]) => args[0] === "rm" && args[2] === container)).toBe(owned && failure !== "inspection");
    expect(spawn.mock.calls.some(([, args]) => args[0] === "network" && args[1] === "rm" && args[2] === project)).toBe(true);
    for (const [, , options] of spawn.mock.calls) {
      expect(options.timeout).toBeGreaterThan(0);
      expect(options.timeout).toBeLessThanOrEqual(120_000);
    }
    const evidence = JSON.parse(writeFile.mock.calls.at(-1)[1]);
    expect(evidence.errors).toHaveLength(owned && failure === "none" ? 1 : 2);
    if (!owned || failure !== "none") expect(evidence.errors[1]).toContain("Cleanup");
    expect(evidence.finished).toBeTruthy();
  });
});
