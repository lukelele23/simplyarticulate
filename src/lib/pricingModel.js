/** @typedef {{name:string,description:string,features:string[],priceId:{month:string,year:string}}} Tier */
const codes=new Set('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW XK'.split(' '));
export function countryCode(value){const code=typeof value==='string'?value.trim().toUpperCase():'';return codes.has(code)?code:undefined;}
export function detectedCountry(headers,geo){return countryCode(geo?.country?.code)||countryCode(headers?.get?.('x-vercel-ip-country'))||countryCode(headers?.get?.('x-country'));}
export function paddleSettings(env){
 const environment=env.VITE_PADDLE_ENVIRONMENT;
 if(!environment)throw new Error('Set VITE_PADDLE_ENVIRONMENT explicitly before loading Paddle.');
 if(!['sandbox','production'].includes(environment))throw new Error('Use sandbox or production for VITE_PADDLE_ENVIRONMENT.');
 const token=env.VITE_PADDLE_CLIENT_TOKEN;
 if(!token?.startsWith(environment==='sandbox'?'test_':'live_'))throw new Error('Set VITE_PADDLE_CLIENT_TOKEN to the matching public client-side token.');
 return environment==='sandbox'?{environment,token}:{token};
}
/** Edit names, descriptions and feature copy here. Price amounts always come from Paddle. @returns {Tier[]} */
export function pricingTiers(env){
 return [
  {name:'Pro',description:'Practice with a clear next step.',features:['Speech coaching and focused retries','Personal learning focuses'],priceId:{month:env.VITE_PADDLE_PRO_MONTH_PRICE_ID||'',year:env.VITE_PADDLE_PRO_YEAR_PRICE_ID||''}},
 ];
}
export function priceIdValid(value){return /^pri_[a-z0-9]{26}$/.test(value||'');}
export function previewRequest(priceIds,country){
 const items=priceIds.map(priceId=>{if(!priceIdValid(priceId))throw new Error('A Paddle price ID is missing or invalid.');return {priceId,quantity:1};});
 const detected=countryCode(country);return {items,...(detected?{address:{countryCode:detected}}:{})};
}
export function previewPrices(response,ids){
 const lines=response?.data?.details?.lineItems||[];
 return Object.fromEntries(ids.map(id=>{
  const line=lines.find(item=>item.price?.id===id);
  if(!line||typeof line.formattedTotals?.total!=='string'||!line.formattedTotals.total)throw new Error('Paddle did not return a formatted price for every selected plan.');
  const trial=line.price.trialPeriod;
  if(trial?.interval!=='day'||trial.frequency!==3)throw new Error('Configure a three-day free trial on each Paddle price.');
  return [id,{total:line.formattedTotals.total,country:countryCode(response.data.address?.countryCode)}];
 }));
}
export function checkoutOptions({transactionId,priceId,requestedPriceId,preview,user,country,origin}){
 if(!/^txn_[a-z0-9]{26}$/.test(transactionId||'')||priceId!==requestedPriceId||!preview?.total)throw new Error('Checkout does not match the displayed plan. Refresh prices and try again.');
 const detected=countryCode(preview.country)||countryCode(country);
 return {transactionId,settings:{displayMode:'overlay',variant:'one-page',theme:'dark',successUrl:new URL('/welcome',origin).href,allowLogout:false},
  customer:{...(user?.email?{email:user.email}:{}),...(detected?{address:{countryCode:detected}}:{})}};
}
