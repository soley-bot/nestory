import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowPath = new URL("../.github/workflows/ci.yml", import.meta.url);

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
  const database = getJob(workflow, "database_gate");

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
      "database",
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
