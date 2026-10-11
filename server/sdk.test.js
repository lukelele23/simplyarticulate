import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { captureDictation } from './live-dictation.js';
import { assemblyServices } from './assembly-client.js';

function fixture(action, overrides = {}) {
  const input = new EventEmitter();
  const interrupts = new EventEmitter();
  const stream = new EventEmitter();
  const child = new EventEmitter();
  const events = [];
  const session = {
    write: (data) => events.push(['write', data.length]),
    close: () => events.push(['close']),
    abort: async () => events.push(['abort']),
    result: async () => { events.push(['result']); return { text: 'Um, I think practice helps.', final_text: 'Practice helps.' }; },
  };
  const client = { dictation: { openLive: (config, options) => {
    events.push(['open', config, options]); return session;
  } } };
  const recorder = { record: (options) => {
    events.push(['capture', options]);
    return { stream: () => stream, process: child, stop: () => {
      events.push(['stop']); setImmediate(() => stream.emit('error', 'intentional shutdown'));
    } };
  } };
  return { events, input, interrupts, stream, child,
    run: () => captureDictation({ client, recorder, input, interrupts,
      onReady: () => queueMicrotask(() => action({ input, interrupts, stream, child })), ...overrides }) };
}

test('microphone sends raw mono PCM and waits for stop before requesting final text', async () => {
  const f = fixture(({ stream, input }) => { stream.emit('data', Buffer.alloc(640)); input.emit('data', Buffer.from('\n')); });
  assert.deepEqual(await f.run(), { text: 'Um, I think practice helps.', final_text: 'Practice helps.' });
  assert.equal(f.events[0][1].sample_rate, 16000);
  assert.equal(f.events[1][1].audioType, 'raw');
  const names = f.events.map(([name]) => name);
  assert.ok(names.indexOf('stop') < names.indexOf('close'));
  assert.ok(names.indexOf('close') < names.indexOf('result'));
  assert.equal(f.input.listenerCount('data'), 0);
  assert.equal(f.interrupts.listenerCount('SIGINT'), 0);
});

test('audio byte limit truncates oversized chunks and stops automatically', async () => {
  const f = fixture(({ stream }) => stream.emit('data', Buffer.alloc(1000)), { maxSeconds: 0.01 });
  await f.run();
  assert.deepEqual(f.events.find(([name]) => name === 'write'), ['write', 320]);
});

test('Ctrl+C aborts the request and does not request a transcript', async () => {
  const f = fixture(({ interrupts }) => interrupts.emit('SIGINT'));
  await assert.rejects(f.run(), /cancelled/);
  assert.ok(f.events.some(([name]) => name === 'abort'));
  assert.ok(!f.events.some(([name]) => name === 'result'));
});

test('microphone process errors abort safely instead of crashing Node', async () => {
  const f = fixture(({ child }) => child.emit('error', new Error('spawn failed')));
  await assert.rejects(f.run(), /Microphone capture failed/);
  assert.ok(f.events.some(([name]) => name === 'abort'));
});

test('empty recordings are rejected and provider upload is aborted', async () => {
  const f = fixture(({ input }) => input.emit('data', Buffer.from('\n')));
  await assert.rejects(f.run(), /No audio/);
  assert.ok(f.events.some(([name]) => name === 'abort'));
});

test('SDK requests use per-job cancellation and sanitize provider failures', async () => {
  const controller = new AbortController();
  const config = { assemblyKey: 'unit-test-key', assemblyBase: 'https://api.assemblyai.com' };
  const client = assemblyServices(config, controller.signal, async (_url, options) => {
    assert.equal(options.headers.authorization, 'unit-test-key');
    controller.abort();
    assert.equal(options.signal.aborted, true);
    return new Response('sensitive provider response', { status: 401 });
  });
  await assert.rejects(client.files.upload(Buffer.alloc(32)), (error) => {
    assert.match(error.message, /401/);
    assert.ok(!error.message.includes('sensitive'));
    return true;
  });
});
