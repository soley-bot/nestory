// Offline synthetic planner. Reads inventory/review files and Git only.
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { json, normalizedSource, sha256 } from './pilot-finance-reset-core.mjs';
import { assertInventoryManifest } from './pilot-finance-reset-recovery-core.mjs';
import { RESET_REGISTRY } from './pilot-finance-reset-registry.mjs';
import { buildResetDependencyPlan } from './pilot-finance-reset-plan-core.mjs';

const root = path.resolve(import.meta.dirname, '..');
const manifestDirectory = path.join(os.tmpdir(), 'nestory-pilot-reset-db-20261022', 'pilot-finance-reset-manifests');
const privateDirectory = path.join(root, '.codex-artifacts');
const plannerFiles = ['scripts/pilot-finance-reset-plan-core.mjs', 'scripts/pilot-finance-reset-plan.mjs'];
const git = args => new Promise((resolve, reject) => execFile('git', args,
  { cwd: root, windowsHide: true, shell: false, timeout: 15_000, maxBuffer: 1024 ** 2 },
  (error, stdout) => error ? reject(Error('Read-only Git binding check failed.')) : resolve(stdout.trim())));
const within = (parent, child) => { const relative = path.relative(parent, child); return relative && !relative.startsWith('..') && !path.isAbsolute(relative); };
async function readPrivateJson(file, parent, direct = false) {
  const resolved = path.resolve(file);
  if (!within(parent, resolved) || (direct && path.dirname(resolved) !== parent) || path.extname(resolved) !== '.json' ||
      await realpath(resolved) !== resolved || (await stat(resolved)).size > 64 * 1024 ** 2) throw Error('Input must be a bounded private local JSON file without redirection.');
  return JSON.parse(normalizedSource(await readFile(resolved, 'utf8')));
}
try {
  const args = process.argv.slice(2);
  if (![2, 4].includes(args.length) || args[0] !== '--manifest' || !args[1] || (args.length === 4 && (args[2] !== '--review' || !args[3]))) {
    throw Error('Usage: node scripts/pilot-finance-reset-plan.mjs --manifest <dedicated local manifest> [--review <ignored local review.json>]');
  }
  const manifest = await readPrivateJson(args[1], manifestDirectory, true);
  const binding = assertInventoryManifest(manifest);
  const candidateHead = await git(['rev-parse', 'HEAD']);
  if (candidateHead !== binding.candidateHead) throw Error('Inventory candidate HEAD changed.');
  for (const table of manifest.tables) if (json(table.policy) !== json(RESET_REGISTRY[table.table])) throw Error('Inventory disposition changed.');
  const captureSources = async () => Promise.all([...binding.candidateSources.map(item => item.name), ...plannerFiles]
    .map(async name => ({ name, sha256: sha256(normalizedSource(await readFile(path.join(root, name), 'utf8'))) })));
  const sourceFiles = await captureSources();
  for (const expected of binding.candidateSources) if (sourceFiles.find(item => item.name === expected.name)?.sha256 !== expected.sha256) throw Error('Inventory helper source changed.');
  let review = null;
  if (args[3]) {
    review = await readPrivateJson(args[3], privateDirectory);
    await git(['check-ignore', '--quiet', '--', path.relative(root, path.resolve(args[3]))]);
  }
  const plan = buildResetDependencyPlan(manifest, review);
  if (json(sourceFiles) !== json(await captureSources()) || candidateHead !== await git(['rev-parse', 'HEAD'])) throw Error('Candidate changed during offline planning.');
  const artifactPayload = { ...plan, plannerSourceFiles: sourceFiles };
  const artifact = { ...artifactPayload, artifactSha256: sha256(json(artifactPayload)) };
  await mkdir(privateDirectory, { recursive: true });
  if (await realpath(privateDirectory) !== privateDirectory) throw Error('Private artifact root may not be redirected.');
  const output = path.join(privateDirectory, 'pilot-finance-reset-plan', randomUUID());
  await mkdir(output, { recursive: true });
  if (await realpath(output) !== output) throw Error('Private artifact directory may not be redirected.');
  await git(['check-ignore', '--quiet', '--', path.relative(root, output)]);
  const destination = path.join(output, 'plan.json');
  await writeFile(destination, `${JSON.stringify(artifact, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`${JSON.stringify({ path: destination, artifactSha256: artifact.artifactSha256,
    dependencyPlanAccepted: plan.dependencyPlanAccepted, plannedRemovals: plan.candidateRemovalOrder.length,
    issues: plan.issues.length, executionSupported: false, actualResetRecoveryProven: false })}\n`);
  if (!plan.dependencyPlanAccepted) process.exitCode = 2;
} catch (error) {
  process.stderr.write(`${JSON.stringify({ message: error instanceof SyntaxError ? 'Malformed private JSON; contents withheld.' : error.message,
    executionSupported: false, actualResetRecoveryProven: false })}\n`);
  process.exitCode = 1;
}
