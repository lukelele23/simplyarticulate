export function row(value){return Array.isArray(value)?value[0]:value;}
export async function rpc(db,name,args={}){const {data,error}=await db.rpc(name,args);if(error)throw error;return data;}
export function publicJob(job){const result=job.result?{...job.result}:null;if(result)delete result.verification;return {id:job.id,status:job.status,result,error:job.error||null};}
export function safeError(error){const match=String(error?.message||'').match(/SA(400|401|403|404|409|429):([^\n]+)/);return match?{status:Number(match[1]),message:match[2].trim()}:{status:503,message:'The analysis service is temporarily unavailable. Your recording is still available.'};}
