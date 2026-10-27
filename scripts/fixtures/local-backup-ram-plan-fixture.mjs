import {createHash} from 'node:crypto';
import {LOCAL_CAPTURE_POLICY,PILOT_BACKUP_ORGANIZATION} from '../local-backup-capture.mjs';
import {describeMigrationStatement} from '../hosted-migration-parity-core.mjs';
import {SERVER_MATERIALIZER_POLICY_SHA256} from '../pilot-finance-reset-server-materializer.mjs';
import {patchRowText} from '../pilot-finance-reset-executor-plan.mjs';
import {createPilotRamRehearsalPlanner} from '../local-backup-ram-rehearsal-plan.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const org=PILOT_BACKUP_ORGANIZATION;
export function pilotRamPlanFixture() {
  const tables = LOCAL_CAPTURE_POLICY.map(p => ({table_name:p.table,scopeColumn:p.scopeColumn,capture:p.capture,mustBeEmpty:p.mustBeEmpty,
    row_count:0,rows_sha256:hash(''),rows:p.capture==='full-row-image'?[]:null}));
  const metadata = LOCAL_CAPTURE_POLICY.map(p => ({table:p.table,columns:[...new Set(['id',p.scopeColumn])].map(name=>({name})),constraints:[]}));
  const row = (table,v,raw=JSON.stringify(v)) => {
    const t=tables.find(t=>t.table_name===table),r={primaryKey:{id:v.id},rowText:raw,rowSha256:hash(raw)};
    t.rows.push(r);t.row_count=t.rows.length;t.rows_sha256=hash(t.rows.map(r=>r.rowSha256).join(''));
    metadata.find(m=>m.table===table).columns=Object.keys(v).map(name=>({name}));return {relation_name:table,primary_key:r.primaryKey,row_text:raw,row_sha256:r.rowSha256};
  };
  const expenseValue={id:id(2),organization_id:org,ledger_entry_id:id(3),amount:1,financial_generation:0};
  const expense=row('public.finance_expense_items',expenseValue,JSON.stringify(expenseValue).replace('"amount":1','"amount":9007199254740993.1200'));
  const ledger=row('public.ledger_entries',{id:id(3),organization_id:org,financial_generation:0});
  const deposit=row('public.lease_deposits',{id:id(4),organization_id:org,lease_id:id(5),status:'held',currency:'USD',archived_at:null,received_on:'2026-09-01',returned_on:null});
  const retired=row('app_private.financial_idempotency_requests',{id:id(6),organization_id:org,status:'completed',financial_generation:0});
  row('public.leases',{id:id(5),organization_id:org,status:'active'});
  row('public.properties',{id:id(7),organization_id:org});
  const snapshot={format:'nestory-local-pilot-business-capture-v1',scope:'selected-org-business',operationId:id(90),organizationId:org,
    authBackupIncluded:false,securityMetadataIncluded:true,excludedCredentialRelations:['auth.*',...LOCAL_CAPTURE_POLICY.filter(p=>p.capture==='count-and-hash-only').map(p=>p.table)],
    tables,restoreMetadata:metadata,catalog:[{kind:'schema',name:'public',sha256:'e'.repeat(64)}],ledger:[{version:'20261026000100',name:'fixture',statements:[describeMigrationStatement('SELECT 1;')]}],
    storageReferences:[],storageMetadata:[],storageBucketMetadata:[]};
  const manifestBytes=Buffer.from(JSON.stringify(snapshot)),expectedSourceSha256=hash(manifestBytes),operationId=id(99);
  const planner=createPilotRamRehearsalPlanner({manifestBytes,expectedSourceSha256,operationId});
  const staged=patchRowText(expense.row_text,{ledger_entry_id:null}),normalized=patchRowText(deposit.row_text,{status:'pending',received_on:null,returned_on:null});
  // Server materialization casts an MD5 digest to uuid without RFC-v4 bit edits.
  // Keep a non-v4 first action throughout planner, packet and SQL consumers.
  const actionHex=createHash('md5').update(`${operationId}/0/synthetic-fixture`).digest('hex');
  const serverActionId=[actionHex.slice(0,8),actionHex.slice(8,12),actionHex.slice(12,16),actionHex.slice(16,20),actionHex.slice(20)].join('-');
  const action=(r,ordinal,kind,before,after,changed_columns)=>({action_id:ordinal===1?serverActionId:id(100+ordinal),ordinal,relation_name:r.relation_name,primary_key:r.primary_key,
    kind,before_row_text:before,after_row_text:after,before_sha256:hash(before),after_sha256:after===null?null:hash(after),changed_columns});
  const actions=[action(expense,1,'normalization',expense.row_text,staged,['ledger_entry_id']),action(expense,2,'archive-delete',staged,null,[]),
    action(ledger,3,'archive-delete',ledger.row_text,null,[]),action(deposit,4,'normalization',deposit.row_text,normalized,['status','received_on'])];
  const archive=[retired,expense,deposit,ledger];
  // Wire text is intentionally noncompact. Production uses server-supplied
  // jsonb::text; this fixture does not implement PostgreSQL serialization.
  const wire=v=>JSON.stringify(v,null,1);
  const archive_descriptor_text=wire(archive.map(({relation_name,primary_key,row_sha256})=>({relation_name,primary_key,row_sha256})));
  const action_descriptor_text=wire(actions.map(({action_id,ordinal,relation_name,primary_key,kind,before_sha256,after_sha256})=>({action_id,ordinal,relation_name,primary_key,kind,before_sha256,after_sha256})));
  const catalog_text=wire(snapshot.catalog),ledger_text=wire([...snapshot.ledger,{version:'20261027005615',name:'financial_reset_empty_books_preserved_contracts',statements:[describeMigrationStatement('SELECT 2;')]}]);
  const summary={format:'nestory-server-reset-materialization-v1',operation_id:operationId,organization_id:org,source_generation:0,source_sha256:expectedSourceSha256,
    policy_sha256:SERVER_MATERIALIZER_POLICY_SHA256,archive_count:archive.length,action_count:actions.length,
    archive_sha256:hash(archive_descriptor_text),action_sha256:hash(action_descriptor_text),
    source_snapshot_sha256:'a'.repeat(64),foreign_snapshot_sha256:'b'.repeat(64),catalog_snapshot_sha256:hash(catalog_text),ledger_snapshot_sha256:hash(ledger_text),
    counts:[],deleted_rows:2,normalized_rows:1,cycle_stage_rows:1,accepted:true,blockers:[]};
  const summary_text=wire(summary),preview={...summary,manifest_sha256:hash(summary_text),summary_text},
    materialization={summary,summary_text,archive,actions,archive_descriptor_text,action_descriptor_text,catalog_text,ledger_text};
  return {planner,preview,materialization,manifestBytes,expectedSourceSha256,operationId,snapshot,expense,ledger,deposit,retired};
}
