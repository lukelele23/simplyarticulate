import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const migration=fs.readFileSync(new URL('../supabase/migrations/20261014000100_account_usernames.sql',import.meta.url),'utf8');
async function database(){const db=new PGlite();await db.exec("create schema auth;create role anon;create role authenticated;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql as $$select nullif(current_setting('app.uid',true),'')::uuid$$;");return db;}
test('usernames are unique ignoring case, validated on metadata updates, editable and released after deletion',async()=>{
 const db=await database();try{
 await db.exec(migration);await db.exec(migration);
 const owner=crypto.randomUUID(),other=crypto.randomUUID();
 await db.query('insert into auth.users values($1,$2),($3,$4)',[owner,{username:'Speaker'},other,{}]);
 await db.query("select set_config('app.uid',$1,false)",[other]);
 assert.equal((await db.query("select public.sa_username_available('speaker') available")).rows[0].available,false);
 await assert.rejects(()=>db.query('update auth.users set raw_user_meta_data=$1 where id=$2',[{username:'sPeAkEr'},other]),/duplicate key/);
 await assert.rejects(()=>db.query('update auth.users set raw_user_meta_data=$1 where id=$2',[{username:'bad name'},other]),/Choose 3-24/);
 await assert.rejects(()=>db.query('update auth.users set raw_user_meta_data=$1 where id=$2',[{},owner]),/cannot be removed/);
 await db.query('update auth.users set raw_user_meta_data=$1 where id=$2',[{username:'NewSpeaker'},owner]);
 assert.equal((await db.query("select public.sa_username_available('speaker') available")).rows[0].available,true);
 await db.query('update auth.users set raw_user_meta_data=$1 where id=$2',[{username:'Speaker'},other]);
 await db.query('delete from auth.users where id=$1',[other]);
 assert.equal((await db.query("select public.sa_username_available('Speaker') available")).rows[0].available,true);
 await db.exec('set role anon');await assert.rejects(()=>db.query("select public.sa_username_available('Speaker')"),/permission denied/);await db.exec('reset role');
 await db.query("select set_config('app.uid','',false)");await assert.rejects(()=>db.query("select public.sa_username_available('Speaker')"),/Sign in/);
 }finally{await db.close();}
});
test('legacy username collisions stop migration without deleting or renaming accounts',async()=>{
 const db=await database();try{
 await db.query('insert into auth.users values($1,$2),($3,$4)',[crypto.randomUUID(),{username:'Speaker'},crypto.randomUUID(),{username:'speaker'}]);
 await assert.rejects(()=>db.exec(migration),/Resolve duplicate usernames/);await db.exec('rollback');
 assert.equal((await db.query('select count(*) total from auth.users')).rows[0].total,2);
 }finally{await db.close();}
});

test('username migration works without owning the managed Auth users table',async()=>{
 const db=await database();try{
 await db.exec(`create role managed_auth;create role app_installer;
 alter table auth.users owner to managed_auth;
 grant usage on schema auth,public to app_installer,managed_auth;
 grant create on schema public to app_installer;
 grant select,insert,update,delete,references,trigger on auth.users to app_installer;
 set role app_installer;`);
 await db.exec(migration);await db.exec(migration);
 const first=crypto.randomUUID(),second=crypto.randomUUID();
 await db.query('insert into auth.users values($1,$2),($3,$4)',[first,{username:'SameName'},second,{}]);
 await assert.rejects(()=>db.query('update auth.users set raw_user_meta_data=$1 where id=$2',[{username:'samename'},second]),/duplicate key/);
 }finally{await db.close();}
});