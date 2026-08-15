import assert from "node:assert/strict";
import test from "node:test";

import { cleanupPaidCostEvidenceOrphans } from "./cleanup-paid-cost-storage-orphans-core.mjs";

const orphan = {
  organization_id: "00000000-0000-4000-8000-000000000001",
  storage_path:
    "00000000-0000-4000-8000-000000000001/paid-cost-evidence/" + "a".repeat(64),
};

test("dry run inventories aged orphans without claiming or removing them", async () => {
  const harness = createHarness();
  const result = await cleanupPaidCostEvidenceOrphans({
    apply: false,
    client: harness.client,
    graceSeconds: 86_400,
  });

  assert.deepEqual(result, {
    candidates: 1,
    claimed: 0,
    failed: 0,
    removed: 0,
    skipped: 0,
  });
  assert.deepEqual(harness.calls, [
    ["rpc", "list_paid_cost_evidence_orphans", { p_grace_seconds: 86_400 }],
  ]);
});

test("apply claims, removes through Storage API, and releases the claim", async () => {
  const harness = createHarness();
  const result = await cleanupPaidCostEvidenceOrphans({
    apply: true,
    client: harness.client,
  });

  assert.equal(result.removed, 1);
  assert.deepEqual(harness.calls.map((call) => call.slice(0, 2)), [
    ["rpc", "list_paid_cost_evidence_orphans"],
    ["rpc", "begin_paid_cost_evidence_cleanup"],
    ["remove", orphan.storage_path],
    ["rpc", "finish_paid_cost_evidence_cleanup"],
  ]);
});

test("a refused claim is skipped without touching Storage", async () => {
  const harness = createHarness({ claim: false });
  const result = await cleanupPaidCostEvidenceOrphans({
    apply: true,
    client: harness.client,
  });

  assert.equal(result.skipped, 1);
  assert.equal(result.removed, 0);
  assert.equal(harness.calls.some(([kind]) => kind === "remove"), false);
});

test("a Storage failure still releases the cleanup claim", async () => {
  const harness = createHarness({ removeError: "storage unavailable" });
  const errors = [];
  const result = await cleanupPaidCostEvidenceOrphans({
    apply: true,
    client: harness.client,
    onError: (error) => errors.push(error),
  });

  assert.equal(result.failed, 1);
  assert.equal(result.removed, 0);
  assert.equal(
    harness.calls.at(-1)[1],
    "finish_paid_cost_evidence_cleanup",
  );
  assert.deepEqual(errors, [
    { message: "storage unavailable", stage: "storage-remove" },
  ]);
});

function createHarness({ claim = true, removeError = null } = {}) {
  const calls = [];
  const client = {
    rpc: async (name, args) => {
      calls.push(["rpc", name, args]);
      if (name === "list_paid_cost_evidence_orphans") {
        return { data: [orphan], error: null };
      }
      if (name === "begin_paid_cost_evidence_cleanup") {
        return { data: claim, error: null };
      }
      return { data: true, error: null };
    },
    storage: {
      from: () => ({
        remove: async ([path]) => {
          calls.push(["remove", path]);
          return {
            data: removeError ? null : [{ name: path }],
            error: removeError ? { message: removeError } : null,
          };
        },
      }),
    },
  };

  return { calls, client };
}
