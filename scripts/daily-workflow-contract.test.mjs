import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { buildWorkspacePermissionContext, hasPermission } from "../src/lib/auth/permission-context.ts";
import { getWorkspaceCapabilitiesFromPermissions } from "../src/lib/auth/capabilities.ts";
import { assertDailyAuthorities, dailyActors, dailyAuthority, dailyDates, dailyFixture, dailyInvoiceHref, dailyOwnerHref, dailyPermissions } from "./daily-workflow-contract.mjs";

const baseline = fs.readFileSync(new URL("../supabase/test-fixtures/baseline.sql", import.meta.url), "utf8");
function contextFor(actor, overrides = {}) {
  // Read the actual fixture grants, then use the application's real normalizer.
  const grants = [...baseline.matchAll(/\('([a-f0-9-]+)'::uuid, '([a-z_.]+)'::public.organization_permission_key\)/g)]
    .filter(match => match[1] === actor.roleId).map(match => match[2]);
  return buildWorkspacePermissionContext({
    branch: { id: dailyFixture.branch, status: "active" },
    customRole: actor.roleId ? { id: actor.roleId, name: "Fixture role", status: "active", permissionKeys: grants } : null,
    ordinaryAccessActive: true, organizationId: dailyFixture.org, roleKind: actor.role, userId: actor.id,
    ...overrides,
  });
}
function actorsFromFixture() {
  return Object.fromEntries(Object.entries(dailyActors).map(([name, actor]) => {
    const resolved = contextFor(actor);
    expect(resolved.ok).toBe(true);
    return [name, { role: actor.role, roleId: actor.roleId, email: actor.email, branch: dailyFixture.branch,
      permissions: Object.fromEntries(dailyPermissions.map(permission => [permission, hasPermission(resolved.context, permission)])),
      unassignedProperty: false,
    }];
  }));
}

describe("daily workflow fixture authority preflight", () => {
  it("uses existing fixture grants and actual application permissions for every phase", () => {
    const actors = actorsFromFixture();
    expect(() => assertDailyAuthorities(actors)).not.toThrow();
    for (const phase of dailyAuthority) {
      const result = contextFor(dailyActors[phase.actor]);
      for (const permission of phase.permissions) expect(hasPermission(result.context, permission), `${phase.phase}: ${permission}`).toBe(true);
    }
    expect(dailyAuthority.filter(phase => phase.phase !== "move-in").every(phase => phase.actor === "finance")).toBe(true);
  });
  it("reproduces the setup denial without extending Finance Manager or Finance Member", () => {
    const manager = contextFor(dailyActors.finance).context;
    expect(hasPermission(manager, "leases.activate")).toBe(true);
    expect(hasPermission(manager, "properties.view")).toBe(false);
    const member = getWorkspaceCapabilitiesFromPermissions(contextFor(dailyActors.reader).context);
    for (const key of ["canOperateFinance", "canCorrectFinance", "canCloseOwnerMonth", "canPublishOwnerStatement"]) expect(member[key]).toBe(false);
  });
  it("permits financial phases but never reopening, unlocking or access management", () => {
    const caps = getWorkspaceCapabilitiesFromPermissions(contextFor(dailyActors.finance).context);
    for (const key of ["canOperateFinance", "canCorrectFinance", "canLockFinancialMonth", "canCloseOwnerMonth", "canPublishOwnerStatement", "canReadOwnerBalanceAuthority"]) expect(caps[key]).toBe(true);
    for (const key of ["canReopenOwnerMonth", "canUnlockFinancialMonth", "canManageAccess"]) expect(caps[key]).toBe(false);
  });
  for (const overrides of [{ ordinaryAccessActive: false }, { branch: { id: dailyFixture.branch, status: "inactive" } }, { customRole: null }]) {
    it(`fails closed when ordinary access is unavailable: ${JSON.stringify(overrides)}`, () => {
      expect(contextFor(dailyActors.finance, overrides).ok).toBe(false);
    });
  }
  for (const phase of dailyAuthority) for (const permission of phase.permissions) {
    it(`fails before build if assigned-property ${permission} is denied in ${phase.phase}`, () => {
      const actors = actorsFromFixture();
      actors[phase.actor].permissions[permission] = false;
      expect(() => assertDailyAuthorities(actors)).toThrow();
    });
  }
  it("rejects a broadened reader, unknown-property access or changed branch", () => {
    for (const mutate of [actors => { actors.reader.permissions["finance.correct_records"] = true; }, actors => { actors.finance.unassignedProperty = true; }, actors => { actors.finance.branch = "another-branch"; }, actors => { actors.finance.email = dailyActors.setup.email; }]) {
      const actors = actorsFromFixture(); mutate(actors);
      expect(() => assertDailyAuthorities(actors)).toThrow();
    }
  });
});

describe("daily workflow date and scope preflight", () => {
  it.each([
    ["2026-09-30", "2026-09-01", "2027-03-01"],
    ["2026-10-01", "2026-10-01", "2027-04-01"],
    ["2026-12-31", "2026-12-01", "2027-06-01"],
    ["2028-02-29", "2028-02-01", "2028-08-01"],
  ])("keeps company business date %s in its own month", (day, month, end) => {
    expect(dailyDates(day)).toEqual({ businessDate: day, month, end });
  });
  it("handles the Phnom Penh first-of-month boundary before UTC midnight", () => {
    const instant = new Date("2026-09-30T18:00:00Z");
    const businessDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Phnom_Penh", year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
    expect(dailyDates(businessDate).month).toBe("2026-10-01");
  });
  it("rejects invalid dates and IDs and scopes canonical invoice/owner routes", () => {
    expect(() => dailyDates("2026-02-30")).toThrow();
    expect(() => dailyInvoiceHref("?q=A-03")).toThrow();
    const invoice = new URL(dailyInvoiceHref(dailyFixture.unit), "https://example.invalid");
    expect([...invoice.searchParams.keys()]).toEqual(["invoiceId"]);
    const owner = new URL(dailyOwnerHref("2026-10-01"), "https://example.invalid");
    expect(Object.fromEntries(owner.searchParams)).toEqual({ month: "2026-10", view: "summary", propertyId: dailyFixture.property, ownerPersonId: dailyFixture.owner });
  });
});
