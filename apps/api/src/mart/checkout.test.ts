import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceCanFulfil } from './checkout.js';

test('source availability accepts quantity-free services without weakening product stock checks',()=>{
 assert.equal(sourceCanFulfil('SERVICE',null,1),true);
 assert.equal(sourceCanFulfil('SERVICE','2.000',2),true);
 assert.equal(sourceCanFulfil('SERVICE','1.000',2),false);
 assert.equal(sourceCanFulfil('PRODUCT',null,1),false);
 assert.equal(sourceCanFulfil('PRODUCT','2.000',2),true);
 assert.equal(sourceCanFulfil('PRODUCT','not-a-quantity',1),false);
});
