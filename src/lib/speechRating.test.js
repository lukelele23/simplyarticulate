import test from 'node:test';
import assert from 'node:assert/strict';
import {saveSpeechRating} from './speechRating.js';
const take={rating:{stars:7,reason:'Clear point; add an example.'},recording:{draftId:'take-1',recordedAt:1700000000000,durationSeconds:60},metadata:{topic:'Practice',difficulty:'medium',format:'speech'}};
test('automatic stars persist without transcript and repeated results do not duplicate progress',()=>{
 const items=saveSpeechRating([],take,'2026-10-12');
 assert.equal(items.length,1);assert.deepEqual(items[0].rating,take.rating);
 assert.equal(items[0].analysis,undefined);
 assert.strictEqual(saveSpeechRating(items,take,'2026-10-12'),items);
});
test('a revised score preserves saved feedback and other takes',()=>{
 const current=[{id:'take-1',analysis:{transcript:'Private saved feedback'},syncFeedback:true},{id:'other',topic:'Other'}];
 const items=saveSpeechRating(current,take,'2026-10-12');
 assert.equal(items.length,2);assert.equal(items[0].analysis.transcript,'Private saved feedback');assert.equal(items[0].syncFeedback,true);
 assert.equal(saveSpeechRating(items,{...take,rating:{stars:9,reason:'Improved'}},'2026-10-12')[0].rating.stars,9);
});
test('daily challenge stars retain challenge identity and invalid scores cannot enter progress',()=>{
 const daily={...take,metadata:{...take.metadata,format:'daily-challenge',challengeId:'2026-10-12'}};
 assert.equal(saveSpeechRating([],daily,'2026-10-12')[0].challengeId,'2026-10-12');
 for(const stars of [-1,11,2.5])assert.equal(saveSpeechRating([],{...take,rating:{stars}},'2026-10-12').length,0);
});

test('prompt version remains available without storing a transcript',()=>{
 const rows=saveSpeechRating([], {...take,metadata:{...take.metadata,analysisVersion:'coach-v2'}},'2026-10-12');assert.equal(rows[0].analysisVersion,'coach-v2');assert.equal(rows[0].analysis,undefined);
 const revised=saveSpeechRating(rows,{...take,metadata:{...take.metadata,analysisVersion:'coach-v3'}},'2026-10-12');assert.equal(revised[0].analysisVersion,'coach-v3');
});
