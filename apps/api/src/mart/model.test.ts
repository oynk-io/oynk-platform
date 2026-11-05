import assert from 'node:assert/strict';
import test from 'node:test';
import { connectionSchema, ingestSchema, sourceItemSchema, storefrontSchema } from './model.js';

const item={sourceItemId:'product-1',revision:1,kind:'PRODUCT',title:'Bag of rice',currency:'NGN',priceMinor:8500000,availability:'IN_STOCK',quantity:'3.000',active:true,published:false};

test('connector contract is source-neutral and rejects unsafe records',()=>{
 assert.equal(connectionSchema.parse({sourceSystem:'quickbooks',sourceTenantId:'tenant-7',label:'Main store'}).sourceSystem,'quickbooks');
 assert.equal(connectionSchema.parse({sourceSystem:'zoho_books',sourceTenantId:'tenant-7',label:'Main store'}).sourceSystem,'zoho_books');
 assert.equal(sourceItemSchema.parse(item).description,'');
 assert.equal(ingestSchema.parse({eventId:'change-123',items:[item]}).items.length,1);
 assert.equal(ingestSchema.safeParse({eventId:'change-123',items:[item,item]}).success,false);
 assert.equal(sourceItemSchema.safeParse({...item,availability:'IN_STOCK',quantity:'0'}).success,false);
 assert.equal(sourceItemSchema.safeParse({...item,imageUrls:['http://invalid.example/image.jpg']}).success,false);
 assert.equal(sourceItemSchema.safeParse({...item,costMinor:100}).success,false);
});

test('storefront cover accepts removal or a secure URL and remains optional for existing clients',()=>{
 const store={displayName:'Oynk Store',published:true};
 assert.equal(storefrontSchema.parse(store).imageUrl,undefined);
 assert.equal(storefrontSchema.parse({...store,imageUrl:null}).imageUrl,null);
 assert.equal(storefrontSchema.parse({...store,imageUrl:'https://api.example.test/api/mart/media/photo'}).imageUrl,'https://api.example.test/api/mart/media/photo');
 for(const imageUrl of ['http://example.test/photo','javascript:alert(1)','not-a-url'])assert.equal(storefrontSchema.safeParse({...store,imageUrl}).success,false);
});

test('public storefront contact is optional and validates phone numbers',()=>{
 const store={displayName:'The Store',published:true};
 assert.equal(storefrontSchema.parse(store).publicPhone,undefined);
 assert.equal(storefrontSchema.parse({...store,publicPhone:null}).publicPhone,null);
 assert.equal(storefrontSchema.parse({...store,publicPhone:'+2348012345678'}).publicPhone,'+2348012345678');
 for(const publicPhone of ['08012345678','tel:123','+123','+23480;123'])assert.equal(storefrontSchema.safeParse({...store,publicPhone}).success,false);
});
