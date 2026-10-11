import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createAnalysisServer, readConfig } from './index.js';
import { validateReview } from './community.js';

const day = new Date().toISOString().slice(0, 10);
const transcript = 'Practice helps me organize my ideas because I can repeat a small task and reflect on what worked before I try again tomorrow.';
const reviewData = {
  moderation: 'allow',
  eligible: true,
  reason: 'Appropriate practice content.',
  dimensions: ['relevance', 'organization', 'support', 'clarity'].map((name) => ({
    name, score: 20, reason: 'Clear evidence in this take.',
  })),
};
const metadata = {
  format: 'daily-challenge',
  topic: 'Practice',
  difficulty: 'medium',
  durationSeconds: 60,
  challengeId: day,
  publicUsername: 'TestSpeaker',
  consent: true,
};

test('API enforces one scored daily attempt per authenticated account', async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'speech-attempt-api-'));
  const config = {
    ...readConfig({
      AI_ENABLED: 'true',
      ASSEMBLYAI_API_KEY: 'test',
      GEMINI_API_KEY: 'test',
      VITE_SUPABASE_URL: 'https://test.example',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'test',
    }),
    dataDir,
  };
  const server = createAnalysisServer(config, {
    fetchImpl: async () => Response.json({ id: 'test-user' }),
    getChallenge: async () => ({ id: day, topic: 'Practice' }),
    analyze: async () => ({
      transcript,
      metrics: { durationSeconds: 60 },
      demo: false,
    }),
    review: async () => validateReview(reviewData, transcript),
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/analysis`;
  const headers = { Authorization: 'Bearer test-token' };
  const upload = () => {
    const form = new FormData();
    form.append('metadata', JSON.stringify(metadata));
    form.append('audio', new Blob([new Uint8Array(100)], { type: 'audio/wav' }), 'test.wav');
    return form;
  };

  try {
    const attemptUrl = `${base}/community/attempt?day=${day}`;
    assert.deepEqual(await (await fetch(attemptUrl, { headers })).json(), { day, used: false, recoverable:false, state:'available' });
    assert.equal((await fetch(base, { method: 'POST', headers, body: upload() })).status, 202);
    assert.deepEqual(await (await fetch(attemptUrl, { headers })).json(), { day, used: true, recoverable:false, state:'completed' });
    assert.equal((await fetch(base, { method: 'POST', headers, body: upload() })).status, 429);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    rmSync(dataDir, { recursive: true, force: true });
  }
});
