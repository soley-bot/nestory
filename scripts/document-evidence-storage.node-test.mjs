import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";

const organizationId = "00000000-0000-0000-0000-000000000001";
const propertyId = "10000000-0000-0000-0000-000000000001";
const bucket = "nestory-documents";

function readLocalRuntime() {
  const result = process.env.npm_execpath
    ? spawnSync(
        process.execPath,
        [process.env.npm_execpath, "exec", "--", "supabase", "status", "-o", "env"],
        { encoding: "utf8", shell: false },
      )
    : spawnSync(
        process.platform === "win32" ? "npx.cmd" : "npx",
        ["supabase", "status", "-o", "env"],
        { encoding: "utf8", shell: false },
      );
  assert.equal(result.status, 0, "local Supabase status should be available");

  const values = Object.fromEntries(
    result.stdout
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2].replace(/"$/, "")]),
  );

  assert.ok(values.API_URL, "local API URL should be present");
  assert.ok(values.ANON_KEY, "local anonymous key should be present");
  return { anonKey: values.ANON_KEY, apiUrl: values.API_URL };
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

test("real local Storage bytes equal immutable opening-evidence metadata", async () => {
  const runtime = readLocalRuntime();
  const client = createClient(runtime.apiUrl, runtime.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const login = await client.auth.signInWithPassword({
    email: "nestory@gmail.com",
    password: "123456789",
  });
  assert.equal(login.error, null, "fixture Super Admin should authenticate");

  const storagePath = `${organizationId}/documents/${randomUUID()}-opening-evidence.pdf`;
  const exactBytes = Buffer.from(
    "Nestory opening evidence actual-byte integration\r\nUSD 123.45\r\n",
    "utf8",
  );
  const contentSha256 = sha256(exactBytes);

  const upload = await client.storage.from(bucket).upload(storagePath, exactBytes, {
    cacheControl: "3600",
    contentType: "application/pdf",
    upsert: false,
  });
  assert.equal(upload.error, null, "real local Storage upload should succeed");

  let documentId;
  try {
    const createResult = await client.rpc("create_document", {
      p_category: "owner_opening_balance_evidence",
      p_content_sha256: contentSha256,
      p_file_name: "opening-evidence.pdf",
      p_mime_type: "application/pdf",
      p_organization_id: organizationId,
      p_property_id: propertyId,
      p_size_bytes: exactBytes.byteLength,
      p_storage_path: storagePath,
    });
    assert.equal(createResult.error, null, "checked document metadata create should succeed");
    assert.ok(createResult.data, "checked create should return a document ID");
    documentId = createResult.data;

    const metadataResult = await client
      .from("documents")
      .select("content_sha256, storage_path")
      .eq("id", documentId)
      .single();
    assert.equal(metadataResult.error, null, "document metadata should be readable");
    assert.equal(metadataResult.data.content_sha256, contentSha256);
    assert.equal(metadataResult.data.storage_path, storagePath);

    const download = await client.storage.from(bucket).download(storagePath);
    assert.equal(download.error, null, "uploaded evidence should download");
    const downloadedBytes = Buffer.from(await download.data.arrayBuffer());
    assert.deepEqual(downloadedBytes, exactBytes, "downloaded bytes should equal uploaded bytes");
    assert.equal(
      sha256(downloadedBytes),
      metadataResult.data.content_sha256,
      "SHA-256 of bytes actually read should equal immutable document metadata",
    );

    await client.storage.from(bucket).upload(
      storagePath,
      Buffer.from("replacement bytes", "utf8"),
      { contentType: "application/pdf", upsert: true },
    );
    const afterReplaceAttempt = await client.storage.from(bucket).download(storagePath);
    assert.equal(afterReplaceAttempt.error, null);
    assert.deepEqual(
      Buffer.from(await afterReplaceAttempt.data.arrayBuffer()),
      exactBytes,
      "fingerprinted Storage bytes cannot be replaced",
    );

    await client.storage.from(bucket).remove([storagePath]);
    const afterDeleteAttempt = await client.storage.from(bucket).download(storagePath);
    assert.equal(afterDeleteAttempt.error, null);
    assert.deepEqual(
      Buffer.from(await afterDeleteAttempt.data.arrayBuffer()),
      exactBytes,
      "fingerprinted Storage bytes cannot be deleted directly",
    );

    const wrongCleanup = await client.rpc("discard_unreferenced_document_upload", {
      p_content_sha256: "0".repeat(64),
      p_document_id: documentId,
      p_organization_id: organizationId,
      p_storage_path: storagePath,
    });
    assert.ok(wrongCleanup.error, "cleanup must reject a non-matching fingerprint");

    const stillPresent = await client
      .from("documents")
      .select("id")
      .eq("id", documentId)
      .single();
    assert.equal(stillPresent.error, null, "failed cleanup must retain the document");

    const cleanup = await client.rpc("discard_unreferenced_document_upload", {
      p_content_sha256: contentSha256,
      p_document_id: documentId,
      p_organization_id: organizationId,
      p_storage_path: storagePath,
    });
    assert.equal(cleanup.error, null, "checked cleanup should remove only the new unreferenced row");
    documentId = undefined;

    const remove = await client.storage.from(bucket).remove([storagePath]);
    assert.equal(remove.error, null, "orphan object removal should succeed after checked row cleanup");
    const afterCleanup = await client.storage.from(bucket).download(storagePath);
    assert.ok(afterCleanup.error, "checked orphan cleanup should remove the uploaded object");
  } finally {
    if (documentId) {
      await client.rpc("discard_unreferenced_document_upload", {
        p_content_sha256: contentSha256,
        p_document_id: documentId,
        p_organization_id: organizationId,
        p_storage_path: storagePath,
      });
    }
    await client.storage.from(bucket).remove([storagePath]);
  }
});
