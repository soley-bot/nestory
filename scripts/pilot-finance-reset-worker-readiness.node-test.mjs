import test from 'node:test';
import assert from 'node:assert/strict';
import {readLocalCustodyParallel,assertLocalCustodyPayloadPreflight,verifyLocalCustodyPayload,localCustodyFailureCode,classifyLocalCustodyDatabaseFailure} from './pilot-finance-reset-local-custody-runner.mjs';

const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return{promise,resolve}};
test('resume failures and actor expiry diagnostics reveal only closed static categories',()=>{
 for(const code of ['local_custody_actor_context_required','local_execute_adapter_unverified','local_execute_transition_unverified','local_execute_resume_unverified']){
  assert.equal(localCustodyFailureCode(Error(code)),code);assert.equal(localCustodyFailureCode(Error(code+' PRIVATE')),'local_custody_worker_stopped');
 }
 assert.equal(classifyLocalCustodyDatabaseFailure(Buffer.from('ERROR financial_reset_actor_context_required PRIVATE SQL')),'local_custody_actor_context_required');
});

test('independent fresh reads overlap and preserve result identities regardless of completion order',async()=>{
 const started=[],gates=[deferred(),deferred(),deferred(),deferred()];
 const pending=readLocalCustodyParallel(gates.map((gate,index)=>async()=>{started.push(index);await gate.promise;return{index}}));
 await Promise.resolve();assert.deepEqual(started,[0,1,2,3]);
 for(const index of [3,1,0,2])gates[index].resolve();
 assert.deepEqual(await pending,[{index:0},{index:1},{index:2},{index:3}]);
});

test('failed observation drains other reads before credentials can be cleaned up',async()=>{
 const gate=deferred(),events=[];let completed=false;
 const pending=readLocalCustodyParallel([
  async()=>{throw Error('observation refused')},
  async()=>{events.push('source-start');await gate.promise;events.push('source-end')},
 ]).finally(()=>{completed=true;events.push('cleanup')});
 await Promise.resolve();await Promise.resolve();assert.equal(completed,false);
 gate.resolve();await assert.rejects(pending,/observation refused/);
 assert.deepEqual(events,['source-start','source-end','cleanup']);
});

test('synchronous provider failure still starts and drains all independent reads',async()=>{
 const gate=deferred();let started=false,finished=false;
 const pending=readLocalCustodyParallel([()=>{throw Error('source refused')},async()=>{started=true;await gate.promise;finished=true}]);
 await Promise.resolve();assert.equal(started,true);assert.equal(finished,false);
 gate.resolve();await assert.rejects(pending,/source refused/);assert.equal(finished,true);
});

test('any failed source, job, original attempt or observation prevents execution continuation',async()=>{
 for(let rejected=0;rejected<4;rejected++){
  let writes=0,finished=0;
  await assert.rejects(readLocalCustodyParallel(Array.from({length:4},(_,index)=>async()=>{
   finished++;if(index===rejected)throw Error('fresh check refused');return index;
  })).then(()=>{writes++}),/fresh check refused/);
  assert.equal(finished,4);assert.equal(writes,0);
 }
});

test('preflight cannot treat a malformed or recovery payload as authorization',()=>{
 for(const action of ['execute-recovery','prepare-recovery','reopen','unknown']){
  assert.throws(()=>assertLocalCustodyPayloadPreflight({action,mainSha:'a'.repeat(40),payload:{}}),/reset_scope_invalid/);
  assert.throws(()=>verifyLocalCustodyPayload({ticket:{action,mainSha:'a'.repeat(40)},payload:{}}),/reset_scope_invalid/);
 }
 assert.throws(()=>assertLocalCustodyPayloadPreflight({action:'execute',mainSha:'a'.repeat(40),payload:{}}));
});
