import test from 'node:test';
import assert from 'node:assert/strict';
import {validateFramework} from './framework.js';
import {validateFramework as validateEdge} from '../supabase/functions/_shared/framework.js';
import {frameworkFixture} from './framework-fixture.js';
for (const [name,validate] of [['local',validateFramework],['edge',validateEdge]]) {
 test(name + ' accepts ten-star boundaries and preserves score',()=>{
  for (const stars of [0,5,10]) {
   const value=structuredClone(frameworkFixture);value.rating.stars=stars;
   assert.deepEqual(validate(value,'Daily practice helps.').rating,value.rating);
  }
 });
 test(name + ' rejects missing, fractional, and out-of-range ratings',()=>{
  for (const stars of [-1,11,4.5,'7',null]) {
   const value=structuredClone(frameworkFixture);value.rating.stars=stars;
   assert.throws(()=>validate(value,'Daily practice helps.'));
  }
  const value=structuredClone(frameworkFixture);delete value.rating;
  assert.throws(()=>validate(value,'Daily practice helps.'));
 });
}
