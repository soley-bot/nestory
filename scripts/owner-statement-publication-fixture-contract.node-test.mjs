import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const manifestPath = join(
  process.cwd(),
  "scripts/fixtures/owner-statement-publication.json",
);

test("guarded fixture declares runtime authority and a zero-difference manual oracle", () => {
  assert.equal(
    existsSync(manifestPath),
    true,
    "owner statement publication fixture manifest must exist",
  );
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.equal(
    manifest.runtimeAuthority.statementNumberPattern,
    "^OS-[0-9]{6}-[0-9A-F]{12}$",
  );
  assert.equal(manifest.runtimeAuthority.sha256Pattern, "^[0-9a-f]{64}$");
  assert.deepEqual(manifest.runtimeAuthority.artifactFormats, ["pdf", "xlsx"]);
  assert.equal(manifest.reconciliation.unexplainedDifference, "0.00");
  assert.deepEqual(
    manifest.reconciliation.components.map(({ component }) => component).sort(),
    [
      "ips_due_to_owner",
      "ips_held_owner_cash",
      "owner_due_to_ips",
      "security_deposit_custody",
    ],
  );
  assert.deepEqual(
    manifest.reconciliation.lines.map(({ number }) => number),
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
  );
  assert.deepEqual(
    manifest.reconciliation.lines.map(({ kind, amount, sourceCount }) => ({
      amount,
      kind,
      sourceCount,
    })),
    [
      { amount: "1000.00", kind: "opening", sourceCount: 1 },
      { amount: "0.00", kind: "opening", sourceCount: 1 },
      { amount: "0.00", kind: "opening", sourceCount: 1 },
      { amount: "0.00", kind: "opening", sourceCount: 1 },
      { amount: "-25.00", kind: "movement", sourceCount: 1 },
      { amount: "975.00", kind: "closing", sourceCount: 1 },
      { amount: "0.00", kind: "closing", sourceCount: 1 },
      { amount: "0.00", kind: "closing", sourceCount: 1 },
      { amount: "0.00", kind: "closing", sourceCount: 1 },
    ],
  );
});
