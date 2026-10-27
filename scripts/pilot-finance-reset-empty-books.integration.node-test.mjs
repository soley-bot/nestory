import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtempSync,writeFileSync,rmSync,rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertSyntheticDescriptor, assertOwnedRuntime } from './pilot-finance-reset-empty-books.integration.mjs';
import { localRecoveryDocker } from './local-recovery-docker.mjs';

const runId='09afd97e-9bbb-433c-b50b-a444eb3322e1';
const descriptor=()=>({runId,database:`pilot_reset_empty_books_${runId}`,dbContainer:'a'.repeat(64),httpContainer:'b'.repeat(64),authContainer:'d'.repeat(64),restContainer:'e'.repeat(64),networkId:'c'.repeat(64),
  authUrl:'http://empty-books-auth:9999',restUrl:'http://empty-books-rest:3000'});
function runtime(d) {
  const container=Id=>({Id,Config:{Labels:{'nestory.empty-books.run':runId}},State:{Running:true},HostConfig:{PortBindings:{}},Mounts:[],
    NetworkSettings:{Networks:{owned:{NetworkID:d.networkId,Aliases:[]}}}});
  const members=[container(d.dbContainer),container(d.httpContainer),container('d'.repeat(64)),container('e'.repeat(64))];
  members[0].NetworkSettings.Networks.owned.Aliases=['db'];
  members[2].NetworkSettings.Networks.owned.Aliases=['empty-books-auth'];members[3].NetworkSettings.Networks.owned.Aliases=['empty-books-rest'];
  members[2].Config.Env=[`GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin@db:5432/${d.database}`];
  members[3].Config.Env=[`PGRST_DB_URI=postgres://authenticator@db:5432/${d.database}`];
  return {network:{Id:d.networkId,Internal:true,Labels:{'nestory.empty-books.run':runId},Containers:Object.fromEntries(members.map(c=>[c.Id,{}]))},members};
}
test('synthetic harness only admits exact isolated disposable descriptors',()=>{
  assertSyntheticDescriptor(descriptor());
  for(const change of [d=>{d.database='postgres';},d=>{d.authUrl='https://project.supabase.co';},d=>{d.dbContainer='db';},
    d=>{d.password='secret';},d=>{d.authUrl='http://user:pass@auth:9999';},d=>{d.restUrl='http://127.0.0.1:3000';}]) {
    const d=descriptor();change(d);assert.throws(()=>assertSyntheticDescriptor(d));
  }
});
test('synthetic runtime rejects reused mounts, exposed ports and network or ownership changes',()=>{
  const d=descriptor();assert.equal(assertOwnedRuntime(d,runtime(d)),true);
  for(const change of [r=>{r.network.Internal=false;},r=>{r.members[0].Mounts=[{Type:'volume'}];},r=>{r.members[1].Mounts=[{Type:'bind'}];},
    r=>{r.members[0].HostConfig.PortBindings={'5432/tcp':[{}]};},r=>{r.members[0].Config.Labels={};},r=>{r.members[1].NetworkSettings.Networks.extra={NetworkID:'d'.repeat(64)};},
    r=>{r.members[2].Config.Labels={};},r=>{r.members[3].NetworkSettings.Networks.owned.Aliases=[];},
    r=>{r.members[2].NetworkSettings.Networks.owned.Aliases=['empty-books-rest'];r.members[3].NetworkSettings.Networks.owned.Aliases=['empty-books-auth'];},
    r=>{r.network.Containers['f'.repeat(64)]={};},r=>{r.members[2].Mounts=[{Type:'volume'}];},
    r=>{r.members[2].Config.Env=['GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin@other:5432/postgres'];},
    r=>{r.members[3].Config.Env=[`PGRST_DB_URI=postgres://postgres@db:5432/${d.database}`];}]) {
    const r=runtime(d);change(r);assert.throws(()=>assertOwnedRuntime(d,r));
  }
});
test('synthetic Docker boundary rejects remote contexts and environment overrides before exec',async()=>{
  await assert.rejects(localRecoveryDocker({env:{DOCKER_HOST:'ssh://remote'},execute:()=>assert.fail('must not execute')}),/overrides/);
  for(const platform of ['win32','linux']) await assert.rejects(localRecoveryDocker({env:{},platform,
    execute:(_exe,args)=>args[1]==='show'?'remote':JSON.stringify('tcp://remote:2375')}),/local Docker endpoint/);
  const calls=[];
  const local=await localRecoveryDocker({env:{},platform:'win32',execute:(_exe,args)=>{
    calls.push(args);if(args[1]==='show')return 'desktop-linux';if(args[1]==='inspect')return JSON.stringify('npipe:////./pipe/dockerDesktopLinuxEngine');return 'ok';
  }});
  assert.equal(local.docker(['inspect','synthetic']),'ok');
  assert.deepEqual(calls.at(-1),['--host','npipe:////./pipe/dockerDesktopLinuxEngine','inspect','synthetic']);
});
test('genuine success fixture cannot fabricate authentication or weaken database enforcement',()=>{
  const sql=readFileSync(new URL('./fixtures/pilot-finance-reset-empty-books-http-setup.sql',import.meta.url),'utf8');
  assert.match(sql,/pilot_reset_empty_books_/);
  assert.match(sql,/JOIN auth\.sessions/);
  assert.doesNotMatch(sql,/INSERT INTO auth\.(users|sessions)|SET SESSION AUTHORIZATION|request\.jwt|DISABLE TRIGGER|session_replication_role|GRANT /i);
  assert.match(sql,/'version',4,'actor_id'/);
  assert.match(sql,/'contracts_sha256',app_private\.financial_reset_hash/);
});
test('CLI failures never print descriptor credentials or assertion values',()=>{
  const directory=mkdtempSync(path.join(tmpdir(),'empty-books-invalid-'));
  try {
    const d=descriptor();d.authUrl='http://private-user:never-print-this-password@auth:9999';
    const file=path.join(directory,'descriptor.json');writeFileSync(file,JSON.stringify(d));
    const result=spawnSync(process.execPath,[fileURLToPath(new URL('./pilot-finance-reset-empty-books.integration.mjs',import.meta.url)),file],{encoding:'utf8',windowsHide:true});
    assert.equal(result.status,1);assert.equal(result.stdout,'');
    assert.equal(result.stderr.trim(),'Synthetic empty-books proof failed; no success evidence was issued.');
    assert.doesNotMatch(result.stderr,/private-user|never-print-this-password/);
  } finally { rmSync(path.join(directory,'descriptor.json'));rmdirSync(directory); }
});
