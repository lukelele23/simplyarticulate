import {paddlePublicConfig} from '../lib/paddlePublicConfig.js';
import {useEffect,useMemo,useRef,useState} from 'react';
import {paddleSettings,pricingTiers,priceIdValid,previewRequest,previewPrices,checkoutOptions} from '../lib/pricingModel.js';
import {getPaddle,billingRequest} from '../lib/paddlePricing.js';
import './pricingCards.css';

export default function PricingCards({country,user,onSignUp,locationReady=true}){
 const [interval,setInterval]=useState('month'),[prices,setPrices]=useState({}),[loading,setLoading]=useState(true);
 const [error,setError]=useState(''),[opening,setOpening]=useState(''),[retry,setRetry]=useState(0);
 const checkoutEnabled=import.meta.env.VITE_BILLING_ENABLED==='true';
 const sequence=useRef(0),selected=useRef({});
 const tiers=useMemo(()=>pricingTiers(paddlePublicConfig),[]);
 let configurationError='';try{paddleSettings(paddlePublicConfig);}catch(cause){configurationError=cause.message;}
 useEffect(()=>{
  const ticket=++sequence.current;let canceled=false;setPrices({});setError('');setLoading(true);
  if(configurationError){setLoading(false);return;}
  if(!locationReady)return;
  const ids=tiers.map(t=>t.priceId[interval]).filter(priceIdValid);
  if(new Set(ids).size!==ids.length){setError('Each plan needs its own distinct Paddle price ID.');setLoading(false);return;}
  if(!ids.length){setLoading(false);return;}
  (user&&checkoutEnabled?billingRequest('status').then(status=>{if(canceled)throw Error('Selection changed');if(status.environment!==paddlePublicConfig.VITE_PADDLE_ENVIRONMENT)throw Error('Frontend and billing-server environments do not match.');return getPaddle(status.paddleCustomerId||null);}):getPaddle(null)).then(async paddle=>previewPrices(await paddle.PricePreview(previewRequest(ids,country)),ids))
   .then(next=>{if(!canceled&&ticket===sequence.current)setPrices(next);})
   .catch(cause=>{if(!canceled&&ticket===sequence.current)setError(cause.message||'Prices could not be loaded.');})
   .finally(()=>{if(!canceled&&ticket===sequence.current)setLoading(false);});
  return()=>{canceled=true;};
 },[country,interval,tiers,retry,configurationError,locationReady,user?.id]);
 selected.current={interval,userId:user?.id};
 useEffect(()=>{const listener=event=>{if(['checkout.closed','checkout.completed','checkout.error'].includes(event.detail?.name))setOpening('');
  if(event.detail?.name==='checkout.error')setError('Checkout could not finish. Close it and try again.');};
  window.addEventListener('sa-paddle-event',listener);return()=>window.removeEventListener('sa-paddle-event',listener);},[]);
 async function subscribe(tier){
  if(opening||!checkoutEnabled)return;
  if(!user){try{sessionStorage.setItem('sa-sign-in-return','/subscription');}catch{}onSignUp?.();return;}
  const priceId=tier.priceId[interval],preview=prices[priceId],selection=interval,owner=user.id;
  setOpening(tier.name);setError('');
  try{
   const config=paddleSettings(paddlePublicConfig);
   const result=await billingRequest('checkout',{priceId});
   if(selected.current.interval!==selection||selected.current.userId!==owner)throw new Error('Your selection changed. Please choose a plan again.');
   if(result.environment!==(config.environment||'production')||result.clientToken!==config.token)throw new Error('Frontend and billing-server Paddle configuration do not match.');
   const paddle=await getPaddle(result.paddleCustomerId);
   paddle.Checkout.open(checkoutOptions({...result,requestedPriceId:priceId,preview,user,country,origin:location.origin}));
  }catch(cause){setError(cause.message||'Checkout could not open.');setOpening('');}
 }
 return <section className="pricing-section" aria-labelledby="pricing-heading">
  <header className="pricing-intro"><span className="pricing-mode">{paddlePublicConfig.VITE_PADDLE_ENVIRONMENT==='sandbox'?'Sandbox · Test payments only':'SimplyArticulate Pro'}</span><h2 id="pricing-heading">Make speaking practice a habit.</h2><p>Get Pro with a three-day free trial. Choose monthly or yearly billing.</p></header>
  <div className="pricing-interval" role="group" aria-label="Billing interval">
   <button type="button" aria-pressed={interval==='month'} disabled={Boolean(opening)} onClick={()=>setInterval('month')}>Monthly</button>
   <button type="button" aria-pressed={interval==='year'} disabled={Boolean(opening)} onClick={()=>setInterval('year')}>Yearly</button>
  </div>
  {configurationError&&<p className="pricing-error" role="alert">Checkout configuration required: {configurationError}</p>}
  {error&&<div className="pricing-error" role="alert"><p>{error}</p><button type="button" disabled={Boolean(opening)} onClick={()=>setRetry(n=>n+1)}>Reload prices</button></div>}
  <div className="pricing-grid" aria-busy={loading}>
   {tiers.map(tier=>{const id=tier.priceId[interval],price=prices[id],configured=priceIdValid(id);
    return <article className={'pricing-tier'+(tier.name==='Pro'?' pricing-tier-featured':'')} key={tier.name}>
     <header><h3>{tier.name}</h3><p>{tier.description}</p></header>
     <div className="pricing-amount" aria-live="polite">{price?<><strong>{price.total}</strong><span>per {interval==='month'?'month':'year'}</span></>:<span>{!configured?'Price not configured':loading?'Loading price…':'Price unavailable'}</span>}</div>
     <p className="pricing-trial">3 days free, then billed {interval==='month'?'monthly':'yearly'}. Cancel before the trial ends to avoid renewal.</p>
     <ul>{tier.features.map(feature=><li key={feature}>{feature}</li>)}</ul>
     <button type="button" className="pricing-subscribe" aria-label={`Subscribe to ${tier.name}`} disabled={!checkoutEnabled||!price||loading||Boolean(opening)||Boolean(configurationError)} onClick={()=>subscribe(tier)}>{!checkoutEnabled?'Coming soon':opening===tier.name?'Opening checkout…':'Subscribe'}</button>
    </article>;
   })}
  </div>
  <p className="pricing-footnote">Prices are supplied by Paddle for your location. Checkout confirms taxes and your billing address. <a href="/refunds/">Refund and cancellation policy</a>.</p>
 </section>;
}
