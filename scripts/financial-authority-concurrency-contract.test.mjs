import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("financial authority concurrency harness contract", () => {
  it("holds transactions until the parent explicitly releases them", () => {
    const source = readFileSync(
      resolve(process.cwd(), "scripts/lib/financial-authority-concurrency.mjs"),
      "utf8",
    );

    expect(source).not.toContain("pg_catalog.pg_sleep");
    expect(source).toContain("release()");
    expect(source).toContain("child.stdin.write(sql)");
    expect(source).toContain("child.stdin.end(releaseSql)");
  });
});
