// Invoked only by the owned disposable-database harness. Wait for observed
// PostgreSQL lock contention, never assume ordering from a sleep duration.
import { spawn } from 'node:child_process';
import { assertDepositCandidateTarget } from './deposit-candidate-target.mjs';

export async function custodyConcurrency(context) {
  const {endpoint,container,db,sql,seed,q,actor,results,check,prepareFor,argsFor,custodyPayload,custodyCandidate,receiptFor,renewalFor,freshKey}=context;
  assertDepositCandidateTarget(context);
  const workers=[];
  const start=(name,body,hold=false)=>{
    assertDepositCandidateTarget(context);
    const child=spawn('docker',['--host',endpoint,'exec','-i',container,'psql','-X','-qAt','-U','supabase_admin','-d',db,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],{stdio:['pipe','pipe','pipe'],windowsHide:true});
    const worker={name,child,out:'',err:'',closed:false,code:null};
    worker.done=new Promise(resolve=>{child.on('error',error=>{worker.err+=error.message;});child.on('close',code=>{worker.closed=true;worker.code=code;resolve(worker);});});
    child.stdout.on('data',chunk=>worker.out+=chunk.toString());
    child.stderr.on('data',chunk=>worker.err+=chunk.toString());
    child.stdin.on('error',error=>{worker.err+=error.message;});
    child.stdin.write(`SET application_name='${name}'; SET statement_timeout='20s'; SET idle_in_transaction_session_timeout='30s';\n${body}\n\\echo CUSTODY_WORKER_READY\n`);
    if(!hold)child.stdin.end();
    workers.push(worker);return worker;
  };
  const waitFor=async(predicate,label,worker)=>{
    const deadline=Date.now()+15000;
    while(Date.now()<deadline){
      if(predicate())return;
      if(worker?.closed)throw Error(`${label}: worker exited ${worker.code}: ${worker.err}`);
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    throw Error(`Timeout waiting for observed ${label}`);
  };
  const ready=worker=>waitFor(()=>worker.out.includes('CUSTODY_WORKER_READY'),'worker-held transaction',worker);
  const blocked=worker=>waitFor(()=>sql(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname='${db}' AND application_name='${worker.name}' AND cardinality(pg_blocking_pids(pid))>0)`).trim()==='t','PostgreSQL blocking lock',worker);
  const release=async worker=>{worker.child.stdin.end('COMMIT;\n');await worker.done;if(worker.code!==0)throw Error(worker.err);};
  const ordinary=body=>`BEGIN; SET LOCAL "request.jwt.claim.sub"=${q(101)}; SET LOCAL ROLE authenticated; ${body};`;
  try {
    if(context.accountArchive) {
      const {args,lease}=context.accountArchive;
      const reverse=start('custody_reverse_account_lock',ordinary(`SELECT public.execute_deposit_rent_journal(${args})`),true);
      await ready(reverse);
      check('historical reversal holds a shared row-lock relation on its exact liability account',`SELECT EXISTS(SELECT 1 FROM pg_locks lock JOIN pg_stat_activity activity ON activity.pid=lock.pid WHERE activity.datname='${db}' AND activity.application_name='custody_reverse_account_lock' AND lock.relation='public.finance_accounts'::regclass AND lock.mode='RowShareLock' AND lock.granted)`,'t');
      const archive=start('custody_archive_waits',`BEGIN; SET LOCAL "request.jwt.claim.sub"=${q(106)}; SET LOCAL ROLE authenticated; SELECT public.set_finance_account_archived(${q(1)},${q(81)},true,NULL); COMMIT;`);
      await blocked(archive);
      results.push({name:'real authenticated account archival waits for concurrent historical reversal',pass:true});
      await release(reverse);await archive.done;
      if(archive.code!==0)throw Error(`Concurrent legitimate account archival failed: ${archive.err}`);
      const result=JSON.parse(reverse.out.split('\n').find(line=>line.startsWith('{'))??'null');
      if(result?.state!=='resolved')throw Error('Concurrent historical reversal did not resolve');
      check('serialized reversal then archival preserves restored balances and inactive original account',`SELECT app_private.deposit_rent_held(${q(1)},${q(lease+2)})=500 AND (SELECT balance_due=500 FROM public.tenant_invoice_balances WHERE id=${q(lease+3)}) AND (SELECT archived_at IS NOT NULL AND archived_by=${q(106)} FROM public.finance_accounts WHERE id=${q(81)}) AND (SELECT liability_account_id=${q(81)} FROM public.deposit_rent_applications WHERE id='${result.result.commandId}')`,'t');
      return;
    }
    seed(17000,'through_ips',500,600,700);
    const intent=prepareFor(17000,custodyPayload(17000)),args=argsFor(17000,intent);
    sql(actor(101,`SET LOCAL ROLE authenticated; SELECT public.begin_deposit_rent_journal_attempt(${args},${intent.revision})`,true));
    const staleRenewKey=freshKey(17000);
    const receipt=start('custody_receipt_holds',ordinary(receiptFor(17000,'concurrent-custody-receipt')),true);
    await ready(receipt);
    const renewal=start('custody_renew_waits',ordinary(renewalFor(17000,500,staleRenewKey))+' COMMIT;');
    const application=start('custody_apply_waits',ordinary(`SELECT public.execute_deposit_rent_journal(${args})`)+' COMMIT;');
    await blocked(renewal);await blocked(application);
    results.push({name:'real receipt, renewal and checked application contend on PostgreSQL transaction locks',pass:true});
    await release(receipt);
    await Promise.all([renewal.done,application.done]);
    if(renewal.code===0||!renewal.err.includes('23514'))throw Error(`Concurrent stale renewal was not rejected: ${renewal.err}`);
    if(application.code!==0)throw Error(`Concurrent journal failed to retain known rejection: ${application.err}`);
    const rejected=JSON.parse(application.out.split('\n').find(line=>line.startsWith('{'))??'null');
    if(rejected?.state!=='rejected'||rejected.token!==intent.token)throw Error('Concurrent receipt did not produce original journal rejection');
    check('concurrent receipt wins; renewal and application roll back claims and financial posting',`SELECT app_private.deposit_rent_held(${q(1)},${q(17002)})=600 AND NOT EXISTS(SELECT 1 FROM public.deposit_rent_applications WHERE lease_deposit_id=${q(17002)}) AND NOT EXISTS(SELECT 1 FROM app_private.financial_idempotency_requests WHERE idempotency_key IN ('${staleRenewKey}','${intent.idempotencyKey}'))`,'t');
    const key=freshKey(17000),command=renewalFor(17000,600,key);
    const first=start('custody_renew_first',ordinary(command),true);await ready(first);
    const duplicate=start('custody_renew_duplicate',ordinary(command)+' COMMIT;');await blocked(duplicate);
    await release(first);await duplicate.done;
    if(duplicate.code!==0)throw Error(`Concurrent same-key renewal failed: ${duplicate.err}`);
    const returned=worker=>worker.out.split('\n').find(line=>/^[0-9a-f-]{36}$/.test(line));
    if(!returned(first)||returned(first)!==returned(duplicate))throw Error('Concurrent renewal retries changed identity');
    check('concurrent same-key renewal produces one successor and one original identity',`SELECT count(*) FROM app_private.deposit_rent_custody_attestations WHERE custody_confirmation_id='${returned(first)}'`,'2');
    if(custodyCandidate(17000).deposits[0].custodyCurrent!==true)throw Error('Concurrent renewal did not restore current custody');
    results.push({name:'serialized renewal restores current evidence after concurrent receipt',pass:true});
  } finally {
    assertDepositCandidateTarget(context);
    // Scope cleanup to exact owned database and generated worker names. Backend
    // termination rolls back any open synthetic transaction before DROP DATABASE.
    for(const worker of workers)if(!worker.closed){
      sql(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${db}' AND application_name='${worker.name}'`);
      worker.child.stdin.end();await worker.done;
    }
  }
}
