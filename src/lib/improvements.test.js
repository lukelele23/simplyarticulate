import test from 'node:test';
import assert from 'node:assert/strict';
import { reportText, fillerRate, transcriptSegments } from './reports.js';
import { practiceInsights } from './insights.js';
import { frameworkFixture } from '../../server/framework-fixture.js';
test('new report exports readable sections without legacy fields or raw JSON',()=>{
  const text=reportText({transcript:'Daily practice helps.',metrics:{wordCount:3,wordsPerMinute:60,fillerCount:0},coaching:frameworkFixture},'Practice');
  assert.match(text,/Argument and logic/);assert.match(text,/Structure and language/);assert.match(text,/Suggested revision/);assert.match(text,/Give one specific example/);assert.doesNotMatch(text,/"argumentLogic"/);
});
test('old and transcript-only reports still export',()=>{
  assert.match(reportText({transcript:'A thought',coaching:{summary:'Useful',strength:{observation:'Clear',quote:'A thought'},improvements:['Add support'],nextExercise:'Try again'}}),/Add support/);
  assert.match(reportText({transcript:'A thought',coachingError:'Try later'}),/Try later/);
});
test('timestamp playback preserves real word times and never fabricates legacy timing',()=>{
  assert.deepEqual(transcriptSegments({transcript:'Legacy report'}),[]);
  const segments=transcriptSegments({words:[{text:'Hello.',start:2000,end:2500},{text:'Um,',start:5000,end:5500},{text:'again.',start:5600,end:6000},{text:'invalid',start:-1,end:0}]});
  assert.equal(segments.length,2);assert.equal(segments[0].startSeconds,2);assert.equal(segments[1].startSeconds,5);assert.equal(segments[1].text,'Um, again.');
});
test('progress rates normalize speech length and exclude demonstration reports',()=>{
  assert.equal(fillerRate({wordCount:200,fillerCount:8}),4);assert.equal(fillerRate({wordCount:0,fillerCount:1}),null);
  const result=practiceInsights([{id:'a',date:'2026-10-09',durationSeconds:120,analysis:{metrics:{wordCount:200,fillerCount:8},coaching:{nextStep:'Give specific evidence for your claim'}}},{id:'b',date:'2026-10-10',durationSeconds:60,analysis:{demo:true,metrics:{wordCount:30}}}]);
  assert.equal(result.analyzed.length,1);assert.equal(result.minutes,3);assert.equal(result.plan.id,'support');
});
