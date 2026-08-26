import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const secretScannerPath = fileURLToPath(
  new URL("./verify-repository-secrets.mjs", import.meta.url),
);
const dependencyAuditPath = fileURLToPath(
  new URL("./audit-dependencies.mjs", import.meta.url),
);
const workflowPath = new URL("../.github/workflows/ci.yml", import.meta.url);
const dependabotPath = new URL("../.github/dependabot.yml", import.meta.url);
const packagePath = new URL("../package.json", import.meta.url);

const securitySourcePaths = [
  "audit-dependencies.mjs",
  "secret-scan-core.mjs",
  "security-guardrails.node-test.mjs",
  "verify-repository-secrets.mjs",
];

test("tracked secret scanning catches high-confidence values without revealing them", async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "nestory-secret-scan-"));
  try {
    runGit(fixtureRoot, "init");

    const githubToken = ["ghp", "A".repeat(36)].join("_");
    const supabaseSecret = ["sb", "secret", "B".repeat(32)].join("_");
    const serviceRoleJwt = createJwt({ role: "service_role" });
    const privateKey = ["-----BEGIN ENCRYPTED ", "PRIVATE KEY-----"].join("");
    const pgpPrivateKey = ["-----BEGIN PGP ", "PRIVATE KEY BLOCK-----"].join("");
    const ssh2PrivateKey = ["---- BEGIN SSH2 ENCRYPTED ", "PRIVATE KEY ----"].join(
      "",
    );
    const supabasePat = ["sbp", "D".repeat(40)].join("_");
    const versionedSupabasePat = ["sbp", "v0", "E".repeat(40)].join("_");
    const genericSecret = `Ab9-example-${"Z7x!".repeat(6)}`;
    const untrackedToken = ["npm", "C".repeat(36)].join("_");
    const trackedPath = join(fixtureRoot, "tracked.env");

    await writeFile(
      trackedPath,
      [
        `GITHUB_TOKEN=${githubToken}`,
        `SUPABASE_SERVICE_ROLE_KEY=${serviceRoleJwt}`,
        `SUPABASE_SECRET_KEY=${supabaseSecret}`,
        `PRIVATE_KEY=${privateKey}`,
        `PGP_BLOB=${pgpPrivateKey}`,
        `SSH2_BLOB=${ssh2PrivateKey}`,
        `SUPABASE_CREDENTIAL=${supabasePat}`,
        `SUPABASE_SCOPED_CREDENTIAL=${versionedSupabasePat}`,
        `PUBLIC_INTEREST_RATE_LIMIT_SECRET=${genericSecret}`,
      ].join("\n"),
    );
    await writeFile(
      join(fixtureRoot, ".env.example"),
      [
        "SUPABASE_SERVICE_ROLE_KEY=replace-with-service-role-key",
        "PUBLIC_INTEREST_RATE_LIMIT_SECRET=ci-placeholder",
        "RESEND_API_KEY=",
      ].join("\n"),
    );
    await writeFile(join(fixtureRoot, "untracked.env"), `NPM_TOKEN=${untrackedToken}\n`);
    runGit(fixtureRoot, "add", "tracked.env", ".env.example");

    const failed = runNode(secretScannerPath, ["--root", fixtureRoot]);
    const failedOutput = `${failed.stdout}\n${failed.stderr}`;

    assert.equal(failed.status, 1);
    assert.match(failedOutput, /github-token at tracked\.env:1/);
    assert.match(failedOutput, /supabase-service-role-jwt at tracked\.env:2/);
    assert.match(failedOutput, /supabase-secret-key at tracked\.env:3/);
    assert.match(failedOutput, /private-key at tracked\.env:4/);
    assert.match(failedOutput, /private-key at tracked\.env:5/);
    assert.match(failedOutput, /private-key at tracked\.env:6/);
    assert.match(failedOutput, /supabase-personal-access-token at tracked\.env:7/);
    assert.match(failedOutput, /supabase-personal-access-token at tracked\.env:8/);
    assert.match(failedOutput, /generic-sensitive-assignment at tracked\.env:9/);
    assert.doesNotMatch(failedOutput, /untracked\.env/);
    for (const secret of [
      githubToken,
      supabaseSecret,
      serviceRoleJwt,
      privateKey,
      pgpPrivateKey,
      ssh2PrivateKey,
      supabasePat,
      versionedSupabasePat,
      genericSecret,
      untrackedToken,
    ]) {
      assert.equal(failedOutput.includes(secret), false);
    }

    const privateKeyPlaceholder = ["<path", "to-local", "private-key>"].join("-");
    await writeFile(
      trackedPath,
      [
        "GITHUB_TOKEN=ci-placeholder",
        "SUPABASE_SERVICE_ROLE_KEY=replace-with-service-role-key",
        "SUPABASE_SECRET_KEY=",
        `PRIVATE_KEY=${privateKeyPlaceholder}`,
        "PUBLIC_INTEREST_RATE_LIMIT_SECRET=replace-with-random-bytes",
      ].join("\n"),
    );

    const passed = runNode(secretScannerPath, ["--root", fixtureRoot]);
    assert.equal(passed.status, 0, `${passed.stdout}\n${passed.stderr}`);
    assert.match(passed.stdout, /Repository secret scan passed: 2 tracked files checked\./);
  } finally {
    await rm(fixtureRoot, { force: true, recursive: true });
  }
});

test("secret security sources remain clean when added to a future Git index", async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "nestory-secret-self-scan-"));
  try {
    runGit(fixtureRoot, "init");
    for (const sourcePath of securitySourcePaths) {
      const source = await readFile(new URL(sourcePath, import.meta.url), "utf8");
      await writeFile(join(fixtureRoot, sourcePath), source);
    }
    runGit(fixtureRoot, "add", ...securitySourcePaths);

    const result = runNode(secretScannerPath, ["--root", fixtureRoot]);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(
      result.stdout,
      new RegExp(
        `Repository secret scan passed: ${securitySourcePaths.length} tracked files checked\\.`,
      ),
    );
  } finally {
    await rm(fixtureRoot, { force: true, recursive: true });
  }
});

test("dependency auditing enforces separate production and complete-tree thresholds", async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "nestory-dependency-audit-"));
  try {
    const token = ["npm", "D".repeat(36)].join("_");
    const cleanNpm = await writeFakeNpm(fixtureRoot, {
      all: { high: 0, moderate: 2 },
      production: { high: 0, moderate: 0 },
    });
    const clean = runNode(dependencyAuditPath, [], {
      GITHUB_TOKEN: token,
      NODE_AUTH_TOKEN: token,
      NPM_TOKEN: token,
      npm_execpath: cleanNpm,
    });
    const cleanOutput = `${clean.stdout}\n${clean.stderr}`;

    assert.equal(clean.status, 0, cleanOutput);
    assert.match(cleanOutput, /Production dependencies: 0 moderate-or-higher/);
    assert.match(cleanOutput, /Complete dependency tree: 0 high-or-critical/);
    assert.equal(cleanOutput.includes(token), false);

    const vulnerableNpm = await writeFakeNpm(fixtureRoot, {
      all: { critical: 1, high: 1 },
      production: { moderate: 1 },
    });
    const vulnerable = runNode(dependencyAuditPath, [], {
      GITHUB_TOKEN: token,
      NODE_AUTH_TOKEN: token,
      NPM_TOKEN: token,
      npm_execpath: vulnerableNpm,
    });
    const vulnerableOutput = `${vulnerable.stdout}\n${vulnerable.stderr}`;

    assert.equal(vulnerable.status, 1);
    assert.match(vulnerableOutput, /Production dependencies: 1 moderate-or-higher/);
    assert.match(vulnerableOutput, /Complete dependency tree: 2 high-or-critical/);
    assert.equal(vulnerableOutput.includes(token), false);
    assert.doesNotMatch(vulnerableOutput, /affected-package-name/);
  } finally {
    await rm(fixtureRoot, { force: true, recursive: true });
  }
});

test("CI wires redacted security checks before install and configures conservative updates", async () => {
  const [workflow, dependabot, packageJson] = await Promise.all([
    readFile(workflowPath, "utf8"),
    readFile(dependabotPath, "utf8"),
    readFile(packagePath, "utf8").then(JSON.parse),
  ]);

  assert.equal(
    packageJson.scripts["security:secrets"],
    "node scripts/verify-repository-secrets.mjs",
  );
  assert.equal(
    packageJson.scripts["security:audit"],
    "node scripts/audit-dependencies.mjs",
  );
  assert.equal(
    packageJson.scripts["security:check"],
    "npm run security:secrets && npm run security:audit",
  );
  assert.match(
    packageJson.scripts["test:contracts"],
    /scripts\/security-guardrails\.node-test\.mjs/,
  );

  const scanPosition = workflow.indexOf("      - name: Scan tracked repository secrets");
  const auditPosition = workflow.indexOf("      - name: Audit dependency vulnerabilities");
  const installPosition = workflow.indexOf("      - name: Install dependencies");
  assert.ok(scanPosition > 0);
  assert.ok(auditPosition > scanPosition);
  assert.ok(installPosition > auditPosition);
  assert.match(workflow, /^        run: npm run security:secrets$/m);
  assert.match(workflow, /^        run: npm run security:audit$/m);
  assert.doesNotMatch(workflow, /npm audit fix|--force/);

  assert.equal((dependabot.match(/package-ecosystem: "npm"/g) ?? []).length, 1);
  assert.equal(
    (dependabot.match(/package-ecosystem: "github-actions"/g) ?? []).length,
    1,
  );
  assert.equal((dependabot.match(/interval: "weekly"/g) ?? []).length, 2);
  assert.match(dependabot, /production-minor-and-patch:/);
  assert.match(dependabot, /development-minor-and-patch:/);
  assert.match(dependabot, /github-actions-minor-and-patch:/);
  assert.doesNotMatch(dependabot, /auto-merge|insecure-external-code-execution/);
});

async function writeFakeNpm(root, { all, production }) {
  const path = join(
    root,
    `fake-npm-${Date.now()}-${Math.random().toString(16).slice(2)}.mjs`,
  );
  const completeCounts = completeVulnerabilityCounts(all);
  const productionCounts = completeVulnerabilityCounts(production);
  await writeFile(
    path,
    [
      'const forbidden = process.env.NODE_AUTH_TOKEN ?? process.env.NPM_TOKEN ?? process.env.GITHUB_TOKEN;',
      'if (forbidden) { console.error(forbidden); process.exit(2); }',
      'const production = process.argv.includes("--omit=dev");',
      `const counts = production ? ${JSON.stringify(productionCounts)} : ${JSON.stringify(completeCounts)};`,
      'console.log(JSON.stringify({ metadata: { vulnerabilities: counts }, vulnerabilities: { "affected-package-name": { severity: "critical" } } }));',
    ].join("\n"),
  );
  return path;
}

function completeVulnerabilityCounts(overrides) {
  const counts = { critical: 0, high: 0, info: 0, low: 0, moderate: 0, total: 0 };
  Object.assign(counts, overrides);
  counts.total = counts.info + counts.low + counts.moderate + counts.high + counts.critical;
  return counts;
}

function createJwt(payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}.${"x".repeat(32)}`;
}

function runGit(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

function runNode(script, args = [], env = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: dirname(script),
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}
