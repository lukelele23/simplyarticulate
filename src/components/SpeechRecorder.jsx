import { audioCapture } from '../lib/audioCapture.js';
import MicrophoneCheck from './MicrophoneCheck.jsx';
import { saveDraft } from '../lib/drafts.js';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

import { pcmWave } from "../lib/audio.js";

const MAX_SECONDS = 300;

const SpeechRecorder = forwardRef(function SpeechRecorder(
  { user, topic, difficulty, onBusyChange, onClipChange, format = 'speech', challengeId, publicUsername, showPlayback = true },
  ref
) {
  const recordedAt = useRef(null);
  const draftId = useRef(null);
  const draftWrites = useRef(Promise.resolve());
  const pcm = useRef(null);
  const active = useRef(false);
  const recorder = useRef(null);
  const stream = useRef(null);
  const tick = useRef(null);
  const activeSegmentStartedAt = useRef(0);
  const recordedMilliseconds = useRef(0);
  const operation = useRef(false);
  const stopPromise = useRef(null);
  const resolveStop = useRef(null);
  const [status, setStatus] = useState("idle");
  const [clip, setClip] = useState(null);
  const [url, setUrl] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const busy = ["requesting", "recording", "paused", "stopping", "saving", "analyzing"].includes(status);

  useEffect(() => { onClipChange?.(clip ? { blob: clip.blob, storageBlob:clip.storageBlob, durationSeconds: clip.seconds, draftId:draftId.current, requestKey:draftId.current,recordedAt:recordedAt.current } : null); }, [clip, onClipChange]);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      pcm.current?.processor.port.postMessage({type:'recording',enabled:false}); pcm.current?.processor.disconnect(); pcm.current?.source.disconnect(); void pcm.current?.context.close(); pcm.current = null;
      clearInterval(tick.current);
      if (recorder.current?.state !== "inactive") recorder.current?.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
      resolveStop.current?.(null);
    };
  }, []);

  useEffect(() => {
    if (!clip) { setUrl(""); return; }
    const next = URL.createObjectURL(clip.blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [clip]);

  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);

  useEffect(() => {
    if (!busy) return;
    const warn = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  async function start() {
    if (operation.current) return false;
    if (clip && !window.confirm("Replace this recording? Save it first if you want to keep it.")) return false;
    setError("");
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError("Recording needs HTTPS (or localhost) and a browser that supports microphone recording.");
      return false;
    }
    operation.current = true;
    setStatus("requesting");
    try {
      const input = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      if (!active.current) { input.getTracks().forEach((track) => track.stop()); return; }
      stream.current = input;
      const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"]
        .find((type) => MediaRecorder.isTypeSupported(type) && document.createElement("audio").canPlayType(type));
      const capture = new MediaRecorder(input, mimeType ? { mimeType, audioBitsPerSecond: 64000 } : undefined);
      recorder.current = capture;
      draftId.current=crypto.randomUUID();recordedAt.current=new Date().toISOString();
      pcm.current=await audioCapture(input);
      if(!active.current){pcm.current?.processor.disconnect();pcm.current?.source.disconnect();void pcm.current?.context.close();pcm.current=null;input.getTracks().forEach(t=>t.stop());operation.current=false;return false;}
      const chunks = [];
      const persistClip=(blob,seconds,completed,storageBlob)=>{
        const take={id:draftId.current,owner:user?.id || 'signed-out',recordedAt:recordedAt.current,topic,difficulty,format,challengeId,publicUsername,blob,storageBlob,durationSeconds:seconds,completed};
        draftWrites.current=draftWrites.current.catch(()=>{}).then(()=>saveDraft(take)).catch(()=>{if(active.current)setError('Local recovery could not be saved. Keep this page open and download your take when finished.');});
      };
      capture.ondataavailable = (event) => { if (event.data.size) {chunks.push(event.data);const seconds=Math.min(MAX_SECONDS,Math.max(1,Math.floor((recordedMilliseconds.current+(capture.state==='recording'?Date.now()-activeSegmentStartedAt.current:0))/1000)));persistClip(new Blob(chunks,{type:capture.mimeType}),seconds,false);}};
      capture.onerror = () => {
        if (active.current) setError("The microphone recording was interrupted. Check your microphone and try again.");
        stop();
      };
      capture.onstop = async () => {
        clearInterval(tick.current);
        input.getTracks().forEach((track) => track.stop());
        stream.current = null;
        operation.current = false;
        if (!active.current) { resolveStop.current?.(null); return; }
        const storageBlob = new Blob(chunks, { type: capture.mimeType || chunks[0]?.type || "audio/webm" });
        let blob = storageBlob;
        const captured = pcm.current; pcm.current = null;
        if (captured) {
          const flushed=await captured.flush();
          if (flushed && captured.samples.length) {try {blob=pcmWave(captured.samples,captured.context.sampleRate);}catch {blob=storageBlob;}}
          captured.processor.disconnect(); captured.source.disconnect(); captured.silence.disconnect(); void captured.context.close();
        }
        if (blob.size) {
          const nextClip = { blob, storageBlob, seconds: Math.min(MAX_SECONDS, Math.max(1, Math.ceil(recordedMilliseconds.current / 1000))) };
          persistClip(blob,nextClip.seconds,true,storageBlob);
          await draftWrites.current;
          if(!active.current){resolveStop.current?.(null);return;}
          setClip(nextClip);
          resolveStop.current?.({ blob, storageBlob, durationSeconds: nextClip.seconds, draftId:draftId.current, requestKey:draftId.current,recordedAt:recordedAt.current });
        } else { setError("No audio was captured. Your previous recording, if any, is still available."); resolveStop.current?.(null); }
        setStatus("idle");
      };
      capture.start(1000);
      pcm.current?.processor.port.postMessage({type:'recording',enabled:true});
      stopPromise.current = null;
      resolveStop.current = null;
      setClip(null);
      onClipChange?.(null);
      recordedMilliseconds.current = 0;
      activeSegmentStartedAt.current = Date.now();
      setElapsed(0);
      setStatus("recording");
      tick.current = window.setInterval(() => {
        if (!active.current) return;
        const totalMilliseconds = recordedMilliseconds.current + Date.now() - activeSegmentStartedAt.current;
        const seconds = Math.min(MAX_SECONDS, Math.floor(totalMilliseconds / 1000));
        setElapsed(seconds);
        if (seconds >= MAX_SECONDS) stop();
      }, 250);
      return true;
    } catch (cause) {
      clearInterval(tick.current);
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
      pcm.current?.processor.disconnect(); pcm.current?.source.disconnect(); void pcm.current?.context.close(); pcm.current = null;
      operation.current = false;
      if (!active.current) return;
      setStatus("idle");
      setError(cause.name === "NotAllowedError"
        ? "Microphone access was blocked. Allow microphone access in your browser’s site settings, then try again."
        : cause.name === "NotFoundError" ? "No microphone was found. Connect one and try again."
        : "Could not start your microphone. Check that it is connected and available, then try again.");
      return false;
    }
  }

  function pause() {
    if (recorder.current?.state === "recording") {
      recordedMilliseconds.current += Date.now() - activeSegmentStartedAt.current;
      clearInterval(tick.current);
      pcm.current?.processor.port.postMessage({type:'recording',enabled:false});
      recorder.current.pause();
      stream.current?.getAudioTracks().forEach((track) => { track.enabled = false; });
      setElapsed(Math.min(MAX_SECONDS, Math.floor(recordedMilliseconds.current / 1000)));
      setStatus("paused");
    }
  }

  function resume() {
    if (recorder.current?.state === "paused") {
      activeSegmentStartedAt.current = Date.now();
      stream.current?.getAudioTracks().forEach((track) => { track.enabled = true; });
      recorder.current.resume();
      pcm.current?.processor.port.postMessage({type:'recording',enabled:true});
      setStatus("recording");
      tick.current = window.setInterval(() => {
        if (!active.current) return;
        const totalMilliseconds = recordedMilliseconds.current + Date.now() - activeSegmentStartedAt.current;
        const seconds = Math.min(MAX_SECONDS, Math.floor(totalMilliseconds / 1000));
        setElapsed(seconds);
        if (seconds >= MAX_SECONDS) stop();
      }, 250);
    }
  }

  function stop() {
    if (stopPromise.current) return stopPromise.current;
    if (recorder.current?.state === "recording") {
      recordedMilliseconds.current += Date.now() - activeSegmentStartedAt.current;
    }
    if (recorder.current?.state === "recording" || recorder.current?.state === "paused") {
      clearInterval(tick.current);
      setStatus("stopping");
      stopPromise.current = new Promise((resolve) => { resolveStop.current = resolve; });
      recorder.current.stop();
      return stopPromise.current;
    }
    return Promise.resolve(clip ? { blob: clip.blob, storageBlob:clip.storageBlob, durationSeconds: clip.seconds,draftId:draftId.current,requestKey:draftId.current,recordedAt:recordedAt.current } : null);
  }

  useImperativeHandle(ref, () => ({ start, pause, resume, stop }));


  return (
    <section className="speech-recorder" aria-label="Speech recording">
      <MicrophoneCheck disabled={busy}/>
      <p className="recording-status" role="status">
        {status === "recording" ? `Microphone recording · ${elapsed}s` : status === "paused" ? `Recording paused · ${elapsed}s` : status === "requesting" ? "Waiting for microphone permission…" : status === "stopping" ? "Finishing recording…" : clip ? `Recording ready · ${clip.seconds}s` : "Microphone ready · starts with the speech timer"}
      </p>
      {showPlayback && url && !busy && <audio className="recording-player" controls controlsList="nodownload" src={url}>Your browser does not support audio playback.</audio>}
      {clip && <p className="screen-message">This take is kept locally for recovery. Finish and review your speech to download audio or save it to your account.</p>}
      <div className="speech-analysis">
        <p>After recording, review your take and request optional AI feedback. Saving audio to your account is a separate choice.</p>
      </div>
      {error && <p className="recording-error" role="alert">{error}</p>}
    </section>
  );
});

export default SpeechRecorder;




