import assert from 'node:assert/strict';
import test from 'node:test';
import {storefrontCrop,STOREFRONT_COVER_RATIO} from './storefrontCrop';

test('portrait and wide photos crop to the mobile storefront ratio without leaving image bounds',()=>{
 for(const [width,height] of [[1200,1800],[1800,600],[1280,692]]){
  for(const zoom of [1,2,3])for(const x of [0,50,100])for(const y of [0,50,100]){
   const crop=storefrontCrop(width,height,zoom,x,y);
   assert.ok(Math.abs(crop.width/crop.height-STOREFRONT_COVER_RATIO)<0.00001);
   assert.ok(crop.x>=0&&crop.y>=0);
   assert.ok(crop.x+crop.width<=width+0.00001&&crop.y+crop.height<=height+0.00001);
  }
 }
});

test('crop settings clamp invalid input and preserve the selected position',()=>{
 const left=storefrontCrop(2000,600,1,0,50),right=storefrontCrop(2000,600,1,100,50);
 assert.equal(left.x,0);assert.ok(right.x>0);assert.equal(right.x+right.width,2000);
 assert.deepEqual(storefrontCrop(1200,1800,0,-100,300),storefrontCrop(1200,1800,1,0,100));
 assert.throws(()=>storefrontCrop(0,600,1,50,50));
});
