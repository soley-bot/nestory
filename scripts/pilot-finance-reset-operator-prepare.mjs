// Offline, content-bound private operation packet. Never connects to a service.
import { execFileSync } from 'node:child_process';
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REQUIRED_ARTIFACTS, SOURCE_ENTRYPOINTS, canonicalJson, hashSourceBytes, prepareOperatorPacket,
  assertOperatorPacket } from './pilot-finance-reset-operator-core.mjs';

const root = path.resolve(import.meta.dirname, '..');
const fail = code => { throw new Error(code); };
const git = args => {
  try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
  catch { fail('operator_local_git_inspection_failed'); }
};
const contains = (parent, child) => {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
};

export async function preparePrivatePacket({ reviewPath, artifactsDirectory, outputPath }) {
  if (await realpath(root) !== root) fail('operator_workspace_redirected');
  const input = await realpath(path.resolve(artifactsDirectory));
  const destination = path.resolve(outputPath), outputParent = await realpath(path.dirname(destination));
  // Customer artifacts must not be copied into a checkout or later uploaded as
  // public CI artifacts. Private encrypted storage is a separate evidence gate.
  if (contains(root, input) || contains(root, outputParent)) fail('operator_private_artifacts_inside_checkout');
  if ((await lstat(input)).isSymbolicLink() || path.resolve(artifactsDirectory) !== input ||
    outputParent !== path.dirname(destination)) fail('operator_artifact_directory_redirected');
  const reviewFile = await realpath(path.resolve(reviewPath));
  if (!contains(input, reviewFile) || reviewFile !== path.resolve(reviewPath)) fail('operator_review_outside_private_directory');
  let review;
  try { review = JSON.parse(await readFile(reviewFile, 'utf8')); }
  catch { fail('operator_review_json_invalid'); }
  const candidateHead = git(['rev-parse', 'HEAD']);
  // Every tracked migration, script, and workflow is captured, including future
  // transitive helpers. New untracked changes must be committed and re-reviewed.
  if (git(['status', '--porcelain', '--untracked-files=all']) !== '') fail('operator_clean_committed_source_required');
  const sourcePaths = git(['ls-files', '--', 'scripts', 'supabase/migrations', '.github/workflows']).split(/\r?\n/).filter(Boolean).sort();
  if (SOURCE_ENTRYPOINTS.some(name => !sourcePaths.includes(name))) fail('operator_source_entrypoint_not_tracked');
  const sources = [];
  for (const name of sourcePaths) {
    const source = path.resolve(root, name);
    if (!contains(root, source) || await realpath(source) !== source || !(await lstat(source)).isFile()) fail('operator_source_redirected');
    sources.push({ path: name, sha256: hashSourceBytes(await readFile(source)) });
  }
  const artifacts = {};
  for (const role of REQUIRED_ARTIFACTS) {
    if (review?.artifacts?.[role] === null) continue;
    // Fixed role names prevent arbitrary file paths and do not read credentials.
    // Archive bytes must be ciphertext before they are supplied to this tool.
    const artifact = path.join(input, `${role}.artifact`);
    try {
      if (await realpath(artifact) !== artifact || !(await lstat(artifact)).isFile()) fail('operator_artifact_redirected');
      const stat = await lstat(artifact);
      if (stat.size < 1 || stat.size > 256 * 1024 * 1024) fail('operator_artifact_size_invalid');
      artifacts[role] = await readFile(artifact);
    } catch (error) {
      if (error.message.startsWith('operator_')) throw error;
      fail('operator_artifact_unavailable');
    }
  }
  const packet = prepareOperatorPacket({ review, sources, artifacts, candidateHead });
  assertOperatorPacket(packet);
  if (git(['rev-parse', 'HEAD']) !== candidateHead || git(['status', '--porcelain', '--untracked-files=all']) !== '') fail('operator_sources_changed_during_preparation');
  for (const source of sources) if (hashSourceBytes(await readFile(path.join(root, source.path))) !== source.sha256) fail('operator_sources_changed_during_preparation');
  // Exclusive creation prevents silently replacing a reviewed operation packet.
  await writeFile(destination, `${canonicalJson(packet)}\n`, { flag: 'wx', mode: 0o600 });
  return { format: packet.format, packetSha256: packet.packetSha256, sourcesSha256: packet.sourcesSha256,
    sourceFileCount: packet.sourceFiles.length, artifactCount: Object.values(packet.artifacts).filter(Boolean).length,
    evidenceBlockers: packet.evidenceBlockers, implementationBlockers: packet.implementationBlockers, executionSupported: false };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 6 || args[0] !== '--review' || args[2] !== '--private-artifacts' || args[4] !== '--output') fail('operator_usage_review_private_artifacts_output_required');
  const result = await preparePrivatePacket({ reviewPath: args[1], artifactsDirectory: args[3], outputPath: args[5] });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    // Never emit SQL, artifact bodies, customer paths, driver messages or tokens.
    const code = /^operator_[a-z_]+$/.test(error.message) ? error.message : 'operator_preparation_failed';
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
