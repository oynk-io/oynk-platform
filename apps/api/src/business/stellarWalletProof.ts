import { Keypair, Networks, TransactionBuilder } from '@stellar/stellar-sdk';

export type StellarNetwork='TESTNET'|'PUBLIC';
export const stellarPassphrase=(network:StellarNetwork)=>network==='PUBLIC'?Networks.PUBLIC:Networks.TESTNET;

export function verifyStellarTransactionProof(input:{address:string;network:StellarNetwork;transactionHash:string;signedXdr:string}){
 const transaction=TransactionBuilder.fromXDR(input.signedXdr,stellarPassphrase(input.network));
 if(transaction.hash().toString('hex')!==input.transactionHash)return false;
 const key=Keypair.fromPublicKey(input.address);
 return transaction.signatures.some(signature=>key.verify(transaction.hash(),Buffer.from(signature.signature())));
}

