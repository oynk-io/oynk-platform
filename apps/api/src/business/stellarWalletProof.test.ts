import assert from 'node:assert/strict';
import test from 'node:test';
import { Account, Keypair, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { stellarPassphrase, verifyStellarTransactionProof } from './stellarWalletProof.js';

function fixture(){const owner=Keypair.random();const transaction=new TransactionBuilder(new Account(owner.publicKey(),'1'),{fee:'100',networkPassphrase:stellarPassphrase('TESTNET')}).addOperation(Operation.manageData({name:'oynk.business.verify',value:Buffer.from('challenge')})).setTimeout(300).build();return{owner,transaction};}

test('accepts the expected business wallet signature',()=>{const{owner,transaction}=fixture();transaction.sign(owner);assert.equal(verifyStellarTransactionProof({address:owner.publicKey(),network:'TESTNET',transactionHash:transaction.hash().toString('hex'),signedXdr:transaction.toXDR()}),true);});
test('rejects another signer and any changed challenge hash',()=>{const{owner,transaction}=fixture();transaction.sign(Keypair.random());assert.equal(verifyStellarTransactionProof({address:owner.publicKey(),network:'TESTNET',transactionHash:transaction.hash().toString('hex'),signedXdr:transaction.toXDR()}),false);assert.equal(verifyStellarTransactionProof({address:owner.publicKey(),network:'TESTNET',transactionHash:'00'.repeat(32),signedXdr:transaction.toXDR()}),false);});

