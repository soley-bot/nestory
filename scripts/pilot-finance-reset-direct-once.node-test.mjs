import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {compileDirectOnceSql,directOnceStateSql,DIRECT_ONCE_OPERATION} from './pilot-finance-reset-direct-once.mjs';
const base={operationId:DIRECT_ONCE_OPERATION,action:'execute',authorizationId:'11111111-1111-4111-8111-111111111111',foreignSha256:'a'.repeat(64)};
test('the direct route rejects arbitrary SQL and altered template bytes',()=>{
 for(const sql of ['SELECT 1;',"BEGIN; DELETE FROM public.people; COMMIT;",'x'.repeat(408735)])
  assert.throws(()=>compileDirectOnceSql({...base,encoded:gzipSync(sql).toString('base64')}),/direct_input_invalid/);
});
test('the direct route rejects unbounded decompression and malformed input',()=>{
 for(const encoded of ['!', 'a'.repeat(45057),gzipSync('x'.repeat(408736)).toString('base64')])
  assert.throws(()=>compileDirectOnceSql({...base,encoded}),/direct_input_invalid/);
 for(const changes of [{operationId:base.authorizationId},{action:'reopen'},{authorizationId:"'; COMMIT;--"},
  {authorizationId:'10000000-0000-4000-8000-000000000099'},{foreignSha256:"'; SELECT 1;--"}])
  assert.throws(()=>compileDirectOnceSql({...base,...changes,encoded:'eA=='}),/direct_input_invalid/);
});
test('readback is read-only and rejects interpolation into the authorization locator',()=>{
 const sql=directOnceStateSql(base.authorizationId);
 assert.match(sql,/^BEGIN READ ONLY;/);assert.match(sql,/ROLLBACK;$/);
 assert.match(sql,/actions_complete/);assert.match(sql,/contracts_unchanged/);
 assert.throws(()=>directOnceStateSql("'; DELETE FROM public.people;--"),/direct_input_invalid/);
});
