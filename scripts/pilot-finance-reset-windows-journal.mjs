// Real Windows create-new/write-through/FlushFileBuffers persistence. This
// proves the narrow filesystem mechanism, not encryption, backup or consent.
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { canonicalJson, hashBytes } from './pilot-finance-reset-operator-core.mjs';

const helper = fileURLToPath(new URL('./pilot-finance-reset-windows-journal.ps1', import.meta.url));
const powershell = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
const mechanisms = new WeakMap();
const fail = code => { const e = new Error(`windows_reset_journal_${code}`); e.requiresReconciliation = true; throw e; };
const exact = (o, fields) => o && Object.getPrototypeOf(o) === Object.prototype && canonicalJson(Object.keys(o).sort()) === canonicalJson([...fields].sort());
const keyHash = key => {
  if (typeof key !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9/_-]{0,511}$/.test(key) || key.split('/').some(v => !v)) fail('slot_invalid');
  return hashBytes(key);
};
async function invoke(request, expectedHelperSha256) {
  if (hashBytes(await readFile(helper)) !== expectedHelperSha256) fail('helper_changed');
  return new Promise((resolve, reject) => {
    let child, settled = false, output = '', stderr = 0;
    const finish = error => { if (settled) return; settled = true; clearTimeout(timer); if (error) { child?.kill(); reject(error); } };
    const timer = setTimeout(() => finish(new Error('windows_reset_journal_outcome_unknown')), 30000);
    try {
      child = spawn(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helper],
        { windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'], env: { SystemRoot: 'C:\\Windows', WINDIR: 'C:\\Windows',
          TEMP: process.env.TEMP, TMP: process.env.TMP, PSModulePath: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules' } });
      child.on('error', () => finish(new Error('windows_reset_journal_outcome_unknown')));
      child.stdin.on('error', () => finish(new Error('windows_reset_journal_outcome_unknown')));
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', chunk => { output += chunk; if (Buffer.byteLength(output) > 1024 * 1024) finish(new Error('windows_reset_journal_response_invalid')); });
      child.stderr.on('data', bytes => { stderr += bytes.length; if (stderr > 8192) finish(new Error('windows_reset_journal_verification_failed')); });
      child.on('close', code => {
        if (settled) return;
        if (code !== 0 || stderr) return finish(new Error('windows_reset_journal_verification_failed'));
        let result; try { result = JSON.parse(output.trim()); } catch { return finish(new Error('windows_reset_journal_response_invalid')); }
        settled = true; clearTimeout(timer); resolve(result);
      });
      child.stdin.end(canonicalJson(request), 'utf8');
    } catch { finish(new Error('windows_reset_journal_outcome_unknown')); }
  });
}

function checkOptions(options, initialize) {
  if (process.platform !== 'win32' || !exact(options, ['directory', 'storeId', 'expectedHelperSha256', ...(initialize ? [] : ['expectedRootIdentity'])]) ||
    !/^[a-f0-9]{64}$/.test(options.expectedHelperSha256) || !/^[a-f0-9-]{36}$/.test(options.storeId) ||
    typeof options.directory !== 'string' || !/^C:\\/.test(options.directory) || path.win32.normalize(options.directory) !== options.directory ||
    options.directory.endsWith('\\') || options.directory.slice(2).includes(':') ||
    !initialize && !/^[a-f0-9]{8}:[a-f0-9]{16}$/.test(options.expectedRootIdentity)) fail('configuration_invalid');
}
export async function initializeWindowsResetJournal(options) {
  checkOptions(options, true);
  const result = await invoke({ action: 'initialize', root: options.directory, rootIdentity: null, storeId: options.storeId, slot: null, payload: null }, options.expectedHelperSha256);
  if (!exact(result, ['status', 'rootIdentity', 'storeId']) || result.status !== 'initialized' || result.storeId !== options.storeId ||
    !/^[a-f0-9]{8}:[a-f0-9]{16}$/.test(result.rootIdentity)) fail('initialization_unverified');
  return Object.freeze({ ...options, expectedRootIdentity: result.rootIdentity });
}
export async function openWindowsResetJournal(options) {
  checkOptions(options, false);
  const configuration = structuredClone(options);
  const request = (action, slot = null, payload = null) => ({ action, root: configuration.directory, rootIdentity: configuration.expectedRootIdentity, storeId: configuration.storeId, slot, payload });
  const initial = await invoke(request('open'), configuration.expectedHelperSha256);
  if (!exact(initial, ['status', 'rootIdentity', 'storeId']) || initial.status !== 'opened' || initial.storeId !== configuration.storeId ||
    initial.rootIdentity !== configuration.expectedRootIdentity) fail('initialization_unverified');
  const attempted = new Set();
  const store = Object.freeze({
    async read(key) {
      const result = await invoke(request('read', keyHash(key)), configuration.expectedHelperSha256);
      if (exact(result, ['status']) && result.status === 'absent') return null;
      if (!exact(result, ['status', 'payload', 'sha256']) || result.status !== 'present' || typeof result.payload !== 'string') fail('read_unverified');
      const bytes = Buffer.from(result.payload, 'base64');
      if (bytes.length > 262144 || bytes.toString('base64') !== result.payload || hashBytes(bytes) !== result.sha256) fail('read_unverified');
      return bytes;
    },
    async putIfAbsent(key, input) {
      const slot = keyHash(key);
      if (!(input instanceof Uint8Array) || input.length > 262144) fail('payload_invalid');
      const bytes = Buffer.from(input);
      if (attempted.has(slot)) fail('previous_attempt_requires_reconciliation');
      // Even an interrupted helper launch consumes this process's attempt.
      attempted.add(slot);
      const result = await invoke(request('put', slot, bytes.toString('base64')), configuration.expectedHelperSha256);
      if (!exact(result, ['status', 'payload', 'sha256']) || !['created', 'exists'].includes(result.status)) fail('write_unverified');
      const observed = Buffer.from(result.payload, 'base64');
      if (observed.toString('base64') !== result.payload || hashBytes(observed) !== result.sha256 ||
        result.status === 'created' && !observed.equals(bytes)) fail('write_readback_mismatch');
      return result.status;
    },
  });
  mechanisms.set(store, Object.freeze({ kind: 'windows-create-new-write-through-flush-readback', storeId: configuration.storeId,
    rootIdentity: initial.rootIdentity, helperSha256: configuration.expectedHelperSha256,
    encryptionAuthority: 'independent-volume-review-required', recoveryAuthority: 'independent-restore-and-key-review-required' }));
  return store;
}
export function inspectWindowsResetJournal(store) {
  const observed = mechanisms.get(store); if (!observed) fail('unrecognized_provider'); return structuredClone(observed);
}
