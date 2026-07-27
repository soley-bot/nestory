import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("property cash shadow executable", () => {
  it("exposes a runnable command with explicit local-only usage", () => {
    const npmInvocation =
      process.platform === "win32"
        ? {
            command: process.execPath,
            prefix: [
              resolve(
                dirname(process.execPath),
                "node_modules",
                "npm",
                "bin",
                "npm-cli.js",
              ),
            ],
          }
        : { command: "npm", prefix: [] };
    const result = spawnSync(
      npmInvocation.command,
      [
        ...npmInvocation.prefix,
        "run",
        "finance:property-cash-shadow",
        "--",
        "--help",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: process.env,
      },
    );

    expect(result.status).toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      "--organization <uuid>",
    );
  });
});
