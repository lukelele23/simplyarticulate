import { FRAMEWORK_SCHEMA, FRAMEWORK_PROMPT, validateFramework, verifyClaims } from './framework.js';
import { setTimeout as delay } from 'node:timers/promises';
import { measureSpeech } from './metrics.js';
import { assemblyServices } from './assembly-client.js';
import {reliableRequest} from '../src/lib/reliableRequest.js';

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
  const response = await reliableRequest(url, { ...options, signal },{fetchImpl,timeoutMs:90000});
  if (!response.ok) {
    // Do not retain/log response bodies: they can contain prompts or credentials.
    await response.body?.cancel();
    throw Object.assign(new Error(`AI provider request failed (${response.status}). Try again later.`), { providerStatus: response.status });
  }
  return response.json();
}

export async function generateCoaching(transcript, metadata, metrics, config, signal, fetchImpl = fetch) {
  const verification = await verifyClaims(transcript, config, signal, fetchImpl);
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
  const text = response.candidates?.[0]?.content?.parts?.filter((part) => !part.thought).map((part) => part.text || '').join('');
  if (!text) throw new Error('No coaching was returned.');
  return { ...validateFramework(JSON.parse(text), transcript, verification.sources, metrics.wordCount, metadata), groundingMetadata: verification.groundingMetadata };
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

export async function analyzeAudio(audio, mimeType, metadata, config, onProgress, signal, fetchImpl = fetch) {
  const headers = { authorization: config.assemblyKey };
  const client = assemblyServices(config, signal, fetchImpl);
  let transcriptId;
  let result;
  let cleanupFailed = false;
  try {
    onProgress('uploading');
    const uploadUrl = await client.files.upload(audio);
    onProgress('transcribing');
    const submitted = await client.transcripts.submit({
        audio_url: uploadUrl, speech_models: [config.assemblyModel],
        language_code: 'en', disfluencies: true, punctuate: true, format_text: false,
        // Bound processing independently of the duration claimed by the browser.
        audio_end_at: (metadata.parentJobId ? 60 : config.maxSeconds) * 1000,
    });
    if (typeof submitted.id !== 'string' || !/^[a-zA-Z0-9-]+$/.test(submitted.id)) throw new Error('Invalid transcription response.');
    transcriptId = submitted.id;
    let transcription = submitted;
    while (transcription.status !== 'completed') {
      if (transcription.status === 'error') throw new Error('This recording could not be transcribed. Check the audio and try again.');
      await delay(config.pollMs, undefined, { signal });
      transcription = await client.transcripts.get(transcriptId);
    }
    const transcript = transcription.text?.trim();
    if (!transcript || !Array.isArray(transcription.words) || !transcription.words.length) {
      throw new Error('No speech was detected. Try recording again in a quieter place.');
    }
    if (transcript.length > 30000) throw new Error('Transcript exceeds the supported practice length.');
    const duration = Number(transcription.audio_duration);
    if (!Number.isFinite(duration) || duration <= 0 || duration > (metadata.parentJobId ? 60 : config.maxSeconds) + 2) throw new Error('Unsupported recording duration.');
    const metrics = measureSpeech(transcription.words, duration);
    result = { transcript, words: transcription.words.map(({text,start,end})=>({text,start,end})), metrics, coaching: null, coachingError: null, demo: false };
    onProgress('coaching');
    try {
      result.coaching = await generateCoaching(transcript, metadata, metrics, config, signal, fetchImpl);
    } catch (error) {
      result.coachingErrorCode = logCoachingFailure(error, config.geminiModel);
      // Preserve a successfully paid-for transcript even if the second provider fails.
      result.coachingError = 'Your transcript is ready, but written coaching is temporarily unavailable. You can retry coaching without uploading again.';
    }
  } finally {
    if (transcriptId) {
      try {
        const response = await fetchImpl(`${config.assemblyBase}/v2/transcript/${transcriptId}`, {
          method: 'DELETE', headers, signal: AbortSignal.timeout(10000),
        });
        if (!response.ok && response.status !== 404) cleanupFailed = true;
      } catch { cleanupFailed = true; }
      if (cleanupFailed) console.error(`Provider transcript cleanup needs retry: ${transcriptId}`);
    }
  }
  result.cleanupWarning = cleanupFailed
    ? 'Provider transcript deletion could not be confirmed. Contact support to request provider cleanup.' : null;
  return result;
}

export function demoAnalysis(metadata) {
  const transcript = 'I believe daily practice helps us improve. Um, one small attempt teaches us something useful. For example, repeating a short speech helps us organize our ideas. That is why I would practice again tomorrow.';
  const tokens = transcript.split(/\s+/);
  const seconds = Math.max(10, metadata.durationSeconds);
  const words = tokens.map((text, index) => ({ text, start: index * seconds * 1000 / tokens.length, end: (index + 0.7) * seconds * 1000 / tokens.length }));
  return {
    demo: true, transcript, words, metrics: measureSpeech(words, seconds), coachingError: null,
    coaching: {
      summary: 'This is a sample report, not an analysis of your recording.',
      strength: { observation: 'The sample states a clear position.', quote: 'I believe daily practice helps us improve.' },
      organization: 'The sample moves from a main point to an example and a conclusion.',
      relevance: 'In a real analysis, this section compares your speech with the selected topic.',
      improvements: ['Use a specific example from your own experience.', 'Finish by restating the main point in one sentence.'],
      nextExercise: 'Try another one-minute speech with one point, one example, and one conclusion.',
    },
  };
}
