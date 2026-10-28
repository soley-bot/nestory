// One reviewed Pilot transaction. No arbitrary SQL, database URL or credentials.
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
export const DIRECT_ONCE_OPERATION='7c70e27f-ba37-48cc-8f93-d32badcb2fb7';
export const DIRECT_ONCE_TEMPLATE_SHA256='42d2ba7cebaac4018c92ec7d84633324961b3b30dbec56479e6dfbf431198224';
const authorizationSentinel='10000000-0000-4000-8000-000000000099';
const originalForeign='f2e75bdd74843731bfbdc95db10adb4116e80ce6045aacc7f4439a0e580b1ce5';
const deny=()=>{throw Error('local_custody_direct_input_invalid');};
export function compileDirectOnceSql({encoded,authorizationId,foreignSha256,operationId,action}){
 if(operationId!==DIRECT_ONCE_OPERATION||action!=='execute'||
  !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(authorizationId??'')||
  authorizationId===authorizationSentinel||!/^[a-f0-9]{64}$/.test(foreignSha256??'')||
  typeof encoded!=='string'||encoded.length>45056||!encoded.length||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))deny();
 let bytes;
 try{
  const compressed=Buffer.from(encoded,'base64');
  try{if(compressed.toString('base64')!==encoded)deny();bytes=gunzipSync(compressed,{maxOutputLength:408735});}
  finally{compressed.fill(0);}
  if(bytes.length!==408735||createHash('sha256').update(bytes).digest('hex')!==DIRECT_ONCE_TEMPLATE_SHA256)deny();
  const template=bytes.toString('utf8');
  if(template.split(authorizationSentinel).length!==2||template.split(originalForeign).length!==3)deny();
  return template.replace(authorizationSentinel,authorizationId).replaceAll(originalForeign,foreignSha256);
 }catch{deny();}finally{bytes?.fill(0);}
}
export function directOnceStateSql(authorizationId){
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(authorizationId??''))deny();
 return `BEGIN READ ONLY;
SET LOCAL search_path=pg_catalog;
SET LOCAL statement_timeout='45s';
SELECT jsonb_build_object(
 'authorizationConsumed',coalesce(a.consumed_at IS NOT NULL,false),
 'operationComplete',coalesce(o.status='actions_complete' AND o.completed_at IS NOT NULL,false),
 'actionsTotal',(SELECT count(*) FROM app_private.financial_reset_actions WHERE operation_id=o.operation_id),
 'actionsApplied',(SELECT count(*) FROM app_private.financial_reset_actions WHERE operation_id=o.operation_id AND applied_at IS NOT NULL),
 'emptyBooks',coalesce(c.result_json->'empty_books'='true'::jsonb,false),
 'billingPaused',coalesce(c.result_json->'billing_paused'='true'::jsonb,false),
 'contractsPreserved',coalesce(c.result_json->'contracts_unchanged'='true'::jsonb,false),
 'leasesPreservedUnbilled',coalesce(c.result_json->'preserved_unbilled_lease_count'='60'::jsonb,false),
 'frozen',coalesce(w.status='frozen' AND w.generation=1,false))
FROM app_private.financial_reset_operations o
LEFT JOIN app_private.financial_reset_actor_authorizations a ON a.authorization_id='${authorizationId}'::uuid
 AND a.operation_id=o.operation_id AND a.organization_id=o.organization_id
LEFT JOIN app_private.financial_reset_verification_checkpoints c ON c.operation_id=o.operation_id AND c.organization_id=o.organization_id
LEFT JOIN app_private.financial_write_controls w ON w.organization_id=o.organization_id
WHERE o.operation_id='${DIRECT_ONCE_OPERATION}'::uuid AND o.organization_id='752a87b8-bd04-4a45-9cb8-00687af66e73'::uuid;
ROLLBACK;`;
}

