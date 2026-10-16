import test from 'node:test';
import assert from 'node:assert/strict';
import {accountUsername,usernameError,saveAccountUsername} from './username.js';
test('only an explicitly chosen valid username completes onboarding',()=>{
 assert.equal(accountUsername({user_metadata:{full_name:'Google Name'}}),'');
 assert.equal(accountUsername({user_metadata:{username:'Clear_Speaker'}}),'Clear_Speaker');
 for(const name of ['ab','with spaces','a'.repeat(25),'',123])assert.equal(accountUsername({user_metadata:{username:name}}),'');
 assert.equal(usernameError('  Clear_Speaker  '),'');
});
test('saves the trimmed name in account metadata and checks server availability first',async()=>{
 let saved;const user={id:'u',user_metadata:{username:'Clear_Speaker'}};
 const client={rpc:async(name,args)=>{assert.equal(name,'sa_username_available');assert.equal(args.p_username,'Clear_Speaker');return {data:true};},auth:{updateUser:async value=>{saved=value;return {data:{user}};}}};
 assert.equal(await saveAccountUsername(client,' Clear_Speaker '),user);assert.deepEqual(saved,{data:{username:'Clear_Speaker'}});
});
test('taken names and missing migration cannot silently save a username',async()=>{
 for(const result of [{data:false},{error:{message:'missing RPC'}}]){
  let writes=0;await assert.rejects(()=>saveAccountUsername({rpc:async()=>result,auth:{updateUser:async()=>{writes++;}}},'Speaker'),/taken|unavailable/);assert.equal(writes,0);
 }
});
test('a race at save time reports the name was taken without granting onboarding',async()=>{
 let calls=0;const client={rpc:async()=>({data:++calls===1}),auth:{updateUser:async()=>({error:{message:'duplicate'}})}};
 await assert.rejects(()=>saveAccountUsername(client,'Speaker'),/just taken/);
});
