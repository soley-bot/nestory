import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";

import { selectLocalDatabaseContainer } from "./load-test-fixture.mjs";

const organizationId = "00000000-0000-0000-0000-000000000001";
const propertyId = "10000000-0000-0000-0000-000000000001";
const bucket = "nestory-documents";
const repoRoot = path.resolve(import.meta.dirname, "..");

function databaseContainer() {
  const result = spawnSync(
    "docker",
    ["ps", "--filter", "name=^/supabase_db_", "--format", "{{.Names}}"],
    { cwd: repoRoot, encoding: "utf8", shell: false },
  );
  assert.equal(result.status, 0, result.stderr);
  return selectLocalDatabaseContainer(
    repoRoot,
    result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
  );
}

function cleanupExactArtifacts(runId, storagePaths) {
  const expectedPrefix = `${organizationId}/documents/${runId}-`;
  assert.ok(storagePaths.length > 0, "cleanup requires exact test object paths");
  assert.equal(
    new Set(storagePaths).size,
    storagePaths.length,
    "cleanup paths must be unique",
  );
  for (const storagePath of storagePaths) {
    assert.ok(
      storagePath.startsWith(expectedPrefix),
      `cleanup path must remain inside the exact test run: ${storagePath}`,
    );
  }

  const pathArray = storagePaths.map((storagePath) => `'${storagePath}'`).join(",");
  const sql = `
    BEGIN;
    LOCK TABLE public.documents IN ACCESS EXCLUSIVE MODE;
    CREATE TEMP TABLE document_evidence_cleanup_ids ON COMMIT DROP AS
    SELECT id
    FROM public.documents
    WHERE organization_id = '${organizationId}'
      AND storage_path = ANY (ARRAY[${pathArray}]::text[]);
    DELETE FROM public.activity_logs
    WHERE organization_id = '${organizationId}'
      AND (
        entity_id IN (SELECT id FROM document_evidence_cleanup_ids)
        OR new_values ->> 'document_id' IN (
          SELECT id::text FROM document_evidence_cleanup_ids
        )
        OR previous_values ->> 'document_id' IN (
          SELECT id::text FROM document_evidence_cleanup_ids
        )
      );
    ALTER TABLE public.documents
      DISABLE TRIGGER guard_document_content_fingerprint;
    DELETE FROM public.documents
    WHERE id IN (SELECT id FROM document_evidence_cleanup_ids);
    ALTER TABLE public.documents
      ENABLE TRIGGER guard_document_content_fingerprint;
    SELECT set_config('storage.allow_delete_query', 'true', true);
    DELETE FROM storage.objects AS object
    WHERE object.bucket_id = '${bucket}'
      AND object.name = ANY (ARRAY[${pathArray}]::text[])
      AND NOT EXISTS (
        SELECT 1 FROM public.documents AS document
        WHERE document.storage_path = object.name
      );
    COMMIT;
    SELECT jsonb_build_array(
      (
        SELECT count(*) FROM public.documents
        WHERE storage_path = ANY (ARRAY[${pathArray}]::text[])
      ),
      (
        SELECT count(*) FROM storage.objects
        WHERE bucket_id = '${bucket}'
          AND name = ANY (ARRAY[${pathArray}]::text[])
      )
    );
  `;
  const container = databaseContainer();
  const result = spawnSync(
    "docker",
    [
      "exec", container, "psql", "-X", "-U", "postgres", "-d", "postgres",
      "-v", "ON_ERROR_STOP=1", "-At", "-c", sql,
    ],
    { cwd: repoRoot, encoding: "utf8", shell: false },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    result.stdout.trim().split(/\r?\n/).at(-1),
    "[0, 0]",
    "real Storage harness must leave zero exact document rows and objects",
  );
}

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
  const runId = randomUUID();
  const artifactPath = (suffix) =>
    `${organizationId}/documents/${runId}-${suffix}`;
  const orphanPath = artifactPath("failed-create.pdf");
  const linkedPaths = new Map(
    ["timeline", "task", "lease", "tenant-request"].map((label) => [
      label,
      artifactPath(`${label}.pdf`),
    ]),
  );
  const storagePath = artifactPath("opening-evidence.pdf");
  const replacementPath = artifactPath("replacement.pdf");
  const failedReplacementPath = artifactPath("failed-replacement.pdf");
  const exactArtifactPaths = [
    orphanPath,
    ...linkedPaths.values(),
    storagePath,
    replacementPath,
    failedReplacementPath,
  ];

  try {
    const runtime = readLocalRuntime();
    const client = createClient(runtime.apiUrl, runtime.anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const login = await client.auth.signInWithPassword({
      email: "nestory@gmail.com",
      password: "123456789",
    });
    assert.equal(login.error, null, "fixture Super Admin should authenticate");

  const orphanBytes = Buffer.from("unregistered failed create\n", "utf8");
  const orphanUpload = await client.storage.from(bucket).upload(orphanPath, orphanBytes, {
    contentType: "application/pdf",
    upsert: false,
  });
  assert.equal(orphanUpload.error, null, "failed-create object upload should succeed");
  const failedCreate = await client.rpc("create_document", {
    p_category: "owner_opening_balance_evidence",
    p_content_sha256: "BAD-HASH",
    p_file_name: "failed-create.pdf",
    p_mime_type: "application/pdf",
    p_organization_id: organizationId,
    p_property_id: propertyId,
    p_size_bytes: orphanBytes.byteLength,
    p_storage_path: orphanPath,
  });
  assert.ok(failedCreate.error, "failed checked create should roll back all metadata");
  const orphanMetadata = await client
    .from("documents")
    .select("id")
    .eq("storage_path", orphanPath)
    .maybeSingle();
  assert.equal(orphanMetadata.error, null);
  assert.equal(orphanMetadata.data, null, "failed create leaves no registered row");
  const removeOrphan = await client.storage.from(bucket).remove([orphanPath]);
  assert.equal(
    removeOrphan.error,
    null,
    "only the unique unregistered failed-create object is removable",
  );
  const removedOrphan = await client.storage.from(bucket).download(orphanPath);
  assert.ok(removedOrphan.error, "unregistered failed-create object should be gone");

  const ledgerEntry = await client
    .from("ledger_entries")
    .select("id, unit_id")
    .eq("organization_id", organizationId)
    .eq("property_id", propertyId)
    .limit(1)
    .single();
  assert.equal(ledgerEntry.error, null, "fixture should expose one Ledger entry");

  const representativeLinks = [
    {
      argument: "p_timeline_event_id",
      label: "timeline",
      table: "timeline_events",
    },
    {
      argument: "p_task_id",
      label: "task",
      table: "tasks",
    },
    {
      argument: "p_lease_id",
      label: "lease",
      table: "leases",
    },
    {
      argument: "p_tenant_request_id",
      label: "tenant-request",
      table: "tenant_requests",
    },
  ];

  for (const link of representativeLinks) {
    const linkedRecord = await client
      .from(link.table)
      .select("id, unit_id")
      .eq("organization_id", organizationId)
      .eq("property_id", propertyId)
      .limit(1)
      .single();
    assert.equal(
      linkedRecord.error,
      null,
      `fixture should expose one ${link.label} record`,
    );
    const linkedPath = linkedPaths.get(link.label);
    assert.ok(linkedPath);
    const linkedBytes = Buffer.from(`registered ${link.label} document\n`, "utf8");
    const linkedHash = sha256(linkedBytes);
    const linkedUpload = await client.storage
      .from(bucket)
      .upload(linkedPath, linkedBytes, {
        contentType: "application/pdf",
        upsert: false,
      });
    assert.equal(linkedUpload.error, null);
    const linkedCreate = await client.rpc("create_document", {
      [link.argument]: linkedRecord.data.id,
      p_category: `${link.label} evidence`,
      p_content_sha256: linkedHash,
      p_file_name: `${link.label}.pdf`,
      p_mime_type: "application/pdf",
      p_organization_id: organizationId,
      p_property_id: propertyId,
      p_size_bytes: linkedBytes.byteLength,
      p_storage_path: linkedPath,
      p_unit_id: linkedRecord.data.unit_id,
    });
    assert.equal(linkedCreate.error, null, `${link.label} document create should succeed`);
    assert.ok(linkedCreate.data);
    const retiredLinkedDiscard = await client.rpc(
      "discard_unreferenced_document_upload",
      {
        p_content_sha256: linkedHash,
        p_document_id: linkedCreate.data,
        p_organization_id: organizationId,
        p_storage_path: linkedPath,
      },
    );
    assert.ok(
      retiredLinkedDiscard.error,
      `${link.label} linked metadata has no authenticated discard route`,
    );
    const retainedLinkedRow = await client
      .from("documents")
      .select("id")
      .eq("id", linkedCreate.data)
      .single();
    assert.equal(
      retainedLinkedRow.error,
      null,
      `${link.label} linked metadata must remain`,
    );
  }

  if (
    process.env.NESTORY_DOCUMENT_EVIDENCE_FORCE_FAILURE ===
    "after-linked-documents"
  ) {
    assert.fail("forced test-only failure after registered linked documents");
  }

  const exactBytes = Buffer.from(
    "Nestory opening evidence actual-byte integration\r\nUSD 123.45\r\n",
    "utf8",
  );
  const contentSha256 = sha256(exactBytes);
  const replacementBytes = Buffer.from(
    "Nestory replacement evidence actual-byte integration\r\nUSD 123.45\r\n",
    "utf8",
  );
  const replacementSha256 = sha256(replacementBytes);

  const upload = await client.storage.from(bucket).upload(storagePath, exactBytes, {
    cacheControl: "3600",
    contentType: "application/pdf",
    upsert: false,
  });
  assert.equal(upload.error, null, "real local Storage upload should succeed");

  {
    const createResult = await client.rpc("create_document", {
      p_category: "owner_opening_balance_evidence",
      p_content_sha256: contentSha256,
      p_file_name: "opening-evidence.pdf",
      p_ledger_entry_id: ledgerEntry.data.id,
      p_mime_type: "application/pdf",
      p_organization_id: organizationId,
      p_property_id: propertyId,
      p_size_bytes: exactBytes.byteLength,
      p_storage_path: storagePath,
      p_unit_id: ledgerEntry.data.unit_id,
    });
    assert.equal(createResult.error, null, "checked document metadata create should succeed");
    assert.ok(createResult.data, "checked create should return a document ID");
    const documentId = createResult.data;

    const metadataResult = await client
      .from("documents")
      .select("content_sha256, storage_path")
      .eq("id", documentId)
      .single();
    assert.equal(metadataResult.error, null, "document metadata should be readable");
    assert.equal(metadataResult.data.content_sha256, contentSha256);
    assert.equal(metadataResult.data.storage_path, storagePath);

    const retiredDiscard = await client.rpc(
      "discard_unreferenced_document_upload",
      {
        p_content_sha256: contentSha256,
        p_document_id: documentId,
        p_organization_id: organizationId,
        p_storage_path: storagePath,
      },
    );
    assert.ok(
      retiredDiscard.error,
      "no authenticated RPC may discard successfully created metadata",
    );
    const retainedAfterDiscardAttempt = await client
      .from("documents")
      .select("id")
      .eq("id", documentId)
      .single();
    assert.equal(
      retainedAfterDiscardAttempt.error,
      null,
      "successfully created linked document metadata must remain",
    );

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

    const replacementUpload = await client.storage
      .from(bucket)
      .upload(replacementPath, replacementBytes, {
        contentType: "application/pdf",
        upsert: false,
      });
    assert.equal(replacementUpload.error, null, "replacement upload should succeed");
    const replacement = await client.rpc("replace_document", {
      p_category: "owner_opening_balance_evidence",
      p_content_sha256: replacementSha256,
      p_document_id: documentId,
      p_file_name: "replacement.pdf",
      p_mime_type: "application/pdf",
      p_organization_id: organizationId,
      p_property_id: propertyId,
      p_size_bytes: replacementBytes.byteLength,
      p_storage_path: replacementPath,
      p_unit_id: ledgerEntry.data.unit_id,
    });
    assert.equal(replacement.error, null, "atomic replacement should succeed");
    assert.ok(replacement.data, "atomic replacement should return the new row identity");

    const replacementRows = await client
      .from("documents")
      .select("id, archived_at, content_sha256, ledger_entry_id, storage_path")
      .in("id", [documentId, replacement.data]);
    assert.equal(replacementRows.error, null);
    const oldRow = replacementRows.data.find((row) => row.id === documentId);
    const newRow = replacementRows.data.find((row) => row.id === replacement.data);
    assert.ok(oldRow?.archived_at, "old linked metadata should be archived and retained");
    assert.equal(oldRow?.content_sha256, contentSha256);
    assert.equal(oldRow?.ledger_entry_id, ledgerEntry.data.id);
    assert.equal(newRow?.archived_at, null);
    assert.equal(newRow?.content_sha256, replacementSha256);
    assert.equal(newRow?.ledger_entry_id, ledgerEntry.data.id);
    assert.equal(newRow?.storage_path, replacementPath);

    const failedReplacementUpload = await client.storage
      .from(bucket)
      .upload(failedReplacementPath, orphanBytes, {
        contentType: "application/pdf",
        upsert: false,
      });
    assert.equal(failedReplacementUpload.error, null);
    const failedReplacement = await client.rpc("replace_document", {
      p_category: "owner_opening_balance_evidence",
      p_content_sha256: "WRONG-HASH",
      p_document_id: replacement.data,
      p_file_name: "failed-replacement.pdf",
      p_mime_type: "application/pdf",
      p_organization_id: organizationId,
      p_property_id: propertyId,
      p_size_bytes: orphanBytes.byteLength,
      p_storage_path: failedReplacementPath,
      p_unit_id: ledgerEntry.data.unit_id,
    });
    assert.ok(failedReplacement.error, "failed replacement should roll back metadata");
    const failedReplacementRow = await client
      .from("documents")
      .select("id")
      .eq("storage_path", failedReplacementPath)
      .maybeSingle();
    assert.equal(failedReplacementRow.error, null);
    assert.equal(failedReplacementRow.data, null);
    const removeFailedReplacement = await client.storage
      .from(bucket)
      .remove([failedReplacementPath]);
    assert.equal(
      removeFailedReplacement.error,
      null,
      "failed atomic replacement leaves only an unregistered object to remove",
    );

    await client.storage.from(bucket).remove([storagePath, replacementPath]);
    const retainedOldBytes = await client.storage.from(bucket).download(storagePath);
    const retainedNewBytes = await client.storage.from(bucket).download(replacementPath);
    assert.equal(retainedOldBytes.error, null, "old registered bytes remain immutable");
    assert.equal(retainedNewBytes.error, null, "new registered bytes remain immutable");
    assert.deepEqual(
      Buffer.from(await retainedOldBytes.data.arrayBuffer()),
      exactBytes,
    );
    assert.deepEqual(
      Buffer.from(await retainedNewBytes.data.arrayBuffer()),
      replacementBytes,
    );
    }
  } finally {
    cleanupExactArtifacts(runId, exactArtifactPaths);
  }
});
