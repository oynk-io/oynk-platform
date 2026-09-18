import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('ramp database: idempotency, approvals, execution, retries, policy versions and audit', {skip:!process.env.RAMP_TEST_DATABASE_URL}, async()=>{
 const url=new URL(process.env.RAMP_TEST_DATABASE_URL!);if(url.hostname!=='127.0.0.1'||url.port!=='5433'||url.pathname!=='/oynk_dashboard')throw new Error('Use only the loopback Oynk development database for this isolated-schema test.');
 const schema=`ramp_test_${randomUUID().replaceAll('-','')}`;url.searchParams.set('options',`-c search_path=${schema}`);process.env.DATABASE_URL=url.toString();
 const {pool}=await import('../db/pool.js');const service=await import('./service.js');
 try{await pool.query(`CREATE SCHEMA ${schema}`);for(const name of ['002_identity_auth.sql','007_consumer_funding.sql','012_ramp_control.sql','014_harden_ramp_audit.sql'])await pool.query(await readFile(new URL(`../db/migrations/${name}`,import.meta.url),'utf8'));
  const operator=randomUUID(),organization=randomUUID(),account=randomUUID();
  await pool.query(`INSERT INTO users(id,email,password_hash,first_name,last_name,status) VALUES($1,$2,'x','Test','Operator','ACTIVE')`,[operator,`${operator}@example.invalid`]);
  await pool.query(`INSERT INTO organizations(id,type,status,platform_mode,legal_name) VALUES($1,'INTERNAL','ACTIVE','TEST','Oynk Internal')`,[organization]);
  await pool.query(`INSERT INTO consumer_accounts(id,subject,client_id,network,wallet,profile) VALUES($1,'subject','client','TESTNET',$2,'{}')`,[account,`C${'A'.repeat(55)}`]);
  const make=(reference:string,amount:bigint)=>service.createRampTransaction(pool,{reference,idempotencyKey:`key:${reference}`,direction:'ON_RAMP',consumerAccountId:account,subjectReference:'subject',walletAddress:`C${'A'.repeat(55)}`,network:'TESTNET',fiatCurrency:'NGN',fiatAmountMinor:10000n,usdcAmountAtomic:amount,provider:'PAYSTACK',actor:{type:'CONSUMER',reference:account}});
  const exact=await make('exact-500',5_000_000_000n);assert.equal(exact.state,'CREATED');assert.equal(exact.approval_state,'NOT_REQUIRED');assert.equal((await make('exact-500',5_000_000_000n)).id,exact.id);
  await service.recordProviderConfirmation(pool,{transactionId:exact.id,provider:'PAYSTACK',providerReference:'paystack-exact',providerStatus:'CONFIRMED'});assert.equal((await service.getRampTransaction(exact.id)).transaction.state,'APPROVED');
  const above=await make('above-500',5_000_000_001n);assert.equal(above.state,'PENDING_APPROVAL');await service.recordProviderConfirmation(pool,{transactionId:above.id,provider:'PAYSTACK',providerReference:'paystack-above',providerStatus:'CONFIRMED'});
  const approved=await service.decideRampTransaction({transactionId:above.id,action:'APPROVE',operatorUserId:operator,operatorOrganizationId:organization});assert.equal(approved.state,'APPROVED');assert.equal((await service.decideRampTransaction({transactionId:above.id,action:'APPROVE',operatorUserId:operator,operatorOrganizationId:organization})).state,'APPROVED');await assert.rejects(()=>service.decideRampTransaction({transactionId:above.id,action:'REJECT',operatorUserId:operator,operatorOrganizationId:organization}),/final approval/);
  const rejected=await make('rejected',6_000_000_000n);assert.equal((await service.decideRampTransaction({transactionId:rejected.id,action:'REJECT',operatorUserId:operator,operatorOrganizationId:organization,note:'Policy review failed'})).state,'REJECTED');
  const execution=await service.beginRampExecution({transactionId:exact.id,idempotencyKey:'execution-idempotency-exact'});assert.equal(execution.state,'PROCESSING');assert.equal((await service.beginRampExecution({transactionId:exact.id,idempotencyKey:'execution-idempotency-exact'})).id,execution.id);
  const failed=await service.finishRampExecution({transactionId:exact.id,idempotencyKey:'execution-idempotency-exact',succeeded:false,errorCode:'RPC_TIMEOUT',errorReason:'Test failure'});assert.equal(failed.state,'FAILED');assert.equal((await service.finishRampExecution({transactionId:exact.id,idempotencyKey:'execution-idempotency-exact',succeeded:false})).state,'FAILED');
  const retry=await service.retryRampTransaction({transactionId:exact.id,idempotencyKey:'retry-idempotency-exact',operatorUserId:operator});assert.equal(retry.state,'QUEUED');assert.deepEqual(await service.retryRampTransaction({transactionId:exact.id,idempotencyKey:'retry-idempotency-exact',operatorUserId:operator}),retry);
  const updated=await service.updateRampPolicy({direction:'OFF_RAMP',enabled:true,manualThresholdUsdcAtomic:4_000_000_000n,cumulativeEnabled:true,cumulativeThresholdUsdcAtomic:12_000_000_000n,cumulativeWindowSeconds:86400,operatorUserId:operator,operatorOrganizationId:organization,note:'Integration test'});assert.equal(updated.version,2);
  assert.equal(Number((await pool.query(`SELECT COUNT(*) count FROM ramp_policy_versions WHERE policy_id=$1`,[updated.id])).rows[0].count),2);assert.equal(Number((await pool.query(`SELECT COUNT(*) count FROM audit_logs WHERE action='RAMP_POLICY_UPDATED' AND resource_id=$1`,[updated.id])).rows[0].count),1);
  const detail=await service.getRampTransaction(above.id);assert.ok(detail.events.some((item:any)=>item.event_type==='MANUAL_APPROVAL_GRANTED'));assert.equal(detail.approvals.length,1);
 }finally{await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await pool.end();}
});
