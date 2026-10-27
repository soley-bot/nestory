// Fixed Pilot credential intake. No key arguments, environment credentials,
// arbitrary credential-store reads, key logging, key files, or network on import.
import { spawn } from 'node:child_process';
import { readFile, lstat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const PILOT_HOSTED_PROJECT_REF = 'pfvmztxktkwyewvxfgot';
export const PILOT_HOSTED_ORIGIN = `https://${PILOT_HOSTED_PROJECT_REF}.supabase.co`;
const root = fileURLToPath(new URL('../', import.meta.url));
const entry = path.join(root, 'node_modules/supabase/dist/supabase.js');
const cliCwd = 'C:\\Windows\\System32';
const failure = code => new Error(`local_backup_files_cli_credential_${code}`);
const pins = Object.freeze([
  { name: 'supabase', version: '2.108.0', integrity: 'sha512-NofgZCCWJTZIVVf3m9mMRr3oVZROeBSTJB4bAmP1MvmhO+jUq7U+HvF1NPqFdvmZA5PKx4vRtpjvg7g6LbeD+w==', file: 'dist/supabase.js', sha256: '253caa8c31ee5976322d04a8bd7752622c0915e7943de3f74e2b73395c54a240' },
  { name: '@supabase/cli-windows-x64', version: '2.108.0', integrity: 'sha512-I24rpbFye5vkoFzuxH7rB4BCSvHY+Eg1LTxbvxQ7IWZTM7xRwvqXgsvmqQpwctwGsIbWZIl6DQ3T39x8yV7F2Q==', file: 'bin/supabase.exe', sha256: 'd7b7da6c5140490807d47b8ce2656504b8db35aa4592a84c3c936b36144de7fd' },
]);

// Read-only, offline installation check. Package-lock pins distribution integrity;
// independent installed-byte pins also reject a changed launcher/native executable.
export async function assertPilotCredentialCliInstallation() {
  try {
    if (process.platform !== 'win32' || process.arch !== 'x64') throw failure('platform_unsupported');
    // CLI 2.108 loads project env by walking cwd ancestors. Stay outside the
    // checkout and refuse any project/dotenv discovery there, without reading it.
    for (let directory = cliCwd; ; directory = path.dirname(directory)) {
      for (const relative of ['supabase/config.toml', 'supabase/config.json', '.supabase/project.json', '.env', '.env.local', '.env.production', '.env.production.local']) {
        try { await lstat(path.join(directory, relative)); throw failure('installation_changed'); }
        catch (error) { if (error?.code !== 'ENOENT') throw error; }
      }
      if (path.dirname(directory) === directory) break;
    }
    const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
    for (const pin of pins) {
      const location = `node_modules/${pin.name}`, directory = path.join(root, location);
      const installed = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
      const locked = lock.packages?.[location];
      if (installed.name !== pin.name || installed.version !== pin.version || locked?.version !== pin.version || locked.integrity !== pin.integrity ||
        !locked.resolved?.startsWith('https://registry.npmjs.org/')) throw failure('installation_changed');
      const filename = path.join(directory, pin.file), stat = await lstat(filename);
      if (!stat.isFile() || stat.isSymbolicLink()) throw failure('installation_changed');
      const hash = createHash('sha256');
      for await (const bytes of createReadStream(filename)) hash.update(bytes);
      if (hash.digest('hex') !== pin.sha256) throw failure('installation_changed');
    }
    return { version: pins[0].version, launcherSha256: pins[0].sha256, binarySha256: pins[1].sha256 };
  } catch (error) { throw failure(error?.message?.endsWith('platform_unsupported') ? 'platform_unsupported' : 'installation_changed'); }
}

export function pilotCredentialCliEnvironment(source) {
  const env = { SUPABASE_TELEMETRY_DISABLED: '1', DO_NOT_TRACK: '1', NO_COLOR: '1', SystemRoot: 'C:\\Windows', WINDIR: 'C:\\Windows' };
  // Native login/keyring resolution needs the user's ordinary profile. All
  // SUPABASE_ overrides, proxy vars, NODE_OPTIONS/NODE_PATH and injected tokens
  // are excluded. Do not invent a replacement login or read its storage ourselves.
  for (const name of ['USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'HOMEDRIVE', 'HOMEPATH', 'TEMP', 'TMP']) {
    const match = Object.keys(source).find(key => key.toLowerCase() === name.toLowerCase());
    if (match && typeof source[match] === 'string') env[name] = source[match];
  }
  return env;
}

export function selectPilotHostedCredential(bytes) {
  let rows;
  try { rows = JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(bytes)); } catch { throw failure('response_invalid'); }
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 64 || rows.some(row => !row || Object.getPrototypeOf(row) !== Object.prototype ||
    typeof row.name !== 'string' || !Object.hasOwn(row, 'api_key') || !(row.api_key === null || typeof row.api_key === 'string'))) throw failure('response_invalid');
  const legacy = rows.filter(row => row.name === 'service_role');
  if (legacy.length > 1) throw failure('ambiguous');
  const secrets = rows.filter(row => row.type === 'secret');
  const selected = legacy.length ? legacy[0] : secrets.length === 1 ? secrets[0] : null;
  if (!selected) throw failure(secrets.length > 1 ? 'ambiguous' : 'missing');
  const isLegacy = legacy.length === 1;
  if (isLegacy ? (selected.type !== undefined && selected.type !== 'legacy') || (selected.id !== undefined && selected.id !== 'service_role') :
    typeof selected.id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(selected.id) || selected.secret_jwt_template?.role !== 'service_role') throw failure('response_invalid');
  const identity = JSON.stringify([selected.id ?? 'service_role', selected.name, selected.type ?? 'legacy', selected.hash ?? null]);
  if (selected.api_key === null || selected.api_key === '******') return { identity, redacted: true };
  const key = selected.api_key;
  if (key.length < 24 || key.length > 8192 || /\s|\*|\u2026/.test(key)) throw failure('key_invalid');
  if (isLegacy) {
    try {
      if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) throw Error();
      const header = JSON.parse(Buffer.from(key.split('.')[0], 'base64url'));
      const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url'));
      // This is a project/role consistency check, not independent JWT signature
      // verification. The key comes from the fixed authenticated Management API.
      if (header.alg !== 'HS256' || claims.ref !== PILOT_HOSTED_PROJECT_REF || claims.role !== 'service_role' || claims.iss !== 'supabase' ||
        !Number.isSafeInteger(claims.exp) || claims.exp * 1000 <= Date.now()) throw Error();
    } catch { throw failure('key_invalid'); }
  } else if (!/^sb_secret_[A-Za-z0-9_-]{20,256}$/.test(key)) throw failure('key_invalid');
  return { identity, redacted: false, key };
}

// Offline protocol port for tests. The production entry point below supplies only
// the fixed owned subprocess and exposes no executable, endpoint, or callback input.
export async function exercisePilotCredentialRead(invoke) {
  let bytes;
  try {
    bytes = await invoke(false);
    let selected = selectPilotHostedCredential(bytes);
    bytes.fill(0); bytes = undefined;
    if (selected.redacted) {
      const identity = selected.identity;
      bytes = await invoke(true);
      selected = selectPilotHostedCredential(bytes);
      if (selected.redacted || selected.identity !== identity) throw failure('reveal_changed');
    }
    return selected.key;
  } catch (error) {
    const code = /^local_backup_files_cli_credential_(response_invalid|ambiguous|missing|key_invalid|reveal_changed|request_failed|output_limit|timeout)$/.exec(error?.message ?? '')?.[1];
    throw failure(code ?? 'request_failed');
  } finally { bytes?.fill(0); }
}

export function pilotCredentialCliRequest(reveal, source = process.env) {
  if (typeof reveal !== 'boolean') throw failure('request_failed');
  return { executable: process.execPath, args: [entry, 'projects', 'api-keys', '--project-ref', PILOT_HOSTED_PROJECT_REF, '--output', 'json', ...(reveal ? ['--reveal'] : [])],
    options: { cwd: cliCwd, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: pilotCredentialCliEnvironment(source) } };
}

// Capture pipes without echoing native errors. On Windows the npm launcher owns a
// native grandchild; terminate its whole PID tree rather than just the launcher.
export function collectPilotCredentialOutput(child, stopOwnedTree, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    let chunks = [], length = 0, stderrBytes = 0, settled = false;
    const wipe = () => { for (const chunk of chunks) chunk.fill(0); chunks = []; };
    const fail = (code, terminate = true) => { if (settled) return; settled = true; clearTimeout(timer); wipe(); try { if (terminate) stopOwnedTree(); } catch { /* Never expose a native error. */ } reject(failure(code)); };
    const timer = setTimeout(() => fail('timeout'), timeoutMs);
    child.stdout.on('data', bytes => {
      if (settled) { bytes.fill(0); return; }
      length += bytes.length;
      if (length > 128 * 1024) { bytes.fill(0); fail('output_limit'); return; }
      chunks.push(Buffer.from(bytes)); bytes.fill(0);
    });
    child.stderr.on('data', bytes => { stderrBytes += bytes.length; bytes.fill(0); if (stderrBytes > 32 * 1024) fail('output_limit'); });
    child.stdout.on('error', () => fail('request_failed'));
    child.stderr.on('error', () => fail('request_failed'));
    child.on('error', () => fail('request_failed'));
    child.on('close', (code, signal) => {
      if (settled) return;
      // The closed launcher's PID may be recycled; never taskkill it afterwards.
      if (code !== 0 || signal) { fail('request_failed', false); return; }
      settled = true; clearTimeout(timer); const output = Buffer.concat(chunks); wipe(); resolve(output);
    });
  });
}

async function invokeFixedCli(reveal) {
  const request = pilotCredentialCliRequest(reveal);
  let child;
  try { child = spawn(request.executable, request.args, request.options); } catch { throw failure('request_failed'); }
  return collectPilotCredentialOutput(child, () => {
    if (!Number.isSafeInteger(child.pid) || child.pid < 1) return;
    const kill = spawn('C:\\Windows\\System32\\taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { shell: false, windowsHide: true, stdio: 'ignore', env: request.options.env });
    kill.on('error', () => { child.kill(); });
  });
}

export async function readPilotHostedServiceCredential() {
  await assertPilotCredentialCliInstallation();
  return exercisePilotCredentialRead(invokeFixedCli);
}
