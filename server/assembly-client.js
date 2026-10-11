import { FileService, TranscriptService } from 'assemblyai';
import {reliableRequest} from '../src/lib/reliableRequest.js';

// The pinned SDK's service transport hook lets each job retain its own
// cancellation signal and timeout, without changing global fetch.
export function assemblyServices(config, signal, fetchImpl = fetch) {
  const params = { apiKey: config.assemblyKey, baseUrl: config.assemblyBase };
  const bounded = (Service) => class extends Service {
    async fetchResponse(input, init = {}) {
      const url = input.startsWith('http') ? input : `${params.baseUrl}${input}`;
      const response = await reliableRequest(url, {
        ...init,
        headers: { authorization: params.apiKey, 'Content-Type': 'application/json', ...init.headers },
        signal,
      },{fetchImpl});
      // Keep provider response bodies (and request details) out of public errors.
      if (!response.ok) {await response.body?.cancel();throw Object.assign(new Error(`AI provider request failed (${response.status}). Try again later.`),{providerStatus:response.status});}
      return response;
    }
  };
  const Files = bounded(FileService);
  const Transcripts = bounded(TranscriptService);
  const files = new Files(params);
  return { files, transcripts: new Transcripts(params, files) };
}
