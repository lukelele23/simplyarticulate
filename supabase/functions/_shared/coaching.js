import {parseCoachingJson,COACHING_VERSION} from './coachingOutput.js';
import { FRAMEWORK_SCHEMA, FRAMEWORK_PROMPT, validateFramework, verifyClaims } from './framework.js';

import { measureSpeech } from './metrics.js';

import {reliableRequest} from './reliableRequest.js';

export const COACH_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    strength: { type: 'OBJECT', properties: { observation: { type: 'STRING' }, quote: { type: 'STRING' } }, required: ['observation', 'quote'] },
    organization: { type: 'STRING' },
    relevance: { type: 'STRING' },
    improvements: { type: 'ARRAY', items: { type: 'STRING' }, minItems: 2, maxItems: 2 },
    nextExercise: { type: 'STRING' },
  },
  required: ['summary', 'strength', 'organization', 'relevance', 'improvements', 'nextExercise'],
};

function textField(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 1800) throw new Error('Invalid coaching response.');
  return value.trim();
}

export function validateCoaching(value, transcript) {
  const quote = textField(value?.strength?.quote);
  // Evidence must actually occur in the transcript; never display fabricated quotations.
  if (!transcript.toLowerCase().includes(quote.toLowerCase())) throw new Error('Coaching quotation did not match the transcript.');
  if (!Array.isArray(value.improvements) || value.improvements.length !== 2) throw new Error('Invalid improvement list.');
  return {
    summary: textField(value.summary),
    strength: { observation: textField(value.strength.observation), quote },
    organization: textField(value.organization), relevance: textField(value.relevance),
    improvements: value.improvements.map(textField), nextExercise: textField(value.nextExercise),
  };
}

async function providerJson(url, options, signal, fetchImpl) {
  const response = await reliableRequest(url, { ...options, signal },{fetchImpl,timeoutMs:80000});
  if (!response.ok) {
    // Do not retain/log response bodies: they can contain prompts or credentials.
    await response.body?.cancel();
    throw Object.assign(new Error(`AI provider request failed (${response.status}). Try again later.`), { providerStatus: response.status });
  }
  return response.json();
}

export async function generateCoaching(transcript, metadata, metrics, config, signal, fetchImpl = fetch, suppliedVerification = null) {
  const verification = suppliedVerification || await verifyClaims(transcript, config, signal, fetchImpl);
  const response = await providerJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.geminiModel)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.geminiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: FRAMEWORK_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: JSON.stringify({ practice: metadata, transcript, metrics, verification, disfluenciesPreserved: true }) }] }],
        generationConfig: {
          responseMimeType: 'application/json', responseSchema: FRAMEWORK_SCHEMA,
          temperature: 0.2, maxOutputTokens: metadata.parentJobId ? 2500 : 4000,
          // Gemini 3.x rejects the legacy zero thinkingBudget used by 2.5 Flash-Lite.
          ...(config.geminiModel.startsWith('gemini-2.5-flash') ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        },
      }),
    }, signal, fetchImpl,
  );
  return { ...validateFramework(parseCoachingJson(response), transcript, verification.sources, metrics.wordCount, metadata), analysisVersion:COACHING_VERSION, groundingMetadata: verification.groundingMetadata };
}

export function logCoachingFailure(error, model) {
  const status = Number.isInteger(error?.providerStatus) ? error.providerStatus : null;
  const validationReasons = {
    'Invalid quoted occurrence.': 'invalid_occurrence_range',
    'Analysis quote is not in the transcript.': 'quotation_not_in_transcript',
    'Unknown factual source.': 'unknown_fact_source',
    'Evidence is required.': 'missing_fact_evidence',
    'Unsupported factual correction.': 'unsupported_fact_correction',
    'Invalid analysis text.': 'invalid_analysis_text',
    'Invalid analysis list.': 'invalid_analysis_list',
    'Invalid analysis object.': 'invalid_analysis_object',
  };
  const reason = status ? `provider_http_${status}` : validationReasons[error?.message] ||
    (['AbortError', 'TimeoutError'].includes(error?.name) ? 'timeout_or_cancelled' :
    error?.name === 'SyntaxError' ? 'invalid_json' :
    error?.name === 'TypeError' ? 'connection_or_response_error' : 'response_validation_failed');
  // Log only controlled fields; never transcript, API key, URL, or raw provider text.
  const safeModel = /^[a-zA-Z0-9._-]{1,100}$/.test(model || '') ? model : 'configured-model';
  console.error(`[SimplyArticulate coaching] model=${safeModel} reason=${reason}`);
  return reason;
}

