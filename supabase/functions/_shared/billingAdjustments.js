import {billingError,checked} from './billingCore.js';

const validId=(value,prefix)=>new RegExp('^'+prefix+'_[a-z0-9]{26}$').test(value||'');
const timestamp=value=>{if(!Number.isFinite(Date.parse(value)))throw billingError('Invalid adjustment timestamp.');return value;};

// These are canonical SDK objects, not untrusted notification payloads.
export async function adjustmentSnapshots(sdk,subscription){
 const result=[];const transactions=new Map();const deadline=Date.now()+11000;
 const collection=sdk.adjustments.list({subscriptionId:[subscription.id],perPage:50});
 for await(const adjustment of collection){
  if(Date.now()>deadline)throw billingError('Adjustment reconciliation timed out.');
  if(result.length>=500)throw billingError('Adjustment reconciliation requires review.');
  if(!validId(adjustment.id,'adj')||!validId(adjustment.transactionId,'txn')||adjustment.subscriptionId!==subscription.id
   ||adjustment.customerId!==subscription.customerId
   ||!['credit','credit_reverse','refund','chargeback','chargeback_reverse','chargeback_warning','chargeback_warning_reverse'].includes(adjustment.action)
   ||!['full','partial'].includes(adjustment.type)||!['approved','pending_approval','rejected','reversed'].includes(adjustment.status))throw billingError('Invalid adjustment ownership or state.');
  let transaction=transactions.get(adjustment.transactionId);
  if(!transaction){transaction=await sdk.transactions.get(adjustment.transactionId);transactions.set(adjustment.transactionId,transaction);}
  if(transaction.id!==adjustment.transactionId||transaction.customerId!==subscription.customerId||transaction.subscriptionId!==subscription.id)throw billingError('Adjustment transaction ownership mismatch.');
  const amount=adjustment.totals?.total,total=transaction.details?.totals?.total;
  if(!/^\d{1,30}$/.test(amount||'')||!/^\d{1,30}$/.test(total||'')||BigInt(total)<=0n)throw billingError('Invalid adjustment amounts.');
  result.push({id:adjustment.id,transaction_id:transaction.id,subscription_id:subscription.id,customer_id:subscription.customerId,
   action:adjustment.action,type:adjustment.type,status:adjustment.status,amount,transaction_total:total,
   created_at:timestamp(adjustment.createdAt),updated_at:timestamp(adjustment.updatedAt),
   period_start:transaction.billingPeriod?.startsAt?timestamp(transaction.billingPeriod.startsAt):null,
   period_end:transaction.billingPeriod?.endsAt?timestamp(transaction.billingPeriod.endsAt):null});
  if(Date.now()>deadline)throw billingError('Adjustment reconciliation timed out.');
 }
 return result;
}

export async function syncAdjustmentEvent(db,sdk,id,config,syncSubscription,sdkCall){
 // Paddle exposes adjustment lookup via a filtered list, not a GET-by-ID endpoint.
 const rows=await sdkCall(sdk.adjustments.list({id:[id],perPage:1}).next());
 const a=rows[0];
 if(rows.length!==1||a.id!==id||!validId(a.customerId,'ctm')||!validId(a.transactionId,'txn'))throw billingError('Adjustment identity mismatch.');
 const transaction=await sdkCall(sdk.transactions.get(a.transactionId));
 if(transaction.id!==a.transactionId||transaction.customerId!==a.customerId||transaction.subscriptionId!==a.subscriptionId)throw billingError('Adjustment ownership mismatch.');
 // A non-subscription purchase has no subscription entitlement to alter.
 if(a.subscriptionId){
  await syncSubscription(db,sdk,a.subscriptionId,config);
  const row=await checked(db.from('billing_adjustments').select('paddle_adjustment_id').eq('paddle_adjustment_id',id).maybeSingle());
  if(!row)throw billingError('Adjustment list is not yet consistent; retry reconciliation.');
 }
}
