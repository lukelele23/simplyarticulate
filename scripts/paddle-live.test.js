import test from 'node:test';
import assert from 'node:assert/strict';
import {enforcePaddleSource,paddleIps} from '../supabase/functions/_shared/paddleSource.js';
import {billingConfig,paddleClient,ready} from '../supabase/functions/_shared/billingCore.js';
test('live configuration fails closed until explicit release approval and calls the live API',async()=>{
 const config=billingConfig({BILLING_ENVIRONMENT:'production',BILLING_ENABLED:'true',PADDLE_API_KEY:'key',PADDLE_CLIENT_TOKEN:'live_token'});
 assert.equal(ready(config),false);
 let url;await paddleClient(config,async value=>{url=value;return Response.json({data:{id:'example'}});})('/products');
 assert.equal(url,'https://api.paddle.com/products');
});
test('IP allowlist refreshes from data.ipv4_cidrs and rejects spoofed or non-Paddle traffic',async()=>{
 let calls=0;const mock=async()=>{calls++;return Response.json({data:{ipv4_cidrs:['192.0.2.1/32']}});};
 const config={webhookIngressToken:'a'.repeat(40)};
 await assert.rejects(()=>enforcePaddleSource(new Request('https://test',{headers:{'x-forwarded-for':'192.0.2.1'}}),config,mock),/Untrusted/);
 await enforcePaddleSource(new Request('https://test',{headers:{'x-sa-webhook-ingress':config.webhookIngressToken,'x-sa-webhook-source-ip':'192.0.2.1'}}),config,mock);
 await assert.rejects(()=>enforcePaddleSource(new Request('https://test',{headers:{'x-sa-webhook-ingress':config.webhookIngressToken,'x-sa-webhook-source-ip':'203.0.113.1'}}),config,mock),/Source not allowed/);
 assert.equal(calls,1);
 await assert.rejects(()=>paddleIps(async()=>{throw Error('offline');},Date.now()+360000),/offline/);
});
