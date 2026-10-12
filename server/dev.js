// Start the UI and its AI backend together; do not require two manual terminals.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {setTimeout as pause} from 'node:timers/promises';
import {loadEnv} from 'vite';
const root=fileURLToPath(new URL('../',import.meta.url));
const children=[];let closing=false;
function run(args){const child=spawn(process.execPath,args,{cwd:root,stdio:'inherit',windowsHide:true});children.push(child);child.on('exit',code=>{if(!closing){closing=true;for(const other of children)if(other!==child)other.kill();process.exitCode=code||0;}});return child;}
async function ready(){try{const response=await fetch('http://127.0.0.1:8787/api/analysis/config',{signal:AbortSignal.timeout(1000)});if(!response.ok)return false;const config=await response.json();return typeof config.enabled==='boolean'&&config.requiresSignIn===true&&Number.isFinite(config.maxSeconds);}catch{return false;}}
const hosted=(process.env.VITE_ANALYSIS_SERVICE||loadEnv('development',root,'VITE_').VITE_ANALYSIS_SERVICE)==='supabase';
const existing=hosted?false:await ready();
if(!hosted&&!existing)run(['--env-file-if-exists=.env.local','--env-file-if-exists=.env.server.local','server/index.js']);
else if(existing)console.log('Using the analysis service already running on port 8787.');
else console.log('Using Supabase Edge Functions for analysis.');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{closing=true;for(const child of children)child.kill();});
if(!hosted&&!existing){
 let available=false;
 for(let attempt=0;attempt<30&&!closing;attempt++){if(await ready()){available=true;break;}await pause(200);}
 if(!available){closing=true;for(const child of children)child.kill();throw Error('The speech analysis server did not start. Check the server setup before opening SimplyArticulate.');}
}
const args=process.argv.slice(2),preview=args.includes('--preview');
run(['node_modules/vite/bin/vite.js',...(preview?['preview']:[]),...args.filter(arg=>arg!=='--preview')]);
