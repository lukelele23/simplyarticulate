import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
import {createSpeechApi} from '../_shared/api.js';
declare const EdgeRuntime:{waitUntil:(promise:Promise<unknown>)=>void};
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(15000)})}});
Deno.serve(createSpeechApi(db,Deno.env,(promise:Promise<unknown>)=>EdgeRuntime.waitUntil(promise)));
