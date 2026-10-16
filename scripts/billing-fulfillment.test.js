import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {Paddle,Environment} from '@paddle/paddle-node-sdk';
import {createBillingWebhook,createBillingApi} from '../supabase/functions/_shared/billingApi.js';
import {billingConfig} from '../supabase/functions/_shared/billingCore.js';
import {handleBillingEvent,processFulfillmentEvent,routedEvent} from '../supabase/functions/_shared/billingFulfillment.js';
import {grantsPaidAccess,accountAccess,customerPortal} from '../supabase/functions/_shared/billingAccess.js';
const id=(prefix,char='a')=>prefix+'_'+char.repeat(26);
const sdk=new Paddle('test-server-key',{environment:Environment.sandbox});
const config=billingConfig({BILLING_ENVIRONMENT:'sandbox',PADDLE_PRO_MONTH_PRICE_ID:id('pri'),PADDLE_WEBHOOK_SECRET:'notification-secret'});
const read=name=>fs.readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
async function database(){const db=new PGlite();await db.exec(`create schema auth;create role anon;create role authenticated;create role service_role;
 create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
 create function public.sa_paid(p_user uuid) returns boolean language sql as $$select false$$;`);
 try{await db.exec(read('20261014000300_paddle_billing.sql'));await db.exec(read('20261015000200_billing_fulfillment.sql'));}catch(error){await db.close();throw error;}
 return db;}
function adapter(db,user){return {auth:{getUser:async()=>({data:{user},error:null})},rpc:async(name,args={})=>{
 try{const parameters=Object.values(args),slots=parameters.map((_,i)=>'$'+(i+1)).join(',');
 const result=await db.query(`select * from public.${name}(${slots})`,parameters);
 return {data:name==='billing_claim_event'?result.rows:result.rows[0]?.[name],error:null};}catch(error){return {data:null,error};}
 },from(table){let columns='*',operation='select',value,options={},filters=[],limit='',order='';let single=false;
 const q={select(c='*'){columns=c;return q;},eq(k,v){filters.push([k,v]);return q;},limit(n){limit=' limit '+n;return q;},order(k){order=' order by '+k;return q;},
  maybeSingle(){single=true;return q;},single(){single=true;return q;},update(v){operation='update';value=v;return q;},upsert(v,o){operation='upsert';value=v;options=o||{};return q;},
  then(resolve,reject){return (async()=>{try{
   const parameters=[];const bind=v=>{parameters.push(v);return '$'+parameters.length;};let sql;
   if(operation==='select')sql=`select ${columns} from public.${table}`;
   else if(operation==='update')sql=`update public.${table} set `+Object.entries(value).map(([k,v])=>k+'='+bind(v)).join(',');
   else {const entries=Object.entries(value);sql=`insert into public.${table}(${entries.map(([k])=>k).join(',')}) values(${entries.map(([,v])=>bind(v)).join(',')}) on conflict(${options.onConflict}) do nothing`;}
   if(filters.length)sql+=' where '+filters.map(([k,v])=>k+'='+bind(v)).join(' and ');
   if(operation==='select')sql+=order+limit;else sql+=' returning *';
   const result=await db.query(sql,parameters);return {data:single?result.rows[0]||null:result.rows,error:null};
  }catch(error){return {data:null,error};}})().then(resolve,reject);}};return q;
 }};}
async function signature(raw){const ts=Math.floor(Date.now()/1000);const key=await crypto.subtle.importKey('raw',new TextEncoder().encode('notification-secret'),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(ts+':'+raw)));
 return `ts=${ts};h1=${Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')}`;}
function canonical(){const customer={id:id('ctm'),email:'owner@example.com',createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-15T12:00:00Z'};
 const subscription={id:id('sub'),customerId:customer.id,status:'active',createdAt:customer.createdAt,updatedAt:customer.updatedAt,
 currentBillingPeriod:{startsAt:'2026-09-01T00:00:00Z',endsAt:'2026-10-01T00:00:00Z'},
 items:[{quantity:1,price:{id:id('pri'),productId:id('pro')}}],scheduledChange:{action:'cancel',effectiveAt:'2026-11-01T00:00:00Z'}};
 const transaction={id:id('txn'),customerId:customer.id,subscriptionId:subscription.id,status:'completed',createdAt:customer.createdAt,updatedAt:customer.updatedAt};
 return {customer,subscription,transaction,sdk:{customers:{get:async()=>customer},subscriptions:{get:async()=>subscription},transactions:{get:async()=>transaction}}};}

test('fulfillment migration preserves existing bindings and is repeatable; duplicate IDs do not create more entities',async()=>{
 const db=await database();try{
 await db.exec(read('20261015000200_billing_fulfillment.sql'));
 const owner=crypto.randomUUID();await db.query('insert into auth.users(id,email) values($1,$2)',[owner,'owner@example.com']);
 await db.query('insert into public.billing_customers(user_id,paddle_customer_id) values($1,$2)',[owner,id('ctm')]);
 const c=canonical(),a=adapter(db);for(let i=0;i<2;i++)await handleBillingEvent(a,c.sdk,{event_type:'transaction.completed',object_id:id('txn')},config);
 for(const table of ['billing_customers','billing_subscriptions','billing_transactions'])assert.equal((await db.query('select count(*) count from public.'+table)).rows[0].count,1);
 const access=await accountAccess(a,owner,config);assert.deepEqual(access,{hasPaidAccess:true,plan:'pro'});
 const row=(await db.query('select * from public.billing_subscriptions')).rows[0];assert.equal(row.paddle_product_id,id('pro'));assert.equal(row.scheduled_change_action,'cancel');
 assert.equal((await db.query('select public.billing_has_paid_access($1) allowed',[owner])).rows[0].allowed,true);
 // No automatic production allowance change from sandbox payments.
 assert.equal((await db.query('select public.sa_paid($1) allowed',[owner])).rows[0].allowed,false);
 await db.exec("update public.billing_settings set provisioning_enabled=true where environment='sandbox'");
 assert.equal((await db.query('select public.sa_paid($1) allowed',[owner])).rows[0].allowed,true);
 }finally{await db.close();}
});
test('out-of-order snapshots cannot undo cancellation; scheduled changes alone never revoke active/trialing access',async()=>{
 const db=await database();try{const c=canonical(),a=adapter(db),owner=crypto.randomUUID();
 await db.query('insert into auth.users(id,email) values($1,$2)',[owner,c.customer.email]);await db.query('insert into public.billing_customers(user_id,paddle_customer_id) values($1,$2)',[owner,c.customer.id]);
 await handleBillingEvent(a,c.sdk,{event_type:'subscription.created',object_id:c.subscription.id},config);
 for(const status of ['active','trialing'])assert.equal(grantsPaidAccess({eligible:true,status,scheduled_change:{action:'pause'},current_period_end:'2000-01-01'}),true);
 for(const status of ['canceled','paused','past_due'])assert.equal(grantsPaidAccess({eligible:true,status}),false);
 c.subscription.status='canceled';c.subscription.updatedAt='2026-10-15T13:00:00Z';await handleBillingEvent(a,c.sdk,{event_type:'subscription.canceled',object_id:c.subscription.id},config);
 c.subscription.status='active';c.subscription.updatedAt='2026-10-15T12:00:00Z';await handleBillingEvent(a,c.sdk,{event_type:'subscription.updated',object_id:c.subscription.id},config);
 assert.equal((await db.query('select status from public.billing_subscriptions')).rows[0].status,'canceled');
 assert.equal((await accountAccess(a,owner,config)).hasPaidAccess,false);
 }finally{await db.close();}
});
test('permanent billing records survive app account deletion and reject DELETE/TRUNCATE',async()=>{
 const db=await database();try{const c=canonical(),owner=crypto.randomUUID(),a=adapter(db);
 await db.query('insert into auth.users(id,email) values($1,$2)',[owner,c.customer.email]);await db.query('insert into public.billing_customers(user_id,paddle_customer_id) values($1,$2)',[owner,c.customer.id]);
 await handleBillingEvent(a,c.sdk,{event_type:'transaction.completed',object_id:c.transaction.id},config);
 for(const table of ['billing_customers','billing_subscriptions','billing_transactions']){
  await assert.rejects(()=>db.query('delete from public.'+table),/cannot be deleted/);
  await assert.rejects(()=>db.query('truncate public.'+table+' cascade'),/cannot be deleted/);
 }
 await db.query('delete from auth.users where id=$1',[owner]);
 assert.equal((await db.query('select user_id from public.billing_customers')).rows[0].user_id,null);
 assert.equal((await db.query('select user_id from public.billing_subscriptions')).rows[0].user_id,null);
 assert.equal((await db.query('select count(*) count from public.billing_transactions')).rows[0].count,1);
 await db.exec('set role authenticated');await assert.rejects(()=>db.query('select * from public.billing_customers'),/permission denied/);
 assert.equal((await db.query('select * from public.billing_subscriptions')).rows.length,0);
 await assert.rejects(()=>db.query('select public.billing_apply_customer($1)',[{}]),/permission denied/);
 }finally{await db.close();}
});
test('SDK verification uses the signing secret and exact raw body before any database work; only supported events queue',async()=>{
 let writes=0;const db={from:()=>({upsert:async()=>{writes++;return {error:null};}})};
 const handler=createBillingWebhook(db,config,()=>sdk);
 const raw=JSON.stringify({event_id:id('evt'),event_type:'customer.created',occurred_at:new Date().toISOString(),data:{id:id('ctm'),email:'owner@example.com'}});
 const sig=await signature(raw);
 const request=(body,sign=sig)=>new Request('https://test',{method:'POST',headers:{'paddle-signature':sign},body});
 assert.equal((await handler(request(raw+' '))).status,401);assert.equal(writes,0);
 assert.equal((await handler(request(raw))).status,200);assert.equal(writes,1);
 const other=JSON.stringify({event_id:id('evt','b'),event_type:'product.created',occurred_at:new Date().toISOString(),data:{id:id('pro'),name:'unused'}});
 assert.equal((await handler(request(other,await signature(other)))).status,200);assert.equal(writes,1);
});
test('portal authenticates first, rejects client ownership, and creates a new SDK session for the server-pinned customer',async()=>{
 const db=await database();try{const c=canonical(),owner=crypto.randomUUID(),a=adapter(db,{id:owner}),calls=[];
 await db.query('insert into auth.users(id,email) values($1,$2)',[owner,c.customer.email]);await db.query('insert into public.billing_customers(user_id,paddle_customer_id) values($1,$2)',[owner,c.customer.id]);
 await handleBillingEvent(a,c.sdk,{event_type:'subscription.created',object_id:c.subscription.id},config);
 const portalSdk={customerPortalSessions:{create:async(customer,subscriptions)=>{calls.push([customer,subscriptions]);return {urls:{general:{overview:'https://sandbox-customer-portal.paddle.com/session?token='+calls.length}}};}}};
 const api=createBillingApi(a,config,()=>{throw Error('no REST provider');},()=>portalSdk);
 assert.equal((await api(new Request('https://test',{method:'POST',body:'{"action":"portal"}'}))).status,401);assert.equal(calls.length,0);
 const request=body=>new Request('https://test',{method:'POST',headers:{authorization:'Bearer session'},body:JSON.stringify(body)});
 assert.equal((await api(request({action:'portal',customerId:id('ctm','b')}))).status,400);assert.equal(calls.length,0);
 const first=await api(request({action:'portal'})),second=await api(request({action:'portal'}));
 assert.equal(first.status,200);assert.equal(first.headers.get('cache-control'),'no-store');assert.notEqual((await first.json()).url,(await second.json()).url);
 assert.deepEqual(calls[0],[c.customer.id,[c.subscription.id]]);
 await assert.rejects(()=>customerPortal(a,{id:crypto.randomUUID()},portalSdk),/No billing account/);
 }finally{await db.close();}
});
test('duplicate deliveries preserve processed state and a failed worker retains its event for retry',async()=>{
 const db=await database();try{const a=adapter(db),c=canonical();
 const delivery={event_id:id('evt'),event_type:'customer.updated',object_id:c.customer.id,occurred_at:'2026-10-15T12:00:00Z'};
 await a.from('billing_events').upsert(delivery,{onConflict:'event_id',ignoreDuplicates:true});
 await processFulfillmentEvent(a,config,{customers:{get:async()=>{throw Error('provider unavailable');}}});
 assert.equal((await db.query('select state from public.billing_events')).rows[0].state,'failed');
 await db.exec("update public.billing_events set next_attempt_at=now()");await processFulfillmentEvent(a,config,c.sdk);
 await a.from('billing_events').upsert(delivery,{onConflict:'event_id',ignoreDuplicates:true});
 assert.equal((await db.query('select state from public.billing_events')).rows[0].state,'processed');
 assert.equal((await db.query('select count(*) count from public.billing_customers')).rows[0].count,1);
 }finally{await db.close();}
});

test('signed simulator IDs queue idempotently in sandbox only and remain subject to SDK verification',async()=>{
 const db=await database();try{
 const handler=createBillingWebhook(adapter(db),config,()=>sdk);
 const event={event_id:'ntfsimevt_01m513r7wxsmvhdxxkd6mbensk',event_type:'subscription.created',occurred_at:new Date().toISOString(),notification_id:'ntfsimntf_01m513r7zs5ep6evz5b5cy59z4',data:{id:id('sub'),items:[],billing_cycle:{interval:'month',frequency:1}}};
 const raw=JSON.stringify(event),sig=await signature(raw);
 const request=(body=raw,sign=sig)=>new Request('https://test',{method:'POST',headers:{'paddle-signature':sign},body});
 assert.equal((await handler(request(raw+' '))).status,401);
 assert.equal((await handler(request())).status,200);
 assert.equal((await handler(request())).status,200);
 assert.equal((await db.query('select count(*) count from public.billing_events')).rows[0].count,1);
 const normalized={eventId:event.event_id,eventType:event.event_type,occurredAt:event.occurred_at,data:event.data};
 assert.throws(()=>routedEvent(normalized,{environment:'live'}),/Invalid billing event/);
 assert.throws(()=>routedEvent(normalized),/Invalid billing event/);
 assert.throws(()=>routedEvent({...normalized,eventId:'ntfsimevt_bad'},config),/Invalid billing event/);
 }finally{await db.close();}
});