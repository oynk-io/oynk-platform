import { randomUUID } from 'node:crypto';
import { Address, Networks, StrKey, TransactionBuilder, scValToNative, xdr } from '@stellar/stellar-sdk';
import type { Identity } from './auth.js';
import { accountFor, FundingError, transaction } from './service.js';
import { pool } from '../db/pool.js';
import { protocolContracts } from './protocol.js';
import { usdcContracts } from './stellarBalance.js';

export function validateChainIntent(identity:Pick<Identity,'wallet'|'network'>, raw:unknown, poolContract:string):Record<string,unknown>&{kind:string;amountAtomic:string;counterparty:string} {
 const input={...(raw as Record<string,unknown>)};
 if(input.callFunction&&typeof input.callFunction==='object')input.callFunction=(input.callFunction as {name?:unknown}).name;
 if(!input||typeof input.sessionReference!=='string'||!/^[A-Za-z0-9_.:-]{8,2048}$/.test(input.sessionReference)||!Array.isArray(input.argsXdr)||input.argsXdr.length>6)throw new FundingError('Invalid transaction details.');
 let args:unknown[];
 try { args=input.argsXdr.map(value=>{if(typeof value!=='string'||value.length>1024)throw new FundingError('Invalid transaction details.');return scValToNative(xdr.ScVal.fromXDR(value,'base64'));}); } catch { throw new FundingError('Invalid transaction details.'); }
 const own=args[0]===identity.wallet;
 if(input.contractId===usdcContracts[identity.network]&&input.callFunction==='transfer'&&args.length===3&&own&&typeof args[1]==='string'&&(StrKey.isValidContract(args[1])||StrKey.isValidEd25519PublicKey(args[1]))&&typeof args[2]==='bigint'&&args[2]>0n)return {...input,kind:'TRANSFER',amountAtomic:String(args[2]),counterparty:args[1]};
 if(input.contractId===poolContract&&['contribute','redeem'].includes(String(input.callFunction))&&args.length===3&&args[2] instanceof Uint8Array&&args[2].length===32&&own&&typeof args[1]==='bigint'&&args[1]>0n)return {...input,kind:input.callFunction==='contribute'?'CONTRIBUTE':'REDEEM',amountAtomic:String(args[1]),counterparty:poolContract};
 throw new FundingError('This transaction cannot be tracked for your account.');
}
export function serializeChainArgs(argsXdr:unknown):string {
 if(!Array.isArray(argsXdr))throw new FundingError('Invalid transaction details.');
 return JSON.stringify(argsXdr);
}
export async function createChainIntent(identity:Identity,raw:unknown){
 const account=await accountFor(identity),input=validateChainIntent(identity,raw,protocolContracts(identity.network).pool);
 return transaction(async db=>{
  const row=await db.query(`INSERT INTO consumer_chain_intents(id,account_id,network,session_reference,contract_id,call_function,args_xdr,kind,amount_atomic,counterparty) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(account_id,session_reference) DO UPDATE SET session_reference=EXCLUDED.session_reference WHERE consumer_chain_intents.contract_id=EXCLUDED.contract_id AND consumer_chain_intents.call_function=EXCLUDED.call_function AND consumer_chain_intents.args_xdr=EXCLUDED.args_xdr RETURNING id,state`,[randomUUID(),account.id,identity.network,input.sessionReference,input.contractId,input.callFunction,serializeChainArgs(input.argsXdr),input.kind,input.amountAtomic,input.counterparty]);
  if(!row.rows[0])throw new FundingError('The transaction details changed. Please start again.',409);
  await db.query(`INSERT INTO consumer_chain_events(intent_id,action) SELECT $1,'SUBMISSION_STARTED' WHERE NOT EXISTS(SELECT 1 FROM consumer_chain_events WHERE intent_id=$1)`,[row.rows[0].id]);
  return row.rows[0];
 });
}
export async function confirmChainIntent(identity:Identity,id:string,raw:unknown,request:typeof fetch=fetch){
 const hash=(raw as {transactionHash?:unknown})?.transactionHash;
 if(typeof hash!=='string'||!/^[a-f0-9]{64}$/i.test(hash))throw new FundingError('Invalid transaction reference.');
 const account=await accountFor(identity);
 const row=(await pool.query('SELECT * FROM consumer_chain_intents WHERE id=$1 AND account_id=$2',[id,account.id])).rows[0];
 if(!row)throw new FundingError('Transaction not found.',404);
 if(row.transaction_hash&&row.transaction_hash!==hash.toLowerCase())throw new FundingError('Transaction reference changed.',409);
 if(row.state==='COMPLETED')return{id,state:row.state,transactionHash:row.transaction_hash};
 // This is a candidate reference, never evidence of completion. Preserve it
 // before RPC so a timeout can be reconciled without sending money again.
 await pool.query(`UPDATE consumer_chain_intents SET candidate_hash=$3,checked_at=NOW() WHERE id=$1 AND account_id=$2 AND state<>'COMPLETED'`,[id,account.id,hash.toLowerCase()]);
 const endpoint=identity.network==='TESTNET'?process.env.STELLAR_TESTNET_RPC_URL||'https://soroban-testnet.stellar.org':process.env.STELLAR_PUBLIC_RPC_URL;
 if(!endpoint||new URL(endpoint).protocol!=='https:')throw new FundingError('Transaction confirmation is unavailable.',503);
 const rpc=async(method:string,params:object={})=>{const r=await request(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(12_000),body:JSON.stringify({jsonrpc:'2.0',id:method,method,params})});const b=await r.json();if(!r.ok||b.id!==method||b.error||!b.result)throw new FundingError('Transaction confirmation is unavailable.',503);return b.result;};
 const [network,result]=await Promise.all([rpc('getNetwork'),rpc('getTransaction',{hash})]);
 if(network.passphrase!==Networks[identity.network])throw new FundingError('Transaction network mismatch.',503);
 if(!['SUCCESS','FAILED'].includes(result.status))return {id,state:row.state};
 const tx=TransactionBuilder.fromXDR(result.envelopeXdr,Networks[identity.network]);
 const inner='innerTransaction' in tx?tx.innerTransaction:tx;
 const matches=inner.operations.some(op=>{
  if(op.type!=='invokeHostFunction'||op.func.switch().name!=='hostFunctionTypeInvokeContract')return false;
  const call=op.func.invokeContract();
  const address=Address.fromScAddress(call.contractAddress()).toString();
  return address===row.contract_id&&call.functionName().toString()===row.call_function&&JSON.stringify(call.args().map(arg=>arg.toXDR('base64')))===JSON.stringify(row.args_xdr);
 });
 if(!matches)throw new FundingError('The transaction does not match this payment.',409);
 return transaction(async db=>{
  const state=result.status==='SUCCESS'?'COMPLETED':'FAILED';
  const changed=await db.query(`UPDATE consumer_chain_intents SET state=$4,transaction_hash=$3,completed_at=NOW(),updated_at=NOW() WHERE id=$1 AND account_id=$2 AND state NOT IN ('COMPLETED','FAILED') RETURNING id`,[id,account.id,hash.toLowerCase(),state]);
  if(changed.rowCount)await db.query(`INSERT INTO consumer_chain_events(intent_id,action) VALUES($1,$2)`,[id,state==='COMPLETED'?'CHAIN_CONFIRMED':'CHAIN_FAILED']);
  return {id,state,transactionHash:hash.toLowerCase()};
 });
}

let reconciling = false;
export function startChainActivityReconciliation() {
 const timer = setInterval(() => { void reconcileChainActivity(); }, 30_000);
 timer.unref();
 return () => clearInterval(timer);
}
export async function reconcileChainActivity() {
 if (reconciling) return;
 reconciling = true;
 try {
  const rows = (await pool.query(`SELECT i.id,i.candidate_hash,a.subject,a.client_id,a.network,a.wallet FROM consumer_chain_intents i JOIN consumer_accounts a ON a.id=i.account_id WHERE i.state IN ('SUBMITTED','RECONCILIATION_REQUIRED') AND i.candidate_hash IS NOT NULL AND (i.checked_at IS NULL OR i.checked_at<NOW()-INTERVAL '30 seconds') ORDER BY i.checked_at NULLS FIRST LIMIT 12`)).rows;
  for(let i=0;i<rows.length;i+=3) await Promise.all(rows.slice(i,i+3).map(async row=> {
   try { await confirmChainIntent({subject:row.subject,clientId:row.client_id,network:row.network,wallet:row.wallet,authMethod:'device'},row.id,{transactionHash:row.candidate_hash}); }
   catch { console.warn('[consumer/chain-activity]',{event:'RECONCILIATION_PENDING',intentId:row.id}); }
  }));
 } catch { console.warn('[consumer/chain-activity]',{event:'RECONCILIATION_UNAVAILABLE'}); }
 finally { reconciling=false; }
}
