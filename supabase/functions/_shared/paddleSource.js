let snapshot,expires=0,pending;
export async function paddleIps(fetchImpl=fetch,now=Date.now()){
 if(snapshot&&now<expires)return snapshot;
 if(!pending)pending=(async()=>{
  const response=await fetchImpl('https://api.paddle.com/ips',{signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw Error('Paddle IP service unavailable');
  const cidrs=(await response.json())?.data?.ipv4_cidrs;
  if(!Array.isArray(cidrs)||!cidrs.length||cidrs.some(c=>!/^\d{1,3}(\.\d{1,3}){3}\/32$/.test(c)||c.split('/')[0].split('.').some(n=>+n>255)))throw Error('Invalid Paddle IP response');
  snapshot=new Set(cidrs.map(c=>c.slice(0,-3)));expires=now+300000;return snapshot;
 })().finally(()=>{pending=undefined;});
 return pending;
}
export function normalizeIp(ip){return ip?.startsWith('::ffff:')?ip.slice(7):ip;}
/** Only the ingress gateway can assert the socket peer IP; forwarded headers alone are untrusted. */
export async function enforcePaddleSource(request,config,fetchImpl=fetch){
 const token=config.webhookIngressToken;
 if(!token||token.length<32||request.headers.get('x-sa-webhook-ingress')!==token)throw Object.assign(Error('Untrusted webhook ingress'),{status:403});
 const ip=normalizeIp(request.headers.get('x-sa-webhook-source-ip'));
 if(!(await paddleIps(fetchImpl)).has(ip))throw Object.assign(Error('Source not allowed'),{status:403});
}
