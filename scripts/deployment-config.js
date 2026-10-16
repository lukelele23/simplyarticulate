import path from 'node:path';
import {MAIN_VIEWS,screenPaths} from '../src/lib/navigation.js';
function httpsUrl(value,label){try{return new URL(value);}catch{throw Error(`Set a valid HTTPS ${label}.`);}}

export function deploymentSettings(env){
 const service=env.VITE_ANALYSIS_SERVICE||'supabase';
 if(!['supabase','node'].includes(service))throw Error('Choose supabase or node for the production analysis service.');
 const required=['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY',...(service==='node'?['ANALYSIS_BACKEND_URL']:[])];
 for(const name of required)if(!env[name]?.trim())throw Error(`Set ${name} before preparing the Netlify deployment.`);
 for(const name of required)if(/YOUR-|PLACEHOLDER|REPLACE_ME/i.test(env[name]))throw Error(`Replace the example value for ${name} before deployment.`);
 const supabase=httpsUrl(env.VITE_SUPABASE_URL,'Supabase URL');
 if(supabase.protocol!=='https:')throw Error('The production Supabase URL must use HTTPS.');
 const key=env.VITE_SUPABASE_PUBLISHABLE_KEY;
 if(key.startsWith('sb_secret_'))throw Error('Use a Supabase publishable key in the frontend, never a secret key.');
 if(key.split('.').length===3){try{if(JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role==='service_role')throw Error('Use a publishable key, never a Supabase service-role key.');}catch(error){if(error.message.includes('service-role'))throw error;}}
 for(const name of Object.keys(env))if(/^VITE_.*(GEMINI|ASSEMBLYAI|SERVICE_ROLE|SECRET|PADDLE.*API.*KEY)/i.test(name)&&env[name])throw Error(`Remove ${name} from frontend variables; provider secrets belong only on the backend.`);
 if(service==='supabase')return {service,backend:`${supabase.origin}/functions/v1/speech-api`};
 const backend=httpsUrl(env.ANALYSIS_BACKEND_URL,'backend URL');
 if(backend.protocol!=='https:'||backend.username||backend.password||backend.search||backend.hash||backend.pathname!=='/'||/^(localhost|127\.|0\.|10\.|192\.168\.|\[::1\])/i.test(backend.hostname)||['simplyarticulate.com','www.simplyarticulate.com'].includes(backend.hostname)||backend.hostname.endsWith('.example')||backend.hostname==='example.com')throw Error('ANALYSIS_BACKEND_URL must be the real HTTPS origin of the hosted analysis server, not localhost, a placeholder, or the frontend domain.');
 for(const name of ['URL','DEPLOY_PRIME_URL'])if(env[name]&&httpsUrl(env[name],'frontend URL').origin===backend.origin)throw Error('The frontend and backend origins must differ to avoid a proxy loop.');
 return {service,backend:backend.origin};
}
export function netlifyRedirects(backend){
 const routes=[...new Set(Object.values(screenPaths))].filter(route=>!MAIN_VIEWS.includes(route.slice(1))).flatMap(route=>[`${route} /index.html 200`,`${route}/ /index.html 200`]).join('\n');
 const information=["about","guides","privacy","terms","support"].flatMap(page=>[`/${page} /${page}/index.html 200`,`/${page}/ /${page}/index.html 200`]).join("\n");
 const views=MAIN_VIEWS.map(view=>`/${view} /${view}/index.html 200`).join('\n');
 return `/api/paddle-context /.netlify/functions/paddle-context 200!\n/api/analysis ${backend}/api/analysis 200!\n/api/analysis/* ${backend}/api/analysis/:splat 200!\n/api/* /api-unavailable.json 404!\n${views}\n${routes}\n${information}\n/* /404.html 404\n`;
}
export function validateBackendEnvironment(env){
 for(const name of ['ASSEMBLYAI_API_KEY','GEMINI_API_KEY','SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','AI_DATA_DIR'])if(!env[name]?.trim())throw Error(`Set ${name} on the analysis server.`);
 if(env.AI_ENABLED!=='true'||env.AI_DEMO_MODE==='true')throw Error('The hosted backend must enable live analysis and disable demo mode.');
 if(!path.isAbsolute(env.AI_DATA_DIR))throw Error('AI_DATA_DIR must be an absolute path on a persistent writable disk.');
 if(httpsUrl(env.SUPABASE_URL,'Supabase URL').protocol!=='https:')throw Error('Use an HTTPS Supabase URL on the backend.');
}
