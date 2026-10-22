import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getPropertiesScreenData, getPropertySummaries } from "@/features/properties/data/properties";
import { parsePropertySearchParams } from "@/features/properties/property.filters";
import { getUnitsScreenData, getUnitPropertyOptions } from "@/features/units/data/units";
import { parseUnitSearchParams } from "@/features/units/unit.filters";
import { getRentReport } from "@/features/reports/data/rent-reports";
import { createSupabaseServerClient } from "@/lib/db/server";
import type { Database } from "@/types/database.generated";

vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: vi.fn() }));

const enabled = process.env.NESTORY_SCALE_DATABASE_CI === "1";
const apiUrl = "http://127.0.0.1:54321";
type Env = Record<string, string | undefined>;

/** CI-only admission: neither a developer's local stack nor a hosted project is admitted. */
function admit(env: Env, config: string, cwd: string, platform: string) {
  assert.equal(env.NESTORY_SCALE_DATABASE_CI, "1", "Explicit scale database opt-in is required.");
  assert.equal(platform, "linux", "Only the ephemeral Linux CI runner is supported.");
  assert.equal(env.CI, "true");
  assert.equal(env.GITHUB_ACTIONS, "true");
  assert.equal(env.GITHUB_JOB, "database", "Only the isolated Database CI job is admitted.");
  assert.equal(env.RUNNER_ENVIRONMENT, "github-hosted");
  assert.match(env.GITHUB_RUN_ID ?? "", /^\d+$/);
  assert.equal(path.resolve(env.GITHUB_WORKSPACE ?? ""), cwd);
  assert.match(config, /^project_id\s*=\s*"nestory"\s*$/m);
  const api = config.split(/^\[api\]\s*$/m)[1]?.split(/^\[/m)[0] ?? "";
  assert.match(api, /^port\s*=\s*54321\s*$/m);
  assert.match(api, /^max_rows\s*=\s*1000\s*$/m);
  for (const key of ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_CONFIG", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH", "DOCKER_API_VERSION", "SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD", "SUPABASE_PROJECT_ID", "SUPABASE_PROJECT_REF", "SUPABASE_DB_CONTAINER", "PROPERTY_CONCURRENCY_DB_CONTAINER"]) {
    assert.ok(!env[key], `Inherited target or credential override is forbidden: ${key}`);
  }
}

describe("scalability PostgREST admission", () => {
  const config = 'project_id = "nestory"\n[api]\nport = 54321\nmax_rows = 1000\n[db]\nport = 54322\n';
  const cwd = path.resolve("synthetic-ci-workspace");
  const env: Env = { NESTORY_SCALE_DATABASE_CI: "1", CI: "true", GITHUB_ACTIONS: "true", GITHUB_JOB: "database", RUNNER_ENVIRONMENT: "github-hosted", GITHUB_RUN_ID: "123", GITHUB_WORKSPACE: cwd };
  it("requires the explicit ephemeral Database CI job and configured local cap", () => {
    expect(() => admit(env, config, cwd, "linux")).not.toThrow();
    for (const changed of [{ NESTORY_SCALE_DATABASE_CI: undefined }, { CI: undefined }, { GITHUB_ACTIONS: undefined }, { GITHUB_JOB: "production_database" }, { RUNNER_ENVIRONMENT: "self-hosted" }, { GITHUB_WORKSPACE: path.dirname(cwd) }, { SUPABASE_PROJECT_ID: "hosted-project" }, { DOCKER_HOST: "tcp://example.invalid:2375" }]) {
      expect(() => admit({ ...env, ...changed }, config, cwd, "linux")).toThrow();
    }
    expect(() => admit(env, config.replace("54321", "59321"), cwd, "linux")).toThrow();
    expect(() => admit(env, config.replace("1000", "5000"), cwd, "linux")).toThrow();
    expect(() => admit(env, config, cwd, "win32")).toThrow();
  });
});

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type Metadata = { id: string; name: string; project: string; running: boolean; created: string; ports: Array<{ HostPort: string }> | null };
class UncertainScaleCommandError extends Error {}

async function makeHarness() {
  const cwd = path.resolve(process.cwd());
  admit(process.env, readFileSync(path.join(cwd, "supabase/config.toml"), "utf8"), cwd, process.platform);
  assert.equal(existsSync(path.join(cwd, "supabase/.temp/project-ref")), false, "Linked checkouts are forbidden.");
  const privateValues: string[] = [];
  const redact = (value: string) => privateValues.reduce((text, secret) => text.replaceAll(secret, "[local-secret-redacted]"), value);
  function execute(command: string, args: string[], input?: string, timeout = 120_000) {
    const result = spawnSync(command, args, { cwd, input, encoding: "utf8", timeout, maxBuffer: 8 * 1024 * 1024, shell: false, windowsHide: true });
    if (result.error || result.signal) throw new UncertainScaleCommandError("The local scale helper did not complete; reconcile the owned fixture before retrying.");
    if (result.status !== 0) throw new Error(redact(result.stderr || `Local helper exited ${result.status}`));
    return result.stdout.trim();
  }
  const context = execute("docker", ["context", "show"]);
  assert.match(context, /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/);
  const endpoint = JSON.parse(execute("docker", ["context", "inspect", context, "--format", "{{json .Endpoints.docker.Host}}"]));
  assert.equal(endpoint, "unix:///var/run/docker.sock", "Only the local runner Docker socket is admitted.");
  const docker = (args: string[], input?: string) => execute("docker", ["--host", endpoint, ...args], input);
  const inspect = (name: string, port: string) => JSON.parse(docker(["inspect", name, "--format", `{"id":{{json .Id}},"name":{{json .Name}},"project":{{json (index .Config.Labels "com.supabase.cli.project")}},"running":{{json .State.Running}},"created":{{json .Created}},"ports":{{json (index .NetworkSettings.Ports "${port}/tcp")}}}`])) as Metadata;
  function verify(value: Metadata, name: string, pinnedId?: string) {
    assert.match(value.id, /^[a-f0-9]{64}$/);
    if (pinnedId) assert.equal(value.id, pinnedId, "CI container was replaced.");
    assert.equal(value.name, `/${name}`);
    assert.equal(value.project, "nestory");
    assert.equal(value.running, true);
    assert.ok(Date.parse(value.created) >= Date.now() - 2 * 60 * 60 * 1000, "Only the fresh CI stack is admitted.");
  }
  const dbName = "supabase_db_nestory";
  const db = inspect(dbName, "5432");
  const gateway = inspect("supabase_kong_nestory", "8000");
  verify(db, dbName);
  verify(gateway, "supabase_kong_nestory");
  assert.ok(db.ports?.some(port => port.HostPort === "54322"));
  assert.ok(gateway.ports?.some(port => port.HostPort === "54321"));
  const rest = inspect("supabase_rest_nestory", "3000");
  verify(rest, "supabase_rest_nestory");
  let status: Record<string, string>;
  try {
    status = JSON.parse(execute(path.join(cwd, "node_modules/supabase/bin/supabase"), ["status", "-o", "json"])) as Record<string, string>;
  } catch {
    throw new Error("Could not parse local CLI status; no status payload is included in diagnostics.");
  }
  assert.equal(status.API_URL, apiUrl, "Local CLI status must identify the exact loopback API.");
  assert.ok(status.ANON_KEY && status.JWT_SECRET, "Local CLI signing material is required.");
  privateValues.push(status.ANON_KEY, status.JWT_SECRET, ...[status.SERVICE_ROLE_KEY].filter(Boolean));
  let dbUrl: URL;
  try { dbUrl = new URL(status.DB_URL); }
  catch { throw new Error("Local CLI database URL is malformed; no credentials are included in diagnostics."); }
  assert.ok(["postgres:", "postgresql:"].includes(dbUrl.protocol));
  assert.equal(dbUrl.hostname, "127.0.0.1");
  assert.equal(dbUrl.port, "54322");
  assert.equal(dbUrl.pathname, "/postgres");

  function sql(body: string) {
    verify(inspect(dbName, "5432"), dbName, db.id);
    return docker(["exec", "-i", db.id, "psql", "-X", "-qAt", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], body);
  }
  const org = randomUUID(), foreignOrg = randomUUID(), actor = randomUUID(), foreignActor = randomUUID();
  const branch = randomUUID(), foreignBranch = randomUUID();
  const marker = `scale-ci-${randomUUID()}`;
  const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
  const organizations = `${quote(org)},${quote(foreignOrg)}`;
  const fixtureId = (kind: string, index: number) => {
    const raw = createHash("md5").update(`${org}:${kind}:${index}`).digest("hex");
    return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
  };
  const sqlId = (kind: string, index: string) => `md5(${quote(`${org}:${kind}:`)}||(${index})::text)::uuid`;
  const snapshot = () => JSON.parse(sql("SELECT jsonb_build_object('organizations',(SELECT count(*) FROM public.organizations),'users',(SELECT count(*) FROM auth.users),'properties',(SELECT count(*) FROM public.properties),'units',(SELECT count(*) FROM public.units),'timeline',(SELECT count(*) FROM public.timeline_events));"));
  const before = snapshot();
  let fixtureAttempted = false;
  let portfolioCount = 0;
  let closed = false;
  let uncertainWrite = false;
  function assertOwned() {
    assert.equal(sql(`SELECT count(*) FROM public.organizations WHERE id IN (${organizations}) AND slug NOT IN (${quote(marker)},${quote(`${marker}-foreign`)});`), "0", "Cleanup ownership marker does not match.");
  }
  function transaction(body: string) {
    if (uncertainWrite) throw new Error(`A previous write outcome is uncertain for local organizations ${org} and ${foreignOrg}; no later fixture write is dispatched.`);
    try { return sql(`BEGIN; SET LOCAL statement_timeout='100s'; ${body} COMMIT;`); }
    catch (error) {
      if (error instanceof UncertainScaleCommandError) uncertainWrite = true;
      throw error;
    }
  }
  async function close() {
    if (closed || !fixtureAttempted) return;
    if (uncertainWrite) throw new Error(`A write outcome is uncertain for local organizations ${org} and ${foreignOrg}; no cleanup is dispatched while that operation may still be running.`);
    assertOwned();
    const removeOwned = `DELETE FROM public.organizations WHERE id IN (${organizations}); DELETE FROM auth.users WHERE id IN (${quote(actor)},${quote(foreignActor)});`;
    try {
      transaction(removeOwned);
    } catch (firstError) {
      // Reconcile a possibly completed DELETE before considering another write.
      assertOwned();
      const remaining = Number(sql(`SELECT count(*) FROM public.organizations WHERE id IN (${organizations});`));
      if (remaining === 0) {
        assert.equal(sql(`SELECT count(*) FROM auth.users WHERE id IN (${quote(actor)},${quote(foreignActor)});`), "0", "Uncertain teardown left an owned auth row.");
      } else {
        if (firstError instanceof UncertainScaleCommandError) {
          throw new Error(`Owned fixture teardown remains uncertain for local organizations ${org} and ${foreignOrg}; no cleanup retry was dispatched.`);
        }
        // Same narrowly scoped bootstrap-account teardown used by
        // scripts/unit-create-http-recovery.node-test.mjs:271-283. No guard is
        // disabled during fixture creation or reads. SET LOCAL is reset by
        // COMMIT/ROLLBACK, and origin is restored before deleting owned orgs.
        const bootstrapTables = [
          "app_private.finance_account_activity_authority_history", "app_private.finance_account_generated_categories",
          "public.finance_account_category_links", "public.finance_account_source_links", "app_private.finance_account_internal_sources",
          "public.finance_account_roles", "public.finance_accounts", "public.finance_categories", "public.financial_reconciliation_sources",
        ];
        try {
          transaction(`SET LOCAL session_replication_role=replica; ${bootstrapTables.map(table => `DELETE FROM ${table} WHERE organization_id IN (${organizations});`).join("\n")} SET LOCAL session_replication_role=origin; ${removeOwned}`);
        } catch (error) {
          throw new AggregateError([firstError, error], "Owned synthetic fixture cleanup failed; no unrelated cleanup is permitted.");
        }
      }
    }
    assert.deepEqual(snapshot(), before, "Owned fixture cleanup did not restore the original row counts.");
    uncertainWrite = false;
    closed = true;
    console.info(JSON.stringify({ check: "scalability-postgrest-owned-cleanup", passed: true, originalRowCountsRestored: true }));
  }
  function authenticatedClient(userId: string) {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role: "authenticated", aud: "authenticated", sub: userId, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 })}`;
    const token = `${unsigned}.${createHmac("sha256", status.JWT_SECRET).update(unsigned).digest("base64url")}`;
    privateValues.push(token);
    return createClient<Database>(apiUrl, status.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        headers: { Authorization: `Bearer ${token}` },
        fetch: async (input, init) => {
          const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
          assert.equal(url.origin, apiUrl, "External network requests are forbidden.");
          assert.ok(url.pathname.startsWith("/rest/v1/"), "Only read-only PostgREST is permitted; Auth, delivery, and Storage requests are forbidden.");
          assert.ok(["GET", "HEAD", "POST"].includes(init?.method ?? "GET"));
          if (init?.method === "POST") assert.equal(url.pathname, "/rest/v1/rpc/get_finance_read_context", "Only the read context RPC is permitted.");
          verify(inspect("supabase_kong_nestory", "8000"), "supabase_kong_nestory", gateway.id);
          return fetch(input, { ...init, redirect: "error", signal: init?.signal ?? AbortSignal.timeout(30_000) });
        },
      },
    }) as unknown as Client;
  }
  try {
    assert.equal(sql(`SELECT count(*) FROM public.organizations WHERE id IN (${organizations});`), "0");
    assert.equal(sql(`SELECT count(*) FROM auth.users WHERE id IN (${quote(actor)},${quote(foreignActor)});`), "0");
    fixtureAttempted = true;
    transaction(`
      INSERT INTO auth.users(id,email) VALUES (${quote(actor)},${quote(`${actor}@example.invalid`)}),(${quote(foreignActor)},${quote(`${foreignActor}@example.invalid`)});
      INSERT INTO public.organizations(id,name,slug) VALUES (${quote(org)},'Synthetic scalability CI',${quote(marker)}),(${quote(foreignOrg)},'Foreign synthetic scalability CI',${quote(`${marker}-foreign`)});
      INSERT INTO public.organization_branches(id,organization_id,name,code) VALUES (${quote(branch)},${quote(org)},'Scale CI','SCALE'),(${quote(foreignBranch)},${quote(foreignOrg)},'Foreign CI','FOREIGN');
      INSERT INTO public.organization_members(organization_id,user_id,role) VALUES (${quote(org)},${quote(actor)},'super_admin'),(${quote(foreignOrg)},${quote(foreignActor)},'super_admin');
      INSERT INTO public.properties(id,organization_id,name,code,property_type,rental_structure) VALUES (${quote(fixtureId("foreign-property", 1))},${quote(foreignOrg)},'Foreign sentinel','FOREIGN','House','multi_unit');
      SELECT set_config('request.jwt.claim.sub',${quote(foreignActor)},true);
      SELECT public.assign_property_branch(${quote(foreignOrg)},${quote(fixtureId("foreign-property", 1))},${quote(foreignBranch)});
      INSERT INTO public.units(id,organization_id,property_id,unit_number) VALUES (${quote(fixtureId("foreign-unit", 1))},${quote(foreignOrg)},${quote(fixtureId("foreign-property", 1))},'FOREIGN');
    `);
    return {
      org, foreignOrg, fixtureId, client: authenticatedClient(actor), foreignClient: authenticatedClient(foreignActor), close,
      addPortfolio(size: number) {
        assertOwned();
        assert.ok([500, 1000, 1001].includes(size) && size > portfolioCount);
        transaction(`
          SELECT set_config('request.jwt.claim.sub',${quote(actor)},true);
          INSERT INTO public.properties(id,organization_id,name,code,property_type,rental_structure)
          SELECT ${sqlId("property", "n")},${quote(org)},'Synthetic scale property '||n,'SCALE-'||lpad(n::text,4,'0'),'House','multi_unit' FROM generate_series(${portfolioCount + 1},${size}) n;
          SELECT public.assign_property_branch(${quote(org)},${sqlId("property", "n")},${quote(branch)}) FROM generate_series(${portfolioCount + 1},${size}) n;
          INSERT INTO public.units(id,organization_id,property_id,unit_number)
          SELECT ${sqlId("unit", "n")},${quote(org)},${sqlId("property", "n")},'UNIT-'||lpad(n::text,4,'0') FROM generate_series(${portfolioCount + 1},${size}) n;
        `);
        portfolioCount = size;
      },
      addDenseProperty() {
        assertOwned();
        transaction(`
          SELECT set_config('request.jwt.claim.sub',${quote(actor)},true);
          INSERT INTO public.properties(id,organization_id,name,code,property_type,rental_structure) VALUES (${quote(fixtureId("dense-property", 1))},${quote(org)},'Synthetic dense property','DENSE','House','multi_unit');
          SELECT public.assign_property_branch(${quote(org)},${quote(fixtureId("dense-property", 1))},${quote(branch)});
          INSERT INTO public.units(id,organization_id,property_id,unit_number)
          SELECT ${sqlId("dense-unit", "n")},${quote(org)},${quote(fixtureId("dense-property", 1))},'DENSE-'||lpad(n::text,4,'0') FROM generate_series(1,1001) n;
          INSERT INTO public.timeline_events(id,organization_id,property_id,unit_id,event_date,event_type,title)
          SELECT ${sqlId("timeline", "n")},${quote(org)},${quote(fixtureId("dense-property", 1))},${quote(fixtureId("dense-unit", 1))},current_date,'Inspection','Synthetic newer timeline '||n FROM generate_series(1,6000) n;
          INSERT INTO public.timeline_events(id,organization_id,property_id,unit_id,event_date,event_type,title)
          VALUES (${quote(fixtureId("timeline", 6001))},${quote(org)},${quote(fixtureId("dense-property", 1))},${quote(fixtureId("dense-unit", 2))},'2000-01-01','Inspection','Older event for the second unit');
        `);
      },
    };
  } catch (error) {
    if (error instanceof UncertainScaleCommandError) {
      throw new Error(`Owned fixture setup remains uncertain for local organizations ${org} and ${foreignOrg}; no creation or cleanup retry was dispatched.`);
    }
    await close();
    throw error;
  }
}

describe.skipIf(!enabled).sequential("scalability: real isolated CI PostgREST and exported loaders", () => {
  let harness: Awaited<ReturnType<typeof makeHarness>> | undefined;
  beforeAll(async () => { harness = await makeHarness(); vi.mocked(createSupabaseServerClient).mockResolvedValue(harness.client); }, 120_000);
  afterAll(async () => { try { await harness?.close(); } finally { vi.mocked(createSupabaseServerClient).mockReset(); } }, 120_000);

  it.each([500, 1000, 1001])("reads %i properties/units through the actual local API", async size => {
    assert.ok(harness);
    harness.addPortfolio(size);
    const summaries = await getPropertySummaries(harness.org);
    expect(summaries).toHaveLength(size);
    expect(new Set(summaries.map(row => row.id))).toEqual(new Set(Array.from({ length: size }, (_, index) => harness!.fixtureId("property", index + 1))));
    expect(summaries.every(row => row.units === 1 && row.netIncomeUsd === 0)).toBe(true);
    const properties = await getPropertiesScreenData(harness.org, parsePropertySearchParams({ sort: "net_desc" }));
    expect(properties.pagination.totalCount).toBe(size);
    const units = await getUnitsScreenData(harness.org, parseUnitSearchParams({ sort: "rent_desc", page: String(Math.ceil(size / 10)) }));
    expect(units.pagination.totalCount).toBe(size);
    expect(units.units.at(-1)?.id).toBe(harness.fixtureId("unit", size));
    expect(await getUnitPropertyOptions(harness.org)).toHaveLength(size);
    const raw = await harness.client.from("units").select("id", { count: "exact" }).eq("organization_id", harness.org);
    expect(raw.error).toBeNull();
    expect(raw.count).toBe(size);
    expect(raw.data).toHaveLength(Math.min(size, 1000));
    console.info(JSON.stringify({ check: "real-postgrest-portfolio", size, rawRows: raw.data?.length, exactCount: raw.count, completeLoaderRows: summaries.length }));
  }, 180_000);

  it("excludes a real foreign organization under authenticated RLS, including unfiltered reads", async () => {
    assert.ok(harness);
    const own = await harness.client.from("units").select("organization_id", { count: "exact" });
    expect(own.error).toBeNull();
    expect(own.count).toBe(1001);
    expect(own.data?.every(row => row.organization_id === harness!.org)).toBe(true);
    const denied = await harness.client.from("units").select("id", { count: "exact" }).eq("organization_id", harness.foreignOrg);
    expect(denied.error).toBeNull();
    expect(denied.count).toBe(0);
    const foreign = await harness.foreignClient.from("units").select("id", { count: "exact" });
    expect(foreign.error).toBeNull();
    expect(foreign.count).toBe(1);
    expect(foreign.data?.[0].id).toBe(harness.fixtureId("foreign-unit", 1));
  }, 30_000);

  it("reads a dense 1001-unit property and 6001 timeline rows without losing the second unit's event", async () => {
    assert.ok(harness);
    harness.addDenseProperty();
    const properties = await getPropertySummaries(harness.org);
    expect(properties).toHaveLength(1002);
    expect(properties.find(row => row.id === harness!.fixtureId("dense-property", 1))?.units).toBe(1001);
    const units = await getUnitsScreenData(harness.org, { ...parseUnitSearchParams({ sort: "rent_desc" }), propertyId: harness.fixtureId("dense-property", 1) });
    expect(units.pagination.totalCount).toBe(1001);
    expect(units.units.find(row => row.id === harness!.fixtureId("dense-unit", 2))?.latestTimelineEvent?.title).toBe("Older event for the second unit");
    const timeline = await harness.client.from("timeline_events").select("id", { count: "exact" }).eq("organization_id", harness.org);
    expect(timeline.error).toBeNull();
    expect(timeline.count).toBe(6001);
    expect(timeline.data).toHaveLength(1000);
    const roll = await getRentReport({ organizationId: harness.org, supabase: harness.client, viewQuery: {
      month: "2026-10", report: "rent-roll", ownerPersonId: "all", peopleArchiveState: "active", peopleView: "relationship", propertyId: "all", status: "all", unitId: "all",
    } });
    expect(roll.rows).toHaveLength(2002);
    expect(roll.summary.find(metric => metric.label === "Rental spaces")?.value).toBe("2002");
    console.info(JSON.stringify({ check: "real-postgrest-dense", units: 1001, timelineRows: 6001, rawTimelineRows: timeline.data?.length, rentRollRows: roll.rows.length }));
  }, 180_000);
});
