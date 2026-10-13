import {existsSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import path from 'node:path';
import {runDeletion} from '../supabase/functions/_shared/accountDeletion.js';
export function localDeletionJournal(directory,owner,stages,operationId){
 const file=path.join(directory,'account-deletions.json');
 const rows=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{};
 const commit=()=>{writeFileSync(file+'.tmp',JSON.stringify(rows),{mode:0o600});renameSync(file+'.tmp',file);};
 return {async run(){const result=await runDeletion({load:async()=>rows[owner]||{completed:[]},save:async state=>{rows[owner]={...state,operationId};commit();},stages});delete rows[owner];commit();return result;}};
}

export function acknowledgeLocalDeletion(directory,operationId){const file=path.join(directory,'account-deletions.json');if(!existsSync(file))return;const rows=JSON.parse(readFileSync(file,'utf8'));for(const [owner,row] of Object.entries(rows))if(row.operationId===operationId)delete rows[owner];writeFileSync(file+'.tmp',JSON.stringify(rows),{mode:0o600});renameSync(file+'.tmp',file);}
