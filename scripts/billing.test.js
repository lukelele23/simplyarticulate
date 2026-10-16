import {Paddle,Environment} from '@paddle/paddle-node-sdk';
const sdk=new Paddle('test-server-key',{environment:Environment.sandbox});
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {billingConfig,ready,verifiedEvent,entitlement,subscriptionSnapshot,paddleClient,limitedBody} from '../supabase/functions/_shared/billingCore.js';
import {createBillingApi,createBillingWebhook,createBillingWorker} from '../supabase/functions/_shared/billingApi.js';
import {createCheckout} from '../supabase/functions/_shared/billingService.js';
import {closeBillingAccount} from '../supabase/functions/_shared/billingDeletion.js';
const id=prefix=>prefix+'_'+'a'.repeat(26);
const config=billingConfig({BILLING_ENVIRONMENT:'sandbox',BILLING_ENABLED:'true',PADDLE_API_KEY:'test-secret',PADDLE_PRO_PRICE_ID:id('pri'),PADDLE_CLIENT_TOKEN:'test_token',PADDLE_WEBHOOK_SECRET:'secret',BILLING_WORKER_TOKEN:'w'.repeat(32)});
const migration=readFileSync(new URL('../supabase/migrations/20261014000300_paddle_billing.sql',import.meta.url),'utf8');
async function signed(raw,ts=Math.floor(Date.now()/1000)){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode('secret'),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(ts+':'+raw)));
 return `ts=${ts};h1=${Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')}`;
}
test('billing remains disabled by default, refuses live configuration and never grants sandbox paid AI',()=>{
 assert.throws(()=>billingConfig({}),/BILLING_ENVIRONMENT/);assert.equal(ready(billingConfig({BILLING_ENVIRONMENT:'sandbox'})),false);assert.equal(ready(config),true);
 assert.throws(()=>billingConfig({BILLING_ENVIRONMENT:'live'}),/sandbox or production/);
 assert.equal(ready(billingConfig({BILLING_ENVIRONMENT:'production'})),false);
 const active={eligible:true,status:'active',current_period_end:new Date(Date.now()+60000).toISOString()};
 assert.deepEqual(entitlement(active),{plan:'pro',environment:'sandbox',paidAnalysis:false});
 for(const status of ['past_due','paused','canceled'])assert.equal(entitlement({...active,status}).plan,'free');
 assert.equal(entitlement({...active,current_period_end:'2020-01-01'}).plan,'pro');
});
test('webhook HMAC verifies exact raw bytes, rejects alterations, stale timestamps and wrong keys',async()=>{
 const event={event_id:id('evt'),event_type:'subscription.updated',occurred_at:new Date().toISOString(),data:{id:id('sub'),billing_cycle:{interval:'month',frequency:1},items:[]}};
 const raw=JSON.stringify(event),signature=await signed(raw);
 assert.equal((await verifiedEvent(raw,signature,'secret',sdk)).eventId,event.event_id);
 await assert.rejects(()=>verifiedEvent(raw+' ',signature,'secret',sdk),/Invalid webhook/);
 await assert.rejects(()=>verifiedEvent(raw,signature,'other',sdk),/Invalid webhook/);
 await assert.rejects(()=>verifiedEvent(raw,signature+';ts=1','secret',sdk),/Invalid webhook/);
 const stale=await signed(raw,Math.floor(Date.now()/1000)-1000);
 await assert.rejects(()=>verifiedEvent(raw,stale,'secret',sdk),/Invalid webhook/);
});
test('canonical snapshots require the approved price, quantity and valid provider identity',()=>{
 const sub={id:id('sub'),customer_id:id('ctm'),updated_at:new Date().toISOString(),status:'active',items:[{price:{id:id('pri')},quantity:1}]};
 assert.equal(subscriptionSnapshot(sub,id('pri')).eligible,true);
 assert.equal(subscriptionSnapshot({...sub,items:[...sub.items,...sub.items]},id('pri')).eligible,false);
 assert.equal(subscriptionSnapshot(sub,'pri_other').eligible,false);
 assert.throws(()=>subscriptionSnapshot({...sub,id:'forged'},id('pri')),/Invalid billing/);
});
test('billing API rejects missing auth, unknown origins and client-supplied ownership/price fields',async()=>{
 let authCalls=0;const db={auth:{getUser:async()=>{authCalls++;return {data:{user:{id:crypto.randomUUID()}},error:null};}}};
 const api=createBillingApi(db,config,()=>{throw Error('must not call provider');});
 assert.equal((await api(new Request('https://test',{method:'POST',body:'{}'}))).status,401);
 assert.equal((await api(new Request('https://test',{method:'POST',headers:{origin:'https://evil.example'},body:'{}'}))).status,403);
 assert.equal((await api(new Request('https://test',{method:'POST',headers:{authorization:'Bearer valid'},body:JSON.stringify({action:'checkout',userId:'victim',priceId:'cheap'})}))).status,400);
 assert.equal(authCalls,1);
});
test('checkout retries reuse ready transactions and never repeat ambiguous financial POSTs',async()=>{
 const intent={id:crypto.randomUUID(),price_id:id('pri'),transaction_id:id('txn'),status:'uncertain'};
 const db={rpc:async()=>({data:{created:false,intent,customer:{environment:'sandbox',paddle_customer_id:id('ctm')}},error:null})};
 const calls=[];const paddle=async(path,method='GET')=>{calls.push([path,method]);return path.startsWith('/prices')?{status:'active',billing_cycle:{interval:'month',frequency:1},trial_period:{interval:'day',frequency:3}}:{id:id('txn'),customer_id:id('ctm'),custom_data:{checkout_intent_id:intent.id},status:'ready'};};
 await assert.rejects(()=>createCheckout(db,{id:crypto.randomUUID()},config,paddle),/being verified/);
 assert.equal(calls.some(([,method])=>method==='POST'),false);
 intent.status='ready';const result=await createCheckout(db,{id:crypto.randomUUID()},config,paddle);
 assert.equal(result.transactionId,id('txn'));assert.equal(calls.some(([,method])=>method==='POST'),false);
});
test('webhook acknowledgment requires durable deduplicated insertion, without trusting custom user IDs',async()=>{
 let captured;const db={from:()=>({upsert:async(value,options)=>{captured={value,options};return {data:null,error:null};}})};
 const event={event_id:id('evt'),event_type:'subscription.updated',occurred_at:new Date().toISOString(),data:{id:id('sub'),billing_cycle:{interval:'month',frequency:1},items:[],custom_data:{user_id:'victim'},email:'private@example.com'}};
 const raw=JSON.stringify(event),signature=await signed(raw);
 const response=await createBillingWebhook(db,config,()=>sdk)(new Request('https://test',{method:'POST',headers:{'paddle-signature':signature},body:raw}));
 assert.equal(response.status,200);assert.equal(captured.options.ignoreDuplicates,true);
 assert.equal(JSON.stringify(captured.value).includes('victim'),false);assert.equal(JSON.stringify(captured.value).includes('private@'),false);
 const failing={from:()=>({upsert:async()=>({error:{message:'disk unavailable'}})})};
 assert.equal((await createBillingWebhook(failing,config,()=>sdk)(new Request('https://test',{method:'POST',headers:{'paddle-signature':signature},body:raw}))).status,503);
});
test('worker rejects unauthenticated calls and bounded body reader rejects oversized payloads',async()=>{
 const worker=createBillingWorker({},config,()=>{});
 assert.equal((await worker(new Request('https://test',{method:'POST'}))).status,401);
 await assert.rejects(()=>limitedBody(new Request('https://test',{method:'POST',body:'x'.repeat(1025)}),1024),/too large/);
});
test('provider errors never expose API keys or provider response details',async()=>{
 const paddle=paddleClient(config,async()=>new Response('private customer data test-secret',{status:400}));
 await assert.rejects(()=>paddle('/customers'),error=>!error.message.includes('test-secret')&&!error.message.includes('private customer'));
});
test('billing migration is repeatable; ownership, checkout reservations, stale events and deletion restrictions hold',async()=>{
 const db=new PGlite();try{
 await db.exec("create schema auth;create role anon;create role authenticated;create role service_role;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('app.uid',true),'')::uuid$$;");
 await db.exec(migration);await db.exec(migration);
 const owner=crypto.randomUUID(),other=crypto.randomUUID();await db.query('insert into auth.users values($1),($2)',[owner,other]);
 const reserve=()=>db.query('select public.billing_reserve_checkout($1,$2) value',[owner,id('pri')]);
 const first=(await reserve()).rows[0].value,second=(await reserve()).rows[0].value;
 assert.equal(first.created,true);assert.equal(second.created,false);assert.equal(first.intent.id,second.intent.id);
 await db.query('update public.billing_customers set paddle_customer_id=$1 where user_id=$2',[id('ctm'),owner]);
 const snapshot={id:id('sub'),customer_id:id('ctm'),price_id:id('pri'),status:'canceled',eligible:true,updated_at:'2026-10-14T12:00:00Z',period_end:'2026-11-14T00:00:00Z'};
 await db.query('select public.billing_apply_subscription($1)',[snapshot]);
 await db.query('select public.billing_apply_subscription($1)',[{...snapshot,status:'active',updated_at:'2026-10-13T12:00:00Z'}]);
 assert.equal((await db.query('select status from public.billing_subscriptions')).rows[0].status,'canceled');
 await assert.rejects(()=>db.query('select public.billing_apply_subscription($1)',[{...snapshot,customer_id:'ctm_'+'b'.repeat(26)}]),/Unmapped/);
 await assert.rejects(()=>db.query('delete from auth.users where id=$1',[owner]),/foreign key/);
 await db.query("select set_config('app.uid',$1,false)",[other]);await db.exec('set role authenticated');
 assert.equal((await db.query('select * from public.billing_subscriptions')).rows.length,0);
 await assert.rejects(()=>db.query('select public.billing_reserve_checkout($1,$2)',[other,id('pri')]),/permission denied/);
 await assert.rejects(()=>db.query("update public.billing_subscriptions set status='active'"),/permission denied/);
 await db.exec('reset role');await db.query("select set_config('app.uid',$1,false)",[owner]);await db.exec('set role authenticated');
 assert.equal((await db.query('select * from public.billing_subscriptions')).rows.length,1);await db.exec('reset role');
 await db.query('insert into public.billing_events(event_id,event_type,object_id,occurred_at) values($1,$2,$3,now())',[id('evt'),'subscription.updated',id('sub')]);
 assert.equal((await db.query('select * from public.billing_claim_event()')).rows.length,1);
 assert.equal((await db.query('select * from public.billing_claim_event()')).rows.length,0);
 await db.query("insert into public.billing_operations(user_id,kind,state) values($1,'deletion','completed')",[owner]);
 await assert.rejects(reserve,/closing/);
 }finally{await db.close();}
});
test('account deletion tolerates an absent pre-billing schema but never a billing database failure',async()=>{
 const mock=error=>({from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({error,data:null})})})})});
 await closeBillingAccount(mock({code:'42P01'}),crypto.randomUUID(),()=>{throw Error('unexpected');});
 await assert.rejects(()=>closeBillingAccount(mock({code:'08006'}),crypto.randomUUID(),()=>{}),/could not be verified/);
});

function deletionDatabase(intents=[]){
 const writes=[];
 const db={from:table=>{
  let operation='select',payload;
  const query={select(){return query;},eq(){return query;},maybeSingle(){return query;},single(){return query;},
   update(value){operation='update';payload=value;return query;},insert(value){operation='insert';payload=value;return query;},
   delete(){operation='delete';return query;},then(resolve,reject){
    let data=null;
    if(operation==='select'&&table==='billing_customers')data={user_id:'owner',paddle_customer_id:id('ctm'),deleting:false};
    if(operation==='select'&&table==='billing_checkout_intents')data=intents;
    if(operation==='insert'&&table==='billing_operations')data={id:crypto.randomUUID()};
    if(operation!=='select')writes.push({table,operation,payload});
    return Promise.resolve({data,error:null}).then(resolve,reject);
   }};return query;
 }};return {db,writes};
}
test('deletion closes checkout and verifies immediate cancellation while preserving billing entities',async()=>{
 const {db,writes}=deletionDatabase([{transaction_id:id('txn'),status:'ready'}]);let canceled=false,checkoutClosed=false;
 const paddle=async(path,method='GET',body)=>{
  if(path==='/transactions/'+id('txn')){if(method==='PATCH'){assert.equal(body.status,'canceled');checkoutClosed=true;return {status:'canceled'};}return {id:id('txn'),status:'ready'};}
  if(path.startsWith('/subscriptions?'))return [{id:id('sub'),customer_id:id('ctm'),status:'active'}];
  if(path.endsWith('/cancel')){assert.equal(checkoutClosed,true);assert.equal(body.effective_from,'immediately');canceled=true;return {status:'canceled'};}
  return {status:canceled?'canceled':'active'};
 };
 await closeBillingAccount(db,'owner',paddle);
 assert.equal(canceled,true);assert.equal(writes.some(w=>w.operation==='delete'),false);assert.equal(writes.at(-1).operation,'update');assert.equal(writes.at(-1).table,'billing_customers');
});
test('uncertain checkouts and failed provider cancellation retain identity binding for safe retry',async()=>{
 const pending=deletionDatabase([{status:'uncertain'}]);
 await assert.rejects(()=>closeBillingAccount(pending.db,'owner',()=>{throw Error('must not call');}),/reconciled by support/);
 assert.equal(pending.writes.some(w=>w.operation==='delete'),false);
 const failed=deletionDatabase();
 await assert.rejects(()=>closeBillingAccount(failed.db,'owner',async path=>{
  if(path.startsWith('/subscriptions?'))return [{id:id('sub'),customer_id:id('ctm'),status:'active'}];
  throw Error('provider offline');
 }),/provider offline/);
 assert.equal(failed.writes.some(w=>w.operation==='delete'),false);
 assert.equal(failed.writes.at(-1).payload.state,'attention');
});

test('configured annual checkout binds the exact requested price and accepts a free three-day trial',async()=>{
 const annual='pri_'+'b'.repeat(26),intentId=crypto.randomUUID();
 const annualConfig=billingConfig({BILLING_ENVIRONMENT:'sandbox',BILLING_ENABLED:'true',PADDLE_API_KEY:'test-secret',PADDLE_PRO_YEAR_PRICE_ID:annual,PADDLE_CLIENT_TOKEN:'test_token',PADDLE_WEBHOOK_SECRET:'secret',BILLING_WORKER_TOKEN:'w'.repeat(32)});
 const db={rpc:async(_name,args)=>{assert.equal(args.p_price,annual);return {data:{created:true,intent:{id:intentId,price_id:annual},customer:{environment:'sandbox',paddle_customer_id:id('ctm')}},error:null};},from:()=>{const q={update:()=>q,eq:()=>q,select:()=>q,single:async()=>({data:{id:intentId},error:null})};return q;}};
 const paddle=async(path,method='GET',body)=>{
  if(method==='GET'){assert.equal(path,'/prices/'+annual);return {status:'active',billing_cycle:{interval:'year',frequency:1},trial_period:{interval:'day',frequency:3}};}
  assert.equal(path,'/transactions');assert.deepEqual(body.items,[{price_id:annual,quantity:1}]);assert.equal(body.customer_id,id('ctm'));return {id:id('txn')};
 };
 const result=await createCheckout(db,{id:crypto.randomUUID()},annualConfig,paddle,annual);
 assert.equal(result.priceId,annual);assert.equal(result.environment,'sandbox');
 await assert.rejects(()=>createCheckout(db,{id:crypto.randomUUID()},annualConfig,paddle,'pri_'+'c'.repeat(26)),/configured subscription price/);
});
test('paid or incorrect trials are rejected before a checkout reservation or charge can be created',async()=>{
 const db={rpc:()=>{throw Error('must not reserve');}};
 for(const trial of [null,{interval:'day',frequency:7},{interval:'day',frequency:3,unit_price:{amount:'100'}},{interval:'day',frequency:3,unit_price_overrides:[{country_codes:['GB'],unit_price:{amount:'100'}}]}]){
  await assert.rejects(()=>createCheckout(db,{id:crypto.randomUUID()},config,async()=>({status:'active',billing_cycle:{interval:'month',frequency:1},trial_period:trial})),/three-day free trial/);
 }
});
test('Pro catalog rejects reused IDs and recognizes active sandbox trials',()=>{
 assert.throws(()=>billingConfig({BILLING_ENVIRONMENT:'sandbox',PADDLE_PRO_MONTH_PRICE_ID:id('pri'),PADDLE_PRO_YEAR_PRICE_ID:id('pri')}),/distinct Paddle price/);
 const trial={eligible:true,status:'trialing',paddle_price_id:id('pri'),current_period_end:new Date(Date.now()+60000).toISOString()};
 assert.equal(entitlement(trial,Date.now(),{[id('pri')]:{tier:'pro'}}).plan,'pro');
 assert.equal(entitlement(trial,Date.now(),{[id('pri')]:{tier:'pro'}}).paidAnalysis,false);
});
