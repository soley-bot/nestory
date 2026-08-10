import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const organizationId = "00000000-0000-0000-0000-000000000001";
const propertyId = "10000000-0000-0000-0000-000000000004";
const ownerId = "80000000-0000-0000-0000-000000000014";
const manifest = JSON.parse(readFileSync(
  new URL("./fixtures/owner-statement-publication.json", import.meta.url),
  "utf8",
));

const runtime = localRuntime();
const client = createClient(runtime.apiUrl, runtime.anonKey, {
  auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
});
const signedIn = await client.auth.signInWithPassword({
  email: "nestory@gmail.com",
  password: "123456789",
});
assert.ifError(signedIn.error);

const monthStart = new Date(Date.UTC(
  new Date().getUTCFullYear(),
  new Date().getUTCMonth() + 24,
  1,
)).toISOString().slice(0, 10);
const series = await client.from("owner_close_series").select("id")
  .eq("organization_id", organizationId)
  .eq("property_id", propertyId)
  .eq("owner_person_id", ownerId)
  .eq("month_start", monthStart)
  .single();
assert.ifError(series.error);

const listed = await client.rpc("get_owner_statement_publications_for_series", {
  p_organization_id: organizationId,
  p_owner_close_series_id: series.data.id,
});
assert.ifError(listed.error);
assert.equal(listed.data.length, 1);
const summary = listed.data[0];
assert.match(
  summary.statement_number,
  new RegExp(manifest.runtimeAuthority.statementNumberPattern),
);
assert.match(
  summary.content_hash,
  new RegExp(manifest.runtimeAuthority.sha256Pattern),
);
assert.deepEqual(
  summary.artifacts.map(({ format }) => format),
  manifest.runtimeAuthority.artifactFormats,
);

const publication = await client.rpc("get_owner_statement_publication", {
  p_organization_id: organizationId,
  p_publication_id: summary.id,
});
assert.ifError(publication.error);
assert.equal(publication.data.lines.length, 9);
assert.equal(
  publication.data.lines.reduce((total, line) => total + line.sources.length, 0),
  9,
);
assert.deepEqual(
  Object.fromEntries(publication.data.components.map((component) => [
    component.component,
    component.closing_amount,
  ])),
  manifest.reconciliation.closingComponents,
);

for (const artifact of publication.data.artifacts) {
  const downloaded = await client.storage.from("owner-statements")
    .download(artifact.storage_path);
  assert.ifError(downloaded.error);
  const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
  assert.equal(bytes.byteLength, artifact.size_bytes);
  assert.match(artifact.sha256, new RegExp(manifest.runtimeAuthority.sha256Pattern));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), artifact.sha256);
}

process.stdout.write(
  `Owner Statement fixture reconciled ${summary.statement_number}: ` +
  `9 lines, 9 sources, 4 components, PDF/XLSX retained, difference 0.00.\n`,
);

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
  };
}
