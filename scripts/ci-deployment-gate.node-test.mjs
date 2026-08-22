import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowPath = new URL("../.github/workflows/ci.yml", import.meta.url);
const pilotSnapshotPath = new URL("./pilot-preservation-snapshot.sql", import.meta.url);

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
