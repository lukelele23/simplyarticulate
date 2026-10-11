import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';import {createAnalysisServer,readConfig} from './index.js';
test('service accepts authenticated email and Google sessions without MFA while rejecting invalid or missing sessions',async()=>{
 const dataDir=mkdtempSync(path.join(tmpdir(),'sa-mfa-'));
 const token=(aal,method)=>`header.${Buffer.from(JSON.stringify({aal,amr:[{method}]})).toString('base64url')}.signature`;
 const email1=token('aal1','otp'),email2=token('aal2','otp'),google1=token('aal1','oauth'),google2=token('aal2','oauth');
 const config={...readConfig({AI_ENABLED:'true',ASSEMBLYAI_API_KEY:'test',GEMINI_API_KEY:'test',SUPABASE_URL:'https://test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'test'}),dataDir};
 const server=createAnalysisServer(config,{fetchImpl:async(_url,options)=>{
  const bearer=options.headers.authorization.slice(7);if(![email1,email2,google1,google2].includes(bearer))return new Response('{}',{status:401});
  const google=[google1,google2].includes(bearer);return Response.json({id:google?'google-user':'email-user',app_metadata:{provider:google?'google':'email'},factors:google?[{id:'totp-factor',status:'verified'}]:[]});
 }});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}/api/analysis`;
 try{
  for(const bearer of [email1,email2,google1,google2])assert.equal((await fetch(`${base}/usage`,{headers:{Authorization:`Bearer ${bearer}`}})).status,200);
  assert.equal((await fetch(`${base}/usage`)).status,401);
  assert.equal((await fetch(base,{method:'POST',body:'Guests cannot upload for analysis'})).status,401);
  assert.equal((await fetch(`${base}/usage`,{headers:{Authorization:`Bearer ${token('aal2','password')}`}})).status,401);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));rmSync(dataDir,{recursive:true,force:true});}
});
