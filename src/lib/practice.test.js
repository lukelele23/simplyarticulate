import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyPrompt, pickFresh, selectDailyTopic, weeklyDays } from './practice.js';
test('shared challenge stays stable across a UTC day and changes at rollover',()=>{
 assert.deepEqual(dailyPrompt(new Date('2026-10-08T00:00:00Z')),dailyPrompt(new Date('2026-10-08T23:59:59Z')));
 assert.notEqual(dailyPrompt(new Date('2026-10-08T23:59:59Z')).id,dailyPrompt(new Date('2026-10-09T00:00:00Z')).id);
});
test('prompt selection avoids recent topics and handles exhausted pools',()=>{
 assert.equal(pickFresh(['a','b','c'],['a','b'],()=>0),'c');
 assert.equal(pickFresh(['a','b'],['a','b'],()=>0),'a');
 assert.equal(pickFresh([],[],()=>0),null);
});
test('daily topic selection rotates deterministically through Supabase rows by UTC date',()=>{
 const topics=[{id:1,topic:'First'},{id:2,topic:'Second'},{id:3,topic:'Third'}];
 assert.deepEqual(selectDailyTopic(topics,new Date('2026-10-08T00:00:00Z')),selectDailyTopic(topics,new Date('2026-10-08T23:59:59Z')));
 assert.notEqual(selectDailyTopic(topics,new Date('2026-10-08T00:00:00Z')).id,selectDailyTopic(topics,new Date('2026-10-09T00:00:00Z')).id);
 assert.equal(selectDailyTopic([{id:1,topic:'  '}]),null);
});
test('weekly participation counts unique dates, excludes old and future sessions',()=>{
 assert.equal(weeklyDays([{date:'2026-10-08'},{date:'2026-10-08'},{date:'2026-10-02'},{date:'2026-10-01'},{date:'2026-10-09'}],new Date(2026,9,8,12)),2);
});
