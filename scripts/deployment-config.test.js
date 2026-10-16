import test from 'node:test';
import assert from 'node:assert/strict';
import {deploymentSettings,netlifyRedirects,validateBackendEnvironment} from './deployment-config.js';
const env={VITE_ANALYSIS_SERVICE:'node',VITE_SUPABASE_URL:'https://test.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',ANALYSIS_BACKEND_URL:'https://speech.backend.test'};
test('Supabase deployment uses Edge Functions without requiring a separate backend host',()=>{
 const settings=deploymentSettings({...env,VITE_ANALYSIS_SERVICE:'supabase',ANALYSIS_BACKEND_URL:''});
 assert.equal(settings.backend,'https://test.supabase.co/functions/v1/speech-api');assert.equal(settings.service,'supabase');
 assert.match(netlifyRedirects(settings.backend),/functions\/v1\/speech-api\/api\/analysis/);
});
test('deploy routing preserves API paths before the SPA fallback',()=>{
 const {backend}=deploymentSettings(env),rules=netlifyRedirects(backend).trim().split('\n');
 assert.deepEqual(rules.slice(0,4),['/api/paddle-context /.netlify/functions/paddle-context 200!','/api/analysis https://speech.backend.test/api/analysis 200!','/api/analysis/* https://speech.backend.test/api/analysis/:splat 200!','/api/* /api-unavailable.json 404!']);
 assert.ok(rules.includes('/practice /practice/index.html 200'));
 assert.ok(rules.includes('/practice/review /index.html 200'));
 assert.equal(rules.at(-1),'/* /404.html 404');
});
test('missing or invalid backend addresses block an incomplete deployment',()=>{
 for(const url of ['', 'http://speech.backend.test','https://localhost','https://127.0.0.1','https://simplyarticulate.com','https://www.simplyarticulate.com','https://analysis.YOUR-HOST.example','https://speech.backend.test/api','https://user:secret@speech.backend.test'])assert.throws(()=>deploymentSettings({...env,ANALYSIS_BACKEND_URL:url}));
 assert.throws(()=>deploymentSettings({...env,URL:env.ANALYSIS_BACKEND_URL}),/proxy loop/);
});
test('provider secrets and service-role keys cannot enter the frontend configuration',()=>{
 assert.throws(()=>deploymentSettings({...env,VITE_GEMINI_API_KEY:'private'}),/backend/);
 assert.throws(()=>deploymentSettings({...env,VITE_PADDLE_API_KEY:'private'}),/backend/);
 assert.throws(()=>deploymentSettings({...env,VITE_SUPABASE_PUBLISHABLE_KEY:'sb_secret_private'}),/secret key/);
 const jwt=`a.${Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')}.b`;
 assert.throws(()=>deploymentSettings({...env,VITE_SUPABASE_PUBLISHABLE_KEY:jwt}),/service-role/);
});
test('backend readiness requires live providers and a persistent absolute data path',()=>{
 const backend={AI_ENABLED:'true',ASSEMBLYAI_API_KEY:'test',GEMINI_API_KEY:'test',SUPABASE_URL:'https://test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'test',AI_DATA_DIR:'/data'};
 assert.doesNotThrow(()=>validateBackendEnvironment(backend));
 assert.throws(()=>validateBackendEnvironment({...backend,AI_DATA_DIR:'.ai-data'}),/absolute/);
 assert.throws(()=>validateBackendEnvironment({...backend,AI_DEMO_MODE:'true'}),/demo/);
 assert.throws(()=>validateBackendEnvironment({...backend,GEMINI_API_KEY:''}),/GEMINI/);
});
