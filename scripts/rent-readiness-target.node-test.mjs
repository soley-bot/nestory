import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { isBuiltin } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { target } from "./ips-integrated-readiness-fixture.mjs";
import { sha256 } from "./ips-readiness-recovery-core.mjs";
import { describeMigrationStatement } from "./hosted-migration-parity-core.mjs";
import { localRecoveryDocker } from "./local-recovery-docker.mjs";
import { approveRentManifest, censusHash, rentBoundarySql, rentManifestMaxAgeMs, rentRuntimeSourceFiles, validateRentEnvironment, verifyRentApiContainer, verifyRentBoundary, verifyRentMigrations, verifyRentSourceFiles, verifyWorkingRentMigrations } from "./rent-readiness-target.mjs";

const now = Date.parse("2026-10-15T12:00:00.000Z"), gitSha = "a".repeat(40), containerId = "b".repeat(64);
const baselineBytes = Buffer.from("preserved baseline provenance");
const sourceHashes = Object.fromEntries(rentRuntimeSourceFiles.map(file => [file, "c".repeat(64)]));
const org = "00000000-0000-0000-0000-000000000001", actor = "00000000-0000-0000-0000-000000000101";
const newId = "70000000-0000-4000-8000-000000000001";
const localMigrations = [{ version: "20261015005100", name: "rent_test", body: "SELECT 1;\r\n" }];
const migrations = [{ version: "20261015005100", name: "rent_test", statements: [describeMigrationStatement("SELECT 1")] }];
const census = { organizationIds: [org], authUserIds: [actor] };
const observed = { database: "postgres", versionMajor: 17, migrations, census };
const manifest = { schemaVersion: 1, sourceKind: "retained-readiness-stack", checkedAt: new Date(now).toISOString(),
  target, containerId, apiContainerId: "d".repeat(64), gitSha, sourceHashes, baselineManifestSha256: sha256(baselineBytes),
  census, censusSha256: censusHash(census), migrations: verifyRentMigrations(localMigrations, migrations), migrationHead: "20261015005100" };
const bytes = Buffer.from(JSON.stringify(manifest)), approvedSha256 = sha256(bytes);
const valid = { bytes, approvedSha256, baselineBytes, gitSha, sourceHashes, now };

// Independently inspect syntax instead of repeating the production inventory.
// Computed executable references require review, not an assumed dependency.
function runtimeDependencies(file, body) {
  const source = ts.createSourceFile(file, body, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  assert.equal(source.parseDiagnostics.length, 0, `Cannot inspect runtime imports: ${file}`);
  const specifiers = new Set(), requireFactories = new Set(), loaders = new Set(["require"]);
  const walk = (node, visit) => { visit(node); ts.forEachChild(node, child => walk(child, visit)); };
  walk(source, node => {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier.text === "node:module") {
      for (const binding of node.importClause?.namedBindings?.elements ?? []) {
        if ((binding.propertyName ?? binding.name).text === "createRequire") requireFactories.add(binding.name.text);
      }
    }
  });
  walk(source, node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer &&
      ts.isCallExpression(node.initializer) && ts.isIdentifier(node.initializer.expression) &&
      requireFactories.has(node.initializer.expression.text)) loaders.add(node.name.text);
  });
  const isModuleUrl = node => ts.isNewExpression(node) && ts.isIdentifier(node.expression) &&
    node.expression.text === "URL" && node.arguments?.[1]?.getText(source) === "import.meta.url";
  const literal = node => {
    if (node && ts.isStringLiteralLike(node)) return node.text;
    if (node && isModuleUrl(node)) return literal(node.arguments[0]);
    assert.fail(`Unsupported computed runtime reference: ${file}`);
  };
  walk(source, node => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      specifiers.add(literal(node.moduleSpecifier));
    }
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      ts.isIdentifier(node.expression) && loaders.has(node.expression.text))) specifiers.add(literal(node.arguments[0]));
    if (isModuleUrl(node)) specifiers.add(literal(node.arguments[0]));
  });
  const dependencies = [];
  for (const specifier of specifiers) {
    if (isBuiltin(specifier) || ["playwright", "@supabase/supabase-js"].includes(specifier)) continue;
    assert.match(specifier, /^\.{1,2}\/[^?#\\]+\.mjs$/, `Unsupported runtime reference: ${file}`);
    const dependency = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
    assert.ok(dependency.startsWith("scripts/") && !dependency.includes("/../"), "Runtime dependency leaves scripts");
    dependencies.push(dependency);
  }
  return dependencies.sort();
}

test("pinned files equal the complete executable local import closure, including transitive helpers", () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const pending = ["scripts/rent-readiness-target.mjs", "scripts/smoke-ips-rent-readiness.mjs"], visited = new Set();
  while (pending.length) {
    const file = pending.pop();
    if (visited.has(file)) continue;
    visited.add(file);
    pending.push(...runtimeDependencies(file, readFileSync(path.join(root, file), "utf8")));
  }
  assert.deepEqual([...visited].sort(), rentRuntimeSourceFiles);
  assert.ok(!rentRuntimeSourceFiles.some(file => file.endsWith(".node-test.mjs")));
});

test("dependency drift inspection includes import, re-export, dynamic import, CommonJS and module-relative URLs", () => {
  assert.deepEqual(runtimeDependencies("scripts/entry.mjs", `
    import './static.mjs'; export { value } from './exported.mjs';
    import('./dynamic.mjs'); require('./required.mjs');
    import { createRequire as makeRequire } from 'node:module';
    const load = makeRequire(import.meta.url); load('./created-require.mjs');
    new URL('./worker.mjs', import.meta.url);
    import(new URL('./url-import.mjs', import.meta.url));
  `), ["created-require", "dynamic", "exported", "required", "static", "url-import", "worker"].map(name => `scripts/${name}.mjs`));
  for (const body of ["import(variable)", "require(variable)", "new URL(variable, import.meta.url)",
    "import 'file:///outside.mjs'", "import './unreviewed.cjs'", "import '../outside.mjs'",
    "import { createRequire } from 'node:module'; const load = createRequire(import.meta.url); load(variable)"]) {
    assert.throws(() => runtimeDependencies("scripts/entry.mjs", body));
  }
});

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const readGit = args => execFileSync("git", args, { cwd: repositoryRoot, windowsHide: true, timeout: 30_000 });
const pinnedHead = readGit(["rev-parse", "HEAD"]).toString("ascii").trim();
const committedSources = rentRuntimeSourceFiles.map(file => ({ file, bytes: readGit(["show", `${pinnedHead}:${file}`]) }));

for (const file of rentRuntimeSourceFiles) {
  test(`unchanged HEAD cannot authorize modified executable dependency: ${file}`, () => {
    assert.doesNotThrow(() => verifyRentSourceFiles(committedSources, committedSources));
    const working = committedSources.map(row => row.file === file
      ? { ...row, bytes: Buffer.concat([row.bytes, Buffer.from("\n// Uncommitted executable dependency drift.\n")]) } : row);
    assert.throws(() => verifyRentSourceFiles(committedSources, working), /Uncommitted runtime source:/);
    assert.equal(readGit(["rev-parse", "HEAD"]).toString("ascii").trim(), pinnedHead);
    const changedHashes = { ...sourceHashes, [file]: "d".repeat(64) };
    assert.throws(() => approveRentManifest({ ...valid, sourceHashes: changedHashes }), /Harness changed/);
  });
}

test("HEAD verification permits only CRLF normalization while approval preserves exact source bytes", () => {
  const lf = committedSources.map(row => ({ ...row, bytes: Buffer.from(row.bytes.toString("utf8").replaceAll("\r\n", "\n")) }));
  const crlf = lf.map(row => ({ ...row, bytes: Buffer.from(row.bytes.toString("utf8").replaceAll("\n", "\r\n")) }));
  const lfHashes = verifyRentSourceFiles(lf, lf), crlfHashes = verifyRentSourceFiles(lf, crlf);
  assert.notDeepEqual(lfHashes, crlfHashes);
  const lfBytes = Buffer.from(JSON.stringify({ ...manifest, sourceHashes: lfHashes }));
  assert.throws(() => approveRentManifest({ ...valid, bytes: lfBytes, approvedSha256: sha256(lfBytes), sourceHashes: crlfHashes }), /Harness changed/);
  for (const working of [lf.slice(1), [...lf, { file: "scripts/unreviewed.mjs", bytes: Buffer.from("export {}") }],
    lf.map((row, index) => index ? row : { ...row, bytes: Buffer.concat([Buffer.from("\uFEFF"), row.bytes]) }),
    lf.map((row, index) => index ? row : { ...row, bytes: Buffer.concat([row.bytes, Buffer.from([255])]) })]) {
    assert.throws(() => verifyRentSourceFiles(lf, working));
  }
});

test("an approved shallow or test-only source inventory cannot authorize the runtime", () => {
  for (const hashes of [{ harness: "c".repeat(64) }, { ...sourceHashes, "scripts/rent-readiness-target.node-test.mjs": "c".repeat(64) },
    Object.fromEntries(Object.entries(sourceHashes).filter(([file]) => file !== "scripts/local-recovery-docker.mjs"))]) {
    const oldBytes = Buffer.from(JSON.stringify({ ...manifest, sourceHashes: hashes }));
    assert.throws(() => approveRentManifest({ ...valid, bytes: oldBytes, approvedSha256: sha256(oldBytes), sourceHashes: hashes }), /Incomplete rent runtime source hashes/);
  }
});

test("retained capture cannot authorize itself; exact coordinator hash and preserved baseline bytes are required", () => {
  assert.deepEqual(approveRentManifest(valid), manifest);
  for (const override of [{ approvedSha256: undefined }, { approvedSha256: "d".repeat(64) },
    { bytes: Buffer.from(JSON.stringify({ ...manifest, censusSha256: "d".repeat(64) })) },
    { baselineBytes: Buffer.from("changed provenance") }, { gitSha: "e".repeat(40) }, { sourceHashes: {} }]) {
    assert.throws(() => approveRentManifest({ ...valid, ...override }));
  }
});

test("freshness rejects future timestamps, expiration and expiration before a later write", () => {
  for (const clock of [now - 1, now + rentManifestMaxAgeMs + 1]) {
    assert.throws(() => approveRentManifest({ ...valid, now: clock }));
    assert.throws(() => verifyRentBoundary({ manifest, observed, localMigrations, now: clock }));
  }
});

test("target environment rejects default stack, wrong ports/hosts, missing handoffs and partial container IDs", () => {
  const input = { cwd: path.resolve("ips-production-readiness-20261014"),
    config: `project_id = "${target.project}"\n[api]\nport = 59321\n[db]\nport = 59322\n[auth]\n`,
    env: { IPS_LOCAL_HANDOFF: target.project, IPS_RENT_HANDOFF: target.project, IPS_RENT_RETAINED_HANDOFF: target.project,
      NESTORY_BASE_URL: target.app, SUPABASE_DB_CONTAINER: target.container, IPS_RENT_CONTAINER_ID: containerId } };
  assert.doesNotThrow(() => validateRentEnvironment(input));
  for (const key of Object.keys(input.env)) assert.throws(() => validateRentEnvironment({ ...input, env: { ...input.env, [key]: "wrong" } }));
  for (const config of [input.config.replace("59321", "54321"), input.config.replace("59322", "58322"),
    input.config.replace(target.project, "nestory"), input.config.replace("[auth]", "port = 54322\n[auth]")]) {
    assert.throws(() => validateRentEnvironment({ ...input, config }));
  }
  assert.throws(() => validateRentEnvironment({ ...input, cwd: path.resolve("deposit-release-20261009") }));
});

test("migration verification checks every identity and actual statement payload against Git", () => {
  assert.equal(verifyRentMigrations(localMigrations, migrations).length, 1);
  for (const remote of [[], [...migrations, ...migrations], [{ ...migrations[0], version: "20261015005101" }],
    [{ ...migrations[0], name: "other_name" }], [{ ...migrations[0], statements: [describeMigrationStatement("SELECT 2")] }],
    [{ ...migrations[0], statements: [] }]]) assert.throws(() => verifyRentMigrations(localMigrations, remote));
  assert.throws(() => verifyRentMigrations([{ ...localMigrations[0], body: "SELECT 1; SELECT 2;" }], migrations));
  assert.throws(() => verifyRentBoundary({ manifest: { ...manifest, migrationHead: "20261015005101" }, observed, localMigrations, now }));
});

test("dirty, missing and extra working migrations cannot be labeled as the pinned commit", () => {
  const committed = [{ ...localMigrations[0], body: "SELECT 1;\n" }];
  assert.doesNotThrow(() => verifyWorkingRentMigrations(committed, localMigrations));
  for (const working of [[], [...localMigrations, { version: "20261015005101", name: "untracked", body: "SELECT 2;" }],
    [{ ...localMigrations[0], body: "SELECT 2;\n" }], [{ ...localMigrations[0], body: " SELECT 1;\n" }],
    [{ ...localMigrations[0], body: "\uFEFFSELECT 1;\n" }]]) assert.throws(() => verifyWorkingRentMigrations(committed, working));
});

test("API gateway must be this running project's exact container and 59321 binding", () => {
  const api = { name: `/supabase_kong_${target.project}`, id: "d".repeat(64), project: target.project,
    running: true, ports: [{ HostIp: "127.0.0.1", HostPort: "59321" }] };
  assert.doesNotThrow(() => verifyRentApiContainer(api, api.id));
  for (const change of [{ name: "/supabase_kong_nestory" }, { id: "e".repeat(64) }, { running: false },
    { project: "nestory" }, { ports: [{ HostIp: "127.0.0.1", HostPort: "54321" }] }, { ports: [] },
    { ports: [{ HostIp: "192.0.2.1", HostPort: "59321" }] }]) assert.throws(() => verifyRentApiContainer({ ...api, ...change }, api.id));
});

test("retained target cannot use a remote Docker endpoint or environment override", async () => {
  let invoked = false;
  await assert.rejects(localRecoveryDocker({ env: { DOCKER_HOST: "tcp://example.test:2375" }, platform: "win32", execute: () => { invoked = true; } }));
  assert.equal(invoked, false);
  await assert.rejects(localRecoveryDocker({ env: {}, platform: "win32", execute: (_command, args) => args[1] === "show" ? "remote" : JSON.stringify("ssh://example.test") }));
});

test("full live census rejects unknown, missing, duplicate and truncated identities", () => {
  assert.doesNotThrow(() => verifyRentBoundary({ manifest, observed, localMigrations, now }));
  for (const bad of [{ ...census, organizationIds: [] }, { ...census, authUserIds: [] },
    { ...census, organizationIds: [org, newId] }, { ...census, authUserIds: [actor, newId] },
    { ...census, authUserIds: [actor, actor] }, { ...census, authUserIds: null }]) {
    assert.throws(() => verifyRentBoundary({ manifest, observed: { ...observed, census: bad }, localMigrations, now }));
  }
  const tampered = Buffer.from(JSON.stringify({ ...manifest, census: { ...census, authUserIds: [actor, newId] } }));
  assert.throws(() => approveRentManifest({ ...valid, bytes: tampered, approvedSha256: sha256(tampered) }));
});

test("only observed owned UUID additions are permitted after this run creates them", () => {
  const additions = { organizationIds: [], authUserIds: [newId] };
  const grown = { ...observed, census: { ...census, authUserIds: [actor, newId] } };
  assert.doesNotThrow(() => verifyRentBoundary({ manifest, observed: grown, localMigrations, additions, now }));
  assert.throws(() => verifyRentBoundary({ manifest, observed, localMigrations, additions, now }));
  assert.throws(() => verifyRentBoundary({ manifest, observed, localMigrations, additions: { organizationIds: [org], authUserIds: [] }, now }));
  assert.match(rentBoundarySql, /REPEATABLE READ READ ONLY/);
  assert.match(rentBoundarySql, /FROM auth\.users/); assert.match(rentBoundarySql, /FROM public\.organizations/);
  assert.doesNotMatch(rentBoundarySql, /LIMIT|encrypted_password|access_token|refresh_token/i);
});
