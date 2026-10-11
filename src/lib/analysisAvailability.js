// Ignore checks cancelled by an effect cleanup, including React's development remount.
export function checkAnalysisAvailability(request,callbacks,timeoutMs=15000){
 const controller=new AbortController();let active=true;
 const timeout=setTimeout(()=>controller.abort(),timeoutMs);
 Promise.resolve().then(()=>{
  if(!active)return;
  return request('/config',{signal:controller.signal});
 }).then(value=>{if(active&&!controller.signal.aborted)callbacks.ready(value);})
 .catch(error=>{if(active)callbacks.failed(error);})
 .finally(()=>{clearTimeout(timeout);if(active)callbacks.finished();});
 return()=>{active=false;clearTimeout(timeout);controller.abort();};
}
