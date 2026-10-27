import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { RAM_POSTGRES_IMAGE, RESTORE_SOURCE_FILES, assertRamContainer, assertRehearsalMode, assertCaptureReceipt } from './local-backup-restore.mjs';

const id = '1'.repeat(64), runId = '11111111-1111-4111-8111-111111111111';
const binding = { runId, stage: 'capture', id };
function container() {
  return { Id: id, Image: RAM_POSTGRES_IMAGE, Name: `/nestory-local-backup-${runId}-capture`,
    Config: { User: '100:101', Labels: { 'nestory.local-backup.run': runId, 'nestory.local-backup.stage': 'capture' } },
    State: { Running: true }, HostConfig: { ReadonlyRootfs: true, NetworkMode: 'none', Privileged: false,
      LogConfig: { Type: 'none' }, Memory: 536870912, MemorySwap: 536870912, PidsLimit: 64,
      CapDrop: ['ALL'], CapAdd: [], SecurityOpt: ['no-new-privileges'], Ulimits: [{ Name: 'core', Soft: 0, Hard: 0 }],
      Tmpfs: { '/db': 'rw,nosuid,nodev,noexec,size=320m,uid=100,gid=101,mode=0700' }, Binds: [], VolumesFrom: [], PortBindings: {}, Devices: [] },
    Mounts: [], NetworkSettings: { Networks: { none: {} } } };
}
const receipt = () => ({ format: 'nestory-synthetic-ram-backup-capture-v1', syntheticOnly: true, runId, keyId: runId,
  archiveId: runId, cipherSha256: '2'.repeat(64), dumpSha256: '3'.repeat(64), dumpBytes: 2000,
  rowsSha256: '4'.repeat(64), sourceContainerId: id, sourceRemoved: true, capturePid: 123, pgcryptoInterop: true,
  image: RAM_POSTGRES_IMAGE, sourceFiles: RESTORE_SOURCE_FILES.map(name => ({ name, sha256: '5'.repeat(64) })) });

test('synthetic proof cannot grant customer spill custody', () => {
  assert.doesNotThrow(() => assertRehearsalMode('synthetic'));
  for (const mode of ['customer', 'production', undefined, true, { verified: true }]) {
    assert.throws(() => assertRehearsalMode(mode), /customer_intake_spill_custody_unverified/);
  }
});
test('RAM container requires exact owned source image and no disk/network escape', async t => {
  assert.equal(assertRamContainer(binding, container()), true);
  const cases = {
    owner: c => { c.Config.Labels['nestory.local-backup.run'] = 'other'; },
    id: c => { c.Id = '2'.repeat(64); }, image: c => { c.Image = 'sha256:' + '2'.repeat(64); },
    name: c => { c.Name = '/other'; }, stage: c => { c.Config.Labels['nestory.local-backup.stage'] = 'restore'; },
    user: c => { c.Config.User = 'root'; }, stopped: c => { c.State.Running = false; },
    writableRoot: c => { c.HostConfig.ReadonlyRootfs = false; }, network: c => { c.HostConfig.NetworkMode = 'bridge'; },
    attachedNetwork: c => { c.NetworkSettings.Networks.bridge = {}; }, logging: c => { c.HostConfig.LogConfig.Type = 'json-file'; },
    swap: c => { c.HostConfig.MemorySwap *= 2; }, unboundedMemory: c => { c.HostConfig.Memory = 0; },
    privilege: c => { c.HostConfig.Privileged = true; }, capabilities: c => { c.HostConfig.CapAdd = ['SYS_ADMIN']; },
    noNewPrivileges: c => { c.HostConfig.SecurityOpt = []; }, coreDump: c => { c.HostConfig.Ulimits[0].Hard = -1; },
    bind: c => { c.HostConfig.Binds = ['C:/private:/db']; }, volume: c => { c.Mounts.push({ Type: 'volume', Destination: '/db' }); },
    secondTmpfs: c => { c.HostConfig.Tmpfs['/other'] = 'rw'; }, changedTmpfs: c => { c.HostConfig.Tmpfs['/db'] = 'rw'; },
    inheritedVolume: c => { c.Config.Volumes = { '/data': {} }; }, port: c => { c.HostConfig.PortBindings = { '5432/tcp': [{}] }; },
    device: c => { c.HostConfig.Devices = [{}]; }, volumesFrom: c => { c.HostConfig.VolumesFrom = ['other']; },
  };
  for (const [name, mutate] of Object.entries(cases)) await t.test(name, () => {
    const c = container(); mutate(c); assert.throws(() => assertRamContainer(binding, c), /container_custody_changed/);
  });
});
test('saved receipt must prove source removal and bind exact persisted bytes', () => {
  assert.equal(assertCaptureReceipt(receipt()).sourceRemoved, true);
  for (const mutate of [r => { r.sourceRemoved = false; }, r => { r.syntheticOnly = false; }, r => { r.dumpBytes = 0; },
    r => { r.cipherSha256 = 'bad'; }, r => { r.archiveId = '../private'; }, r => { r.pgcryptoInterop = false; },
    r => { r.capturePid = -1; }, r => { r.customerCustodyEstablished = true; }, r => { r.sourceFiles[0].name = '../changed'; },
    r => { r.image = 'mutable:image'; }]) {
    const r = receipt(); mutate(r); assert.throws(() => assertCaptureReceipt(r), /capture_receipt_invalid/);
  }
});
test('unknown and customer CLI inputs fail before I/O without reflecting secrets', () => {
  const marker = 'secret-should-never-be-logged';
  const output = spawnSync(process.execPath, ['scripts/local-backup-restore.mjs', '--customer', marker], { encoding: 'utf8', timeout: 10000 });
  assert.equal(output.status, 1); assert.equal(output.stdout, '');
  assert.equal(output.stderr.includes(marker), false);
  assert.deepEqual(JSON.parse(output.stderr), { status: 'stopped', code: 'local_backup_restore_failed', customerCustodyEstablished: false });
});
