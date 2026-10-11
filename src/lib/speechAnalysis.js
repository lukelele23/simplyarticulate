import { supabase } from '../../utils/supabase.js';
import {reliableRequest} from './reliableRequest.js';
import {readAnalysisResponse} from './analysisResponse.js';

export async function analysisRequest(endpoint, { method = 'GET', body, signal, requestKey } = {}) {
  const { data } = await supabase.auth.getSession();
  const headers = {};
  if (requestKey) headers['Idempotency-Key'] = requestKey;
  if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
  if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  let response;
  try {
    response = await reliableRequest(`/api/analysis${endpoint}`, {
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
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 2000);
    signal.addEventListener('abort', abort, { once: true });
  });
}
