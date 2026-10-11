import { spawnSync } from 'node:child_process';
import { AssemblyAI } from 'assemblyai';
import recorder from 'node-record-lpcm16';
import { captureDictation } from './live-dictation.js';

async function main() {
  const key = process.env.ASSEMBLYAI_API_KEY?.trim();
  const sox = spawnSync('sox', ['--version'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
  const problems = [];
  if (!key || /^(your-|replace|paste)/i.test(key)) problems.push('Set your rotated ASSEMBLYAI_API_KEY in .env.server.local.');
  if (sox.error || sox.status !== 0) problems.push('Install SoX, add its executable folder to PATH, then reopen your terminal.');
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exitCode = 1;
    return;
  }
  const client = new AssemblyAI({ apiKey: key });
  if (typeof client.dictation?.openLive !== 'function') throw new Error('The installed AssemblyAI SDK does not support Dictation.');
  if (process.argv.includes('--check')) {
    console.log('SDK, key configuration and SoX are present. No microphone or paid API request was used. Key validity is not checked.');
    return;
  }
  if (!process.stdin.isTTY) throw new Error('Run this command in an interactive terminal.');
  console.log('Your microphone audio will be sent to AssemblyAI. Press Enter to finish or Ctrl+C to cancel.');
  const result = await captureDictation({
    client, recorder, input: process.stdin, interrupts: process,
    instruction: process.env.DICTATION_LLM_INSTRUCTION?.trim() || undefined,
    onReady: (seconds) => console.log(`Recording started; stops automatically after ${seconds} seconds.`),
  });
  console.log('\nOriginal transcript:\n' + result.text);
  console.log('\nFinal text (same as original unless rewriting is configured):\n' + result.final_text);
}

main().catch((error) => {
  // Never dump SDK errors/request objects: they may include sensitive details.
  const safe = ['Recording cancelled.', 'No speech was detected.',
    'No audio was captured. Check your microphone and try again.',
    'Microphone capture failed. Check SoX and microphone permissions.',
    'Run this command in an interactive terminal.',
    'The rewrite instruction must be at most 2048 characters.'];
  console.error(safe.includes(error?.message) ? error.message :
    'Dictation failed. Check your AssemblyAI key, account access, network and microphone, then try again.');
  process.exitCode = 1;
});
