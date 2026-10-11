export async function readAnalysisResponse(response){
 let result;
 try{result=await response.json();}
 catch{
  if(response.status>=500)throw new Error('The analysis server is temporarily unreachable. Keep your recording and try again shortly.');
  throw new Error('This page is not connected to the speech analysis server. Open SimplyArticulate from its running app server, then check analysis again. Your recording is still available.');
 }
 if(!response.ok)throw new Error(typeof result?.error==='string'?result.error:'Analysis could not finish. Please try again.');
 if(!result||typeof result!=='object'||Array.isArray(result))throw new Error('The analysis server returned an incomplete response. Keep your recording and try again.');
 return result;
}
