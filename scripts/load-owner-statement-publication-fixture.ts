import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { buildOwnerStatementXlsx } from "../src/features/reports/data/excel";
import { buildOwnerStatementPdf } from "../src/features/reports/data/pdf";
import { loadOwnerStatementPresentation } from "../src/features/reports/data/owner-statement-presentation";
import { loadOwnerStatementPublication } from "../src/features/reports/data/owner-statement-report";
import type { Database } from "../src/types/database";

const organizationId = "00000000-0000-0000-0000-000000000001";
const propertyId = "10000000-0000-0000-0000-000000000004";
const ownerId = "80000000-0000-0000-0000-000000000014";
const actorId = "00000000-0000-0000-0000-000000000101";
let fixturePhase = "initialize";

async function main() {
  fixturePhase = "runtime";
  const runtime = localRuntime();
  const client = createClient<Database>(runtime.apiUrl, runtime.anonKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const service = createClient<Database>(runtime.apiUrl, runtime.serviceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  await signInFixture(client);

  fixturePhase = "remove prior local artifacts";
  await removePriorFixtureArtifacts(service);

  fixturePhase = "close";
  const monthStart = fixtureMonthStart();
  const closed = await client.rpc("close_owner_month", {
    p_close_reason: "Guarded fixture official Owner Statement publication",
    p_currency: "USD",
    p_idempotency_key: "fixture-owner-statement-close-r3",
    p_month_start: monthStart,
    p_organization_id: organizationId,
    p_owner_person_id: ownerId,
    p_property_id: propertyId,
  });
  if (closed.error) throw closed.error;
  const revisionId = required(closed.data, "revision_id");
  fixturePhase = "publish";
  const published = await client.rpc("publish_owner_statement", {
    p_idempotency_key: "fixture-owner-statement-publish-r3",
    p_organization_id: organizationId,
    p_owner_close_revision_id: revisionId,
  });
  if (published.error) throw published.error;
  const publicationId = required(published.data, "publication_id");
  const statementNumber = required(published.data, "statement_number");
  fixturePhase = "canonical model";
  const model = await loadOwnerStatementPublication(client, organizationId, publicationId);
  const presentation = await loadOwnerStatementPresentation(client, model);

  for (const artifact of [
    { bytes: buildOwnerStatementPdf(model, presentation), contentType: "application/pdf", format: "pdf" as const },
    {
      bytes: buildOwnerStatementXlsx(model),
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      format: "xlsx" as const,
    },
  ]) {
    fixturePhase = `upload ${artifact.format}`;
    const path = `${organizationId}/${publicationId}/${artifact.format}/` +
      `owner-statement-${statementNumber}.${artifact.format}`;
    const uploaded = await client.storage.from("owner-statements").upload(path, artifact.bytes, {
      contentType: artifact.contentType,
      upsert: false,
    });
    if (uploaded.error) throw uploaded.error;
    const object = await service.rpc("get_owner_statement_artifact_object", {
      p_actor_id: actorId,
      p_format: artifact.format,
      p_organization_id: organizationId,
      p_publication_id: publicationId,
      p_storage_path: path,
    });
    if (object.error) throw object.error;
    const storageObjectId = required(object.data, "storage_object_id");
    const storageObjectVersion = required(object.data, "storage_object_version");
    const contentType = required(object.data, "content_type");
    const authoritative = await service.storage.from("owner-statements").download(path);
    if (authoritative.error || !authoritative.data) {
      throw authoritative.error ?? new Error("Missing authoritative fixture artifact");
    }
    const authoritativeBytes = new Uint8Array(await authoritative.data.arrayBuffer());
    const sha256 = createHash("sha256").update(authoritativeBytes).digest("hex");
    if (
      authoritativeBytes.byteLength !== artifact.bytes.byteLength ||
      sha256 !== createHash("sha256").update(artifact.bytes).digest("hex")
    ) throw new Error(`Fixture ${artifact.format} authoritative bytes differ from renderer`);
    fixturePhase = `register ${artifact.format}`;
    const registered = await service.rpc("register_owner_statement_artifact_verified", {
      p_actor_id: actorId,
      p_content_type: contentType,
      p_format: artifact.format,
      p_idempotency_key: artifactReplayKey(
        "fixture-owner-statement-publish-r3", publicationId, artifact.format,
      ),
      p_organization_id: organizationId,
      p_publication_id: publicationId,
      p_sha256: sha256,
      p_size_bytes: authoritativeBytes.byteLength,
      p_storage_object_id: storageObjectId,
      p_storage_object_version: storageObjectVersion,
      p_storage_path: path,
    });
    if (registered.error) throw registered.error;

    fixturePhase = `verify ${artifact.format}`;
    const downloaded = await client.storage.from("owner-statements").download(path);
    if (downloaded.error || !downloaded.data) throw downloaded.error ?? new Error("Missing fixture artifact");
    const retained = new Uint8Array(await downloaded.data.arrayBuffer());
    if (
      retained.byteLength !== artifact.bytes.byteLength ||
      createHash("sha256").update(retained).digest("hex") !== sha256
    ) throw new Error(`Fixture ${artifact.format} bytes failed retention verification`);
  }

  fixturePhase = "readiness";
  const readiness = await client.rpc("get_owner_statement_readiness", {
    p_organization_id: organizationId,
    p_owner_close_revision_id: revisionId,
  });
  if (readiness.error || !readiness.data ||
      (readiness.data as Record<string, unknown>).artifacts_complete !== true) {
    throw readiness.error ?? new Error("Fixture publication is incomplete");
  }
  fixturePhase = "reopen";
  const reopened = await client.rpc("reopen_owner_month", {
    p_idempotency_key: "fixture-owner-statement-reopen-r4",
    p_organization_id: organizationId,
    p_owner_close_series_id: required(closed.data, "series_id"),
    p_reopen_reason: "Guarded fixture prepares the superseding Owner Statement revision",
  });
  if (reopened.error) throw reopened.error;
  fixturePhase = "reroll";
  const rerolled = await client.rpc("generate_owner_balance_period", {
    p_currency: "USD",
    p_idempotency_key: "fixture-owner-statement-reroll-r4",
    p_month_start: monthStart,
    p_organization_id: organizationId,
    p_owner_person_id: ownerId,
    p_property_id: propertyId,
  });
  if (rerolled.error) throw rerolled.error;
  process.stdout.write(
    `Official fixture Owner Statement retained and R4 prepared: ${statementNumber} (${publicationId})\n`,
  );
}

async function signInFixture(client: SupabaseClient<Database>) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const signedIn = await client.auth.signInWithPassword({
      email: "nestory@gmail.com",
      password: "123456789",
    });
    if (!signedIn.error) return;
    lastError = signedIn.error;
    if ((signedIn.error.status ?? 0) < 500) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError ?? new Error("Fixture Super Admin sign-in failed");
}

async function removePriorFixtureArtifacts(service: SupabaseClient<Database>) {
  const bucket = service.storage.from("owner-statements");
  const paths: string[] = [];

  async function visit(folder: string, depth: number): Promise<void> {
    if (depth > 4) throw new Error(`Owner Statement fixture Storage depth exceeded at ${folder}`);
    for (let offset = 0; ; offset += 100) {
      const listed = await bucket.list(folder, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
      if (listed.error) throw listed.error;
      for (const entry of listed.data ?? []) {
        const entryPath = `${folder}/${entry.name}`;
        if (!entryPath.startsWith(`${organizationId}/`)) {
          throw new Error(`Refusing out-of-scope Owner Statement cleanup: ${entryPath}`);
        }
        if (entry.id) paths.push(entryPath);
        else await visit(entryPath, depth + 1);
      }
      if ((listed.data?.length ?? 0) < 100) break;
    }
  }

  await visit(organizationId, 0);
  for (let index = 0; index < paths.length; index += 100) {
    const batch = paths.slice(index, index + 100);
    const removed = await bucket.remove(batch);
    if (removed.error) throw removed.error;
    const confirmed = new Set((removed.data ?? []).map((entry) => entry.name));
    for (const path of batch) {
      if (!confirmed.has(path)) throw new Error(`Storage cleanup did not confirm ${path}`);
    }
  }

  await visit(organizationId, 0);
  if (paths.length > 0) {
    const residue: string[] = [];
    async function findResidue(folder: string, depth: number): Promise<void> {
      if (depth > 4) throw new Error(`Owner Statement fixture residue depth exceeded at ${folder}`);
      const listed = await bucket.list(folder, { limit: 1 });
      if (listed.error) throw listed.error;
      for (const entry of listed.data ?? []) {
        const entryPath = `${folder}/${entry.name}`;
        if (entry.id) residue.push(entryPath);
        else await findResidue(entryPath, depth + 1);
      }
    }
    await findResidue(organizationId, 0);
    if (residue.length > 0) throw new Error(`Owner Statement fixture cleanup residue: ${residue[0]}`);
  }
}

function fixtureMonthStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 24, 1))
    .toISOString().slice(0, 10);
}

function localRuntime() {
  const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const result = spawnSync(
    process.platform === "win32" ? "cmd.exe" : path.join(cwd, "node_modules", ".bin", "supabase"),
    process.platform === "win32"
      ? ["/d", "/s", "/c", "node_modules\\.bin\\supabase.cmd status -o env"]
      : ["status", "-o", "env"],
    { cwd, encoding: "utf8", shell: false },
  );
  if (result.error || result.status !== 0) throw result.error ?? new Error(result.stderr);
  const values = Object.fromEntries(result.stdout.split(/\r?\n/)
    .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => [match[1], match[2].replace(/"$/, "")]));
  const apiUrl = values.API_URL;
  const anonKey = values.ANON_KEY ?? values.PUBLISHABLE_KEY;
  const serviceRoleKey = values.SERVICE_ROLE_KEY ?? values.SECRET_KEY;
  if (!apiUrl || !anonKey || !serviceRoleKey) {
    throw new Error("Local Supabase API runtime is unavailable");
  }
  const hostname = new URL(apiUrl).hostname;
  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    throw new Error(`Refusing non-local Owner Statement fixture target: ${hostname}`);
  }
  return { anonKey, apiUrl, serviceRoleKey };
}

function artifactReplayKey(key: string, publicationId: string, format: "pdf" | "xlsx") {
  return "owner-statement-artifact-v2:" + createHash("sha256")
    .update(`owner-statement-artifact-v2\0${key}\0${publicationId}\0${format}`)
    .digest("hex");
}

function required(value: unknown, key: string) {
  if (!value || typeof value !== "object") throw new Error(`Missing ${key}`);
  const candidate = (value as Record<string, unknown>)[key];
  if (typeof candidate !== "string" || !candidate) throw new Error(`Missing ${key}`);
  return candidate;
}

main().catch((error) => {
  const detail = error && typeof error === "object"
    ? JSON.stringify(error, Object.getOwnPropertyNames(error))
    : String(error);
  process.stderr.write(`Owner Statement fixture failed during ${fixturePhase}: ${detail}\n`);
  process.exitCode = 1;
});
