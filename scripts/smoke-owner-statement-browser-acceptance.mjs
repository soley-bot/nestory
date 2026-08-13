import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { setHiddenControlValue } from "./playwright-form-controls.mjs";

import { findLocalDatabaseContainer } from "./load-test-fixture.mjs";
import { validateLocalBaseUrl } from "./smoke-ui-redesign-policy.mjs";

const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const databaseContainer = findLocalDatabaseContainer(cwd);
const baseUrl = validateLocalBaseUrl(process.env.NESTORY_BASE_URL ?? "http://localhost:3000");
const password = process.env.NESTORY_TEST_PASSWORD ?? "123456789";
const actors = {
  super_admin: "nestory@gmail.com",
  finance_manager: "finance.manager@nestory.com",
  finance_member: "finance.member@nestory.com",
  operations_manager: "operations.manager@nestory.com",
};
const organizationId = "00000000-0000-0000-0000-000000000001";
const propertyId = "10000000-0000-0000-0000-000000000004";
const ownerId = "80000000-0000-0000-0000-000000000014";
const monthStart = dbScalar(
  "SELECT (date_trunc('month', current_date) + interval '24 months')::date::text;",
);
const month = monthStart.slice(0, 7);

let browser;
try {
  loadBaseline();
  const initial = publicationRows();
  assert.equal(initial.length, 1, "guarded fixture must begin with one official statement");
  assert.equal(initial[0].revision_number, 3);
  assert.equal(initial[0].artifact_count, 2);
  const firstSnapshot = publicationSnapshot(initial[0].id);

  browser = await chromium.launch({ headless: true });
  await withBalanceActor(actors.finance_manager, async (page) => {
    await page.getByText("Ready to close owner month · revision 4", { exact: true }).waitFor();
    await page.getByText(initial[0].statement_number, { exact: true }).waitFor();
    await assertPublicationDownloads(page, initial[0]);
    phase("Finance Manager sees retained revision three publication and ready revision four");

    const close = formByButton(page, "Close owner month");
    await close.getByLabel("Close reason").fill(
      "Browser revision four approved for superseding official Owner Statement",
    );
    await close.getByRole("button", { name: "Close owner month" }).click();
    await waitForDb("revision four close", `
      SELECT count(*) = 1 FROM public.owner_close_revisions AS revision
      JOIN public.owner_close_series AS series ON series.id = revision.owner_close_series_id
      WHERE series.organization_id = '${organizationId}'
        AND series.property_id = '${propertyId}' AND series.owner_person_id = '${ownerId}'
        AND series.month_start = '${monthStart}'
        AND revision.revision_number = 4 AND revision.status = 'closed';
    `);
    await page.reload({ waitUntil: "networkidle" });
    await page.getByText("Ready to publish the owner statement", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Publish owner statement" }).click();
    await waitForDb("superseding publication and retained artifacts", `
      SELECT count(*) = 2
        AND count(*) FILTER (WHERE artifact_count = 2) = 2
        AND count(*) FILTER (WHERE supersedes_publication_id IS NOT NULL) = 1
      FROM (
        SELECT publication.id, publication.supersedes_publication_id,
          (SELECT count(*) FROM public.owner_statement_artifacts AS artifact
           WHERE artifact.publication_id = publication.id) AS artifact_count
        FROM public.owner_statement_publications AS publication
        JOIN public.owner_close_revisions AS revision
          ON revision.id = publication.owner_close_revision_id
        JOIN public.owner_close_series AS series
          ON series.id = revision.owner_close_series_id
        WHERE series.organization_id = '${organizationId}'
          AND series.property_id = '${propertyId}' AND series.owner_person_id = '${ownerId}'
          AND series.month_start = '${monthStart}'
      ) AS publications;
    `, 30_000);

    const publications = publicationRows();
    assert.equal(publications.length, 2);
    const latest = publications.find((row) => row.revision_number === 4);
    assert.ok(latest);
    assert.equal(latest.supersedes_publication_id, initial[0].id);
    assert.equal(publicationSnapshot(initial[0].id), firstSnapshot);
    await page.reload({ waitUntil: "networkidle" });
    await page.getByText(initial[0].statement_number, { exact: true }).waitFor();
    await page.getByText(latest.statement_number, { exact: true }).waitFor();
    await page.getByText("Superseded", { exact: true }).waitFor();
    await assertPublicationDownloads(page, initial[0]);
    await assertPublicationDownloads(page, latest);
    phase("N plus one supersedes N while both retained byte sets verify");
  });

  await withBalanceActor(actors.finance_member, async (page) => {
    const publications = publicationRows();
    for (const publication of publications) {
      await page.getByText(publication.statement_number, { exact: true }).waitFor();
      await assertPublicationDownloads(page, publication);
    }
    assert.equal(await page.getByRole("button", { name: "Publish owner statement" }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Close owner month" }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Reopen month" }).count(), 0);
    phase("Finance Member reads and downloads without mutation authority");
  });

  await withShellActor(actors.operations_manager, async (page) => {
    assert.equal(
      await page.locator('nav[aria-label="Global navigation"] a[href="/balances"]').count(),
      0,
    );
    const response = await page.goto(`${baseUrl}/balances`, { waitUntil: "networkidle" });
    assert.ok(
      new URL(page.url()).pathname !== "/balances" || [401, 403, 404].includes(response?.status() ?? 0),
      "Operations Manager reached official Owner Statement authority",
    );
    phase("Operations Manager is denied route and navigation");
  });

  assert.equal(dbScalar(`SELECT count(*) FROM app_private.financial_idempotency_requests
    WHERE status = 'pending' AND operation IN
      ('publish_owner_statement','register_owner_statement_artifact');`), "0");
  process.stdout.write(
    "PASS one official Owner Statement browser lifecycle: Finance Manager close and publish, retained N, immutable bytes, Finance Member read-only, Operations denied\n",
  );
} finally {
  await browser?.close();
  loadBaseline();
}

async function assertPublicationDownloads(page, publication) {
  const card = page.locator("article").filter({
    has: page.getByText(publication.statement_number, { exact: true }),
  });
  for (const artifact of artifactRows(publication.id)) {
    const name = artifact.format === "pdf" ? "Download PDF" : "Download Excel";
    const href = await card.getByRole("link", { name }).getAttribute("href");
    assert.ok(href);
    const response = await page.request.get(new URL(href, baseUrl).toString());
    assert.equal(response.status(), 200);
    const bytes = await response.body();
    assert.equal(bytes.byteLength, artifact.size_bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), artifact.sha256);
  }
}

function publicationRows() {
  return JSON.parse(dbScalar(`
    SELECT coalesce(json_agg(row_to_json(result) ORDER BY result.revision_number), '[]'::json)::text
    FROM (
      SELECT publication.id::text, publication.statement_number, publication.content_hash,
        publication.supersedes_publication_id::text, revision.revision_number,
        (SELECT count(*)::integer FROM public.owner_statement_artifacts AS artifact
         WHERE artifact.publication_id = publication.id) AS artifact_count
      FROM public.owner_statement_publications AS publication
      JOIN public.owner_close_revisions AS revision ON revision.id = publication.owner_close_revision_id
      JOIN public.owner_close_series AS series ON series.id = revision.owner_close_series_id
      WHERE series.organization_id = '${organizationId}'
        AND series.property_id = '${propertyId}' AND series.owner_person_id = '${ownerId}'
        AND series.month_start = '${monthStart}'
    ) AS result;
  `));
}

function artifactRows(publicationId) {
  return JSON.parse(dbScalar(`SELECT coalesce(json_agg(json_build_object(
    'id', id::text, 'format', format, 'sha256', sha256, 'size_bytes', size_bytes
  ) ORDER BY format), '[]'::json)::text FROM public.owner_statement_artifacts
  WHERE publication_id = '${publicationId}';`));
}

function publicationSnapshot(publicationId) {
  return dbScalar(`SELECT jsonb_build_object(
    'publication', to_jsonb(publication),
    'artifacts', (SELECT jsonb_agg(to_jsonb(artifact) ORDER BY artifact.format)
      FROM public.owner_statement_artifacts AS artifact WHERE artifact.publication_id = publication.id)
  )::text FROM public.owner_statement_publications AS publication
  WHERE publication.id = '${publicationId}';`);
}

async function withBalanceActor(email, run) {
  return withShellActor(email, async (page) => {
    const toggle = page.getByRole("button", { name: /(?:Expand|Collapse) Finance navigation/ });
    if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
    const link = page.locator('nav[aria-label="Global navigation"] a[href="/balances"]')
      .filter({ hasText: "Owner balances" });
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/balances", { waitUntil: "networkidle" }),
      link.click(),
    ]);
    const form = formByButton(page, "Load balances");
    await setHiddenControlValue(form, "propertyId", propertyId);
    await setHiddenControlValue(form, "ownerPersonId", ownerId);
    await form.getByLabel("Month").fill(month);
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/balances" && url.searchParams.get("month") === month),
      form.getByRole("button", { name: "Load balances" }).click(),
    ]);
    await page.getByTestId("owner-close-readiness").waitFor();
    await run(page);
  });
}

async function withShellActor(email, run) {
  const context = await browser.newContext({ viewport: { height: 960, width: 1440 } });
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL((url) => url.pathname !== "/login", { timeout: 15_000 });
    await page.goto(`${baseUrl}/workspace`, { waitUntil: "networkidle" });
    await page.waitForURL((url) => url.pathname !== "/workspace", {
      waitUntil: "networkidle",
    });
    await run(page);
  } finally {
    await context.close();
  }
}

function formByButton(page, name) {
  return page.locator("form").filter({ has: page.getByRole("button", { name, exact: true }) }).first();
}

async function waitForDb(label, sql, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (dbScalar(sql) === "t") return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Owner Statement DB phase timed out: ${label}`);
}

function phase(label) { process.stdout.write(`PASS ${label}\n`); }

function loadBaseline() {
  const result = spawnSync(process.execPath, [
    "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
    path.join(cwd, "scripts", "load-test-fixture.mjs"),
  ], {
    cwd, encoding: "utf8", env: { ...process.env, SUPABASE_DB_CONTAINER: databaseContainer }, shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
}

function dbScalar(sql) {
  const result = spawnSync("docker", [
    "exec", databaseContainer, "psql", "-X", "-qAt", "-U", "postgres", "-d", "postgres",
    "-v", "ON_ERROR_STOP=1", "-c", sql,
  ], { cwd, encoding: "utf8", shell: false });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.split(/\r?\n/).map((row) => row.trim()).filter(Boolean).at(-1) ?? "";
}
