import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {deletionBody,authRate,securityEvent,failureCategory} from '../supabase/functions/_shared/security.js';
import {createBillingApi} from '../supabase/functions/_shared/billingApi.js';
import {limitedBody} from '../supabase/functions/_shared/billingCore.js';
import {adjustmentSnapshots,syncAdjustmentEvent} from '../supabase/functions/_shared/billingAdjustments.js';
import {Paddle,Environment} from '@paddle/paddle-node-sdk';
import {routedEvent} from '../supabase/functions/_shared/billingFulfillment.js';
import {grantsPaidAccess} from '../supabase/functions/_shared/billingAccess.js';
const read=name=>fs.readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
const id=(prefix,char='a')=>prefix+'_'+char.repeat(26);
const owner='11111111-1111-4111-8111-111111111111';
async function database(){
 const db=new PGlite();
 try{
 await db.exec(`create schema auth;create schema storage;create role anon;create role authenticated;create role service_role bypassrls;
 create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
 create function public.sa_paid(p_user uuid) returns boolean language sql as $$select false$$;
 grant usage on schema auth,storage to authenticated,anon,service_role;
 create table storage.buckets(id text primary key,allowed_mime_types text[],file_size_limit bigint);
 insert into storage.buckets(id) values('speech-recordings');
 create table storage.objects(bucket_id text,name text,primary key(bucket_id,name));alter table storage.objects enable row level security;
 grant select,insert,delete on storage.objects to authenticated;
 create policy storage_owner on storage.objects to authenticated using(split_part(name,'/',1)=auth.uid()::text) with check(split_part(name,'/',1)=auth.uid()::text);
 create table public.daily_topics(id serial primary key,topic text);create table public.speech_topics(id serial primary key,topic text);
 grant all on public.daily_topics,public.speech_topics to authenticated,anon;
 create policy unsafe_daily on public.daily_topics for insert to authenticated with check(true);
 create policy unsafe_speech on public.speech_topics for insert to authenticated with check(true);
 create policy read_daily on public.daily_topics for select to authenticated using(true);
 create policy read_speech on public.speech_topics for select to authenticated using(true);
 create function public.sa_validate_account_username() returns trigger language plpgsql as $$begin return new;end$$;
 grant execute on function public.sa_validate_account_username() to authenticated,anon;
 insert into auth.users(id,email) values('${owner}','owner@example.test');`);
 for(const name of ['20261011000000_practice_sync.sql','20261013000100_progress_versions.sql','20261014000200_practice_actions.sql','20261014000300_paddle_billing.sql','20261015000200_billing_fulfillment.sql','20261016170110_security_resource_limits.sql','20261016170116_billing_adjustment_security.sql']) {
 if(name==='20261016170110_security_resource_limits.sql')await db.exec('alter table public.practice_items drop constraint if exists practice_actions_valid;drop function if exists public.sa_valid_practice_actions(jsonb);');
 await db.exec(read(name));
 }
 return db;
 }catch(e){await db.close();throw e;}
}

test('topic authoring is blocked, valid service content remains readable, trigger grants are removed',async()=>{
 const db=await database();try{
 await db.exec("insert into public.daily_topics(topic) values('A real topic');set role authenticated;");
 assert.equal((await db.query('select * from public.daily_topics')).rows.length,1);
 await assert.rejects(()=>db.exec("insert into public.daily_topics(topic) values('Injected')"),/permission denied/);
 await assert.rejects(()=>db.exec("insert into public.speech_topics(topic) values('Injected')"),/permission denied/);
 assert.equal((await db.query("select has_function_privilege('authenticated','public.sa_validate_account_username()','execute') allowed")).rows[0].allowed,false);
 await db.exec('reset role;');
 await assert.rejects(()=>db.query('insert into public.daily_topics(topic) values($1)',['x'.repeat(501)]),/check constraint/);
 await db.exec(read('20261016170110_security_resource_limits.sql'));
 }finally{await db.close();}
});

test('recording quota applies through storage RLS and deletion frees a slot without touching other accounts',async()=>{
 const db=await database();try{
 await db.exec(`set role authenticated;select set_config('app.uid','${owner}',false);`);
 for(let i=0;i<20;i++)await db.query("insert into storage.objects values('speech-recordings',$1)",[owner+'/'+i]);
 await assert.rejects(()=>db.query("insert into storage.objects values('speech-recordings',$1)",[owner+'/overflow']),/row-level security/);
 await assert.rejects(()=>db.query("insert into storage.objects values('speech-recordings',$1)",[crypto.randomUUID()+'/foreign']),/row-level security/);
 await db.query("delete from storage.objects where name=$1",[owner+'/0']);
 await db.query("insert into storage.objects values('speech-recordings',$1)",[owner+'/replacement']);
 assert.equal((await db.query('select count(*)::int n from storage.objects')).rows[0].n,20);
 }finally{await db.close();}
});

test('progress RPC rejects oversized, extra fields, invalid dates and nested annotations, preserving CAS',async()=>{
 const db=await database();try{
 await db.exec(`set role authenticated;select set_config('app.uid','${owner}',false);`);
 const call=(payload,version=0,operation=crypto.randomUUID())=>db.query('select public.practice_apply($1,$2,$3,false,$4) result',['take',version,payload,operation]);
 const good={id:'take',topic:'Practice',date:'2026-10-16',analysis:{transcript:'Short sample'},syncFeedback:true};
 for(const bad of [{...good,extra:'x'},{...good,analysis:{transcript:'x'.repeat(200000)}},{...good,date:'2026-02-30'},{...good,practiceActions:{version:2}},{...good,topic:22}])await assert.rejects(()=>call(bad),/Invalid progress/);
 const op=crypto.randomUUID();assert.equal((await call(good,0,op)).rows[0].result.applied,true);
 assert.equal((await call(good,0,op)).rows[0].result.applied,true);
 assert.equal((await call({...good,topic:'Conflict'},0)).rows[0].result.applied,false);
 assert.equal((await call({...good,topic:'New'},1)).rows[0].result.applied,true);
 await db.exec('reset role');
 await db.query("insert into public.practice_items(user_id,kind,item_id,payload) select $1,'session','seed-'||n,$2::jsonb from generate_series(1,1999) n",[owner,good]);
 await db.exec('set role authenticated');
 await assert.rejects(()=>db.query('select public.practice_apply($1,0,$2,false,$3)',['overflow',good,crypto.randomUUID()]),/Progress item limit/);
 }finally{await db.close();}
});

test('distributed rate counters and billing handler reject excess calls before provider or Auth work',async()=>{
 const db=await database();try{
 for(let i=0;i<5;i++)assert.equal((await db.query("select public.billing_rate('account:fixture:portal',5) allowed")).rows[0].allowed,true);
 assert.equal((await db.query("select public.billing_rate('account:fixture:portal',5) allowed")).rows[0].allowed,false);
 await db.exec("update public.billing_request_rates set window_start=now()-interval '2 minutes'");
 assert.equal((await db.query("select public.billing_rate('account:fixture:portal',5) allowed")).rows[0].allowed,true);
 let auth=0;const calls=[];
 const mock={rpc:async(name,args)=>{calls.push(args);return {data:false,error:null};},auth:{getUser:async()=>{auth++;}}};
 const handler=createBillingApi(mock,{origins:new Set()},()=>{throw Error('must not run');});
 const response=await handler(new Request('https://test',{method:'POST',headers:{authorization:'Bearer secret'},body:'{"action":"portal"}'}));
 assert.equal(response.status,429);assert.equal(response.headers.get('retry-after'),'60');assert.equal(auth,0);
 const keys=[];await authRate({rpc:async(_name,args)=>{keys.push(args.p_key);return {data:true};}},'secret bearer');
 assert.ok(keys.every(k=>!k.includes('secret')));
 }finally{await db.close();}
});

test('deletion schema and reader handle null, arrays, oversized bytes, wrong content type and stalled streams',async()=>{
 const req=(value,headers={'content-type':'application/json'})=>new Request('https://test',{method:'POST',headers,body:JSON.stringify(value)});
 const valid={operationId:crypto.randomUUID(),confirmation:'Owner'};
 assert.deepEqual(await deletionBody(req(valid)),valid);
 for(const bad of [null,[],{}, {...valid,confirmation:'x'.repeat(321)},{...valid,extra:'x'}])await assert.rejects(()=>deletionBody(req(bad)),e=>e.status===400);
 await assert.rejects(()=>deletionBody(req({...valid,confirmation:'x'.repeat(3000)})),e=>e.status===413);
 await assert.rejects(()=>deletionBody(req(valid,{})),e=>e.status===415);
 const stalled=new ReadableStream({start(){}});
 await assert.rejects(()=>limitedBody(new Request('https://test',{method:'POST',body:stalled,duplex:'half'}),2048,10),e=>e.status===408);
 const output=[];securityEvent('billing_failure',503,'request-id',s=>output.push(s));
 assert.deepEqual(JSON.parse(output[0]),{event:'billing_failure',status:503,requestId:'request-id'});
 assert.equal(failureCategory({code:'forbidden',detail:'sensitive data'}),'paddle_forbidden');
 assert.equal(failureCategory({code:'secret-token-as-code',message:'sensitive data'}),'provider_error');
 assert.equal(failureCategory({category:'database'}),'database');
});

function snapshot(){return {id:id('sub'),customer_id:id('ctm'),price_id:id('pri'),product_id:id('pro'),status:'active',eligible:true,
 created_at:'2026-10-01T00:00:00Z',updated_at:'2026-10-16T00:00:00Z',period_start:'2026-10-01T00:00:00Z',period_end:'2099-11-01T00:00:00Z'};}
function adjustment(overrides={}){return {id:id('adj'),transaction_id:id('txn'),subscription_id:id('sub'),customer_id:id('ctm'),action:'refund',type:'full',status:'approved',amount:'699',transaction_total:'699',
 created_at:'2026-10-15T00:00:00Z',updated_at:'2026-10-16T00:00:00Z',period_start:'2026-10-01T00:00:00Z',period_end:'2099-11-01T00:00:00Z',...overrides};}

test('atomic canonical refund reconciliation matches SQL/JS access, is idempotent, and resists old events',async()=>{
 const db=await database();try{
 await db.query('insert into public.billing_customers(user_id,paddle_customer_id) values($1,$2)',[owner,id('ctm')]);
 const apply=rows=>db.query('select public.billing_apply_subscription_secure($1,$2)',[snapshot(),rows]);
 const access=async()=>{
  const sub=(await db.query('select * from public.billing_subscriptions')).rows[0];
  const sql=(await db.query('select public.billing_has_paid_access($1) allowed',[owner])).rows[0].allowed;
  assert.equal(grantsPaidAccess(sub),sql);return sql;
 };
 await apply([]);assert.equal(await access(),true);
 await apply([adjustment({status:'pending_approval'})]);assert.equal(await access(),true);
 await apply([adjustment()]);assert.equal(await access(),false);
 await db.query("update auth.users set raw_app_meta_data=$2 where id=$1",[owner,{simplyarticulate_subscription:{status:'active',validUntil:'2099-01-01'}}]);
 await db.exec('update public.billing_settings set provisioning_enabled=true');
 assert.equal((await db.query('select public.sa_paid($1) paid',[owner])).rows[0].paid,false);
 await apply([adjustment()]);assert.equal((await db.query('select count(*)::int n from public.billing_adjustments')).rows[0].n,1);
 await apply([adjustment({status:'pending_approval',updated_at:'2026-10-15T00:00:00Z'})]);assert.equal(await access(),false);
 await apply([]);assert.equal(await access(),false);
 await apply([adjustment({status:'reversed',updated_at:'2026-10-17T00:00:00Z'})]);assert.equal(await access(),true);
 await assert.rejects(()=>apply([adjustment({customer_id:id('ctm','b')})]),/ownership mismatch/);
 assert.equal(await access(),true);
 await db.exec(read('20261016170116_billing_adjustment_security.sql'));
 await db.exec('set role authenticated');await assert.rejects(()=>apply([]),/permission denied/);
 }finally{await db.close();}
});

test('partial, rejected and historical refunds retain access; aggregate full refunds and chargebacks block; reversals restore',async()=>{
 const db=await database();try{
 await db.query('insert into public.billing_customers(user_id,paddle_customer_id) values($1,$2)',[owner,id('ctm')]);
 const apply=async rows=>{await db.query('select public.billing_apply_subscription_secure($1,$2)',[snapshot(),rows]);return (await db.query('select public.billing_has_paid_access($1) allowed',[owner])).rows[0].allowed;};
 assert.equal(await apply([adjustment({id:id('adj','b'),type:'partial',amount:'200'})]),true);
 assert.equal(await apply([adjustment({id:id('adj','c'),status:'rejected'})]),true);
 assert.equal(await apply([adjustment({id:id('adj','d'),transaction_id:id('txn','b'),period_start:'2020-01-01',period_end:'2020-02-01'})]),true);
 assert.equal(await apply([adjustment({id:id('adj','e'),type:'partial',amount:'499'})]),false);
 assert.equal(await apply([adjustment({id:id('adj','e'),type:'partial',amount:'499',status:'reversed',updated_at:'2026-10-17'})]),true);
 assert.equal(await apply([adjustment({id:id('adj','f'),action:'chargeback'})]),false);
 assert.equal(await apply([adjustment({id:id('adj','g'),action:'chargeback_reverse',type:'partial',amount:'100',updated_at:'2026-10-18'})]),false);
 assert.equal(await apply([adjustment({id:id('adj','g'),action:'chargeback_reverse',updated_at:'2026-10-19'})]),true);
 }finally{await db.close();}
});

test('adjustment SDK snapshots validate canonical transaction ownership and route both adjustment events',async()=>{
 const sub={id:id('sub'),customerId:id('ctm')};
 const a={id:id('adj'),transactionId:id('txn'),subscriptionId:sub.id,customerId:sub.customerId,action:'refund',type:'full',status:'approved',totals:{total:'699'},createdAt:'2026-10-15',updatedAt:'2026-10-16'};
 let transaction={id:id('txn'),subscriptionId:sub.id,customerId:sub.customerId,billingPeriod:{startsAt:'2026-10-01',endsAt:'2099-11-01'},details:{totals:{total:'699'}}};
 const sdk={adjustments:{list:()=>({async *[Symbol.asyncIterator](){yield a;}})},transactions:{get:async()=>transaction}};
 assert.equal((await adjustmentSnapshots(sdk,sub))[0].amount,'699');
 transaction={...transaction,customerId:id('ctm','b')};await assert.rejects(()=>adjustmentSnapshots(sdk,sub),/ownership mismatch/);
 for(const eventType of ['adjustment.created','adjustment.updated'])assert.equal(routedEvent({eventId:id('evt'),eventType,occurredAt:'2026-10-16',data:{id:id('adj')}},{environment:'production'}).object_id,id('adj'));
});

test('adjustment notification uses the installed SDK filtered-list contract and verifies list visibility',async()=>{
 const real=new Paddle('fake-test-key',{environment:Environment.sandbox});
 assert.equal(typeof real.adjustments.list({id:[id('adj')],perPage:1}).next,'function');
 const params=[];let reconciled=0;
 const a={id:id('adj'),customerId:id('ctm'),transactionId:id('txn'),subscriptionId:id('sub')};
 const sdk={adjustments:{list:options=>{params.push(options);return {next:async()=>[a]};}},transactions:{get:async()=>({id:id('txn'),customerId:id('ctm'),subscriptionId:id('sub')})}};
 const db={from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{paddle_adjustment_id:id('adj')}})})};
 await syncAdjustmentEvent(db,sdk,id('adj'),{},async()=>{reconciled++;},async p=>p);
 assert.deepEqual(params,[{id:[id('adj')],perPage:1}]);assert.equal(reconciled,1);
});
