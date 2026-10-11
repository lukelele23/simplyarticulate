import test from 'node:test';
import assert from 'node:assert/strict';
import {readAnalysisResponse} from './analysisResponse.js';

test('a missing API route is identified separately from an unavailable backend',async()=>{
 await assert.rejects(()=>readAnalysisResponse(new Response('<html>SimplyArticulate</html>',{status:200})),/not connected to the speech analysis server/);
 await assert.rejects(()=>readAnalysisResponse(new Response('',{status:502})),/temporarily unreachable/);
});
test('valid analysis responses preserve API errors and reject incomplete data',async()=>{
 assert.deepEqual(await readAnalysisResponse(Response.json({enabled:true})),{enabled:true});
 await assert.rejects(()=>readAnalysisResponse(Response.json({error:'Sign in to use AI analysis.'},{status:401})),/Sign in/);
 await assert.rejects(()=>readAnalysisResponse(Response.json(null)),/incomplete response/);
 await assert.rejects(()=>readAnalysisResponse(Response.json([])),/incomplete response/);
});
