// Run directly on a public TLS reverse proxy host whose socket peer is the actual sender.
// If another proxy terminates connections, enforce IP filtering at that outermost proxy instead.
import https from 'node:https';
import {readFileSync} from 'node:fs';
import {paddleIps,normalizeIp} from '../supabase/functions/_shared/paddleSource.js';
const {PADDLE_WEBHOOK_UPSTREAM,PADDLE_WEBHOOK_INGRESS_TOKEN,TLS_KEY_FILE,TLS_CERT_FILE}=process.env;
if(!PADDLE_WEBHOOK_INGRESS_TOKEN||PADDLE_WEBHOOK_INGRESS_TOKEN.length<32)throw Error('Set a private ingress token of at least 32 characters');
const upstream=new URL(PADDLE_WEBHOOK_UPSTREAM);
if(upstream.protocol!=='https:'||!upstream.hostname.endsWith('.supabase.co')||upstream.pathname!=='/functions/v1/billing-webhook')throw Error('Invalid upstream');
https.createServer({key:readFileSync(TLS_KEY_FILE),cert:readFileSync(TLS_CERT_FILE)},async(req,res)=>{
 try{
  if(req.method!=='POST'||req.url!=='/paddle/webhook'){res.writeHead(404).end();return;}
  if(!(await paddleIps()).has(normalizeIp(req.socket.remoteAddress))){res.writeHead(403).end();return;}
  let size=0;const chunks=[];
  for await(const chunk of req){size+=chunk.length;if(size>131072){res.writeHead(413).end();return;}chunks.push(chunk);}
  const response=await fetch(upstream,{method:'POST',body:Buffer.concat(chunks),signal:AbortSignal.timeout(15000),headers:{
   'content-type':'application/json','paddle-signature':req.headers['paddle-signature']||'',
   'x-sa-webhook-ingress':PADDLE_WEBHOOK_INGRESS_TOKEN,'x-sa-webhook-source-ip':normalizeIp(req.socket.remoteAddress)}});
  res.writeHead(response.status,{'cache-control':'no-store'}).end(await response.text());
 }catch{res.writeHead(503).end('Webhook unavailable');}
}).listen(Number(process.env.PORT||443));
