/** Shared Node/Edge parser: never render truncated, blocked or oversized model output. */
export function parseCoachingJson(response){
 const candidate=response?.candidates?.[0];
 if(response?.promptFeedback?.blockReason || (candidate?.finishReason && candidate.finishReason!=='STOP'))throw Error('Coaching response did not finish safely.');
 const text=candidate?.content?.parts?.filter(part=>!part.thought&&typeof part.text==='string').map(part=>part.text).join('');
 if(!text||text.length>100000)throw Error('Invalid coaching response size.');
 const value=JSON.parse(text);
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid analysis object.');
 return value;
}
export const COACHING_VERSION='speech-coach-2026-10-14.1';
