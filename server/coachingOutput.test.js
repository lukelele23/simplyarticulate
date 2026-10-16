import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCoachingJson} from '../supabase/functions/_shared/coachingOutput.js';
import {FRAMEWORK_PROMPT} from '../supabase/functions/_shared/framework.js';
import {readFileSync} from 'node:fs';
test('coaching parser rejects blocked, truncated, invalid and oversized output',()=>{
 const response=(text,finishReason='STOP')=>({candidates:[{finishReason,content:{parts:[{text:'do not expose thinking',thought:true},{text}]}}]});
 assert.deepEqual(parseCoachingJson(response('{"summary":"A useful response"}')),{summary:'A useful response'});
 for(const value of [response('{}','MAX_TOKENS'),response('{}','SAFETY'),response('[]'),response('bad'),response('x'.repeat(100001)),{promptFeedback:{blockReason:'SAFETY'}}])assert.throws(()=>parseCoachingJson(value));
});
test('Node and Edge prompts have identical coaching instructions',()=>{assert.equal(FRAMEWORK_PROMPT,readFileSync(new URL('../server/prompts/simplyarticulate.txt',import.meta.url),'utf8'));});
