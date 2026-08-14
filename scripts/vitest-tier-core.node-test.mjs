import assert from "node:assert/strict";
import test from "node:test";

import { classifyVitestFiles } from "./vitest-tier-core.mjs";

const files = [
  "src/domain.test.ts",
  "src/components/screen.test.tsx",
  "scripts/policy.test.mjs",
  ".worktrees/other/src/duplicate.test.ts",
  ".claude/worktrees/other/src/duplicate.test.tsx",
  "node_modules/package/ignored.test.js",
];

const content = new Map([
  ["src/domain.test.ts", "import { test } from 'vitest';"],
  [
    "src/components/screen.test.tsx",
    "/** @vitest-environment jsdom */\nimport { test } from 'vitest';",
  ],
  ["scripts/policy.test.mjs", "import { test } from 'vitest';"],
]);

test("classifies every repository Vitest file into exactly one environment tier", async () => {
  const tiers = await classifyVitestFiles(files, async (path) =>
    content.get(path) ?? "",
  );

  assert.deepEqual(tiers, {
    ignored: [
      ".claude/worktrees/other/src/duplicate.test.tsx",
      ".worktrees/other/src/duplicate.test.ts",
      "node_modules/package/ignored.test.js",
    ],
    ui: ["src/components/screen.test.tsx"],
    unit: ["scripts/policy.test.mjs", "src/domain.test.ts"],
  });
  assert.deepEqual(
    [...tiers.ui, ...tiers.unit].sort(),
    ["scripts/policy.test.mjs", "src/components/screen.test.tsx", "src/domain.test.ts"],
  );
});

test("recognizes both supported jsdom environment comment forms", async () => {
  const tiers = await classifyVitestFiles(
    ["a.test.ts", "b.test.ts"],
    async (path) =>
      path === "a.test.ts"
        ? "// @vitest-environment jsdom"
        : "/**\n * @vitest-environment jsdom\n */",
  );

  assert.deepEqual(tiers.ui, ["a.test.ts", "b.test.ts"]);
  assert.deepEqual(tiers.unit, []);
});
