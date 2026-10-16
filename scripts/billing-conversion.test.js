import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
test('conversion preserves sandbox records in a private archive and creates independent live identities',async()=>{
 const db=new PGlite();try{
 await db.exec(`create schema auth;create role anon;create role authenticated;create role service_role;
 create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
 create function public.sa_paid(p_user uuid) returns boolean language sql as $$select false$$;`);
 for(const file of ['20261014000300_paddle_billing.sql','20261015000200_billing_fulfillment.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 const user=crypto.randomUUID(),customer='ctm_'+'a'.repeat(26),price='pri_'+'b'.repeat(26);
 await db.query('insert into auth.users(id,email) values($1,$2)',[user,'owner@example.com']);
 await db.query('insert into public.billing_customers(user_id,paddle_customer_id) values($1,$2)',[user,customer]);
 await db.exec(readFileSync(new URL('../docs/convert-billing-to-live.sql',import.meta.url),'utf8'));
 assert.equal((await db.query('select paddle_customer_id from billing_sandbox_archive.billing_customers')).rows[0].paddle_customer_id,customer);
 assert.equal((await db.query('select count(*) n from public.billing_customers')).rows[0].n,0);
 const result=await db.query('select public.billing_reserve_checkout($1,$2) result',[user,price]);
 assert.equal(result.rows[0].result.customer.environment,'production');
 assert.equal(result.rows[0].result.customer.paddle_customer_id,null);
 assert.equal((await db.query("select has_schema_privilege('authenticated','billing_sandbox_archive','USAGE') allowed")).rows[0].allowed,false);
 assert.equal((await db.query("select provisioning_enabled from public.billing_settings where environment='production'")).rows[0].provisioning_enabled,false);
 await assert.rejects(()=>db.exec(readFileSync(new URL('../docs/convert-billing-to-live.sql',import.meta.url),'utf8')),/already exists/);
 }finally{await db.close();}
});
