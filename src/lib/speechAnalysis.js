import { supabase } from '../../utils/supabase.js';
import {reliableRequest} from './reliableRequest.js';
import {readAnalysisResponse} from './analysisResponse.js';
import {analysisEndpoint} from './analysisEndpoint.js';

export async function analysisRequest(endpoint, { method = 'GET', body, signal, requestKey } = {}) {
  const { data } = await supabase.auth.getSession();
  const headers = {};
  if(import.meta.env.VITE_ANALYSIS_SERVICE==='supabase')headers.apikey=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (requestKey) headers['Idempotency-Key'] = requestKey;
  if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
  if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  let response;
  try {
    response = await reliableRequest(analysisEndpoint(endpoint,import.meta.env), {
      method, headers, signal,
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    },{retryNetwork:method==='GET'||Boolean(requestKey),retryResponses:method==='GET'||Boolean(requestKey)});
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('Cannot reach the analysis service. Your recording is still available for playback.');
  }
  return readAnalysisResponse(response);
}

export function waitForPoll(signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Stopped', 'AbortError'));
    const abort = () => { clearTimeout(timer); reject(new DOMException('Stopped', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, import.meta.env.VITE_ANALYSIS_SERVICE==='supabase'?5000:2000);
    signal.addEventListener('abort', abort, { once: true });
  });
}
