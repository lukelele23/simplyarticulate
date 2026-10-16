import {useCallback,useEffect,useRef,useState} from 'react';
import {billingRequest as requestBilling} from '../lib/paddlePricing.js';
import './billingPanel.css';

const sandbox=import.meta.env.VITE_PADDLE_ENVIRONMENT==='sandbox';
const enabled=import.meta.env.VITE_BILLING_ENABLED==='true';
export default function BillingPanel({user,onSignUp}){
 const [status,setStatus]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const version=useRef(0);
 const refresh=useCallback(async()=>{
  const current=version.current;
  try{const result=await requestBilling('status');if(current===version.current){setStatus(result);setError('');}}
  catch(cause){if(current===version.current)setError(cause.message);}
 },[]);
 useEffect(()=>{
  version.current++;setStatus(null);setError('');setMessage('');
  if(!enabled||!user)return;
  if(location.pathname==='/welcome')setMessage('Waiting for verified subscription status…');
  refresh();const focus=()=>refresh();window.addEventListener('focus',focus);
  return()=>{version.current++;window.removeEventListener('focus',focus);};
 },[user?.id,refresh]);
 useEffect(()=>{
  if(!message||!enabled||!user)return;
  let count=0;const timer=setInterval(()=>{refresh();if(++count===6)clearInterval(timer);},5000);
  return()=>clearInterval(timer);
 },[message,user?.id,refresh]);
 async function run(action){
  if(busy)return;setBusy(true);setError('');
  try{
   const data=await requestBilling(action);
   if(action==='portal'){window.location.assign(data.url);return;}
   window.location.assign('/subscription');
  }catch(cause){setError(cause.message);}finally{setBusy(false);}
 }
 useEffect(()=>{const complete=()=>{setMessage('Checkout received. Waiting for verified subscription status…');refresh();};
  window.addEventListener('sa-billing-completed',complete);return()=>window.removeEventListener('sa-billing-completed',complete);},[refresh]);
 return <section className="billing-panel" aria-label="Subscription and billing">
  <div className="billing-panel-heading"><h3>SimplyArticulate Pro</h3><span>{enabled?(sandbox?'Sandbox':'Pro'):'Coming soon'}</span></div>
  {!enabled?<p>Subscriptions are being prepared. Your current practice access stays available.</p>:<>
   {sandbox&&<p className="billing-test-notice">Test mode · No real payments</p>}
   {!user?<button type="button" onClick={onSignUp}>Sign in to view your plan</button>:<>
    <p>Plan: {status?.plan&&status.plan!=='free'?status.plan[0].toUpperCase()+status.plan.slice(1)+(sandbox?' (test)':''):'Free'}{status&&status.status!=='free'?` · ${status.status.replace('_',' ')}`:''}</p>
    {status?.periodEnd&&<p>Current period ends {new Date(status.periodEnd).toLocaleDateString()}.</p>}
    {status?.scheduledChange?.action==='cancel'&&<p>Cancellation scheduled for {new Date(status.scheduledChange.effective_at).toLocaleDateString()}.</p>}
    {status?.pending&&<p>A previous checkout is being verified. Contact support if it stays pending.</p>}
    <div className="billing-panel-actions">
     {status?.canCheckout&&!status.pending&&<button disabled={busy} type="button" onClick={()=>window.location.assign('/subscription')}>View plans</button>}
     {status?.canManage&&<button disabled={busy} type="button" onClick={()=>run('portal')}>Manage billing</button>}
     <button disabled={busy} type="button" onClick={refresh}>Refresh status</button>
    </div>
   </>}
  </>}
  {error&&<p role="alert">{error}</p>}
  {message&&<p role="status">{status?.plan&&status.plan!=='free'?'Your subscription is verified.':message}</p>}
 </section>;
}
