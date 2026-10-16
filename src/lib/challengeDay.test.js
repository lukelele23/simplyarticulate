import test from 'node:test';
import assert from 'node:assert/strict';
import {challengeDay,nextChallengeDay,challengeDayStart} from './challengeDay.js';
test('challenge dates roll over at fixed midnight EST in winter and summer',()=>{
 for(const month of ['01','07']){
  assert.equal(challengeDay(`2026-${month}-02T04:59:59.999Z`),`2026-${month}-01`);
  assert.equal(challengeDay(`2026-${month}-02T05:00:00.000Z`),`2026-${month}-02`);
  assert.equal(nextChallengeDay(`2026-${month}-02T04:59:59.999Z`),`2026-${month}-02`);
  assert.equal(challengeDayStart(`2026-${month}-02`),`2026-${month}-02T05:00:00.000Z`);
 }
 assert.equal(nextChallengeDay('2027-01-01T04:59:59Z'),'2027-01-01');
});
