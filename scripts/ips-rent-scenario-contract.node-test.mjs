import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const manifestPath = path.join(process.cwd(), "scripts/fixtures/ips-rent-scenarios.json");
const browserPath = path.join(
  process.cwd(),
  "scripts/smoke-ips-rent-browser-acceptance.mjs",
);

test("Track 5 retains all ten rent scenarios and downstream evidence gates", () => {
  assert.equal(existsSync(manifestPath), true, "rent scenario manifest must exist");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.deepEqual(
    manifest.scenarios.map(({ id }) => id),
    [
      "full_month",
      "mid_month_move_in",
      "mid_month_move_out",
      "unpaid",
      "partial_payment",
      "late_payment",
      "owner_direct_collection",
      "selected_historical_recovery",
      "renewal",
      "rent_change",
    ],
  );
  for (const scenario of manifest.scenarios) {
    assert.equal(scenario.invoiceAuthority, "lease_term+billing_term+approved_policy");
    assert.deepEqual(scenario.downstream, [
      "tenant_balance",
      "ledger",
      "property_cash",
      "owner_allocation",
      "close_readiness",
      "owner_statement",
    ]);
  }
  assert.deepEqual(
    Object.fromEntries(
      manifest.scenarios.map(({ id, oracle }) => [id, oracle]),
    ),
    {
      full_month: {
        propertyCode: "RIV-SHP",
        billingPeriod: "2026-08-01",
        dueDate: "2026-08-05",
        amount: "1450.00",
        balance: "1450.00",
        status: "unpaid",
      },
      mid_month_move_in: {
        billingPeriod: "2026-09-01",
        termStart: "2026-09-15",
        fullPeriodAmount: "900.00",
        amount: "480.00",
        prorationRule: "billing_override",
      },
      mid_month_move_out: {
        billingPeriod: "2026-11-01",
        termEnd: "2026-11-15",
        fullPeriodAmount: "900.00",
        amount: "450.00",
        prorationRule: "billing_override",
      },
      unpaid: {
        propertyCode: "GDN-CRT",
        unitNumber: "G-01",
        dueDate: "2026-08-05",
        amount: "720.00",
        balance: "720.00",
        operatorLabel: "Overdue",
      },
      partial_payment: {
        propertyCode: "CTR-RES",
        unitNumber: "A-01",
        amount: "850.00",
        paidThroughIps: "825.00",
        balance: "25.00",
        status: "partly_paid",
      },
      late_payment: {
        propertyCode: "CTR-RES",
        unitNumber: "A-01",
        dueDate: "2026-08-05",
        receivedDate: "2026-08-11",
        settlementAmount: "25.00",
        balance: "0.00",
        operatorLabel: "Paid late",
      },
      owner_direct_collection: {
        propertyCode: "CTR-RES",
        unitNumber: "A-02",
        amount: "925.00",
        collectedByOwner: "900.00",
        paidThroughIps: "0.00",
        balance: "25.00",
      },
      selected_historical_recovery: {
        propertyCode: "RIV-SHP",
        selectedPeriod: "2026-07-01",
        amount: "1450.00",
        adjacentEarlierPeriod: "2026-06-01",
        adjacentEarlierGenerated: false,
      },
      renewal: {
        billingPeriod: "2026-12-01",
        termSequence: 2,
        supersedesTermSequence: 1,
        amount: "1100.00",
        isProrated: false,
      },
      rent_change: {
        rule: "next_full_period",
        changeDate: "2026-09-15",
        changeMonthAmount: "1450.00",
        changeMonthSegments: ["1450.00", "0.00"],
        changeMonthIsProrated: false,
        nextFullPeriod: "2026-10-01",
        nextFullPeriodAmount: "1550.00",
      },
    },
  );
  assert.equal(manifest.historicalRecovery.adjacentMonthsGenerated, false);
  assert.equal(manifest.roles.financeManagerStructuralConfiguration, false);
  assert.equal(manifest.roles.operationsAccess, false);
});

test("Track 5 retains one complete workspace-first browser acceptance contract", () => {
  assert.equal(existsSync(browserPath), true, "browser acceptance script must exist");
  const source = readFileSync(browserPath, "utf8");

  for (const required of [
    'page.goto(`${baseUrl}/workspace`',
    'navigateFinanceChild(page, "/rent-income")',
    "runScenarioContract();",
    "advanceOwnerAccounting();",
    'name: "Publish Owner Statement"',
    'finance.manager@nestory.com',
    'finance.member@nestory.com',
    'operations.manager@nestory.com',
    'nestory@gmail.com',
    "tenant_rent_receipt",
  ]) {
    assert.match(source, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(
    source,
    /PASS Track 5 browser lifecycle: 10 scenarios, late payment, historical recovery, owner close, official Statement, role denials/,
  );
});
