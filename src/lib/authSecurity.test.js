import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionAccess} from './authSecurity.js';
test('email-link sessions immediately enter the account without an authenticator',()=>{
 const user={id:'email-user',app_metadata:{provider:'email'}};
 assert.equal(sessionAccess({user,access_token:'first-step-email-token'}),user);
});
test('enrolled email and Google accounts are accepted without MFA enrollment or verification',()=>{
 for(const provider of ['email','google']){
  const user={id:provider,app_metadata:{provider},factors:[{status:'verified',factor_type:'totp'}]};
  assert.equal(sessionAccess({user}),user);
 }
});
test('signed-out or missing sessions do not expose an account',()=>{
 for(const session of [null,undefined,{}, {user:null}])assert.equal(sessionAccess(session),null);
});
