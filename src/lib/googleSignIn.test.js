import test from 'node:test';
import assert from 'node:assert/strict';
import {startGoogleSignIn} from './googleSignIn.js';
test('Google sign-in requests an account choice and returns to the current site',async()=>{
 for(const origin of ['http://localhost:5173','https://simplyarticulate.com']){
  let options,visited;
  await startGoogleSignIn({signInWithOAuth:async value=>{options=value;return {data:{url:'https://test.supabase.co/auth/v1/authorize?provider=google'},error:null};}},origin,url=>visited=url);
  assert.equal(options.provider,'google');assert.equal(options.options.redirectTo,`${origin}/`);assert.equal(options.options.queryParams.prompt,'select_account');assert.equal(options.options.skipBrowserRedirect,true);assert.ok(visited.startsWith('https://test.supabase.co/auth/v1/authorize'));
 }
});
test('failed or missing OAuth destinations leave the user on the site with an actionable error',async()=>{
 let visited=false;const navigate=()=>visited=true;
 await assert.rejects(()=>startGoogleSignIn({signInWithOAuth:async()=>({error:Error('Provider unavailable')})},'https://simplyarticulate.com',navigate),/Provider unavailable/);
 for(const url of [null,'not a url','javascript:alert(1)'])await assert.rejects(()=>startGoogleSignIn({signInWithOAuth:async()=>({data:{url},error:null})},'https://simplyarticulate.com',navigate),/sign-in/i);
 assert.equal(visited,false);
});
