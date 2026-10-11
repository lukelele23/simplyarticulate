import test from 'node:test';
import assert from 'node:assert/strict';
import {checkAnalysisAvailability} from './analysisAvailability.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('cancelled development checks cannot overwrite a newer successful check',async()=>{
 const events=[];
 const callbacks={ready:value=>events.push(['ready',value]),failed:error=>events.push(['failed',error.name]),finished:()=>events.push(['finished'])};
 const dispose=checkAnalysisAvailability((_path,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true})),callbacks);
 await tick();dispose();
 const cleanup=checkAnalysisAvailability(async()=>({enabled:true}),callbacks);
 await tick();await tick();cleanup();
 assert.deepEqual(events,[['ready',{enabled:true}],['finished']]);
});
test('late responses after leaving a recording screen do not update availability',async()=>{
 let resolve;const events=[];
 const dispose=checkAnalysisAvailability(()=>new Promise(done=>resolve=done),{ready:()=>events.push('ready'),failed:()=>events.push('failed'),finished:()=>events.push('finished')});
 await tick();dispose();resolve({enabled:true});await tick();assert.deepEqual(events,[]);
});
test('a real availability timeout still reports an error and completes the check',async()=>{
 const events=[];
 await new Promise(done=>checkAnalysisAvailability((_path,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true})),{ready:()=>events.push('ready'),failed:error=>events.push(error.name),finished:()=>{events.push('finished');done();}},5));
 assert.deepEqual(events,['AbortError','finished']);
});
