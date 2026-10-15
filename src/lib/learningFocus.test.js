import test from 'node:test';
import assert from 'node:assert/strict';
import {LEARNING_FOCUSES,recommendLearningFocus} from './learningFocus.js';
const result=(id,nextFocus,extra={})=>({id,date:`2026-10-${id}`,nextFocus,...extra});
test('ten distinct focuses and an honest starter without results',()=>{
 assert.equal(LEARNING_FOCUSES.length,10);assert.equal(new Set(LEARNING_FOCUSES.map(f=>f.id)).size,10);
 const r=recommendLearningFocus([]);assert.equal(r.personalized,false);assert.equal(r.primary.id,'main-point');
});
test('recurring corrective feedback outranks a single issue and recent results weigh more',()=>{
 assert.equal(recommendLearningFocus([result('01','Use a specific example'),result('02','Use one concrete example'),result('03','Work on pacing')]).primary.id,'examples');
 assert.equal(recommendLearningFocus([result('01','Use examples'),result('03','Improve pacing')]).primary.id,'pace');
});
test('sample reports, duplicate takes and strengths do not inflate recommendations',()=>{
 const r=recommendLearningFocus([result('01','Use examples'),result('01','Use examples'),result('02','Improve pacing',{analysis:{demo:true}}),{id:'03',date:'2026-10-03',analysis:{coaching:{strengths:['Excellent evidence and examples']}}}]);
 assert.equal(r.primary.mentions,1);assert.equal(r.primary.id,'examples');
 assert.equal(recommendLearningFocus([{rating:{stars:2},analysis:{coaching:{strengths:['Clear conclusion']}}}]).personalized,false);
});
test('metrics need enough words and meaningful finite measurements',()=>{
 const r=recommendLearningFocus([{analysis:{metrics:{wordCount:100,fillerCount:9,wordsPerMinute:140}}}]);
 assert.equal(r.primary.id,'fillers');assert.equal(r.primary.metricSignals,1);
 assert.equal(recommendLearningFocus([{analysis:{metrics:{wordCount:4,fillerCount:2,wordsPerMinute:250}}}]).personalized,false);
 assert.equal(recommendLearningFocus([{analysis:{metrics:{wordCount:100,wordsPerMinute:0}}}]).personalized,false);
});
test('limits history to twenty and supports synced next-focus without full feedback',()=>{
 const sessions=Array.from({length:25},(_,i)=>({id:String(i),createdAt:new Date(2026,0,i+1).toISOString(),nextFocus:'Choose precise words'}));
 const r=recommendLearningFocus(sessions);assert.equal(r.sampleSize,20);assert.equal(r.primary.id,'precision');
});
