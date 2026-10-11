import { reportText, transcriptSegments } from '../lib/reports.js';
import SavedFeedback from './SavedFeedback.jsx';
import FrameworkFeedback from './FrameworkFeedback.jsx';
import { useEffect, useRef, useState } from 'react';
import { analysisRequest, waitForPoll } from '../lib/speechAnalysis.js';
import {checkAnalysisAvailability} from '../lib/analysisAvailability.js';
import './speechAnalysis.css';

const STATUS_TEXT = {
  submitting: 'Sending your recording…', queued: 'Your analysis is queued…',
  moderating: 'Checking your challenge score and community safety…', uploading: 'Preparing your recording…', transcribing: 'Writing down your words…', coaching: 'Preparing your feedback…',
};

export default function SpeechAnalysis({ recording, metadata, onReportChange, onResult, initialReport = null, onAttemptUsed, user, onSignUp, onRetry }) {
  const [shareTranscript, setShareTranscript] = useState(false);
  const [published, setPublished] = useState(false);
  const [availabilityAttempt, setAvailabilityAttempt] = useState(0);
  const [configError, setConfigError] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [status, setStatus] = useState('idle');
  const [report, setReport] = useState(initialReport);
  const [error, setError] = useState('');
  const [playbackError, setPlaybackError] = useState('');
  const [saveReport, setSaveReport] = useState(Boolean(initialReport && !initialReport.demo));
  const [config, setConfig] = useState(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const playerRef = useRef(null);
  const [currentTime,setCurrentTime]=useState(0);
  const controllerRef = useRef(null);
  const jobIdRef = useRef(null);
  const requestKeyRef = useRef(recording.requestKey || recording.draftId || crypto.randomUUID());
  const mountedRef = useRef(false);
  const busyRef = useRef(false);
  const [usage, setUsage] = useState(null);
  useEffect(() => {
    if (!user || !config?.enabled || config.demo) return;
    const controller = new AbortController();
    const refresh = () => analysisRequest(`/usage?format=${encodeURIComponent(metadata.format)}`,{signal:controller.signal}).then(value=>{if(!controller.signal.aborted)setUsage(value);}).catch(() => {});
    refresh();window.addEventListener('analysis-allowance-changed',refresh);
    return()=>{controller.abort();window.removeEventListener('analysis-allowance-changed',refresh);};
  }, [user, config, status, metadata.format]);
  const signInRequired = !user;
  const allowanceFull = usage && (usage.canAnalyze === false || usage.usedSeconds + usage.reservationSeconds > usage.limitSeconds);
  const busy = Boolean(STATUS_TEXT[status]);

  useEffect(() => {
    if (!user) { setConfig(null); setConfigLoaded(true); setUsage(null); setReport(null); return undefined; }
    setConfigError(''); setConfigLoaded(false);
    return checkAnalysisAvailability(analysisRequest,{
      ready:value=>{setConfig(value);setConfigError('');},
      failed:cause=>setConfigError(cause.name === 'AbortError' ? 'The analysis service is taking longer than expected. Keep your recording and check analysis again.' : cause.message),
      finished:()=>setConfigLoaded(true),
    });
  }, [availabilityAttempt, user?.id]);

  useEffect(() => {
    mountedRef.current = true;
    setPlaybackError('');
    const url = URL.createObjectURL(recording.blob);
    setAudioUrl(url);
    return () => {
      mountedRef.current = false;
      URL.revokeObjectURL(url);
      controllerRef.current?.abort();
      // Keep completed jobs available for recovery; only cancel work still in progress.
      if (jobIdRef.current && busyRef.current) void analysisRequest(`/${jobIdRef.current}`, { method: 'DELETE' }).catch(() => {});
    };
  }, [recording.blob]);

  useEffect(() => {
    onReportChange(user && saveReport && report && !report.demo ? report : null);
  }, [saveReport, report, onReportChange]);

  useEffect(() => { onResult?.(user ? report : null); }, [report,onResult,user]);

  async function analyze() {
    if (!user || busyRef.current) return;
    busyRef.current = true;
    setError(''); setPublished(false); setStatus('submitting');
    const controller = new AbortController();
    controllerRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), Math.max(300000,(config?.jobTimeoutMs||240000)+30000));
    try {
      const form = new FormData();
      form.append('audio', recording.blob, 'speech-recording');
      form.append('metadata', JSON.stringify({ ...metadata, durationSeconds: recording.durationSeconds, consent: true }));
      let job = await analysisRequest('', { method: 'POST', body: form, signal: controller.signal, requestKey: requestKeyRef.current });
      jobIdRef.current = job.id;
      if (metadata.format === 'daily-challenge' && !config?.demo) onAttemptUsed?.();
      while (!['completed', 'error'].includes(job.status)) {
        if (mountedRef.current) setStatus(job.status);
        await waitForPoll(controller.signal);
        job = await analysisRequest(`/${job.id}`, { signal: controller.signal });
      }
      if (job.status === 'error') throw new Error(job.error);
      // Reuse this take’s key to recover a lost response without another charge.
      if (mountedRef.current) {
        setReport(job.result);
        setStatus('completed');
      }
    } catch (caught) {
      if (mountedRef.current) {
        setStatus('error');
        setError(controller.signal.aborted ? 'Analysis stopped or timed out. You can still replay your recording.' : caught.message);
      }
    } finally { clearTimeout(timeout); busyRef.current = false; if(metadata.format==='daily-challenge')onAttemptUsed?.(); }
  }

  async function cancel() {
    controllerRef.current?.abort();
    if (jobIdRef.current) {
      const id = jobIdRef.current; jobIdRef.current = null;
      try { await analysisRequest(`/${id}`, { method: 'DELETE' }); }
      catch { if (mountedRef.current) setError('The browser stopped waiting. Provider processing may continue until its timeout.'); }
    }
  }

  async function forget() {
    await cancel();
    if (mountedRef.current) { setReport(null); setSaveReport(false); setStatus('idle'); }
  }

  async function refreshCoaching() {
    if(busyRef.current || !jobIdRef.current)return;
    busyRef.current=true;setStatus('coaching');setError('');
    try{const signal=AbortSignal.timeout(Math.max(240000,(config?.jobTimeoutMs||240000)+30000));const job=await awaitRetry(await analysisRequest(`/${jobIdRef.current}/coaching`,{method:'POST',body:{transcript:report.transcript},signal}),signal);if(mountedRef.current)setReport(job.result);}
    catch(cause){if(mountedRef.current)setError(cause.message);}
    finally{busyRef.current=false;if(mountedRef.current)setStatus('completed');}
  }

  async function awaitRetry(job,signal){
    while(!['completed','error'].includes(job.status)){
      await waitForPoll(signal);job=await analysisRequest(`/${job.id}`,{signal});
    }
    if(job.status==='error')throw new Error(job.error||'Analysis could not finish.');
    return job;
  }
  async function publishChallenge() {
    if (busyRef.current || !jobIdRef.current) return;
    busyRef.current = true; setStatus('moderating'); setError('');
    try {
      await analysisRequest('/community', {method:'POST',body:{jobId:jobIdRef.current,consent:true,shareTranscript},signal:AbortSignal.timeout(15000)});
      if(mountedRef.current){setPublished(true);window.dispatchEvent(new Event('community-updated'));}
    } catch(cause){if(mountedRef.current)setError(cause.message);}
    finally{busyRef.current=false;if(mountedRef.current)setStatus('completed');}
  }
  async function retryReview() {
    if(busyRef.current || !jobIdRef.current)return;
    busyRef.current=true;setStatus('moderating');setError('');
    try {const signal=AbortSignal.timeout(60000);const job=await awaitRetry(await analysisRequest(`/${jobIdRef.current}/review`,{method:'POST',signal}),signal);if(mountedRef.current)setReport(job.result);}
    catch(cause){if(mountedRef.current)setError(cause.message);}
    finally{busyRef.current=false;if(mountedRef.current)setStatus('completed');}
  }
  async function withdrawEntry() {
    try {await analysisRequest('/community',{method:'DELETE',signal:AbortSignal.timeout(10000)});setPublished(false);window.dispatchEvent(new Event('community-updated'));}
    catch(cause){setError(cause.message);}
  }
  function downloadReport() {
    const text = reportText(report,metadata.topic);
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'simplyarticulate-feedback.txt'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className="analysis-panel" aria-labelledby="analysis-heading">
      <h2 id="analysis-heading">{user ? 'Your recording and feedback' : 'Your recording'}</h2>
      {audioUrl && (
        <>
          <audio
            ref={playerRef}
            onTimeUpdate={event=>setCurrentTime(event.currentTarget.currentTime)}
            controls controlsList="nodownload"
            preload="metadata"
            key={audioUrl}
            src={audioUrl}
            onLoadedData={()=>setPlaybackError('')}
            aria-label="Replay your speech"
            onError={() => setPlaybackError("This take could not be played. Try a new recording; new takes use a compatible WAV format.")}
          />
          {playbackError && <>
            <p role="alert" className="analysis-error">{playbackError}</p>
          </>}
        </>
      )}
      <p className="analysis-muted">{user ? 'Your recording stays in this browser until you choose Analyze. Analysis sends audio to AssemblyAI and the transcript to Google Gemini. Factual claims may be checked using Google Search. Recording audio is not saved in your practice history.' : 'Your recording stays on this device. You can replay it and download it. AI analysis and account audio storage require sign-in.'}</p>
      {config?.demo && <p className="analysis-notice">Demo mode: Analyze displays a sample report. It does not transcribe your recording or contact an AI provider.</p>}
      {user && configLoaded && config?.enabled===false && !configError && <p className="analysis-notice">AI analysis is not configured yet. You can replay your recording and save your practice.</p>}
      {configError && <div><p role="alert" className="analysis-error">{configError}</p><button className="secondary-button" onClick={()=>setAvailabilityAttempt(n=>n+1)}>Check analysis again</button></div>}
      {signInRequired && <div className="analysis-notice"><p>Record, replay and download on this device. Sign in for one practice analysis and one daily-challenge analysis each day.</p><button className="secondary-button" onClick={onSignUp}>Create account or sign in</button></div>}
      {usage && <p className="analysis-muted">{allowanceFull ? usage.paid ? 'Analysis is temporarily unavailable. Your recording is still available.' : 'Today’s analysis allowance for this section is used. Your recording is still available.' : usage.paid ? 'AI analysis is available with your subscription.' : `${usage.analysesRemaining} ${usage.category === 'challenge' ? 'daily-challenge' : 'practice'} analysis remaining today. Your practice and daily-challenge allowances are separate.`} Allowance resets at midnight UTC.</p>}
      {user && <div className="analysis-actions">
        <button type="button" className="primary-button" disabled={busy || !config?.enabled || signInRequired || (allowanceFull && !report && status!=='error' && !recording.recovery)} onClick={analyze}>
          {!configLoaded ? 'Checking analysis availability…' : report ? 'Analyze recording again' : config?.demo ? 'Preview sample report' : 'Analyze my speech'}
        </button>
        {busy && <button type="button" className="secondary-button" onClick={cancel}>Cancel analysis</button>}
      </div>}
      {busy && <p role="status" aria-live="polite">{STATUS_TEXT[status]} This can take a little while.</p>}
      {error && <p role="alert" className="analysis-error">{error}</p>}
      {user && report && <>
        {metadata.format==='daily-challenge' && !report.demo && <section className="community-review">
          <h3>Your challenge score</h3>
          {report.communityReview?.dimensions && <><p className="challenge-score">{report.communityReview.score}<span> / 100</span></p><p className="analysis-muted">AI rating of this take: relevance, organization, support and clarity. Scores can vary and do not measure your overall ability.</p><dl>{report.communityReview.dimensions.map(d=><div key={d.name}><dt>{d.name} · {d.score}/25</dt><dd>{d.reason}</dd></div>)}</dl></>}
          <p>{report.communityReview?.eligible ? 'This take passed community review.' : report.communityReview?.reason || 'Community review is unavailable; this take stays private.'}</p>
          {!published && report.communityReview?.eligible && <><p>Your public username: <strong>{metadata.publicUsername}</strong>. Joining publishes your username and score to everyone using the site.</p><label className="analysis-consent"><input type="checkbox" checked={shareTranscript} onChange={e=>setShareTranscript(e.target.checked)}/>Also let other users read my original transcript.</label><button className="primary-button" disabled={busy} onClick={publishChallenge}>Join today’s leaderboard</button><p className="analysis-muted">One scored attempt per account per UTC day; an eligible score can be entered on the leaderboard once. Audio and private practice details are never shared.</p></>}
          {report.communityReview?.retryable && <button className="secondary-button" disabled={busy} onClick={retryReview}>Retry community review</button>}
          {published && <><p role="status">Your entry is on today’s leaderboard.{shareTranscript?' Your transcript is also shared.':' Your transcript stays private.'}</p><button className="text-button" onClick={withdrawEntry} disabled={busy}>Withdraw my public entry</button></>}
        </section>}
        {report.demo && <p className="analysis-notice"><strong>Sample report — these are not your spoken words.</strong></p>}
        <div className="analysis-metrics">
          <div><strong>{report.metrics.wordCount}</strong><span>Words</span></div>
          <div><strong>{report.metrics.wordsPerMinute}</strong><span>Words per minute</span></div>
          <div><strong>{report.metrics.fillerCount}</strong><span>Detected fillers</span></div>
          <div><strong>{report.metrics.estimatedPauses.length}</strong><span>Estimated long pauses</span></div>
        </div>
        <p className="analysis-muted">Pace uses the full analyzed recording duration. Pause estimates use gaps of at least 1.5 seconds between recognized words. These are practice indicators, not an overall ability score.</p>
        <details open className="analysis-transcript">
          <summary>Original transcript</summary>
          {!report.demo && transcriptSegments(report).length ? <div className="transcript-segments">{transcriptSegments(report).map((segment,i,segments)=><div key={i}><button className="transcript-seek" aria-label={`Play sentence at ${Math.floor(segment.startSeconds)} seconds`} aria-current={currentTime>=segment.startSeconds && currentTime<(segments[i+1]?.startSeconds ?? Infinity)?'true':undefined} onClick={()=>{if(playerRef.current){playerRef.current.currentTime=segment.startSeconds;void playerRef.current.play().catch(()=>setPlaybackError('Press play to hear this moment.'));}}}>{Math.floor(segment.startSeconds/60)}:{String(Math.floor(segment.startSeconds%60)).padStart(2,'0')} · {segment.text}</button><div className="filler-seeks">{segment.words.filter(w=>/^(um+|uh+|erm|er|hmm)[,.!?]?$/i.test(w.text)).map((w,j)=><button className="text-button" key={j} onClick={()=>{if(playerRef.current){playerRef.current.currentTime=w.start/1000;void playerRef.current.play().catch(()=>{});}}}>Hear “{w.text}”</button>)}</div></div>)}</div> : <p>{report.transcript}</p>}
        </details>
        {report.coachingError && <p role="alert" className="analysis-error">{report.coachingError}</p>}
        {report.coachingError && jobIdRef.current && !report.demo && <button className="secondary-button" disabled={busy} onClick={refreshCoaching}>Retry coaching on this transcript</button>}
        {report.cleanupWarning && <p role="alert" className="analysis-error">{report.cleanupWarning}</p>}
        {report.coaching?.argumentLogic ? <FrameworkFeedback coaching={report.coaching} onRetry={onRetry} busy={busy} /> : report.coaching && <><SavedFeedback report={report}/>{onRetry && <button className="primary-button" disabled={busy} onClick={()=>onRetry(report.coaching.improvements?.[0] || report.coaching.nextExercise)}>Practice this improvement</button>}</>}
        {!report.demo && <label className="analysis-consent"><input type="checkbox" checked={saveReport} onChange={(event) => setSaveReport(event.target.checked)} />Keep this transcript and feedback with my progress. It will sync to my private account when available.</label>}
        <div className="analysis-actions">
          <button type="button" className="secondary-button" disabled={busy} onClick={downloadReport}>Download feedback</button>
          <button type="button" className="secondary-button" disabled={busy} onClick={forget}>Remove this report</button>
        </div>
      </>}
      {user && <p className="analysis-muted">Coaching assesses your words and measured timing. Pronunciation and intonation assessment are not included.</p>}
    </section>
  );
}
