import assert from "node:assert/strict";
import test from "node:test";
import {addToast,type ToastItem} from "./Toast";
test("toast state suppresses duplicates and limits visible items",()=>{const first:ToastItem={id:"1",kind:"success",message:"Saved"};assert.equal(addToast([first],{id:"2",kind:"success",message:"Saved"}).length,1);let items:ToastItem[]=[];for(let index=0;index<6;index+=1)items=addToast(items,{id:String(index),kind:"info",message:`Message ${index}`});assert.equal(items.length,4);assert.equal(items[0]?.message,"Message 2");});
