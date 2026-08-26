import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowPath = new URL("../.github/workflows/ci.yml", import.meta.url);
const pilotSnapshotPath = new URL(
  "./pilot-preservation-snapshot.sql",
  import.meta.url,
);
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
const financialEvidenceRecoveryClassifierPath = new URL(
  "./classify-hosted-financial-evidence-branch-backfill.sql",
  import.meta.url,
);
const financialEvidenceRecoveryPreparePath = new URL(
  "./prepare-hosted-financial-evidence-branch-backfill.sql",
  import.meta.url,
);
const financialEvidenceRecoveryRestorePath = new URL(
  "./restore-hosted-financial-evidence-guard.sql",
  import.meta.url,
);
const financialEvidenceRecoverySnapshotPath = new URL(
  "./financial-evidence-preservation-snapshot.sql",
  import.meta.url,
);
const financialEvidenceRecoveryVerificationPath = new URL(
  "./verify-hosted-financial-evidence-branch-backfill.sql",
  import.meta.url,
);
const actionPins = {
  checkout: "actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6.1.0",
  githubScript:
    "actions/github-script@3a2844b7e9c422d3c10d287c895573f7108da1b3 # v9.0.0",
  setupNode:
    "actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6.5.0",
};

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

  assert.match(workflow, /^permissions: \{\}$/m);

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
    assert.match(job, /^    permissions:\n      statuses: write$/m);
    assert.doesNotMatch(job, /^      contents:/m);
    assert.match(job, new RegExp(`^    needs: ${dependency}$`, "m"));
    assert.match(
      job,
      /^    if: always\(\) && github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'$/m,
    );

    const reporter = getStep(job, stepName);

    assert.match(
      reporter,
      new RegExp(`^        uses: ${escapeRegExp(actionPins.githubScript)}$`, "m"),
    );
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

test("CI grants status writes only to reporters and pins every external action", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(workflow, /^permissions: \{\}$/m);

  for (const jobName of ["application", "database", "production_database"]) {
    const job = getJob(workflow, jobName);
    assert.match(job, /^    permissions:\n      contents: read$/m);
    assert.doesNotMatch(job, /statuses: write/);
  }

  for (const jobName of ["application_gate", "production_database_gate"]) {
    const job = getJob(workflow, jobName);
    assert.match(job, /^    permissions:\n      statuses: write$/m);
    assert.doesNotMatch(job, /^      contents:/m);
  }

  const actionReferences = [
    ...workflow.matchAll(/^\s+uses: ([^\s]+)(?:\s+#\s+([^\s]+))?$/gm),
  ];
  assert.ok(actionReferences.length > 0, "workflow must use pinned actions");
  for (const reference of actionReferences) {
    assert.match(reference[1], /^[^@\s]+@[0-9a-f]{40}$/);
    assert.match(reference[2] ?? "", /^v\d+(?:\.\d+){2}$/);
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
  assert.match(release, /^    permissions:\n      contents: read$/m);
  assert.match(release, /^      group: production-supabase$/m);
  assert.match(release, /^      cancel-in-progress: false$/m);
  assert.doesNotMatch(release, /^    env:$/m);

  const checkout = getStep(release, "Check out exact merged main SHA");
  assert.match(
    checkout,
    new RegExp(`^        uses: ${escapeRegExp(actionPins.checkout)}$`, "m"),
  );
  assert.match(checkout, /^          ref: \$\{\{ github\.sha \}\}$/m);
  assert.match(checkout, /^          fetch-depth: 0$/m);
  assert.match(checkout, /^          persist-credentials: false$/m);

  const setupNode = getStep(release, "Set up Node.js");
  assert.match(
    setupNode,
    new RegExp(`^        uses: ${escapeRegExp(actionPins.setupNode)}$`, "m"),
  );
  assert.match(setupNode, /^          package-manager-cache: false$/m);
  assert.doesNotMatch(setupNode, /^          cache:/m);

  for (const [stepName, variableName] of [
    ["Capture Pilot preservation preflight", "snapshot_path"],
    ["Capture approved financial evidence recovery preflight", "before_path"],
    ["Verify approved financial evidence recovery", "after_path"],
    ["Verify Pilot preservation postflight", "after_path"],
  ]) {
    const step = getStep(release, stepName);
    assert.match(
      step,
      new RegExp(`> "\\$${variableName}"`),
      `${stepName} must keep snapshot bodies out of workflow logs`,
    );
    assert.match(step, new RegExp(`test -s "\\$${variableName}"`));
    assert.doesNotMatch(step, new RegExp(`tee "\\$${variableName}"`));
  }

  for (const stepName of [
    "Check out exact merged main SHA",
    "Set up Node.js",
    "Install dependencies",
    "Verify exact merged main SHA",
  ]) {
    assert.doesNotMatch(getStep(release, stepName), /SUPABASE_/);
  }

  const shaCheck = getStep(release, "Verify exact merged main SHA");
  assert.match(shaCheck, /^          GH_TOKEN: \$\{\{ github\.token \}\}$/m);
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
    [
      "Capture Pilot preservation preflight",
      "scripts/pilot-preservation-snapshot.sql",
    ],
    [
      "Normalize approved hosted function newlines",
      "scripts/normalize-hosted-function-newlines.sql",
    ],
    [
      "Capture approved financial evidence recovery preflight",
      "scripts/financial-evidence-preservation-snapshot.sql",
    ],
    [
      "Dry-run production migrations",
      "npm exec -- supabase db push --linked --dry-run --yes",
    ],
    [
      "Apply approved financial evidence recovery and production migrations",
      "npm exec -- supabase db push --linked --yes",
    ],
    [
      "Verify approved financial evidence recovery",
      "scripts/verify-hosted-financial-evidence-branch-backfill.sql",
    ],
    ["Verify hosted migration postflight", "npm run db:hosted-postflight"],
    ["Verify Pilot preservation postflight", "diff --unified=0"],
    [
      "Lint linked database",
      "npm exec -- supabase db lint --linked --level error --fail-on error",
    ],
    [
      "Confirm no pending production migrations",
      "npm exec -- supabase db push --linked --dry-run --yes",
    ],
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
  assert.match(recovery, /\.target_count == 21/);
  assert.doesNotMatch(recovery, /readonly query=/);
});

test("production recovery is limited to the approved twenty-one hash-pinned newline normalizations", async () => {
  const query = await readFile(newlineRecoveryPath, "utf8");
  const verificationQuery = await readFile(
    newlineRecoveryVerificationPath,
    "utf8",
  );

  assert.match(query.trimStart(), /^DO \$recovery\$/);
  assert.doesNotMatch(query, /^BEGIN;|^COMMIT;/m);
  assert.match(query, /hosted_ledger_count\s*<>\s*103/);
  assert.match(query, /hosted_ledger_head\s*<>\s*'20260822045638'/);
  assert.match(query, /jsonb_array_length\(targets\)\s*<>\s*21/);
  assert.match(query, /replace\(definition, E'\\r\\n', E'\\n'\)/);
  assert.match(query, /raw_sha256/);
  assert.match(query, /normalized_sha256/);
  assert.match(query, /expected_raw_sha256\s*=\s*expected_normalized_sha256/);
  assert.match(query, /metadata_before\s+IS DISTINCT FROM metadata_after/);
  assert.match(query, /processed_signatures\s*<>\s*21/);
  assert.match(query, /previously_normalized_targets\s*<>\s*8/);
  assert.match(query, /new_recovery_targets\s*<>\s*13/);
  assert.match(query, /raw_recovery_targets\s+NOT IN \(0, 13\)/);
  assert.match(query, /normalized_recovery_targets\s+NOT IN \(0, 13\)/);
  assert.match(
    query,
    /raw_recovery_targets\s*\+\s*normalized_recovery_targets\s*<>\s*13/,
  );
  const mixedStateGuard = "raw_recovery_targets NOT IN (0, 13)";
  const executionAnchor = "EXECUTE normalized_definition";
  assert.notEqual(query.indexOf(mixedStateGuard), -1);
  assert.notEqual(query.indexOf(executionAnchor), -1);
  assert.ok(
    query.indexOf(mixedStateGuard) < query.indexOf(executionAnchor),
    "mixed recovery target states must fail before any definition executes",
  );

  const expectedTargets = [
    [
      "public.archive_person(uuid,uuid)",
      "c089e21d926145922a41a0cc47460d119d80511688c21db26a83b1c9fc4b08df",
      "9a6ae2109e090224622d214b9d36dc2ff257f1221b9905e3d89a3c64dffac60d",
    ],
    [
      "public.archive_property(uuid,uuid)",
      "080166e6959e245c20397353d1b5e3b32cb2daa63b9c3e32108a234c4912528d",
      "d89cb737223fd868c60aa7243fba0381f122b1aa88aa5eba9227136975347c87",
    ],
    [
      "public.restore_person(uuid,uuid)",
      "e346a1cb0dbceab8d2b641064360f3ed909b9a35923dba12040c00573203bf05",
      "94f21962a9273e73b72883b18e1fc2dfbfd65f247457cae361659d8a1deae79a",
    ],
    [
      "public.restore_property(uuid,uuid)",
      "29952b0525a61d797ffff75c1c4745213565b2e5024d62653b08dece7ce6fa0b",
      "bc708433a87f1522ad917f7a460214967203670db0036372c00843b20ffd358e",
    ],
    [
      "public.update_person(uuid,uuid,text,text,text,text,text,text,text,text[])",
      "3db86d5f86fc0f36e0799b789280b3b4725decccfb5e3bacfceae68f79a0b25e",
      "24186ec6f8f4a8a0b989d4d874f7526cb92c96f2b5dcde29e3966ec7f1efb5fb",
    ],
    [
      "public.archive_asset_photo(uuid,uuid)",
      "b45c5e72657877ea3e7cc2e5d85540db10f5dfd7f3b6543e462e0368b2029cc4",
      "35a73f2c86f509da0d6a46934de71ba79e9fe806cead3e9626f16426644c1f31",
    ],
    [
      "public.create_asset_photo(uuid,uuid,uuid,text,text,text,bigint,text,boolean,date)",
      "2b1d105dd6902af272128ae1ee8fa0087e8b74581004e856c47d1414241bbe85",
      "6e242f86bd40c532cd0f1fe960b2896a63056c8b2abd4bc9a22f301d9cd81e9d",
    ],
    [
      "public.set_asset_photo_cover(uuid,uuid)",
      "1e3644c091625eb6d44cb3669b4868e68a1c2316b86c5edb5f8ebe598d5cb45f",
      "d57f7c4ec83ab385ff8ae805c03d089743480ce6c1c6946a459b23ded60dacbe",
    ],
    [
      "app_private.commit_generic_import_run_internal(uuid,uuid)",
      "22ace458068cc7a664792cbc7f3fc036e0517a957a7f36efd9d358c023721b1a",
      "7281ce6240771f5a8e03108577b76599395be828ec1c55db70878dd9e0add8c8",
    ],
    [
      "app_private.create_lease_core_internal(uuid,uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,numeric,public.currency_code,text,text)",
      "e562bcd22d581cfdc4abee5a6984c1c2ed35e9714bb502b1dc4f1963911073c3",
      "14ab67a6414ea72a409dfb841e21d19125c56ffea5fc97db0b4cba985fadfea4",
    ],
    [
      "app_private.update_lease_with_authoritative_term_internal(uuid,uuid,uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,numeric,public.currency_code,text,text)",
      "67718919899d197f534e262097a83d39b60cd61e5bfd12b430e6e409df72a7ba",
      "f296430f7b8394494f9051353f2d18118b00c74ef607aa83ee89de0ce00f1724",
    ],
    [
      "public.archive_lease(uuid,uuid)",
      "2d231d952d4d2f2975f73c1a99539ccb23f54f8ebd50b6f809565cd10fe018f7",
      "99a1d240de1d18458579c72256f1717223ade9043ec08b1505494a44c0a75eca",
    ],
    [
      "public.correct_authoritative_lease_term(uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,text)",
      "018042d2d893af393227dbbcd9e3c1c6e720f5ae70885d4e3ac7a8ae4d46edbd",
      "5f5f2009d436d3bd8b8a04b6be4a991697757f169e26ced408b0b55c4564d87c",
    ],
    [
      "public.create_lease_with_relationships(uuid,uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,numeric,public.currency_code,text,jsonb,text)",
      "a2bb1d6933370dbf2df78b48f179d8f1f3d0c745251378086d4abfb8e27d3e50",
      "1b2396f86ba5388cf07e88f34d31f271812489438daeaa39a3aeafc855c651f5",
    ],
    [
      "public.restore_lease(uuid,uuid)",
      "e45c887bf36607679939160e440fcf3b5e02b1eccb177e9f4c87a0d0c28c478a",
      "92bab17ef16f879adb2d2ddacafd8a549865ac1dc2abc593b3f25ef5efdde5b9",
    ],
    [
      "public.set_lease_billing_term(uuid,uuid,date,text,text,numeric,boolean,boolean,text,uuid,numeric,numeric,uuid,text)",
      "9d3736c9087a7c0e52b1d80a1afb695fd37185cdcbce05ebb0966d1de32b753a",
      "1da9b7506e2ac081a91b957de38182deb3ea0e064128f4eb0d2fb0b0a288aaea",
    ],
    [
      "public.update_lease_with_authoritative_term(uuid,uuid,uuid,uuid,uuid,date,date,numeric,public.currency_code,integer,text,text,numeric,public.currency_code,text,text)",
      "ca91d38b5a91591c62e8fa40c1d839e8cea72d0ef4d82aaf7911d979cb93ed21",
      "6952d2a435a766264205c9f5aa0ac36783d162ce6f48da50fed563b8053caa6f",
    ],
    [
      "app_private.create_maintenance_task_baseline_track10(uuid,uuid,uuid,text,text,text,text,text,date,time without time zone,date,time without time zone,uuid,numeric,public.currency_code,jsonb,text,uuid,uuid)",
      "a1f4a94213a7935058614c45b0e32e989a0b4bb2959dba05e2b25a4d1a3230e4",
      "65d6e375de72781daa65f9736a78408a967ecb26da0c8938cd2c36c2d3c54b59",
    ],
    [
      "app_private.create_maintenance_task_internal(uuid,uuid,uuid,text,text,text,text,text,date,time without time zone,date,time without time zone,uuid,numeric,public.currency_code,jsonb,text,uuid,uuid)",
      "bc6511b10bca5be34cb527e86131ec2eabb7bcd7c65ebdeec90eabf546c0d32e",
      "f34e944ee364d27ba4d4b7112b7a23ca0072d35974e405b5497d1b01b0b2d375",
    ],
    [
      "app_private.update_maintenance_task_baseline_track10(uuid,uuid,uuid,uuid,text,text,text,text,text,date,time without time zone,date,time without time zone,uuid,numeric,public.currency_code,numeric,public.currency_code,jsonb,text,uuid,uuid)",
      "2d531b43bc7cbe51ee04be7e3f78458ed88e471945baad5497096c985b74bc0a",
      "a98d13dbe686805d0bfefcbe53e50f5b3df1585e1efb66261edac3c57ed96216",
    ],
    [
      "app_private.update_maintenance_task_internal(uuid,uuid,uuid,uuid,text,text,text,text,text,date,time without time zone,date,time without time zone,uuid,numeric,public.currency_code,numeric,public.currency_code,jsonb,text,uuid,uuid)",
      "171db6c1a4b9641ba1f54058fc627c3846306139bc64b2527330bd3ecb6d99b8",
      "5673f36119dad04acfe6ce00d96865db3ec8e65d36d662891272d1d582903921",
    ],
  ];

  for (const [signature, rawHash, normalizedHash] of expectedTargets) {
    assert.equal(
      query.split(signature).length - 1,
      1,
      `${signature} must be unique`,
    );
    assert.equal(
      query.split(rawHash).length - 1,
      1,
      `${rawHash} must be unique`,
    );
    assert.equal(
      query.split(normalizedHash).length - 1,
      1,
      `${normalizedHash} must be unique`,
    );
  }

  assert.equal(expectedTargets.length, 21);
  assert.match(verificationQuery, /count\(\*\)\s*=\s*21/);
  assert.match(
    verificationQuery,
    /bool_and\(actual_sha256 = normalized_sha256\)/,
  );
  assert.match(
    verificationQuery,
    /bool_and\(strpos\(definition, E'\\r'\) = 0\)/,
  );
  assert.match(verificationQuery, /'target_count', 21/);

  assert.doesNotMatch(query, /migration\s+repair/i);
  assert.doesNotMatch(query, /\b(?:delete|truncate|drop)\b/i);
});

test("production recovery runs only at the exact checkpoint and skips completed releases", async () => {
  const query = await readFile(newlineRecoveryClassifierPath, "utf8");

  assert.match(query, /hosted_ledger_count = 103/);
  assert.match(query, /hosted_ledger_head = '20260822045638'/);
  assert.match(query, /package_versions_present = 0/);
  assert.match(query, /hosted_ledger_count = 105/);
  assert.match(query, /hosted_ledger_head = '20260822061424'/);
  assert.match(query, /package_versions_present = 2/);
  assert.match(query, /hosted_ledger_count = 106/);
  assert.match(query, /hosted_ledger_head = '20260822071638'/);
  assert.match(query, /package_versions_present = 3/);
  assert.match(query, /package_versions_present = 4/);
  assert.match(query, /THEN 'required'/);
  assert.match(query, /THEN 'complete'/);
  assert.match(query, /ELSE NULL/);
});

test("financial evidence recovery is exact, branch-only, and restores the strict guard", async () => {
  const [classifier, prepare, restore, snapshot, verification, workflow] =
    await Promise.all([
      readFile(financialEvidenceRecoveryClassifierPath, "utf8"),
      readFile(financialEvidenceRecoveryPreparePath, "utf8"),
      readFile(financialEvidenceRecoveryRestorePath, "utf8"),
      readFile(financialEvidenceRecoverySnapshotPath, "utf8"),
      readFile(financialEvidenceRecoveryVerificationPath, "utf8"),
      readFile(workflowPath, "utf8"),
    ]);
  const release = getJob(workflow, "production_database");
  const apply = getStep(
    release,
    "Apply approved financial evidence recovery and production migrations",
  );
  const verify = getStep(
    release,
    "Verify approved financial evidence recovery",
  );

  for (const query of [classifier, prepare, restore, snapshot, verification]) {
    for (const documentId of [
      "1759ac8e-881d-4e01-8c91-f671f2d7361b",
      "19a60225-b17b-4d1d-ad6b-c1bcc25ce10d",
      "71a9b2e7-2e03-4504-89e4-1b822290117f",
    ]) {
      assert.match(query, new RegExp(documentId));
    }
  }

  assert.match(classifier, /hosted_ledger_count = 105/);
  assert.match(classifier, /hosted_ledger_head = '20260822061424'/);
  assert.match(classifier, /THEN 'required'/);
  assert.match(classifier, /THEN 'resume'/);
  assert.match(classifier, /THEN 'complete'/);
  assert.match(classifier, /ELSE NULL/);

  assert.match(prepare, /db88ec0f62601bf0e8d21e658068b6e7f3314d25a2aea2bd32b00a38707274ba/);
  assert.match(prepare, /to_jsonb\(NEW\)\s*-\s*'branch_id'/);
  assert.match(prepare, /to_jsonb\(OLD\)\s*-\s*'branch_id'/);
  assert.match(prepare, /app_private\.is_financial_evidence_document_locked\(OLD\.id\)/);
  assert.match(prepare, /a8120000-0000-4000-8000-000000000001/);
  assert.match(prepare, /Financial evidence document is immutable while referenced/);
  assert.doesNotMatch(prepare, /migration\s+repair/i);
  assert.doesNotMatch(prepare, /\b(?:delete\s+from|truncate|drop)\b/i);

  assert.match(restore, /db88ec0f62601bf0e8d21e658068b6e7f3314d25a2aea2bd32b00a38707274ba/);
  assert.match(restore, /to_jsonb\(NEW\) IS NOT DISTINCT FROM to_jsonb\(OLD\)/);
  assert.match(restore, /metadata_before\s+IS DISTINCT FROM metadata_after/);
  assert.doesNotMatch(restore, /\b(?:delete\s+from|truncate|drop)\b/i);

  for (const rowHash of [
    "5c1eed5acfe780771360e8aefc580345bbd379fedeb1b35ae0c554a5255ade36",
    "37a99d408f2abe9e68b257db3c3d476ffa7bed92e36169278abe812c3775f3b2",
    "97210808b2b73170ea6db5dd1ae9b9e65139e5041de7bd627b2e9c857ef2f525",
    "2e709c2269424c28626a88554f62403c2dfd5e61a35f72a9c40f3293c39febd7",
    "7e9859df80871fd1559de45325033c1ded97cb5b69e51271683dbec3f05972ef",
    "cd9da1a9f6be9aedd84a9a9640c89ecc66c47d3e3264d8f7d748eededbc62308",
  ]) {
    assert.match(snapshot, new RegExp(rowHash));
  }
  assert.match(snapshot, /related_activity_sha256/);
  assert.match(snapshot, /storage_object_count/);
  assert.match(snapshot, /bucket_id\s*=\s*'nestory-documents'/);
  assert.doesNotMatch(snapshot, /bucket_id\s*=\s*'documents'/);
  assert.match(snapshot, /observed\.storage_object_count\s*=\s*1/);
  assert.doesNotMatch(snapshot, /\b(?:insert|update|delete|truncate|alter|drop|create|grant|revoke)\b/i);

  assert.match(apply, /trap restore_guard EXIT/);
  assert.match(
    apply,
    /required\)\s+trap restore_guard EXIT\s+prepare_guard/,
  );
  assert.match(
    apply,
    /restore_required\)\s+trap restore_guard EXIT\s+restore_guard\s+prepare_guard/,
  );
  assert.match(apply, /prepare-hosted-financial-evidence-branch-backfill\.sql/);
  assert.match(apply, /restore-hosted-financial-evidence-guard\.sql/);
  assert.match(apply, /supabase db push --linked --yes/);
  assert.match(verify, /verify-hosted-financial-evidence-branch-backfill\.sql/);
  assert.match(verify, /diff --unified=0/);
  assert.match(verification, /'hosted_ledger_count', 107/);
  assert.match(verification, /'hosted_ledger_head', '20260822091214'/);
  assert.match(verification, /'strict_guard_restored', true/);
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
    new RegExp(`^          ${name}: \\$\\{\\{ secrets\\.${name} \\}\\}$`, "m"),
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
