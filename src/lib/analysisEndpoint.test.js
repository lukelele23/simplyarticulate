import test from 'node:test';
import assert from 'node:assert/strict';
import {analysisEndpoint} from './analysisEndpoint.js';
test('analysis and voting use the correct hosted Supabase function path',()=>{
 const env={VITE_ANALYSIS_SERVICE:'supabase',VITE_SUPABASE_URL:'https://project.supabase.co'};
 for(const endpoint of ['/config','/challenge','/topic-vote','/subscription-survey','/community','/123/coaching'])assert.equal(analysisEndpoint(endpoint,env),`https://project.supabase.co/functions/v1/speech-api/api/analysis${endpoint}`);
 assert.equal(analysisEndpoint('/config',{}),'/api/analysis/config');
});
