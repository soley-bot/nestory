import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const verifier = fileURLToPath(new URL("./verify-release-parity.mjs", import.meta.url));
const readinessPath = "docs/verification/ips-production-readiness-report.md";
const pilotPath = "docs/verification/ips-pilot-reconciliation.md";

test("accepts an evidence commit after the exact deployed runtime candidate", async (t) => {
  const repo = await createRepo(t);
  await writeFile(path.join(repo, "tracked.txt"), "runtime candidate\n");
  git(repo, "add", "tracked.txt");
  git(repo, "commit", "-m", "runtime candidate");
  const candidateSha = git(repo, "rev-parse", "HEAD");
  await writeFile(
    path.join(repo, readinessPath),
    releaseReadinessEvidence({ candidateSha }),
  );
  await writeFile(
    path.join(repo, pilotPath),
    releasePilotEvidence({ candidateSha }),
  );
  commitAndTrack(repo, "release evidence");

  const result = runVerifier(repo, releaseArgs(repo, candidateSha));

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ready, true);
  assert.equal(report.git.candidateSha, candidateSha);
  assert.equal(report.git.evidenceSha, git(repo, "rev-parse", "HEAD"));
});

test("canonical hosted role templates match the application role contract", async () => {
  const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
  const readiness = await readFile(path.join(repositoryRoot, readinessPath), "utf8");
  const pilot = await readFile(path.join(repositoryRoot, pilotPath), "utf8");
  const capabilities = await readFile(
    path.join(repositoryRoot, "src/lib/auth/capabilities.ts"),
    "utf8",
  );
  const roleBlock = capabilities.match(/WORKSPACE_ROLES\s*=\s*\[([\s\S]*?)\]\s*as const/)?.[1];
  assert.ok(roleBlock, "WORKSPACE_ROLES must remain statically readable");
  const expectedRoles = [...roleBlock.matchAll(/"([a-z_]+)"/g)].map(([, role]) =>
    role.split("_").map((part) => `${part[0].toUpperCase()}${part.slice(1)}`).join(" "),
  );
  assert.equal(expectedRoles.length, 5);

  const readinessRoles = readiness
    .match(/## Hosted role acceptance([\s\S]*?)Journey evidence paths:/)?.[1]
    ?.split(/\r?\n/)
    .map((line) => line.match(/^- \[ \] (.+)$/)?.[1])
    .filter(Boolean);
  const pilotRoles = pilot
    .match(/## Role journeys and usability([\s\S]*?)## Exceptions and sign-off/)?.[1]
    ?.split(/\r?\n/)
    .map((line) => line.match(/^\| ([^|-][^|]*?) \|/)?.[1]?.trim())
    .filter((role) => role && role !== "Role");

  assert.deepEqual(readinessRoles, expectedRoles);
  assert.deepEqual(pilotRoles, expectedRoles);
});

test("rejects an evidence commit that also changes runtime files", async (t) => {
  const repo = await createRepo(t);
  await writeFile(path.join(repo, "runtime-source.ts"), "export const changed = true;\n");
  commitAndTrack(repo, "smuggled runtime change");

  const result = runVerifier(repo, validArgs(repo));

  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stdout).blockers, [
    "evidence_commit_scope_mismatch",
  ]);
});

test("rejects credential-bearing CI URLs without leaking them", async (t) => {
  const repo = await createRepo(t);
  const secret = "TOP-SECRET-CI-TOKEN";
  await writeFile(
    path.join(repo, readinessPath),
    readinessEvidence({
      candidateSha: runtimeCandidate(repo),
      ciUrl: `https://ci.example.invalid/check/1?token=${secret}`,
    }),
  );
  commitAndTrack(repo, "unsafe CI URL");

  const result = runVerifier(repo, validArgs(repo));

  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stdout).blockers, [
    "evidence_provenance_mismatch",
  ]);
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(secret));
});

test("rejects readiness evidence without an ISO UTC CI timestamp", async (t) => {
  const repo = await createRepo(t);
  await writeFile(
    path.join(repo, readinessPath),
    readinessEvidence({
      candidateSha: runtimeCandidate(repo),
      ciCheckedAt: "not-recorded",
    }),
  );
  commitAndTrack(repo, "missing CI timestamp");

  const result = runVerifier(repo, validArgs(repo));

  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stdout).blockers, [
    "evidence_provenance_mismatch",
  ]);
});

test("passes only for the two canonical tracked HEAD evidence files with matching provenance", async (t) => {
  const repo = await createRepo(t);
  await writeFile(path.join(repo, "untracked-local-note.txt"), "ignored\n");

  const result = runVerifier(repo, validArgs(repo));

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(
    {
      ahead: report.git.ahead,
      behind: report.git.behind,
      branch: report.git.branch,
      ready: report.ready,
      trackedClean: report.git.trackedClean,
    },
    {
      ahead: 0,
      behind: 0,
      branch: "codex/release",
      ready: true,
      trackedClean: true,
    },
  );
  assert.deepEqual(report.blockers, []);
  assert.deepEqual(report.evidence.map(({ path: evidencePath }) => evidencePath), [
    readinessPath,
    pilotPath,
  ]);
  assert.ok(report.evidence.every(({ sha256 }) => /^[0-9a-f]{64}$/.test(sha256)));
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(repo.replaceAll("\\", "\\\\")));
  assert.doesNotMatch(result.stdout + result.stderr, /TOP-SECRET-EVIDENCE/);
  assert.doesNotMatch(result.stdout + result.stderr, /CURRENT_HEAD/);
});

test("rejects arbitrary evidence paths without leaking their contents", async (t) => {
  const repo = await createRepo(t);
  const secret = "TOP-SECRET-ARBITRARY-EVIDENCE";
  await writeFile(path.join(repo, "docs", "arbitrary.md"), secret);
  commitAndTrack(repo, "arbitrary evidence");

  const result = runVerifier(repo, evidenceArgs(repo, ["docs/arbitrary.md"]));

  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stdout).blockers, [
    "evidence_commit_scope_mismatch",
    "evidence_paths_mismatch",
  ]);
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(secret));
});

test("rejects an untracked file substituted at a canonical evidence path", async (t) => {
  const repo = await createRepo(t);
  git(repo, "rm", "--cached", readinessPath);
  git(repo, "commit", "-m", "remove readiness evidence from HEAD");
  git(repo, "update-ref", "refs/remotes/origin/codex/release", "HEAD");

  const result = runVerifier(repo, validArgs(repo));

  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stdout).blockers, [
    "evidence_commit_scope_mismatch",
    "evidence_untracked",
  ]);
});

test("rejects dirty canonical evidence that is not byte-identical to HEAD", async (t) => {
  const repo = await createRepo(t);
  const secret = "TOP-SECRET-DIRTY-EVIDENCE";
  await writeFile(
    path.join(repo, readinessPath),
    `${readinessEvidence({ candidateSha: runtimeCandidate(repo) })}\n- reviewer note: ${secret}\n`,
  );

  const result = runVerifier(repo, validArgs(repo));

  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stdout).blockers, [
    "tracked_worktree_dirty",
    "evidence_not_at_head",
  ]);
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(secret));
});

test("rejects a readiness branch declaration that differs from the CLI branch", async (t) => {
  const repo = await createRepo(t);
  await writeFile(
    path.join(repo, readinessPath),
    readinessEvidence({
      branch: "codex/different-release",
      candidateSha: runtimeCandidate(repo),
    }),
  );
  commitAndTrack(repo, "mismatched evidence branch");

  const result = runVerifier(repo, validArgs(repo));

  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stdout).blockers, ["evidence_provenance_mismatch"]);
});

test("rejects candidate or deployed SHA declarations that differ from CLI provenance", async (t) => {
  const repo = await createRepo(t);
  const secret = "f".repeat(40);
  await writeFile(
    path.join(repo, pilotPath),
    pilotEvidence({ candidateSha: secret }),
  );
  commitAndTrack(repo, "mismatched evidence SHA");

  const result = runVerifier(repo, validArgs(repo));

  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stdout).blockers, ["evidence_provenance_mismatch"]);
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(secret));
});

test("fails closed for dirty tracked files while ignoring unrelated untracked files", async (t) => {
  const repo = await createRepo(t);
  await writeFile(path.join(repo, "untracked.txt"), "does not block tracked cleanliness\n");
  assert.equal(runVerifier(repo, validArgs(repo)).status, 0);

  await writeFile(path.join(repo, "tracked.txt"), "changed\n");
  const dirty = runVerifier(repo, validArgs(repo));
  assert.equal(dirty.status, 1);
  assert.deepEqual(JSON.parse(dirty.stdout).blockers, ["tracked_worktree_dirty"]);
});

test("fails closed when local HEAD diverges from the named remote-tracking ref", async (t) => {
  const repo = await createRepo(t);
  await writeFile(path.join(repo, "tracked.txt"), "second commit\n");
  git(repo, "add", "tracked.txt");
  git(repo, "commit", "-m", "local ahead");

  const result = runVerifier(repo, validArgs(repo));

  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.git.ahead, 1);
  assert.equal(report.git.behind, 0);
  assert.deepEqual(report.blockers, [
    "evidence_commit_scope_mismatch",
    "remote_divergence",
  ]);
});

test("fails closed when canonical evidence is empty or still a BLOCKED template", async (t) => {
  const repo = await createRepo(t);
  await writeFile(path.join(repo, readinessPath), "  \n\t\n");
  await writeFile(
    path.join(repo, pilotPath),
    "# Pilot reconciliation\n\nStatus: **BLOCKED**\n\n- reconciliation result: BLOCKED\n",
  );
  commitAndTrack(repo, "incomplete canonical evidence");

  const result = runVerifier(repo, validArgs(repo));

  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stdout).blockers, [
    "evidence_empty",
    "evidence_incomplete",
  ]);
  assert.deepEqual(JSON.parse(result.stdout).evidence, []);
});

test("rejects CLI branch and SHA mismatches without echoing supplied values", async (t) => {
  const repo = await createRepo(t);
  const secret = "TOP-SECRET-BRANCH";
  const result = runVerifier(repo, [
    "--branch",
    `wrong-${secret}`,
    "--sha",
    "0".repeat(40),
    "--candidate-sha",
    runtimeCandidate(repo),
    "--remote-ref",
    "origin/codex/release",
    "--evidence",
    readinessPath,
    "--evidence",
    pilotPath,
  ]);

  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stdout).blockers, [
    "branch_mismatch",
    "head_sha_mismatch",
    "evidence_provenance_mismatch",
  ]);
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(secret));
});

test("rejects incomplete invocation with a redacted machine-readable error", async (t) => {
  const repo = await createRepo(t);
  const result = runVerifier(repo, ["--branch", "codex/release"]);

  assert.equal(result.status, 2);
  assert.deepEqual(JSON.parse(result.stdout), {
    blockers: ["invalid_invocation"],
    ready: false,
    schemaVersion: 1,
  });
  assert.equal(result.stderr, "");
});

async function createRepo(t) {
  const repo = await mkdtemp(path.join(os.tmpdir(), "nestory-release-parity-"));
  t.after(() => rm(repo, { force: true, recursive: true }));
  git(repo, "init", "-b", "codex/release");
  git(repo, "config", "user.email", "release-test@example.invalid");
  git(repo, "config", "user.name", "Release Test");
  await mkdir(path.join(repo, "docs", "verification"), { recursive: true });
  await writeFile(path.join(repo, "tracked.txt"), "initial\n");
  git(repo, "add", "tracked.txt");
  git(repo, "commit", "-m", "runtime candidate");
  git(repo, "update-ref", "refs/tags/runtime-candidate", "HEAD");
  const candidateSha = runtimeCandidate(repo);
  await writeFile(path.join(repo, readinessPath), readinessEvidence({ candidateSha }));
  await writeFile(path.join(repo, pilotPath), pilotEvidence({ candidateSha }));
  commitAndTrack(repo, "release evidence");
  return repo;
}

function readinessEvidence({
  branch = "codex/release",
  candidateSha,
  ciCheckedAt = "2026-08-11T15:00:00Z",
  ciUrl = "https://example.invalid/check/1",
  deployedSha = candidateSha,
} = {}) {
  return `# IPS production readiness report

Status: READY FOR CONTROLLED PILOT

- target environment: production
- target branch: ${branch}
- runtime candidate full SHA: ${candidateSha}
- deployment full SHA: ${deployedSha}
- CI full SHA: ${candidateSha}
- CI status: success
- CI check URL: ${ciUrl}
- CI checked at (UTC): ${ciCheckedAt}
- final decision: READY FOR CONTROLLED PILOT
`;
}

function pilotEvidence({
  candidateSha,
  deployedSha = candidateSha,
} = {}) {
  return `# IPS pilot reconciliation

Status: RECONCILED

- environment: production
- runtime candidate full SHA: ${candidateSha}
- deployed full SHA: ${deployedSha}
- reconciliation result: RECONCILED
`;
}

function releaseReadinessEvidence({ candidateSha }) {
  return `# IPS production readiness report

Status: READY FOR CONTROLLED PILOT

- target environment: production
- target branch: codex/release
- runtime candidate full SHA: ${candidateSha}
- evidence commit full SHA: CURRENT_HEAD
- deployment full SHA: ${candidateSha}
- CI full SHA: ${candidateSha}
- CI status: success
- CI check URL: https://example.invalid/check/1
- CI checked at (UTC): 2026-08-11T15:00:00Z
- final decision: READY FOR CONTROLLED PILOT
`;
}

function releasePilotEvidence({ candidateSha }) {
  return `# IPS pilot reconciliation

Status: RECONCILED

- environment: production
- runtime candidate full SHA: ${candidateSha}
- evidence commit full SHA: CURRENT_HEAD
- deployed full SHA: ${candidateSha}
- reconciliation result: RECONCILED
`;
}

function validArgs(repo) {
  return evidenceArgs(repo, [readinessPath, pilotPath]);
}

function releaseArgs(repo, candidateSha) {
  return [
    "--branch",
    "codex/release",
    "--sha",
    git(repo, "rev-parse", "HEAD"),
    "--candidate-sha",
    candidateSha,
    "--remote-ref",
    "origin/codex/release",
    "--evidence",
    readinessPath,
    "--evidence",
    pilotPath,
  ];
}

function evidenceArgs(repo, evidencePaths) {
  return [
    "--branch",
    "codex/release",
    "--sha",
    git(repo, "rev-parse", "HEAD"),
    "--candidate-sha",
    runtimeCandidate(repo),
    "--remote-ref",
    "origin/codex/release",
    ...evidencePaths.flatMap((evidencePath) => ["--evidence", evidencePath]),
  ];
}

function runtimeCandidate(repo) {
  return git(repo, "rev-parse", "refs/tags/runtime-candidate");
}

function commitAndTrack(repo, message) {
  git(repo, "add", ".");
  git(repo, "commit", "-m", message);
  git(repo, "update-ref", "refs/remotes/origin/codex/release", "HEAD");
}

function runVerifier(cwd, args) {
  return spawnSync(process.execPath, [verifier, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, RELEASE_TEST_SECRET: "MUST-NOT-LEAK" },
  });
}

function git(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
