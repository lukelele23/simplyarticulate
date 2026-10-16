import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {countryCode,detectedCountry,paddleSettings,pricingTiers,previewRequest,previewPrices,checkoutOptions} from './pricingModel.js';
import contextEndpoint from '../../netlify/functions/paddle-context.mjs';
import {routeFor} from './navigation.js';
import {netlifyRedirects} from '../../scripts/deployment-config.js';
const price='pri_'+'a'.repeat(26),transaction='txn_'+'a'.repeat(26);
const env={VITE_PADDLE_ENVIRONMENT:'sandbox',VITE_PADDLE_CLIENT_TOKEN:'test_public_token'};
test('Paddle environment and token are explicit, environment-matched and public',()=>{
 assert.throws(()=>paddleSettings({}),/VITE_PADDLE_ENVIRONMENT/);
 assert.throws(()=>paddleSettings({...env,VITE_PADDLE_ENVIRONMENT:'production'}),/public client-side token/);
 assert.deepEqual(paddleSettings({VITE_PADDLE_ENVIRONMENT:'production',VITE_PADDLE_CLIENT_TOKEN:'live_public'}),{token:'live_public'});
 assert.throws(()=>paddleSettings({...env,VITE_PADDLE_CLIENT_TOKEN:'pdl_server_secret'}),/public client-side token/);
 assert.deepEqual(paddleSettings(env),{environment:'sandbox',token:'test_public_token'});
 const tiers=pricingTiers({VITE_PADDLE_PRO_MONTH_PRICE_ID:price});assert.equal(tiers.length,1);assert.equal(tiers[0].name,'Pro');assert.equal(tiers[0].priceId.month,price);
 assert.equal(tiers[0].priceId.year,'');
});
test('country detection only passes real country codes; absence and sentinels use Paddle IP detection',()=>{
 assert.equal(countryCode('OTHERS'),undefined);assert.equal(countryCode('ZZ'),undefined);assert.equal(countryCode('gb'),'GB');
 assert.equal(detectedCountry(new Headers({'x-vercel-ip-country':'IE'})),'IE');
 assert.equal(detectedCountry(new Headers({'x-vercel-ip-country':'GB'}),{country:{code:'AU'}}),'AU');
 assert.deepEqual(previewRequest([price],'OTHERS'),{items:[{priceId:price,quantity:1}]});
 assert.deepEqual(previewRequest([price],undefined),{items:[{priceId:price,quantity:1}]});
 assert.equal(previewRequest([price],'IE').address.countryCode,'IE');
});
test('server country endpoint is uncached, omits absent country and exposes no configuration',async()=>{
 const response=await contextEndpoint(new Request('https://site/api/paddle-context'),{});
 assert.deepEqual(await response.json(),{});assert.equal(response.headers.get('cache-control'),'private, no-store');
 const gb=await contextEndpoint(new Request('https://site/api/paddle-context',{headers:{'x-vercel-ip-country':'GB'}}),{});
 assert.deepEqual(await gb.json(),{countryCode:'GB'});
 assert.equal((await contextEndpoint(new Request('https://site/api/paddle-context',{method:'POST'}),{})).status,405);
});
test('formattedTotals are preserved byte-for-byte and missing or nontrial catalog data blocks Subscribe',()=>{
 const response={data:{address:{countryCode:'IE'},details:{lineItems:[{price:{id:price,trialPeriod:{interval:'day',frequency:3}},formattedTotals:{total:'6,99 €'}}]}}};
 assert.equal(previewPrices(response,[price])[price].total,'6,99 €');
 assert.throws(()=>previewPrices(response,['pri_'+'b'.repeat(26)]),/formatted price/);
 response.data.details.lineItems[0].price.trialPeriod=null;assert.throws(()=>previewPrices(response,[price]),/three-day/);
});
test('one-page overlay uses the exact server-bound price, signed-in email, country and /welcome',()=>{
 const opts=checkoutOptions({transactionId:transaction,priceId:price,requestedPriceId:price,preview:{total:'£4.99',country:'GB'},user:{email:'tester@example.com'},origin:'http://localhost:5173'});
 assert.equal(opts.transactionId,transaction);assert.equal(opts.settings.displayMode,'overlay');assert.equal(opts.settings.variant,'one-page');
 assert.equal(opts.settings.successUrl,'http://localhost:5173/welcome');assert.equal(opts.customer.email,'tester@example.com');assert.equal(opts.customer.address.countryCode,'GB');
 assert.throws(()=>checkoutOptions({transactionId:transaction,priceId:'different',requestedPriceId:price,preview:{total:'£4.99'},origin:'http://localhost:5173'}),/does not match/);
 assert.equal(routeFor('/welcome').screen,'welcome');
 const routes=netlifyRedirects('https://backend.example');assert.ok(routes.indexOf('/api/paddle-context')<routes.indexOf('/api/*'));assert.ok(routes.includes('/welcome /index.html 200'));
});
test('pricing display never performs currency math or formats Paddle strings and imports no server key',()=>{
 const page=readFileSync(new URL('../components/PricingCards.jsx',import.meta.url),'utf8');
 assert.ok(!page.includes('Intl.NumberFormat'));assert.ok(!page.includes('PADDLE_API_KEY'));assert.ok(!page.includes('unitPrice.amount'));
});
