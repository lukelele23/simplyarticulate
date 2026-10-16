import {useEffect,useState} from 'react';
import PricingCards from '../components/PricingCards.jsx';
import BillingPanel from '../components/BillingPanel.jsx';
import {countryCode} from '../lib/pricingModel.js';
export default function SubscriptionScreen({user,onSignUp}){
 const [context,setContext]=useState({ready:false});
 useEffect(()=>{const controller=new AbortController();
  fetch('/api/paddle-context',{signal:controller.signal,cache:'no-store'}).then(async r=>r.ok?r.json():{}).then(data=>setContext({ready:true,country:countryCode(data.countryCode)})).catch(()=>{if(!controller.signal.aborted)setContext({ready:true});});
  return()=>controller.abort();
 },[]);
 return <div className="grid gap-6"><PricingCards country={context.country} locationReady={context.ready} user={user} onSignUp={onSignUp}/>{user&&<BillingPanel user={user} onSignUp={onSignUp}/>}</div>;
}
