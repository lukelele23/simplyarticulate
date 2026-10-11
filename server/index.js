import {topicVoting} from './topic-voting.js';
import { analysisAllowance, hasPaidEntitlement } from './analysis-allowance.js';
import http from 'node:http';
import { communityStore, reviewChallenge } from './community.js';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateMetadata } from './metrics.js';
import { analyzeAudio, demoAnalysis, generateCoaching, logCoachingFailure } from './providers.js';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

export function readConfig(env = process.env) {
  const demo = env.AI_DEMO_MODE === 'true';
  const production = env.NODE_ENV === 'production';
  if (demo && production) throw new Error('Demo mode must be disabled in production.');
  const positive = (name, fallback, maximum) => {
    const value = Number(env[name] || fallback);
    if (!Number.isFinite(value) || value < 1 || value > maximum) throw new Error(`Invalid ${name}.`);
    return value;
  };
  const assemblyBase = env.ASSEMBLYAI_BASE_URL || 'https://api.assemblyai.com';
  if (!['https://api.assemblyai.com', 'https://api.eu.assemblyai.com'].includes(assemblyBase)) throw new Error('Invalid AssemblyAI endpoint.');
  const host = env.AI_HOST || (production?'0.0.0.0':'127.0.0.1');
  if (demo && host !== '127.0.0.1') throw new Error('Demo mode must bind to 127.0.0.1.');
  return {
    demo, production, enabled: demo || env.AI_ENABLED === 'true', host,
    port: positive('AI_PORT', Number(env.PORT || 8787), 65535),
    assemblyKey: env.ASSEMBLYAI_API_KEY || '', geminiKey: env.GEMINI_API_KEY || '',
    assemblyModel: env.ASSEMBLYAI_MODEL || 'universal-3-5-pro',
    geminiModel: env.GEMINI_MODEL || 'gemini-3.5-flash-lite', assemblyBase,
    supabaseUrl: env.SUPABASE_URL || env.VITE_SUPABASE_URL || '',
    supabaseKey: env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
    paidDailyAnalyses: positive('AI_PAID_DAILY_ANALYSES', 25, 1000),
    maxSeconds: positive('AI_MAX_SECONDS', 300, 300),
    maxBytes: positive('AI_MAX_UPLOAD_MB', 12, 25) * 1024 * 1024,
    userDailySeconds: positive('AI_USER_DAILY_MINUTES', 30, 1440) * 60,
    globalDailySeconds: positive('AI_GLOBAL_DAILY_MINUTES', 300, 100000) * 60,
    maxConcurrent: positive('AI_MAX_CONCURRENT_JOBS', 3, 20),
    timeoutMs: positive('AI_JOB_TIMEOUT_SECONDS', 240, 600) * 1000,
    pollMs: 2000,
    allowedOrigins: new Set((env.AI_ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,https://simplyarticulate.com,https://www.simplyarticulate.com').split(',').map((origin) => origin.trim()).concat(production?[]:['http://localhost:4173','http://127.0.0.1:4173'])),
    dataDir: path.resolve(projectRoot, env.AI_DATA_DIR || '.ai-data'),
  };
}

export function createAnalysisServer(config, dependencies = {}) {
  const fetchImpl = dependencies.fetchImpl || fetch;
  const analyze = dependencies.analyze || analyzeAudio;
  const coach = dependencies.coach || generateCoaching;
  const store = communityStore(config.dataDir);
  const review = dependencies.review || reviewChallenge;
  const voting = topicVoting(config,fetchImpl,dependencies.now || Date.now);
  const getChallenge = dependencies.getChallenge || voting.challenge;
  const allowance = analysisAllowance(config);
  const entitlements = new Map();
  const jobs = new Map();
  const rates = new Map();
  const quotaPath = path.join(config.dataDir, 'usage.json');
  let quota = { day: new Date().toISOString().slice(0, 10), users: {}, total: 0 };
  if (!config.demo) {
    mkdirSync(config.dataDir, { recursive: true });
    if (existsSync(quotaPath)) {
      quota = JSON.parse(readFileSync(quotaPath, 'utf8'));
      if (!quota || typeof quota.day !== 'string' || typeof quota.users !== 'object' || !Number.isFinite(quota.total)) {
        throw new Error('Invalid quota file. Repair it before enabling AI.');
      }
    }
  }
  function saveQuota() {
    if (config.demo) return;
    writeFileSync(`${quotaPath}.tmp`, JSON.stringify(quota), { mode: 0o600 });
    renameSync(`${quotaPath}.tmp`, quotaPath);
  }
  function currentQuota() {
    const day = new Date().toISOString().slice(0, 10);
    if (quota.day !== day) { quota = { day, users: {}, total: 0 }; saveQuota(); }
    return quota;
  }
  function reserve(owner) {
    const current = currentQuota();
    if ((!entitlements.get(owner) && (current.users[owner] || 0) + config.maxSeconds > config.userDailySeconds+(allowance.surveyStatus(owner).completed?config.maxSeconds:0)) ||
        current.total + config.maxSeconds > config.globalDailySeconds) {
      throw Object.assign(new Error('Today’s analysis allowance is full. Try again tomorrow.'), { status: 429 });
    }
    current.users[owner] = (current.users[owner] || 0) + config.maxSeconds;
    current.total += config.maxSeconds;
    saveQuota();
    return current.day;
  }
  function settle(owner, reservedDay, actualSeconds) {
    const current = currentQuota();
    if (current.day !== reservedDay) return;
    const refund = Math.max(0, config.maxSeconds - Math.ceil(actualSeconds));
    current.users[owner] = Math.max(0, (current.users[owner] || 0) - refund);
    current.total = Math.max(0, current.total - refund);
    saveQuota();
  }
  function configured() {
    return config.demo || Boolean(config.enabled && config.assemblyKey && config.geminiKey && config.supabaseUrl && config.supabaseKey);
  }
  async function authenticate(req) {
    const authorization = req.headers.authorization;
    if (!authorization?.startsWith('Bearer ') || authorization.length > 10000) {
      throw Object.assign(new Error('Sign in to use AI analysis.'), { status: 401 });
    }
    const response = await fetchImpl(`${config.supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
      headers: { authorization, apikey: config.supabaseKey }, signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw Object.assign(new Error('Your sign-in expired. Sign in again.'), { status: 401 });
    const user = await response.json();
    if (typeof user.id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(user.id)) throw Object.assign(new Error('Invalid sign-in.'), { status: 401 });
    entitlements.set(user.id, hasPaidEntitlement(user));
    return user.id;
  }
  function rateLimit(owner) {
    const now = Date.now();
    const attempts = (rates.get(owner) || []).filter((time) => now - time < 60000);
    if (attempts.length >= 5) throw Object.assign(new Error('Please wait a minute before another analysis request.'), { status: 429 });
    attempts.push(now); rates.set(owner, attempts);
  }
  function respond(res, status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(data));
  }
  function ownedJob(id, owner) {
    const job = jobs.get(id);
    if (!job || job.owner !== owner) throw Object.assign(new Error('Analysis not found or expired. Your recording stays in your browser.'), { status: 404 });
    return job;
  }
  async function readBody(req, maximum) {
    if (Number(req.headers['content-length']) > maximum) throw Object.assign(new Error('Recording is too large.'), { status: 413 });
    const chunks = []; let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > maximum) throw Object.assign(new Error('Recording is too large.'), { status: 413 });
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  function snapshot(job) {
    return { id: job.id, status: job.status, result: job.result || null, error: job.error || null };
  }
  async function processJob(job, audio, type, metadata) {
    const timeout = setTimeout(() => job.controller.abort(), config.timeoutMs);
    try {
      job.result = config.demo ? demoAnalysis(metadata) : await analyze(
        audio, type, metadata, config, (status) => { job.status = status; }, job.controller.signal, fetchImpl,
      );
      if (!config.demo) settle(job.owner, job.reservedDay, job.result.metrics.durationSeconds);
      if (metadata.format === 'daily-challenge' && !config.demo) {
        job.status = 'moderating';
        try { job.result.communityReview = await review(job.result, metadata, config, job.controller.signal, fetchImpl); }
        catch { job.result.communityReview = {moderation:'review',eligible:false,retryable:true,reason:'Community review is unavailable. Your transcript stays private; retry review later.'}; }
      }
      if (!config.demo) allowance.finish(job.analysisToken, Boolean(job.result.transcript || job.result.communityReview));
      if (!config.demo && metadata.format==='daily-challenge')store.completeAttempt(job.owner,metadata.challengeId,job);
      job.status = 'completed';
    } catch (error) {
      if(!config.demo&&!job.result)settle(job.owner,job.reservedDay,0);
      job.status = 'error';
      job.error = job.controller.signal.aborted ? 'Analysis stopped or timed out. Your recording is still available for playback.' :
        ['No speech was detected. Try recording again in a quieter place.', 'This recording could not be transcribed. Check the audio and try again.'].includes(error.message)
          ? error.message : 'Analysis could not finish. Check your connection and try again later.';
      console.error(`Analysis ${job.id} failed (${error.name || 'Error'}).`);
      if (!config.demo && metadata.format==='daily-challenge')store.failAttempt(job.owner,metadata.challengeId);
    } finally {
      if (!config.demo) allowance.finish(job.analysisToken, false);
      clearTimeout(timeout);
      job.finishedAt = Date.now();
      if (job.deleted) jobs.delete(job.id);
    }
  }
  const server = http.createServer(async (req, res) => {
    try {
      const origin = req.headers.origin;
      if (origin && !config.allowedOrigins.has(origin)) return respond(res, 403, { error: 'This website origin is not allowed.' });
      // The frontend uses a same-origin /api proxy. No wildcard CORS is enabled.
      const url = new URL(req.url, 'http://localhost');
      if(req.method==='GET'&&url.pathname==='/api/analysis/health')return respond(res,configured()?200:503,{ready:configured()});
      if (req.method === 'GET' && url.pathname === '/api/analysis/config') {
        return respond(res, 200, { enabled: configured(), demo: config.demo, requiresSignIn: true,
          maxSeconds: config.maxSeconds, maxUploadBytes: config.maxBytes, jobTimeoutMs: config.timeoutMs });
      }
      if (!url.pathname.startsWith('/api/analysis')) return respond(res, 404, { error: 'Not found.' });
      if (req.method === 'GET' && url.pathname === '/api/analysis/challenge') {
        return respond(res,200,await getChallenge());
      }
      if (req.method === 'GET' && url.pathname === '/api/analysis/topic-vote/results') {
        return respond(res,200,await voting.results());
      }
      if (url.pathname === '/api/analysis/topic-vote') {
        const voter = await authenticate(req);
        if(req.method==='GET')return respond(res,200,await voting.ballot(voter));
        if(req.method==='POST'){
          rateLimit(voter);
          let ballot;
          try{ballot=JSON.parse((await readBody(req,2048)).toString('utf8'));}catch(error){if(error.status)throw error;return respond(res,400,{error:'Invalid vote.'});}
          if(typeof ballot?.targetDay!=='string'||typeof ballot?.choiceId!=='string')return respond(res,400,{error:'Choose one of the listed topics.'});
          return respond(res,200,await voting.vote(voter,ballot.targetDay,ballot.choiceId));
        }
        return respond(res,405,{error:'Method not allowed.'});
      }
      if (req.method === 'GET' && url.pathname === '/api/analysis/community') {
        const day = url.searchParams.get('day') || new Date().toISOString().slice(0,10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return respond(res,400,{error:'Invalid challenge day.'});
        return respond(res,200,{entries:store.list(day),day});
      }
      if (req.method === 'GET' && url.pathname === '/api/analysis/community/attempt') {
        const owner = await authenticate(req);
        const day = url.searchParams.get('day') || new Date().toISOString().slice(0,10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return respond(res,400,{error:'Invalid challenge day.'});
        const attempt=store.attempt(owner,day);
        return respond(res,200,{day,used:Boolean(attempt),recoverable:attempt?.state==='failed',state:attempt?.state || 'available'});
      }
      if (req.method === 'DELETE' && url.pathname === '/api/analysis/community') {
        const owner = await authenticate(req);
        store.withdraw(owner,new Date().toISOString().slice(0,10)); return respond(res,200,{withdrawn:true});
      }
      if(url.pathname==='/api/analysis/subscription-survey'){
        const owner=await authenticate(req);
        if(req.method==='GET')return respond(res,200,allowance.surveyStatus(owner));
        if(req.method==='POST'){
          rateLimit(owner);
          let body;try{body=JSON.parse((await readBody(req,2048)).toString('utf8'));}catch(error){if(error.status)throw error;return respond(res,400,{error:'Choose a survey answer.'});}
          return respond(res,200,allowance.completeSurvey(owner,body?.answer));
        }
        return respond(res,405,{error:'Method not allowed.'});
      }
      if (!configured()) return respond(res, 503, { error: 'AI analysis is not configured yet. You can still use the practice timer.' });
      const owner = await authenticate(req);

      if (req.method === 'POST' && url.pathname === '/api/analysis/community') {
        rateLimit(owner);
        const body=JSON.parse((await readBody(req,2048)).toString('utf8'));
        if(body.consent!==true || typeof body.shareTranscript!=='boolean')return respond(res,400,{error:'Choose whether to share your transcript and confirm public entry.'});
        const job=ownedJob(body.jobId,owner);
        if(job.status!=='completed' || job.metadata.format!=='daily-challenge' || job.result?.demo)return respond(res,409,{error:'Complete a live daily challenge analysis first.'});
        const challenge=await getChallenge();
        if(job.metadata.challengeId!==challenge.id || job.metadata.topic!==challenge.topic)return respond(res,409,{error:'The daily challenge changed. Try the current challenge.'});
        return respond(res,201,{entry:store.publish(owner,job,body.shareTranscript)});
      }
      if (req.method === 'GET' && url.pathname === '/api/analysis/usage') {
        const current = currentQuota();
        return respond(res, 200, { day: current.day, ...(entitlements.get(owner) ? {} : { usedSeconds: current.users[owner] || 0, limitSeconds: config.userDailySeconds+(allowance.surveyStatus(owner).completed?config.maxSeconds:0), reservationSeconds: config.maxSeconds }), ...allowance.usage(owner, entitlements.get(owner), url.searchParams.get('format') || 'speech') });
      }
      if (req.method === 'POST' && url.pathname === '/api/analysis') {
        rateLimit(owner);
        if (!(req.headers['content-type'] || '').startsWith('multipart/form-data;')) return respond(res, 415, { error: 'Send an audio recording and practice details.' });
        const body = await readBody(req, config.maxBytes + 8192);
        let form;
        try { form = await new Request('http://localhost', { method: 'POST', headers: { 'Content-Type': req.headers['content-type'] }, body }).formData(); }
        catch { return respond(res, 400, { error: 'Invalid upload.' }); }
        const file = form.get('audio');
        const rawMetadata = form.get('metadata');
        if (typeof rawMetadata !== 'string' || rawMetadata.length > 4096) return respond(res, 400, { error: 'Invalid practice details.' });
        let metadata;
        try { metadata = validateMetadata(JSON.parse(rawMetadata), config.maxSeconds); }
        catch (error) { return respond(res, 400, { error: error.message }); }
        if(metadata.format==='daily-challenge' && !config.demo){
          const challenge=await getChallenge();
          if(metadata.challengeId!==challenge.id || metadata.topic!==challenge.topic)return respond(res,400,{error:'Use today’s official challenge topic.'});
        }
        const allowedTypes = new Set(['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'video/webm']);
        if (!file || typeof file.arrayBuffer !== 'function' || file.size < 64 || file.size > config.maxBytes || !allowedTypes.has(file.type.split(';')[0])) {
          return respond(res, 400, { error: 'Use a nonempty WebM, MP4, Ogg, or WAV recording within the upload limit.' });
        }
        const audio = Buffer.from(await file.arrayBuffer());
        const requestKey = req.headers['idempotency-key'];
        if (requestKey && (typeof requestKey !== 'string' || !/^[a-zA-Z0-9-]{10,100}$/.test(requestKey))) return respond(res,400,{error:'Invalid request key.'});
        const digest = createHash('sha256').update(audio).update(JSON.stringify(metadata)).digest('hex');
        const previous = requestKey && [...jobs.values()].find(j=>j.owner===owner && j.requestKey===requestKey);
        if (previous) {
          if (previous.digest !== digest) return respond(res,409,{error:'This request key belongs to a different recording.'});
          if (previous.status !== 'error') return respond(res,200,snapshot(previous));
        }
        if(!config.demo && metadata.format==='daily-challenge' && requestKey){
          const attempt=store.attempt(owner,metadata.challengeId);
          if(attempt?.digest===digest && attempt.requestKey===requestKey && attempt.state==='completed' && attempt.result){
            const recovered={id:attempt.jobId,owner,metadata:attempt.metadata,result:attempt.result,reviewRetries:attempt.reviewRetries || 0,status:'completed',finishedAt:Date.now(),controller:new AbortController(),digest,requestKey};
            jobs.set(recovered.id,recovered);return respond(res,200,snapshot(recovered));
          }
        }
        if ([...jobs.values()].filter((job) => !job.finishedAt).length >= config.maxConcurrent ||
            [...jobs.values()].some((job) => job.owner === owner && !job.finishedAt) || jobs.size >= 500) {
          return respond(res, 429, { error: 'Analysis is busy. Please wait for it to finish.' });
        }
        const analysisToken = config.demo ? null : allowance.reserve(owner, entitlements.get(owner), metadata.format);
        let reservedDay;
        try { reservedDay = config.demo ? null : reserve(owner); }
        catch (error) { allowance.finish(analysisToken, false); throw error; }
        if(metadata.format==='daily-challenge' && !config.demo){
          try {
            if(!store.reserveAttempt(owner,metadata.challengeId,digest,requestKey)){
              allowance.finish(analysisToken,false);settle(owner,reservedDay,0);
              return respond(res,429,{error:'Today’s competitive take is locked. After a service failure, recover and analyze the original recording; a replacement cannot be scored.'});
            }
          } catch(error) {
            allowance.finish(analysisToken,false);settle(owner,reservedDay,0);
            throw error;
          }
        }
        const job = { id: randomUUID(), owner, metadata, reservedDay, analysisToken, requestKey, digest, status: 'queued', controller: new AbortController(), createdAt: Date.now() };
        jobs.set(job.id, job);
        respond(res, 202, snapshot(job));
        void processJob(job, audio, file.type, metadata);
        return;
      }
      const match = url.pathname.match(/^\/api\/analysis\/([a-f0-9-]{36})(\/coaching|\/review)?$/);
      if (!match) return respond(res, 404, { error: 'Not found.' });
      const job = ownedJob(match[1], owner);
      if (req.method === 'GET' && !match[2]) return respond(res, 200, snapshot(job));
      if (req.method === 'DELETE' && !match[2]) {
        if(!config.demo && job.metadata.format==='daily-challenge' && job.status==='completed')store.forgetRecovery(owner,job.metadata.challengeId);
        job.deleted = true; job.controller.abort();
        if (job.finishedAt) jobs.delete(job.id);
        return respond(res, 200, { deleted: true });
      }
      if (req.method === 'POST' && match[2] === '/review') {
        rateLimit(owner);
        if(config.demo || job.status!=='completed' || !job.result || job.metadata.format!=='daily-challenge')return respond(res,409,{error:'Complete a live daily challenge first.'});
        if(!job.result.communityReview?.retryable)return respond(res,409,{error:'This take already has a community review. Its score and moderation decision are retained.'});
        if((job.reviewRetries||0)>=3)return respond(res,429,{error:'Community review retry limit reached.'});
        job.reviewRetries=(job.reviewRetries||0)+1;job.status='moderating';job.finishedAt=null;
        respond(res,202,snapshot(job));
        void (async()=>{
        try {job.result.communityReview=await review(job.result,job.metadata,config,AbortSignal.timeout(35000),fetchImpl);}
        catch {job.result.communityReview={moderation:'review',eligible:false,retryable:true,reason:'Review unavailable. Your transcript stays private.'};}
        finally {job.status='completed';job.finishedAt=Date.now();store.completeAttempt(owner,job.metadata.challengeId,job);}
        })().catch(()=>console.error('Community retry persistence failed.'));
        return;
      }
      if (req.method === 'POST' && match[2] === '/coaching') {
        rateLimit(owner);
        if (!job.result || job.status !== 'completed') return respond(res, 409, { error: 'Wait for the transcript to finish.' });
        job.coachingRetries = (job.coachingRetries || 0) + 1;
        const body = await readBody(req, 32000);
        let transcript;
        try { transcript = JSON.parse(body.toString('utf8')).transcript; } catch { return respond(res, 400, { error: 'Invalid transcript.' }); }
        if (typeof transcript !== 'string' || transcript.trim().length < 5 || transcript.length > 30000) return respond(res, 400, { error: 'Provide a transcript between 5 and 30,000 characters.' });
        if (config.demo) return respond(res, 200, snapshot(job));
        if (job.result.coaching && transcript === (job.result.coachingTranscript || job.result.transcript)) return respond(res, 200, snapshot(job));
        if (job.coachingRetries > 3) return respond(res,429,{error:'Coaching retry limit reached. Your transcript is retained.'});
        const originalRetry = !job.result.coaching && transcript === job.result.transcript;
        const refreshToken = originalRetry ? null : allowance.reserve(owner, entitlements.get(owner), job.metadata.format);
        job.controller=new AbortController();
        const retryTimeout=setTimeout(()=>job.controller.abort(),config.timeoutMs);
        job.status = 'coaching'; job.finishedAt = null;
        respond(res,202,snapshot(job));
        void (async()=>{
        try {
          const coaching = await coach(transcript, job.metadata, job.result.metrics, config, job.controller.signal, fetchImpl);
          allowance.finish(refreshToken, true);
          job.result = { ...job.result, coachingTranscript: transcript, coaching, coachingError: null };
        } catch (error) {
          job.result.coachingErrorCode = logCoachingFailure(error, config.geminiModel);
          job.result.coachingError = 'Written coaching is temporarily unavailable. Your original transcript and metrics are preserved.';
        }
        finally { clearTimeout(retryTimeout);allowance.finish(refreshToken, false); job.status = 'completed'; job.finishedAt = Date.now(); if(job.metadata.format==='daily-challenge')store.completeAttempt(owner,job.metadata.challengeId,job); }
        })().catch(()=>console.error('Coaching retry persistence failed.'));
        return;
      }
      return respond(res, 405, { error: 'Method not allowed.' });
    } catch (error) {
      if (!res.headersSent) respond(res, error.status || 500, { error: error.status ? error.message : 'The analysis service is temporarily unavailable.' });
    }
  });
  server.requestTimeout = 30000;
  const cleanupTimer = setInterval(() => {
    store.expireRecovery();
    const now = Date.now();
    for (const [id, job] of jobs) {
      if (job.finishedAt && now - job.finishedAt > 30 * 60 * 1000) jobs.delete(id);
    }
    for (const [owner, attempts] of rates) if (!attempts.some((time) => now - time < 60000)) rates.delete(owner);
  }, 60000);
  cleanupTimer.unref();
  server.on('close', () => { clearInterval(cleanupTimer); for (const job of jobs.values()) job.controller.abort(); });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = readConfig();
  const server = createAnalysisServer(config);
  server.listen(config.port, config.host, () => console.log(`Speech analysis backend: http://${config.host}:${config.port} (${config.demo ? 'SAMPLE DEMO' : config.enabled ? 'live configuration' : 'disabled'})`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}
