import {paddlePublicConfig} from './paddlePublicConfig.js';
import {paddleSettings} from './pricingModel.js';
import {supabase} from '../../utils/supabase.js';
let instance;
export async function getPaddle(paddleCustomerId){
 const config=paddleSettings(paddlePublicConfig);
 if(!instance)instance=import('@paddle/paddle-js').then(({initializePaddle})=>initializePaddle({...config,...(/^ctm_[a-z0-9]{26}$/.test(paddleCustomerId||'')?{pwCustomer:{id:paddleCustomerId}}:{}),eventCallback:event=>{
  window.dispatchEvent(new CustomEvent('sa-paddle-event',{detail:{name:event.name}}));
 }})).then(paddle=>{if(!paddle)throw new Error('Paddle could not be initialized.');return paddle;}).catch(error=>{instance=null;throw error;});
 const paddle=await instance;
 if(paddleCustomerId!==undefined){if(paddleCustomerId!==null&&!/^ctm_[a-z0-9]{26}$/.test(paddleCustomerId))throw new Error('Invalid Paddle customer ID.');paddle.Update({pwCustomer:paddleCustomerId?{id:paddleCustomerId}:{}});}
 return paddle;
}
export async function billingRequest(action,extra={}){
 const {data,error}=await supabase.functions.invoke('billing-api',{body:{action,...extra}});
 if(error||data?.error){let message=data?.error;if(!message&&error?.context)try{message=(await error.context.json()).error;}catch{}
  throw new Error(message||'Billing is unavailable. Please try again.');}
 return data;
}
