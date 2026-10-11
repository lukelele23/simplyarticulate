import test from 'node:test';
import assert from 'node:assert/strict';
import {reliableRequest} from './reliableRequest.js';

test('transient server and throttling responses recover with bounded retries',async()=>{
 let calls=0;const waits=[];
 const response=await reliableRequest('/job',{method:'GET'},{fetchImpl:async()=>{calls++;return calls===1?new Response('',{status:503}):calls===2?new Response('',{status:429,headers:{'Retry-After':'1'}}):Response.json({status:'completed'});},wait:async ms=>waits.push(ms)});
 assert.deepEqual(await response.json(),{status:'completed'});assert.equal(calls,3);assert.deepEqual(waits,[500,1000]);
});
test('safe reads recover from network loss without duplicating unprotected writes',async()=>{
 let calls=0;
 const fetchImpl=async()=>{if(++calls===1)throw new TypeError('network');return Response.json({id:'same-job'});};
 assert.equal((await(await reliableRequest('/job',{}, {fetchImpl,wait:async()=>{}})).json()).id,'same-job');
 calls=0;await assert.rejects(()=>reliableRequest('/submit',{method:'POST'},{fetchImpl,wait:async()=>{}}),TypeError);assert.equal(calls,1);
 calls=0;assert.equal((await(await reliableRequest('/submit',{method:'POST',headers:{'Idempotency-Key':'existing-key'}},{fetchImpl,retryNetwork:true,wait:async()=>{}})).json()).id,'same-job');assert.equal(calls,2);
});
test('authentication, invalid requests and long Retry-After values do not retry',async()=>{
 for(const status of [400,401,403,413,429]){
  let calls=0;const response=await reliableRequest('/job',{}, {fetchImpl:async()=>{calls++;return new Response('',{status,headers:{'Retry-After':'60'}});},wait:async()=>{throw Error('must not wait');}});
  assert.equal(response.status,status);assert.equal(calls,1);
 }
});
test('persistent provider failures stop after three attempts and cancellation stops immediately',async()=>{
 let calls=0;const response=await reliableRequest('/job',{}, {fetchImpl:async()=>{calls++;return new Response('',{status:503});},wait:async()=>{}});
 assert.equal(response.status,503);assert.equal(calls,3);
 const controller=new AbortController();calls=0;
 await assert.rejects(()=>reliableRequest('/job',{signal:controller.signal},{fetchImpl:async()=>{calls++;return new Response('',{status:503});},wait:async()=>controller.abort()}),{name:'AbortError'});
 assert.equal(calls,1);
});
