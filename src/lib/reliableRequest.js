function pause(ms,signal){
 return new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(signal.reason);return;}
  const abort=()=>{clearTimeout(timer);reject(signal.reason);};
  const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);
  signal?.addEventListener('abort',abort,{once:true});
 });
}

// Retry only safe reads or explicitly idempotent writes after an ambiguous connection loss.
export async function reliableRequest(url,options={},settings={}){
 const {fetchImpl=fetch,wait=pause,timeoutMs=30000,retries=2,retryResponses=true}=settings;
 const retryNetwork=settings.retryNetwork??(!options.method||options.method==='GET');
 for(let attempt=0;;attempt++){
  options.signal?.throwIfAborted();
  let response;
  try{
   const timeout=AbortSignal.timeout(timeoutMs);
   response=await fetchImpl(url,{...options,signal:options.signal?AbortSignal.any([options.signal,timeout]):timeout});
  }catch(error){
   if(options.signal?.aborted||!retryNetwork||attempt>=retries||!['TypeError','TimeoutError'].includes(error.name))throw error;
   await wait(500*2**attempt,options.signal);continue;
  }
  if(!retryResponses||![408,429,500,502,503,504].includes(response.status)||attempt>=retries)return response;
  const retryAfter=response.headers?.get('Retry-After');
  const delay=retryAfter?Math.max(0,Number.isFinite(Number(retryAfter))?Number(retryAfter)*1000:Date.parse(retryAfter)-Date.now()):500*2**attempt;
  // Respect long provider delays by leaving recovery to a later explicit retry.
  if(!Number.isFinite(delay)||delay>5000)return response;
  await response.body?.cancel();
  await wait(delay,options.signal);
 }
}
