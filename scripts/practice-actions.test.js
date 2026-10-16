import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
test('practice-action database validation preserves legacy data and bounds user annotations',async()=>{
 const db=new PGlite();try{
 await db.exec('create table public.practice_items(kind text,payload jsonb);');
 const migration=fs.readFileSync(new URL('../supabase/migrations/20261014000200_practice_actions.sql',import.meta.url),'utf8');await db.exec(migration);await db.exec(migration);
 await db.query('insert into public.practice_items values($1,$2)',['session',{topic:'Legacy'}]);
 await db.query('insert into public.practice_items values($1,$2)',['session',{practiceActions:{version:1,checks:{'v1-1234567890abcdef':true},note:'Try one example.'}}]);
 for(const state of [{version:2,checks:{},note:''},{version:1,checks:{bad:true},note:''},{version:1,checks:{},note:'a'.repeat(601)},{version:1,checks:{},note:'',transcript:'unwanted copy'}])await assert.rejects(()=>db.query('insert into public.practice_items values($1,$2)',['session',{practiceActions:state}]),/check constraint/);
 }finally{await db.close();}
});
