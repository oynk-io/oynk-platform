import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { MAX_PHOTO_BYTES, normalizePhoto } from './media.js';
import { inventoryItemSchema } from './inventoryModel.js';

test('catalog uploads resize, re-encode and strip metadata',async()=>{
 const original=await sharp({create:{width:2400,height:1200,channels:3,background:'#44885a'}}).jpeg().withMetadata().toBuffer();
 const photo=await normalizePhoto(original,'image/jpeg');
 const metadata=await sharp(photo.content).metadata();
 assert.equal(metadata.format,'webp');assert.equal(metadata.width,1600);assert.equal(metadata.height,800);
 assert.equal(metadata.exif,undefined);assert.equal(metadata.icc,undefined);
 assert.match(photo.sha256,/^[a-f0-9]{64}$/);
 await assert.rejects(()=>normalizePhoto(original,'image/png'),/could not be opened/);
 await assert.rejects(()=>normalizePhoto(Buffer.from('<svg></svg>'),'image/svg+xml'),/Choose a JPG/);
 await assert.rejects(()=>normalizePhoto(Buffer.from('not a photo'),'image/jpeg'),/could not be opened/);
 await assert.rejects(()=>normalizePhoto(Buffer.alloc(MAX_PHOTO_BYTES+1),'image/png'),/up to 5 MB/);
});
test('inventory requires five or fewer secure photos and preserves publication choices',()=>{
 const item={name:'Rice',price:1500,stockQuantity:3};
 assert.equal(inventoryItemSchema.parse(item).published,true);
 assert.equal(inventoryItemSchema.parse({...item,published:false}).published,false);
 const urls=Array.from({length:5},(_,i)=>`https://example.test/${i}.webp`);
 assert.deepEqual(inventoryItemSchema.parse({...item,imageUrls:urls}).imageUrls,urls);
 assert.equal(inventoryItemSchema.safeParse({...item,imageUrls:[...urls,urls[0]]}).success,false);
 assert.equal(inventoryItemSchema.safeParse({...item,imageUrls:['http://example.test/a.jpg']}).success,false);
});
