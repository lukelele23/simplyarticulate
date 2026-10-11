export const SAMPLE_RATE = 16000;
export const MAX_DICTATION_SECONDS = 110;

// This captures the Node computer's microphone; website visitors use MediaRecorder.
export async function captureDictation({ client, recorder, input, interrupts,
  maxSeconds = MAX_DICTATION_SECONDS, instruction, onReady = () => {} }) {
  if (!Number.isFinite(maxSeconds) || maxSeconds <= 0 || maxSeconds > MAX_DICTATION_SECONDS) {
    throw new Error('Dictation recordings must be between 0 and 110 seconds.');
  }
  if (instruction && (typeof instruction !== 'string' || instruction.length > 2048)) {
    throw new Error('The rewrite instruction must be at most 2048 characters.');
  }
  const session = client.dictation.openLive({
    sample_rate: SAMPLE_RATE, channels: 1, language_codes: ['en'],
    ...(instruction ? { llm_instruction: instruction } : {}),
  }, { timeout: 240000 });
  let recording, stream, timer, finishing = false, capturedBytes = 0;
  const byteLimit = Math.floor(SAMPLE_RATE * 2 * maxSeconds / 2) * 2;
  let finish;
  const stopped = new Promise((resolve) => { finish = resolve; });
  const stop = (reason) => {
    if (finishing) return;
    finishing = true;
    clearTimeout(timer);
    finish(reason);
  };
  const stopFromInput = () => stop('done');
  const cancel = () => {
    if (finishing) { Promise.resolve(session.abort()).catch(() => {}); }
    else stop('cancelled');
  };
  const failed = () => { if (!finishing) stop('capture-error'); };
  const ended = () => stop('done');
  const send = (chunk) => {
    if (finishing) return;
    const remaining = byteLimit - capturedBytes;
    const bytes = chunk.subarray(0, remaining);
    try { if (bytes.length) session.write(bytes); }
    catch { stop('capture-error'); return; }
    capturedBytes += bytes.length;
    if (capturedBytes >= byteLimit) stop('done');
  };
  try {
    recording = recorder.record({ sampleRate: SAMPLE_RATE, channels: 1,
      audioType: 'raw', recorder: 'sox', endOnSilence: false });
    stream = recording.stream();
    stream.on('data', send);
    stream.on('error', failed);
    stream.on('end', ended);
    // Missing executables emit an error on the child process, not its stream.
    recording.process?.on('error', failed);
    input.once('data', stopFromInput);
    input.once('end', stopFromInput);
    interrupts?.once('SIGINT', cancel);
    input.resume?.();
    timer = setTimeout(() => stop('done'), maxSeconds * 1000);
    onReady(maxSeconds);
    const reason = await stopped;
    recording.stop();
    // The stream's error listener remains attached through child shutdown;
    // node-record-lpcm16 can emit a nonzero-exit error after an intentional stop.
    if (reason === 'cancelled') throw new Error('Recording cancelled.');
    if (reason === 'capture-error') throw new Error('Microphone capture failed. Check SoX and microphone permissions.');
    if (!capturedBytes) throw new Error('No audio was captured. Check your microphone and try again.');
    session.close();
    // result() itself closes the session: call it only after capture stops.
    const result = await session.result();
    if (!result.text?.trim()) throw new Error('No speech was detected.');
    return { text: result.text, final_text: result.final_text ?? result.text };
  } catch (error) {
    try { await session.abort(); } catch { /* Preserve the original failure. */ }
    throw error;
  } finally {
    finishing = true;
    clearTimeout(timer);
    input.removeListener('data', stopFromInput);
    input.removeListener('end', stopFromInput);
    input.pause?.();
    interrupts?.removeListener('SIGINT', cancel);
    stream?.removeListener('data', send);
    stream?.removeListener('end', ended);
    // Keep shutdown error listeners; the recorder's child may still be closing.
    try { recording?.stop(); } catch { /* Already stopped. */ }
  }
}
