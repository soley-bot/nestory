// Transient private-file bootstrap for the fixed GitHub-hosted runtime. Does
// not create external resources, generate keys or claim durable local storage.
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashBytes, canonicalJson } from './pilot-finance-reset-operator-core.mjs';
import { assertGithubHostedConfiguration } from './pilot-finance-reset-github-hosted-core.mjs';
import { assertPrivatePathObservation, RESET_REPOSITORY } from './pilot-finance-reset-hosted-workflow-core.mjs';
import { GITHUB_HOSTED_RESET_WORKFLOW } from './pilot-finance-reset-github-hosted-core.mjs';

const directory = '/etc/nestory-reset';
const fail = code => { throw new Error(`github_hosted_reset_bootstrap_${code}`); };
const inputs = ['PILOT_RESET_GITHUB_HOSTED_CONFIG_JSON', 'PILOT_RESET_EXTERNAL_STORES_JSON', 'PILOT_RESET_DATABASE_CA_PEM', 'PILOT_RESET_DATABASE_PASSWORD'];
const parse = bytes => { try { return JSON.parse(bytes.toString('utf8')); } catch { fail('document_invalid'); } };

// Pure preparation for synthetic tests. The returned bytes contain private
// material and must never be logged or persisted outside the fixed private dir.
export function prepareGithubHostedBootstrapFiles(environment) {
  const material = Object.fromEntries(inputs.map(k => {
    const value = environment[k];
    if (typeof value !== 'string' || value.length < 1 || Buffer.byteLength(value) > 2 * 1024 * 1024 || value.includes('\0')) fail('input_invalid');
    return [k, value];
  }));
  const configBytes = Buffer.from(material.PILOT_RESET_GITHUB_HOSTED_CONFIG_JSON);
  const config = assertGithubHostedConfiguration(parse(configBytes), environment.PILOT_RESET_GITHUB_HOSTED_CONFIG_SHA256, configBytes);
  const storesBytes = Buffer.from(material.PILOT_RESET_EXTERNAL_STORES_JSON), stores = parse(storesBytes);
  if (hashBytes(storesBytes) !== config.providerConfigurationSha256 || stores?.format !== 'nestory-github-hosted-reset-stores-v1' ||
    canonicalJson(Object.keys(stores).sort()) !== canonicalJson(['artifacts', 'format', 'journal']) ||
    stores.journal?.storeId !== config.journalStoreId || stores.artifacts?.storeId !== config.artifactStoreId ||
    stores.journal?.accessMode !== 'append-only' || stores.artifacts?.accessMode !== 'read-only') fail('stores_invalid');
  const caBytes = Buffer.from(material.PILOT_RESET_DATABASE_CA_PEM);
  if (hashBytes(caBytes) !== config.sslRootCertSha256 || !material.PILOT_RESET_DATABASE_CA_PEM.includes('-----BEGIN CERTIFICATE-----')) fail('ca_changed');
  const password = material.PILOT_RESET_DATABASE_PASSWORD;
  if (/[\r\n]/.test(password)) fail('password_invalid');
  const escaped = password.replaceAll('\\', '\\\\').replaceAll(':', '\\:');
  const c = config.connection;
  return Object.freeze({ 'github-hosted.json': configBytes, 'external-store.json': storesBytes,
    'database-ca.pem': caBytes, 'database.pgpass': Buffer.from(`${c.host}:${c.port}:${c.database}:${c.user}:${escaped}\n`) });
}

export async function bootstrapGithubHostedInputs() {
  if (process.platform !== 'linux' || typeof process.getuid !== 'function' || Number(process.versions.node.split('.')[0]) !== 24 ||
    process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_ENVIRONMENT !== 'github-hosted' ||
    process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || process.env.GITHUB_REPOSITORY !== RESET_REPOSITORY ||
    process.env.GITHUB_REF !== 'refs/heads/main' || process.env.GITHUB_WORKFLOW_REF !== `${RESET_REPOSITORY}/${GITHUB_HOSTED_RESET_WORKFLOW}@refs/heads/main` ||
    !/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA ?? '') || process.env.GITHUB_WORKFLOW_SHA !== process.env.GITHUB_SHA) fail('origin_invalid');
  let files;
  try { files = prepareGithubHostedBootstrapFiles(process.env); }
  finally { for (const k of inputs) delete process.env[k]; }
  // The workflow creates this empty directory with owner-only access. Never
  // chmod/reuse an unknown directory or replace a prior input on a retry.
  const ancestors = [];
  for (const name of ['/', '/etc', directory]) {
    const stat = await lstat(name);
    ancestors.push({ path: name, type: stat.isSymbolicLink() ? 'symlink' : stat.isDirectory() ? 'directory' : 'other', uid: stat.uid, mode: stat.mode & 0o7777 });
  }
  assertPrivatePathObservation({ requested: directory, resolved: await realpath(directory), ancestors, uid: process.getuid(), kind: 'directory' });
  for (const [name, bytes] of Object.entries(files)) {
    let file;
    try {
      file = await open(`${directory}/${name}`, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
      await file.writeFile(bytes); await file.sync();
      const stat = await file.stat();
      if (stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o600 || stat.nlink !== 1 || stat.size !== bytes.length) fail('file_invalid');
    } finally { await file?.close(); bytes.fill(0); }
  }
  return { status: 'transient-inputs-prepared', durableLocalStorage: false };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(canonicalJson(await bootstrapGithubHostedInputs())); }
  catch { console.error(canonicalJson({ status: 'stopped', code: 'github_hosted_reset_bootstrap_failed', automaticRetryAllowed: false })); process.exitCode = 1; }
}
