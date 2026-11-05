import assert from 'node:assert/strict';
import test from 'node:test';
import { readPoolView } from './poolView.js';
test('pool reads start together and optional failures preserve the member balance',async()=>{
 const started:string[]=[];
 let resolve!:(value:{unitsAtomic:string})=>void;
 const position=new Promise<{unitsAtomic:string}>(done=>{resolve=done;});
 const result=readPoolView(()=>{started.push('position');return position;},async()=>{started.push('stats');throw new Error('RPC unavailable');},async()=>{started.push('liquidity');return{availableAtomic:'100'};});
 assert.deepEqual(started,['position','stats','liquidity']);
 resolve({unitsAtomic:'50'});
 assert.deepEqual(await result,{unitsAtomic:'50',stats:null,liquidity:{availableAtomic:'100'}});
});
test('missing member balance fails rather than manufacturing a zero position',async()=>{
 await assert.rejects(readPoolView(async()=>{throw new Error('position unavailable');},async()=>({}),async()=>({})),/position unavailable/);
});
