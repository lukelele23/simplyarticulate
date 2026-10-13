export function isAllowedOrigin(origin,allowed,localDevelopment=false){
 if(!origin||allowed.has(origin))return true;
 if(!localDevelopment)return false;
 try{const url=new URL(origin);return url.origin===origin&&url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname);}catch{return false;}
}
