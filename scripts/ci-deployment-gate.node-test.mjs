import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowPath = new URL("../.github/workflows/ci.yml", import.meta.url);
const pilotSnapshotPath = new URL("./pilot-preservation-snapshot.sql", import.meta.url);
const newlineRecoveryPath = new URL(
  "./normalize-hosted-function-newlines.sql",
  import.meta.url,
);
const newlineRecoveryVerificationPath = new URL(
  "./verify-hosted-function-newline-recovery.sql",
  import.meta.url,
);
const newlineRecoveryClassifierPath = new URL(
  "./classify-hosted-function-newline-recovery.sql",
  import.meta.url,
);

function getJob(workflow, jobName) {
  const normalized = workflow.replace(/\r\n/g, "\n");
  const marker = `  ${jobName}:\n`;
  const start = normalized.indexOf(marker);

  assert.notEqual(start, -1, `missing ${jobName} job`);

  const remainder = normalized.slice(start + marker.length);
  const nextJob = remainder.search(/^  [a-z0-9_-]+:\n/m);

  return nextJob === -1 ? remainder : remainder.slice(0, nextJob);
}

function getStep(job, stepName) {
  const marker = `      - name: ${stepName}\n`;
  const start = job.indexOf(marker);

  assert.notEqual(start, -1, `missing ${stepName} step`);

  const remainder = job.slice(start + marker.length);
  const nextStep = remainder.search(/^      - name: /m);

  return nextStep === -1 ? remainder : remainder.slice(0, nextStep);
}

test("production CI reports both release gates to Vercel", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const application = getJob(workflow, "application_gate");
  const database = getJob(workflow, "production_database_gate");

  assert.match(workflow, /^  statuses: write$/m);

  for (const [job, dependency, stepName, statusName] of [
    [
      application,
      "application",
      "Report Application deployment gate",
      "Vercel - nestory: Application",
    ],
    [
      database,
      "production_database",
      "Report Database deployment gate",
      "Vercel - nestory: Database",
    ],
  ]) {
    assert.match(job, new RegExp(`^    needs: ${dependency}$`, "m"));
    assert.match(
      job,
      /^    if: always\(\) && github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'$/m,
    );

    const reporter = getStep(job, stepName);

    assert.match(reporter, /^        uses: actions\/github-script@v9$/m);
    assert.match(
      reporter,
      new RegExp(
        `^            const state = "\\$\\{\\{ needs\\.${dependency}\\.result \\}\\}" === "success" \\? "success" : "failure";$`,
        "m",
      ),
    );
    assert.match(
      reporter,
      /^            await github\.rest\.repos\.createCommitStatus\(\{$/m,
    );
    assert.match(reporter, /^              sha: context\.sha,$/m);
    assert.match(reporter, /^              state,$/m);
    assert.match(
      reporter,
      new RegExp(`^              context: "${statusName}",$`, "m"),
    );
    assert.match(
      reporter,
      /^              target_url: "\$\{\{ github\.server_url \}\}\/\$\{\{ github\.repository \}\}\/actions\/runs\/\$\{\{ github\.run_id \}\}",$/m,
    );
  }
});

test("production database release is serialized and runs only from exact merged main", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const release = getJob(workflow, "production_database");

  assert.match(
    workflow,
    /^  cancel-in-progress: \$\{\{ github\.ref != 'refs\/heads\/main' \}\}$/m,
  );
  assert.match(release, /^    needs: database$/m);
  assert.match(
    release,
    /^    if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'$/m,
  );
  assert.match(release, /^    environment: production-database$/m);
  assert.match(release, /^      group: production-supabase$/m);
  assert.match(release, /^      cancel-in-progress: false$/m);
  assert.doesNotMatch(release, /^    env:$/m);

  const checkout = getStep(release, "Check out exact merged main SHA");
  assert.match(checkout, /^        uses: actions\/checkout@v6$/m);
  assert.match(checkout, /^          ref: \$\{\{ github\.sha \}\}$/m);
  assert.match(checkout, /^          fetch-depth: 0$/m);
  assert.match(checkout, /^          persist-credentials: false$/m);

  for (const stepName of [
    "Check out exact merged main SHA",
    "Set up Node.js",
    "Install dependencies",
    "Verify exact merged main SHA",
  ]) {
    assert.doesNotMatch(getStep(release, stepName), /SUPABASE_/);
  }

  const shaCheck = getStep(release, "Verify exact merged main SHA");
  assert.match(
    shaCheck,
    /^          GH_TOKEN: \$\{\{ github\.token \}\}$/m,
  );
  assert.match(
    shaCheck,
    /gh api "repos\/\$GITHUB_REPOSITORY\/commits\/main" --jq '\.sha'/,
  );
  assert.doesNotMatch(shaCheck, /git fetch/);
  assert.match(shaCheck, /test "\$\(git rev-parse HEAD\)" = "\$GITHUB_SHA"/);
  assert.match(shaCheck, /test "\$MAIN_SHA" = "\$GITHUB_SHA"/);

  for (const stepName of [
    "Verify production database credentials are configured",
    "Link exact production project",
  ]) {
    const step = getStep(release, stepName);
    assertStepHasSecret(step, "SUPABASE_ACCESS_TOKEN");
    assertStepHasSecret(step, "SUPABASE_DB_PASSWORD");
    assertStepHasSecret(step, "SUPABASE_PROJECT_ID");
  }

  const expectedReleaseSteps = [
    ["Verify hosted migration preflight", "npm run db:hosted-preflight"],
    ["Capture Pilot preservation preflight", "scripts/pilot-preservation-snapshot.sql"],
    [
      "Normalize approved hosted function newlines",
      "scripts/normalize-hosted-function-newlines.sql",
    ],
    ["Dry-run production migrations", "npm exec -- supabase db push --linked --dry-run --yes"],
    ["Apply production migrations", "npm exec -- supabase db push --linked --yes"],
    ["Verify hosted migration postflight", "npm run db:hosted-postflight"],
    ["Verify Pilot preservation postflight", "diff --unified=0"],
    ["Lint linked database", "npm exec -- supabase db lint --linked --level error --fail-on error"],
    ["Confirm no pending production migrations", "npm exec -- supabase db push --linked --dry-run --yes"],
  ];
  let previousPosition = -1;
  for (const [stepName, command] of expectedReleaseSteps) {
    const position = release.indexOf(`      - name: ${stepName}\n`);
    assert.ok(position > previousPosition, `${stepName} must remain ordered`);
    previousPosition = position;
    const step = getStep(release, stepName);
    assert.match(step, new RegExp(escapeRegExp(command)));
    assertStepHasSecret(step, "SUPABASE_ACCESS_TOKEN");
    assertStepHasSecret(step, "SUPABASE_DB_PASSWORD");
  }

  const recovery = getStep(
    release,
    "Normalize approved hosted function newlines",
  );
  assert.match(
    recovery,
    /db query --linked --file scripts\/classify-hosted-function-newline-recovery\.sql/,
  );
  assert.match(recovery, /case "\$recovery_state" in/);
  assert.match(recovery, /^            required\)$/m);
  assert.match(recovery, /^            complete\)$/m);
  assert.match(
    recovery,
    /db query --linked --file scripts\/normalize-hosted-function-newlines\.sql/,
  );
  assert.match(
    recovery,
    /db query --linked --file scripts\/verify-hosted-function-newline-recovery\.sql/,
  );
  assert.doesNotMatch(recovery, /readonly query=/);
});

test("production recovery is limited to five hash-pinned newline normalizations", async () => {
  const query = await readFile(newlineRecoveryPath, "utf8");
  const verificationQuery = await readFile(
    newlineRecoveryVerificationPath,
    "utf8",
  );

  assert.match(query.trimStart(), /^DO \$recovery\$/);
  assert.doesNotMatch(query, /^BEGIN;|^COMMIT;/m);
  assert.match(query, /hosted_ledger_count\s*<>\s*103/);
  assert.match(query, /hosted_ledger_head\s*<>\s*'20260822045638'/);
  assert.match(query, /jsonb_array_length\(targets\)\s*<>\s*5/);
  assert.match(query, /replace\(definition, E'\\r\\n', E'\\n'\)/);
  assert.match(query, /raw_sha256/);
  assert.match(query, /normalized_sha256/);
  assert.match(query, /metadata_before\s+IS DISTINCT FROM metadata_after/);
  assert.match(query, /processed_signatures\s*<>\s*5/);

  for (const signature of [
    "public.archive_person(uuid,uuid)",
    "public.archive_property(uuid,uuid)",
    "public.restore_person(uuid,uuid)",
    "public.restore_property(uuid,uuid)",
    "public.update_person(uuid,uuid,text,text,text,text,text,text,text,text[])",
  ]) {
    assert.equal(query.split(signature).length - 1, 1, `${signature} must be unique`);
  }

  for (const hash of [
    "c089e21d926145922a41a0cc47460d119d80511688c21db26a83b1c9fc4b08df",
    "080166e6959e245c20397353d1b5e3b32cb2daa63b9c3e32108a234c4912528d",
    "e346a1cb0dbceab8d2b641064360f3ed909b9a35923dba12040c00573203bf05",
    "29952b0525a61d797ffff75c1c4745213565b2e5024d62653b08dece7ce6fa0b",
    "3db86d5f86fc0f36e0799b789280b3b4725decccfb5e3bacfceae68f79a0b25e",
    "9a6ae2109e090224622d214b9d36dc2ff257f1221b9905e3d89a3c64dffac60d",
    "d89cb737223fd868c60aa7243fba0381f122b1aa88aa5eba9227136975347c87",
    "94f21962a9273e73b72883b18e1fc2dfbfd65f247457cae361659d8a1deae79a",
    "bc708433a87f1522ad917f7a460214967203670db0036372c00843b20ffd358e",
    "24186ec6f8f4a8a0b989d4d874f7526cb92c96f2b5dcde29e3966ec7f1efb5fb",
  ]) {
    assert.equal(query.split(hash).length - 1, 1, `${hash} must be unique`);
  }

  assert.match(verificationQuery, /count\(\*\)\s*=\s*5/);
  assert.match(verificationQuery, /bool_and\(actual_sha256 = normalized_sha256\)/);
  assert.match(verificationQuery, /bool_and\(strpos\(definition, E'\\r'\) = 0\)/);
  assert.match(verificationQuery, /'target_count', 5/);

  assert.doesNotMatch(query, /migration\s+repair/i);
  assert.doesNotMatch(query, /\b(?:delete|truncate|drop)\b/i);
});

test("production recovery runs only at the exact checkpoint and skips completed releases", async () => {
  const query = await readFile(newlineRecoveryClassifierPath, "utf8");

  assert.match(query, /hosted_ledger_count = 103/);
  assert.match(query, /hosted_ledger_head = '20260822045638'/);
  assert.match(query, /package_versions_present = 0/);
  assert.match(query, /package_versions_present = 4/);
  assert.match(query, /THEN 'required'/);
  assert.match(query, /THEN 'complete'/);
  assert.match(query, /ELSE NULL/);
});

test("production release compares an aggregate-only Pilot preservation snapshot", async () => {
  const query = await readFile(pilotSnapshotPath, "utf8");

  assert.match(query, /organization\.slug = 'pilot'/);
  assert.match(query, /'membershipCount'/);
  assert.match(query, /'superAdminMembershipCount'/);
  assert.match(query, /'propertyCount'/);
  assert.match(query, /'leaseLifecycleEventCount'/);
  assert.match(query, /'ownerComponentMovementCount'/);
  assert.match(query, /'activityLogCount'/);
  assert.match(query, /'membershipCount'\)::integer = 4/);
  assert.match(query, /'superAdminMembershipCount'\)::integer = 4/);
  assert.doesNotMatch(
    query,
    /\b(?:insert|update|delete|truncate|alter|drop|create|grant|revoke)\b/i,
  );
});

function assertStepHasSecret(step, name) {
  assert.match(
    step,
    new RegExp(
      `^          ${name}: \\$\\{\\{ secrets\\.${name} \\}\\}$`,
      "m",
    ),
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
