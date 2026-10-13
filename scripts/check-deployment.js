import {loadEnv} from 'vite';
import {fileURLToPath} from 'node:url';
import {deploymentSettings,validateBackendEnvironment} from './deployment-config.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const env={...loadEnv('production',root,''),...process.env};
if(process.argv.includes('--backend')){validateBackendEnvironment(env);console.log('Backend settings are present. Confirm the disk is persistent and writable on the hosting service.');}
else {
 const {backend,service}=deploymentSettings(env);
 if(process.argv.includes('--online')){
  const response=await fetch(`${backend}/api/analysis/health`,{headers:service==='supabase'?{apikey:env.VITE_SUPABASE_PUBLISHABLE_KEY}:{},signal:AbortSignal.timeout(15000)});
  const health=await response.json();
  if(!response.ok||health.ready!==true)throw Error('The hosted analysis server is not ready.');
  if(service==='supabase'){if(!['scheduler','progress','focusedRetry','survey','deletion','recordings'].every(key=>health.features?.[key]===true))throw Error('One or more account features need their migrations.');const deletion=await fetch(new URL('delete-account',backend.replace(/speech-api.*$/,'')).href,{method:'OPTIONS',signal:AbortSignal.timeout(15000)});if(!deletion.ok)throw Error('Deploy the delete-account function before publishing.');}
 }
 console.log('Frontend deployment settings passed.');
}
