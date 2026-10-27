import test from 'node:test';
import assert from 'node:assert/strict';
import { writePrivateBackupFile, decryptLocalBackupChunks } from './local-backup-crypto.mjs';
const id='11111111-1111-4111-8111-111111111111';
test('public artifact writer cannot write a private-key or key-metadata file',async()=>{
 for(const kind of ['private.dpapi','public.asc','metadata.json','../private.key']) {
  await assert.rejects(writePrivateBackupFile(id,kind,Buffer.from('synthetic private bytes')),/^Error: local_backup_artifact_kind_invalid$/);
 }
});
test('plaintext cannot be persisted under an encrypted archive extension',async()=>{
 await assert.rejects(writePrivateBackupFile(id,'archive.pgp',Buffer.from('sensitive synthetic plaintext')),/^Error: local_backup_encrypted_artifact_required$/);
});
test('invalid or unbounded decryption batches fail before local key access',async()=>{
 for(const chunks of [null,[],[null],Array(4097).fill(Buffer.alloc(0))]) {
  await assert.rejects(decryptLocalBackupChunks(id,chunks),/^Error: local_backup_ciphertext_limit$/);
 }
});
