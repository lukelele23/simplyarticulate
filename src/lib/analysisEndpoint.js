export function analysisEndpoint(endpoint,env){
 const mode=env.VITE_ANALYSIS_SERVICE||'local';
 if(mode==='supabase'){
  const origin=new URL(env.VITE_SUPABASE_URL).origin;
  return `${origin}/functions/v1/speech-api/api/analysis${endpoint}`;
 }
 return `/api/analysis${endpoint}`;
}
