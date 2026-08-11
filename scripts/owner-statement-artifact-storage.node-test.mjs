import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import test, { after, before } from "node:test";
import { createClient } from "@supabase/supabase-js";

const organizationId = "00000000-0000-0000-0000-000000000001";
const propertyId = "10000000-0000-0000-0000-000000000004";
const ownerId = "80000000-0000-0000-0000-000000000014";
const actorId = "00000000-0000-0000-0000-000000000101";
const runtime = localRuntime();
const user = createClient(runtime.apiUrl, runtime.anonKey, clientOptions());
const service = createClient(runtime.apiUrl, runtime.serviceKey, clientOptions());
const uploadedPaths = new Set();

function restoreFixture() {
  const restored = spawnSync(process.execPath, ["scripts/load-test-fixture.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: false,
    timeout: 60_000,
  });
  assert.equal(restored.status, 0, restored.stderr);
}

before(restoreFixture);
after(async () => {
  for (const path of uploadedPaths) {
    const removed = await service.storage.from("owner-statements").remove([path]);
    assert.ifError(removed.error);
    assert.ok(
      removed.data?.some((object) => object.name === path),
      `cleanup must confirm removal of ${path}`,
    );
    const absent = await service.storage.from("owner-statements").download(path);
    assert.ok(absent.error, `cleaned Storage path must not download: ${path}`);
  }
  restoreFixture();
});

test("only trusted byte verification can complete retained artifact authority", async () => {
  const signedIn = await user.auth.signInWithPassword({
    email: "nestory@gmail.com",
    password: "123456789",
  });
  assert.ifError(signedIn.error);
  const monthStart = fixtureMonthStart();
  const locked = await user.rpc("set_financial_month_lock", {
    p_locked: true,
    p_month_start: monthStart,
    p_organization_id: organizationId,
    p_reason: "Real Storage correction-round verification",
  });
  assert.ifError(locked.error);
  const closed = await user.rpc("close_owner_month", {
    p_close_reason: "Real Storage correction-round verification",
    p_currency: "USD",
    p_idempotency_key: "track-4b-correction-storage-close",
    p_month_start: monthStart,
    p_organization_id: organizationId,
    p_owner_person_id: ownerId,
    p_property_id: propertyId,
  });
  assert.ifError(closed.error);
  const published = await user.rpc("publish_owner_statement", {
    p_idempotency_key: "track-4b-correction-storage-publish",
    p_organization_id: organizationId,
    p_owner_close_revision_id: closed.data.revision_id,
  });
  assert.ifError(published.error);

  const publicationId = published.data.publication_id;
  const statementNumber = published.data.statement_number;
  const path = `${organizationId}/${publicationId}/pdf/` +
    `owner-statement-${statementNumber}.pdf`;
  const bytes = new TextEncoder().encode("retained-owner-statement-byte-proof");
  const uploaded = await user.storage.from("owner-statements").upload(path, bytes, {
    contentType: "application/pdf",
    upsert: false,
  });
  assert.ifError(uploaded.error);
  uploadedPaths.add(path);

  const forged = await user.rpc("register_owner_statement_artifact", {
    p_format: "pdf",
    p_idempotency_key: "track-4b-correction-forged-user-metadata",
    p_organization_id: organizationId,
    p_publication_id: publicationId,
    p_sha256: "0".repeat(64),
    p_size_bytes: 999,
    p_storage_path: path,
  });
  assert.ok(forged.error, "authenticated caller metadata must never register");

  const object = await service.rpc("get_owner_statement_artifact_object", {
    p_actor_id: actorId,
    p_format: "pdf",
    p_organization_id: organizationId,
    p_publication_id: publicationId,
    p_storage_path: path,
  });
  assert.ifError(object.error);
  const retained = await service.storage.from("owner-statements").download(path);
  assert.ifError(retained.error);
  const retainedBytes = new Uint8Array(await retained.data.arrayBuffer());
  const sha256 = createHash("sha256").update(retainedBytes).digest("hex");

  const wrongVersion = await service.rpc("register_owner_statement_artifact_verified", {
    p_actor_id: actorId,
    p_content_type: "application/pdf",
    p_format: "pdf",
    p_idempotency_key: "track-4b-correction-wrong-object-version",
    p_organization_id: organizationId,
    p_publication_id: publicationId,
    p_sha256: sha256,
    p_size_bytes: retainedBytes.byteLength,
    p_storage_object_id: object.data.storage_object_id,
    p_storage_object_version: "wrong-version",
    p_storage_path: path,
  });
  assert.ok(wrongVersion.error);

  const wrongSize = await service.rpc("register_owner_statement_artifact_verified", {
    p_actor_id: actorId,
    p_content_type: "application/pdf",
    p_format: "pdf",
    p_idempotency_key: "track-4b-correction-wrong-object-size",
    p_organization_id: organizationId,
    p_publication_id: publicationId,
    p_sha256: sha256,
    p_size_bytes: retainedBytes.byteLength + 1,
    p_storage_object_id: object.data.storage_object_id,
    p_storage_object_version: object.data.storage_object_version,
    p_storage_path: path,
  });
  assert.match(wrongSize.error?.message ?? "", /owner_statement_artifact_metadata_mismatch/);

  const wrongContentType = await service.rpc("register_owner_statement_artifact_verified", {
    p_actor_id: actorId,
    p_content_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    p_format: "pdf",
    p_idempotency_key: "track-4b-correction-wrong-content-type",
    p_organization_id: organizationId,
    p_publication_id: publicationId,
    p_sha256: sha256,
    p_size_bytes: retainedBytes.byteLength,
    p_storage_object_id: object.data.storage_object_id,
    p_storage_object_version: object.data.storage_object_version,
    p_storage_path: path,
  });
  assert.match(wrongContentType.error?.message ?? "", /owner_statement_artifact_invalid/);

  const registered = await service.rpc("register_owner_statement_artifact_verified", {
    p_actor_id: actorId,
    p_content_type: "application/pdf",
    p_format: "pdf",
    p_idempotency_key: "track-4b-correction-verified-pdf",
    p_organization_id: organizationId,
    p_publication_id: publicationId,
    p_sha256: sha256,
    p_size_bytes: retainedBytes.byteLength,
    p_storage_object_id: object.data.storage_object_id,
    p_storage_object_version: object.data.storage_object_version,
    p_storage_path: path,
  });
  assert.ifError(registered.error);

  const metadata = await user.rpc("get_owner_statement_artifact_download", {
    p_artifact_id: registered.data.artifact_id,
    p_organization_id: organizationId,
  });
  assert.ifError(metadata.error);
  assert.equal(metadata.data.sha256, sha256);
  assert.equal(metadata.data.size_bytes, retainedBytes.byteLength);

  const replacement = await user.storage.from("owner-statements").upload(
    path,
    new TextEncoder().encode("replacement"),
    { contentType: "application/pdf", upsert: true },
  );
  assert.ok(replacement.error, "registered bytes must not be replaceable");
});

function clientOptions() {
  return {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  };
}

function fixtureMonthStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 24, 1))
    .toISOString().slice(0, 10);
}

function localRuntime() {
  const result = spawnSync(
    process.platform === "win32" ? "cmd.exe" : "npx",
    process.platform === "win32"
      ? ["/d", "/s", "/c", "node_modules\\.bin\\supabase.cmd status -o env"]
      : ["supabase", "status", "-o", "env"],
    { cwd: process.cwd(), encoding: "utf8", shell: false },
  );
  assert.equal(result.status, 0, result.stderr);
  const values = Object.fromEntries(result.stdout.split(/\r?\n/)
    .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter(Boolean)
    .map((match) => [match[1], match[2].replace(/"$/, "")]));
  return {
    anonKey: values.ANON_KEY ?? values.PUBLISHABLE_KEY,
    apiUrl: values.API_URL,
    serviceKey: values.SERVICE_ROLE_KEY ?? values.SECRET_KEY,
  };
}
