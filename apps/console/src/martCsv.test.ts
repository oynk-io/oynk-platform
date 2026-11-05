import assert from 'node:assert/strict';
import test from 'node:test';
import { parseInventoryCsv } from './martCsv';

test('CSV defaults to publication, but honors all explicit private values and supported headings',()=>{
 assert.equal(parseInventoryCsv('name,price\nRice,1500')[0].published,true);
 for(const header of ['publish_to_mart','publish_to_store','published'])for(const value of ['false','no','0'])
  assert.equal(parseInventoryCsv(`name,price,${header}\nRice,1500,${value}`)[0].published,false);
 assert.equal(parseInventoryCsv('name,price,publish_to_mart\nRice,1500,')[0].published,true);
 assert.throws(()=>parseInventoryCsv('name,price,published\nRice,1500,maybe'),/true or false/);
 assert.throws(()=>parseInventoryCsv('name,price\nRice,'),/row 2/);
});
test('CSV retains quoted fields and five ordered photos; rejects unsupported URLs',()=>{
 const urls=Array.from({length:5},(_,i)=>`https://example.test/${i}.jpg`);
 const row=parseInventoryCsv(`name,price,description,image_urls\n"Rice, white",1500,"Line one\nLine two",${urls.join(';')}`)[0];
 assert.equal(row.name,'Rice, white');assert.equal(row.description,'Line one\nLine two');assert.deepEqual(row.imageUrls,urls);
 assert.throws(()=>parseInventoryCsv(`name,price,image_urls\nRice,1500,${[...urls,urls[0]].join(';')}`),/five HTTPS/);
 assert.throws(()=>parseInventoryCsv('name,price,image_urls\nRice,1500,http://example.test/a.jpg'),/five HTTPS/);
 assert.throws(()=>parseInventoryCsv('name,price,published,publish_to_mart\nRice,1500,true,false'),/one publication column/);
});
