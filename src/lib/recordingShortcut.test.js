import test from 'node:test';
import assert from 'node:assert/strict';
import {recordingShortcut} from './recordingShortcut.js';
const key={code:'Space',target:{closest:()=>null}};
const state={secondsLeft:60,running:false,started:false};
test('Space starts, pauses and resumes only an available recording',()=>{
 assert.equal(recordingShortcut(key,state),'start');
 assert.equal(recordingShortcut(key,{...state,running:true,started:true}),'pause');
 assert.equal(recordingShortcut(key,{...state,started:true}),'resume');
 for(const change of [{blocked:true},{secondsLeft:0},{running:true,fixedDuration:true}])assert.equal(recordingShortcut(key,{...state,...change}),null);
});
test('typing and native controls retain Space behavior',()=>{
 assert.equal(recordingShortcut({...key,target:{closest:()=>({})}},state),null);
 for(const change of [{repeat:true},{isComposing:true},{ctrlKey:true},{altKey:true},{metaKey:true},{shiftKey:true},{defaultPrevented:true},{code:'Enter'}])assert.equal(recordingShortcut({...key,...change},state),null);
});
