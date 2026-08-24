import assert from "node:assert/strict";
import test from "node:test";

import { buildScriptInventory } from "./script-inventory-core.mjs";

test("classifies commands, imported support, documented tools, and unreferenced scripts", () => {
  const inventory = buildScriptInventory({
    documents: new Map([
      ["docs/runbook.md", "Run `node scripts/manual-check.mjs` before cutover."],
      ["scripts/command.mjs", 'import "./support.mjs";'],
    ]),
    packageScripts: {
      "test:contracts": "node --test scripts/command.mjs",
    },
    scriptPaths: [
      "scripts/command.mjs",
      "scripts/manual-check.mjs",
      "scripts/old-output.mjs",
      "scripts/support.mjs",
    ],
    workflowTexts: [],
  });

  assert.deepEqual(inventory.entries, [
    {
      classification: "default-gate",
      path: "scripts/command.mjs",
      references: ["package:test:contracts"],
    },
    {
      classification: "documented-operator",
      path: "scripts/manual-check.mjs",
      references: ["docs/runbook.md"],
    },
    {
      classification: "unreferenced",
      path: "scripts/old-output.mjs",
      references: [],
    },
    {
      classification: "reusable-support",
      path: "scripts/support.mjs",
      references: ["scripts/command.mjs"],
    },
  ]);
});

test("treats non-gate package commands and workflow references as active", () => {
  const inventory = buildScriptInventory({
    documents: new Map(),
    packageScripts: {
      "report:generate": "node scripts/report.mjs",
    },
    scriptPaths: ["scripts/ci-check.mjs", "scripts/report.mjs"],
    workflowTexts: [
      [".github/workflows/ci.yml", "run: node scripts/ci-check.mjs"],
    ],
  });

  assert.deepEqual(
    inventory.entries.map(({ classification, path }) => ({
      classification,
      path,
    })),
    [
      { classification: "workflow-gate", path: "scripts/ci-check.mjs" },
      { classification: "specialist-command", path: "scripts/report.mjs" },
    ],
  );
});

test("recognizes Vitest convention files as default-gate coverage", () => {
  const inventory = buildScriptInventory({
    documents: new Map(),
    packageScripts: {},
    scriptPaths: ["scripts/policy.test.mjs"],
    workflowTexts: [],
  });

  assert.equal(inventory.entries[0].classification, "default-gate");
});

test("flags executable Node tests that have no execution gate", () => {
  const inventory = buildScriptInventory({
    documents: new Map([
      [
        "docs/repository/script-inventory.md",
        "| `scripts/safety.node-test.mjs` | documented-operator |",
      ],
    ]),
    packageScripts: {},
    scriptPaths: ["scripts/safety.node-test.mjs"],
    workflowTexts: [],
  });

  assert.deepEqual(inventory.entries, [
    {
      classification: "ungated-test",
      path: "scripts/safety.node-test.mjs",
      references: [],
    },
  ]);
});
