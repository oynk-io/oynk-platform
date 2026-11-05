import assert from 'node:assert/strict';
import test from 'node:test';
import { documentUploadOutcome, parseTier3Document, requireTier3Documents, tier3ProviderBody } from './tier3Documents.js';

const png=`data:image/png;base64,${Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]).toString('base64')}`;

test('Tier 3 documents require explicit consent and a matching image type',()=>{
 const valid=parseTier3Document({kind:'IDENTITY',identityType:'NIN',base64Image:png,consent:true});
 assert.equal(valid.document.kind,'IDENTITY');
 assert.match(valid.sha256,/^[0-9a-f]{64}$/);
 assert.throws(()=>parseTier3Document({kind:'IDENTITY',identityType:'NIN',base64Image:png,consent:false}),/valid ID/i);
 assert.throws(()=>parseTier3Document({kind:'ADDRESS',base64Image:png.replace('image/png','image/jpeg'),consent:true}),/JPG or PNG/i);
 assert.throws(()=>parseTier3Document({kind:'ADDRESS',base64Image:'data:image/png;base64,%%%',consent:true}),/JPG or PNG/i);
});

test('Tier 3 uses the VFD KYC bundle schema for both documents',()=>{
 assert.deepEqual(tier3ProviderBody('1000000001',{kind:'IDENTITY',identityType:'NIN',base64Image:png,consent:true}),{
  accountNo:'1000000001',documentType:'identityDocuments',identityDocuments:[{identityType:'NIN',frontImage:{base64Image:png}}],
 });
 assert.deepEqual(tier3ProviderBody('1000000001',{kind:'ADDRESS',base64Image:png,consent:true}),{
  accountNo:'1000000001',documentType:'utilityBill',utilityBill:{base64Image:png},
 });
});

test('VFD upload confirmation accepts documented and sandbox response forms but rejects failed rows',()=>{
 assert.equal(documentUploadOutcome({status:'00',data:{uploadResults:[{documentType:'UTILITY_BILL',status:'SUCCESS'}]}}),'confirmed');
 assert.equal(documentUploadOutcome({status:'00',data:{uploadResults:[{documentType:'NIN',status:'UPLOADED'}]}}),'confirmed');
 assert.equal(documentUploadOutcome({status:'00',message:'Successful'}),'confirmed');
 assert.equal(documentUploadOutcome({status:'00',data:{uploadResults:[{documentType:'UTILITY_BILL',status:'PENDING_REVIEW'}]}}),'unknown');
 assert.equal(documentUploadOutcome({status:'00',data:{uploadResults:[{documentType:'IDENTITY_DOCUMENTS',status:'FAILED'}]}}),'rejected');
 assert.equal(documentUploadOutcome({status:'00',message:'Document upload failed'}),'rejected');
 assert.equal(documentUploadOutcome({status:'99',data:{uploadResults:[{status:'SUCCESS'}]}}),'unknown');
});

test('Tier 3 cannot start before both documents were received',async()=>{
 const query=async()=>({rows:[{kind:'IDENTITY'}]}) as any;
 await assert.rejects(requireTier3Documents('account', {query} as any),/ID and a utility bill/i);
 const both=async()=>({rows:[{kind:'IDENTITY'},{kind:'ADDRESS'}]}) as any;
 await assert.doesNotReject(requireTier3Documents('account',{query:both} as any));
});
