// Synthetic-only private-directory artifacts. No CLI, customer-data flag,
// encryption claim, deletion, chmod/ACL change, or replacement operation.
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { sha256 } from './pilot-finance-reset-core.mjs';
import { FILE_LIMITS, verifyFilesArchive } from './pilot-finance-reset-files-core.mjs';

const checkout = path.resolve(import.meta.dirname, '..');
const fail = code => { throw new Error(`files_${code}`); };
const contains = (parent, child) => {
  const relative = path.relative(parent, child);
  return relative === '' || relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};
const sameFile = (a, b) => a.dev === b.dev && a.ino === b.ino && a.nlink === 1 && b.nlink === 1;

async function artifactLocation(outputPath) {
  if (typeof outputPath !== 'string' || !path.isAbsolute(outputPath)) fail('absolute_artifact_path_required');
  const destination = path.resolve(outputPath), parent = path.dirname(destination);
  if (contains(checkout, destination)) fail('artifact_inside_checkout');
  if (await realpath(parent) !== parent || (await lstat(parent)).isSymbolicLink()) fail('artifact_directory_redirected');
  const stat = await lstat(parent);
  if (!stat.isDirectory()) fail('artifact_directory_invalid');
  if (process.platform !== 'win32' && (stat.mode & 0o077 || stat.uid !== process.getuid())) fail('private_directory_required');
  return { destination, parent, stat };
}

async function assertOpenArtifact(location, handle) {
  if (await realpath(location.parent) !== location.parent || !sameDirectory(location.stat, await lstat(location.parent))) fail('artifact_directory_changed');
  const entry = await lstat(location.destination), descriptor = await handle.stat();
  if (!entry.isFile() || entry.isSymbolicLink() || !sameFile(entry, descriptor) || await realpath(location.destination) !== location.destination) fail('artifact_redirected');
  if (process.platform !== 'win32' && (entry.mode & 0o077 || entry.uid !== process.getuid())) fail('private_file_required');
  return descriptor;
}

const sameDirectory = (a, b) => b.isDirectory() && !b.isSymbolicLink() && a.dev === b.dev && a.ino === b.ino;

export async function writeSyntheticPrivateArtifact(outputPath, bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 1 || bytes.length > FILE_LIMITS.totalBytes * 2) fail('artifact_size_invalid');
  const location = await artifactLocation(outputPath);
  let handle;
  try {
    // O_EXCL also refuses a dangling symlink. No path is removed after errors;
    // incomplete or acknowledgment-lost output is reconciled by exact digest.
    handle = await open(location.destination, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0), 0o600);
    await assertOpenArtifact(location, handle);
    await handle.writeFile(bytes);
    await handle.sync();
    const stat = await assertOpenArtifact(location, handle);
    if (stat.size !== bytes.length) fail('artifact_write_incomplete');
    return { sha256: sha256(bytes), byteLength: bytes.length, exclusiveCreation: true,
      syntheticOnly: true, encrypted: false, customerArchiveAuthorityEstablished: false,
      // Node's mode bits do not establish a Windows DACL. The task's synthetic
      // directory is permitted, but this is never a customer privacy attestation.
      filesystemPrivacyVerified: process.platform !== 'win32' };
  } catch (error) {
    if (error.code === 'EEXIST') fail('artifact_exists_no_overwrite');
    if (/^files_[a-z_]+$/.test(error.message)) throw error;
    fail('artifact_write_failed');
  } finally { await handle?.close(); }
}

export async function readSyntheticPrivateArtifact(inputPath, expectedSha256) {
  if (!/^[a-f0-9]{64}$/.test(expectedSha256 ?? '')) fail('artifact_digest_required');
  const location = await artifactLocation(inputPath);
  let handle;
  try {
    const link = await lstat(location.destination);
    if (link.isSymbolicLink() || !link.isFile() || link.nlink !== 1) fail('artifact_redirected');
    handle = await open(location.destination, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = await assertOpenArtifact(location, handle);
    if (before.size < 1 || before.size > FILE_LIMITS.totalBytes * 2) fail('artifact_size_invalid');
    const bytes = await handle.readFile();
    const after = await assertOpenArtifact(location, handle);
    if (!sameFile(before, after) || before.size !== after.size || before.mtimeMs !== after.mtimeMs || bytes.length !== before.size || sha256(bytes) !== expectedSha256) fail('artifact_digest_mismatch');
    return bytes;
  } catch (error) {
    if (/^files_[a-z_]+$/.test(error.message)) throw error;
    fail('artifact_read_failed');
  } finally { await handle?.close(); }
}

export async function readAndVerifyFilesArchive({ inputPath, expectedArchiveSha256, plan, expectedPlanSha256 }) {
  const bytes = await readSyntheticPrivateArtifact(inputPath, expectedArchiveSha256);
  return verifyFilesArchive({ plan, expectedPlanSha256, bytes, expectedArchiveSha256 });
}
