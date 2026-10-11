import {loadEnv} from 'vite';
import {fileURLToPath} from 'node:url';
import {deploymentSettings,validateBackendEnvironment} from './deployment-config.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const env={...loadEnv('production',root,''),...process.env};
if(process.argv.includes('--backend')){validateBackendEnvironment(env);console.log('Backend settings are present. Confirm the disk is persistent and writable on the hosting service.');}
else {
 const {backend}=deploymentSettings(env);
 if(process.argv.includes('--online')){
  const response=await fetch(`${backend}/api/analysis/health`,{signal:AbortSignal.timeout(15000)});
  if(!response.ok||(await response.json()).ready!==true)throw Error('The hosted analysis server is not ready.');
 }
 console.log('Frontend deployment settings passed.');
}
