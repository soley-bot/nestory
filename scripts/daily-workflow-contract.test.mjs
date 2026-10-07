import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { buildWorkspacePermissionContext, hasPermission } from "../src/lib/auth/permission-context.ts";
import { getWorkspaceCapabilitiesFromPermissions } from "../src/lib/auth/capabilities.ts";
import { assertDailyAuthorities, dailyActors, dailyAuthority, dailyDates, dailyFixture, dailyInvoiceHref, dailyOwnerHref, dailyPermissions, inspectDailyFixture, prepareDailyCorrectionSource, readDailyBusinessDate } from "./daily-workflow-contract.mjs";
import { assertDailyReceiptIdentities, dailyIdentityMap, fixtureIdentityProfile, remapDailyFixtureSql } from "./daily-fixture-identities.mjs";
import { requirePrivilegedStepUp } from "../src/lib/auth/privileged-step-up-guard.ts";

const stepUpMocks = vi.hoisted(() => ({ admin: vi.fn(), server: vi.fn() }));
vi.mock("@/lib/db/admin", () => ({ createSupabaseAdminClient: stepUpMocks.admin }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: stepUpMocks.server }));

const baseline = fs.readFileSync(new URL("../supabase/test-fixtures/baseline.sql", import.meta.url), "utf8");
const dailyEnv = { GITHUB_ACTIONS: "true", CI: "true", RUNNER_OS: "Linux", GITHUB_REPOSITORY: "soley-bot/nestory", GITHUB_EVENT_NAME: "pull_request", GITHUB_RUN_ID: "123", GITHUB_RUN_ATTEMPT: "1", NESTORY_TEST_SHA: "a".repeat(40), NESTORY_DAILY_FIXTURE_IDENTITIES: "1", SUPABASE_DB_CONTAINER: "supabase_db_nestory-daily-123-1", NESTORY_BASE_URL: "http://127.0.0.1:3107" };

describe("daily correction owner-source prerequisite (mocked SQL boundary)", () => {
  const invoice = "a1111111-1111-4111-8111-111111111111";
  const payment = "a2222222-2222-4222-8222-222222222222";
  const allocation = "a3333333-3333-4333-8333-333333333333";
  const source = [{ id: allocation, amount: 40 }];
  it("prepares only the recorded payment with Finance authority and checks its retained amount", () => {
    const events = [];
    const sql = vi.fn(statement => { events.push("read"); return statement.includes("jsonb_agg") ? JSON.stringify(source) : "1"; });
    const command = vi.fn(() => events.push("allocate"));
    expect(prepareDailyCorrectionSource(sql, command, invoice, payment)).toBe(allocation);
    expect(events).toEqual(["read", "allocate", "read"]);
    for (const id of [dailyFixture.org, dailyFixture.property, dailyFixture.unit, invoice, payment, dailyActors.finance.id]) expect(sql.mock.calls[0][0]).toContain(id);
    expect(command).toHaveBeenCalledExactlyOnceWith(dailyActors.finance.id,
      `SELECT public.allocate_owner_event('${dailyFixture.org}','tenant_rent_receipt','${allocation}','daily-rent-source-${allocation}');`);
    expect(sql.mock.calls[1][0]).toContain("gross_signed_amount=40");
  });
  it.each([[], [...source, ...source], [{ id: allocation, amount: 39 }], [{ id: "invalid", amount: 40 }]])("rejects a missing, split or changed source before any mutation: %j", rows => {
    const command = vi.fn();
    expect(() => prepareDailyCorrectionSource(() => JSON.stringify(rows), command, invoice, payment)).toThrow();
    expect(command).not.toHaveBeenCalled();
  });
  it("stops on command denial without another actor or an unchecked write", () => {
    const command = vi.fn(() => { throw new Error("Not authorized"); });
    const sql = vi.fn(() => JSON.stringify(source));
    expect(() => prepareDailyCorrectionSource(sql, command, invoice, payment)).toThrow("Not authorized");
    expect(command).toHaveBeenCalledTimes(1); expect(sql).toHaveBeenCalledTimes(1);
  });
  it("does not proceed to preview without the verified owner effect", () => {
    expect(() => prepareDailyCorrectionSource(statement => statement.includes("jsonb_agg") ? JSON.stringify(source) : "0", vi.fn(), invoice, payment)).toThrow("before correction preview");
  });
  it("rejects malformed identities before reading and wires preparation before the visible preview", () => {
    const sql = vi.fn();
    expect(() => prepareDailyCorrectionSource(sql, vi.fn(), "invalid", payment)).toThrow();
    expect(sql).not.toHaveBeenCalled();
    const journey = fs.readFileSync(new URL("./smoke-daily-workflow.mjs", import.meta.url), "utf8");
    const prepare = journey.indexOf("prepareDailyCorrectionSource(sql, authenticated, invoice.id, payment.id)");
    const preview = journey.indexOf('name: "Preview correction"');
    const lock = journey.indexOf("set_financial_month_lock");
    const save = journey.indexOf('name: "Save this month\'s rent"');
    for (const index of [prepare, preview, lock, save]) expect(index).toBeGreaterThanOrEqual(0);
    expect(prepare).toBeLessThan(preview);
    expect(lock).toBeGreaterThan(save);
  });
});

describe("daily receipt fixture identities", () => {
  it("preserves every baseline byte except the four identity references", () => {
    let mapped = remapDailyFixtureSql(baseline);
    for (const [before, after] of Object.entries(dailyIdentityMap)) {
      expect(mapped).not.toContain(before);
      expect(mapped.split(after)).toHaveLength(baseline.split(before).length);
      mapped = mapped.replaceAll(after, before);
    }
    expect(mapped).toBe(baseline);
    expect(() => remapDailyFixtureSql("SELECT 1;")).toThrow("Baseline identity missing");
    expect(() => remapDailyFixtureSql(baseline + dailyFixture.org)).toThrow("identity collision");
  });
  it("keeps ordinary fixture loaders unchanged and confines remapping to the daily project", () => {
    expect(fixtureIdentityProfile({}).sql(baseline)).toBe(baseline);
    for (const [before, after] of Object.entries(dailyIdentityMap)) {
      expect(fixtureIdentityProfile({}).id(before)).toBe(before);
      expect(fixtureIdentityProfile(dailyEnv).id(before)).toBe(after);
    }
    const profile = fixtureIdentityProfile(dailyEnv);
    expect(profile.sql(baseline)).toBe(remapDailyFixtureSql(baseline));
    expect(() => profile.assertApi("http://127.0.0.1:58321")).not.toThrow();
    for (const api of ["http://127.0.0.1:54321", "https://example.supabase.co", "http://127.0.0.1:58321/wrong"]) {
      expect(() => profile.assertApi(api)).toThrow();
    }
    for (const overrides of [{ NESTORY_DAILY_FIXTURE_IDENTITIES: "0" }, { CI: "false" }, { SUPABASE_DB_CONTAINER: "supabase_db_nestory" }, { NESTORY_BASE_URL: "https://pilot.nestory-kh.com" }, { SUPABASE_PROJECT_ID: "hosted-project" }]) {
      expect(() => fixtureIdentityProfile({ ...dailyEnv, ...overrides })).toThrow();
    }
  });
  it("rejects the original fixture before SQL and accepts only valid receipt identities", () => {
    expect(() => assertDailyReceiptIdentities("00000000-0000-0000-0000-000000000001", dailyActors)).toThrow("organization fails strict UUID");
    expect(() => assertDailyReceiptIdentities(dailyFixture.org, { finance: { id: "00000000-0000-0000-0000-000000000701" } })).toThrow("finance actor fails strict UUID");
    expect(() => assertDailyReceiptIdentities(dailyFixture.org, dailyActors)).not.toThrow();
  });
  it.each([
    ["organization", "00000000-0000-0000-0000-000000000001", dailyActors.finance.id],
    ["actor", dailyFixture.org, "00000000-0000-0000-0000-000000000701"],
  ])("reproduces the old %s rejection through the real guard before Auth, service RPC or storage", async (_name, organizationId, userId) => {
    vi.clearAllMocks();
    const client = { auth: { getClaims: vi.fn(), getUser: vi.fn() } };
    await expect(requirePrivilegedStepUp({ organizationId, userId }, client)).rejects.toThrow("Privileged email verification required");
    expect(client.auth.getClaims).not.toHaveBeenCalled();
    expect(client.auth.getUser).not.toHaveBeenCalled();
    expect(stepUpMocks.admin).not.toHaveBeenCalled();
    expect(stepUpMocks.server).not.toHaveBeenCalled();
  });
  it.each(Object.keys(dailyActors))("uses the real guard for the mapped %s identity while retaining exact-session proof", async name => {
    vi.clearAllMocks();
    const userId = dailyActors[name].id;
    const sessionId = "a0000000-0000-4000-8000-000000000001";
    const client = { auth: {
      getClaims: vi.fn().mockResolvedValue({ data: { claims: { session_id: sessionId, sub: userId } }, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }),
    } };
    const admin = { rpc: vi.fn().mockResolvedValue({ data: true, error: null }) };
    stepUpMocks.admin.mockReturnValue(admin);
    await expect(requirePrivilegedStepUp({ organizationId: dailyFixture.org, userId }, client)).resolves.toBe(admin);
    expect(admin.rpc).toHaveBeenCalledExactlyOnceWith("assert_privileged_email_step_up_satisfied", { p_organization_id: dailyFixture.org, p_user_id: userId, p_session_id: sessionId });
    expect(client.auth.getClaims).toHaveBeenCalledOnce();
    expect(client.auth.getUser).toHaveBeenCalledOnce();
  });
});
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
  it.each(Object.keys(dailyActors))("probes the business-date RPC as the actual authenticated %s actor", actor => {
    const statements = [];
    expect(readDailyBusinessDate(statement => { statements.push(statement); return "2026-10-01"; }, actor)).toBe("2026-10-01");
    expect(statements).toHaveLength(1);
    expect(statements[0]).toContain("BEGIN READ ONLY");
    expect(statements[0]).toContain(`set_config('request.jwt.claim.sub','${dailyActors[actor].id}',true)`);
    expect(statements[0]).toContain("SET LOCAL ROLE authenticated");
    expect(statements[0]).toContain(`public.get_lease_rent_business_date('${dailyFixture.org}')`);
    expect(statements[0]).toContain("ROLLBACK");
  });
  it.each(["Not authorized", "Connection closed"])("stops on %s without an administrator or UTC fallback", message => {
    const calls = [];
    const cause = new Error(message);
    try {
      readDailyBusinessDate(statement => { calls.push(statement); throw cause; }, "finance");
      expect.fail("A denied RPC must block acceptance");
    } catch (error) {
      expect(error.message).toContain("finance cannot read get_lease_rent_business_date as authenticated");
      expect(error.cause).toBe(cause);
    }
    expect(calls).toHaveLength(1);
  });
  it("rejects malformed RPC output instead of inventing a business date", () => {
    expect(() => readDailyBusinessDate(() => "", "finance")).toThrow("finance cannot read");
  });
  it("checks the RPC even when every permission key passes, before further fixture work", () => {
    const actors = actorsFromFixture();
    const calls = [];
    expect(() => inspectDailyFixture(statement => {
      calls.push(statement);
      const actor = Object.keys(dailyActors).find(key => statement.includes(dailyActors[key].id));
      if (statement.includes("json_build_object('role'")) return JSON.stringify(actors[actor]);
      if (actor === "setup" && statement.includes("SET LOCAL ROLE authenticated")) return "2026-10-01";
      if (actor === "finance" && statement.includes("SET LOCAL ROLE authenticated")) throw new Error("Not authorized");
      throw new Error("Unexpected work after failed date contract");
    })).toThrow("finance cannot read get_lease_rent_business_date as authenticated");
    expect(calls).toHaveLength(5);
    expect(calls.some(statement => statement.includes("'vacant'"))).toBe(false);
  });
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
