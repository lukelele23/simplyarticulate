import {detectedCountry} from '../../src/lib/pricingModel.js';
export default async function handler(request,context){
 const headers={'Content-Type':'application/json','Cache-Control':'private, no-store','Vary':'x-vercel-ip-country,x-country'};
 if(request.method!=='GET')return new Response(JSON.stringify({error:'Method not allowed.'}),{status:405,headers});
 const country=detectedCountry(request.headers,context?.geo);
 return new Response(JSON.stringify(country?{countryCode:country}:{}),{headers});
}
