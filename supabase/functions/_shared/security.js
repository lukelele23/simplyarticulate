import {billingError,limitedBody} from './billingCore.js';

// Log only an allowlisted envelope, never exception messages or request data.
export function securityEvent(kind,status,requestId=crypto.randomUUID(),sink=console.warn,category){
 sink(JSON.stringify({event:kind,status,requestId,...(category?{category}:{})}));
}
export function failureCategory(error){
 if(error?.category==='database')return 'database';
 if(typeof error?.code==='string')return new Set(['forbidden','not_found','entity_not_found','authentication_invalid','authentication_missing','authentication_malformed','rate_limit','rate_limit_exceeded']).has(error.code)?'paddle_'+error.code:'provider_error';
 if(error instanceof TypeError)return 'integration_contract';
 if(error?.status===408||error?.message==='Billing request timed out.')return 'timeout';
 if(error?.message==='Set PADDLE_API_KEY on the server.')return 'configuration';
 return 'reconciliation';
}
export function securityFailure(kind,error){securityEvent(kind,error?.status||503,crypto.randomUUID(),console.warn,failureCategory(error));}
export async function billingRate(db,key,limit){
 const result=await db.rpc('billing_rate',{p_key:key,p_limit:limit});
 if(result.error)throw billingError('Billing is temporarily unavailable.',503);
 if(result.data!==true)throw billingError('Please wait before trying again.',429);
}
export async function authRate(db,token){
 // A global ceiling also bounds Auth calls from attackers rotating fake tokens.
 await billingRate(db,'auth:global',600);
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
 const fingerprint=Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('');
 await billingRate(db,'auth:'+fingerprint,30);
}
export async function deletionBody(request){
 if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw billingError('Use application/json.',415);
 let body;
 try{body=JSON.parse(await limitedBody(request,2048));}catch(error){if(error.status)throw error;throw billingError('Invalid deletion request.',400);}
 if(!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).some(k=>!['operationId','confirmation'].includes(k))
  ||!/^\b[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b$/i.test(body.operationId||'')
  ||typeof body.confirmation!=='string'||body.confirmation.length>320)throw billingError('Invalid deletion request.',400);
 return body;
}
