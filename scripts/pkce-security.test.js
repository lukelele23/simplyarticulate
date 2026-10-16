import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {AuthClient} from '@supabase/supabase-js';

test('PKCE callback exchanges the stored verifier, removes the code, and rejects code replay',async()=>{
 const previous={window:globalThis.window,document:globalThis.document};
 const location={href:'https://simplyarticulate.com/?code=single-use-code'};
 globalThis.window={location,history:{state:null,replaceState(_state,_unused,url){location.href=url;}}};
 globalThis.document={visibilityState:'hidden'};
 const memory=new Map([['fixture-code-verifier',JSON.stringify('test-verifier')]]),requests=[];
 let used=false;
 const auth=new AuthClient({url:'https://auth.example.test',storageKey:'fixture',flowType:'pkce',persistSession:true,detectSessionInUrl:true,autoRefreshToken:false,
  storage:{getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)},
  fetch:async(url,options)=>{
   requests.push({url:String(url),body:JSON.parse(options.body)});
   if(used)return Response.json({msg:'Code already used',code:'bad_code'},{status:400});
   used=true;return Response.json({access_token:'fake-access-token',refresh_token:'fake-refresh-token',token_type:'bearer',expires_in:3600,
    user:{id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',email:'fixture@example.test'}});
  }});
 try{
  const {data,error}=await auth.getSession();assert.equal(error,null);assert.equal(data.session.user.id,'11111111-1111-4111-8111-111111111111');
  assert.equal(requests.length,1);assert.ok(requests[0].url.includes('grant_type=pkce'));
  assert.deepEqual(requests[0].body,{auth_code:'single-use-code',code_verifier:'test-verifier'});
  assert.equal(new URL(location.href).searchParams.has('code'),false);assert.equal(memory.has('fixture-code-verifier'),false);
  memory.set('fixture-code-verifier',JSON.stringify('test-verifier'));
  const replay=await auth.exchangeCodeForSession('single-use-code');assert.ok(replay.error);assert.equal(replay.data.session,null);
 }finally{await auth.dispose();if(previous.window===undefined)delete globalThis.window;else globalThis.window=previous.window;if(previous.document===undefined)delete globalThis.document;else globalThis.document=previous.document;}
});

test('frontend explicitly uses PKCE; deletion restricts origins and pins its SDK; enforced CSP blocks inline executable scripts',()=>{
 const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
 assert.match(read('utils/supabase.js'),/flowType:\s*'pkce'/);
 const deletion=read('supabase/functions/delete-account/index.ts');
 assert.match(deletion,/@supabase\/supabase-js@2\.117\.2/);assert.doesNotMatch(deletion,/Allow-Origin["']?\s*:\s*["']\*/);
 const policy=read('netlify.toml').match(/Content-Security-Policy = "([^"]+)"/)[1];
 const scripts=policy.split(';').find(d=>d.trim().startsWith('script-src'));
 assert.ok(scripts.includes("'self'"));assert.ok(scripts.includes('https://cdn.paddle.com'));assert.ok(!scripts.includes('unsafe-inline'));assert.ok(!scripts.includes('unsafe-eval'));
 assert.ok(policy.includes("object-src 'none'"));assert.ok(policy.includes("frame-ancestors 'none'"));
 assert.match(read('supabase/functions/deno.lock'),/"version": "4"/);
});
