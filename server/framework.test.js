import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { analysisAllowance, hasPaidEntitlement } from './analysis-allowance.js';
import { validateFramework } from './framework.js';
import { generateCoaching } from './providers.js';

import { frameworkFixture } from './framework-fixture.js';

test('daily free allowance reserves atomically, refunds failure, persists success', () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'sa-count-'));
  try {
    const ledger = analysisAllowance({ dataDir });
    const token = ledger.reserve('user', false);
    assert.throws(()=>ledger.reserve('user', false));
    ledger.finish(token, false);
    ledger.finish(ledger.reserve('user', false), true);
    assert.equal(analysisAllowance({ dataDir }).usage('user', false).canAnalyze, false);
    assert.equal(ledger.usage('other', false).canAnalyze, true);
  } finally { rmSync(dataDir, { recursive: true, force: true }); }
});
test('paid allowance enforces the configured daily total across both sections', () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'sa-paid-'));
  try {
    const ledger = analysisAllowance({ dataDir });
    for (let i=0;i<25;i++) ledger.finish(ledger.reserve('paid', true, i%2 ? 'daily-challenge' : 'speech'), true);
    assert.throws(()=>ledger.reserve('paid', true));
    assert.equal(ledger.usage('paid', true).analysesUsed, 25);
  } finally { rmSync(dataDir, { recursive: true, force: true }); }
});
test('only server-managed active unexpired entitlement grants paid allowance', () => {
  const subscription = { status: 'active', validUntil: '2099-01-01T00:00:00Z' };
  assert.equal(hasPaidEntitlement({user_metadata:{simplyarticulate_subscription:subscription}}), false);
  assert.equal(hasPaidEntitlement({app_metadata:{simplyarticulate_subscription:subscription}}), true);
  assert.equal(hasPaidEntitlement({app_metadata:{simplyarticulate_subscription:{...subscription,validUntil:'2000-01-01'}}}), false);
});
test('framework rejects fabricated quotes, sources, and invalid filler offsets', () => {
  const input = 'Daily practice helps.';
  assert.equal(validateFramework(structuredClone(frameworkFixture), input).nextStep, frameworkFixture.nextStep);
  const bad = structuredClone(frameworkFixture);
  bad.argumentLogic.issues = [{quote:'Invented',explanation:'Bad',suggestion:'Edit'}];
  assert.throws(()=>validateFramework(bad,input));
  bad.argumentLogic.issues=[];
  bad.argumentLogic.factChecks=[{claimQuote:'Daily practice',status:'supported',explanation:'True',correction:null,sourceIds:[]}];
  assert.throws(()=>validateFramework(bad,input));
  bad.argumentLogic.factChecks=[];
  bad.structureLanguage.fillerOccurrences=[{quote:'Daily',startChar:1,endChar:6}];
  const repaired = validateFramework(bad,input);
  assert.equal(repaired.structureLanguage.fillerOccurrences[0].startChar,0);
  assert.equal(repaired.structureLanguage.fillerOccurrences[0].endChar,5);
});

test('wrong model offsets are repaired from unique exact quotes without losing coaching', () => {
  const value = structuredClone(frameworkFixture);
  value.structureLanguage.fillerOccurrences=[{quote:'Um',startChar:12,endChar:14}];
  const result=validateFramework(value,'Um, daily practice helps.');
  assert.deepEqual(result.structureLanguage.fillerOccurrences,[{quote:'Um',startChar:0,endChar:2}]);
  assert.equal(result.languageMetrics.fillerCount,1);
  assert.equal(value.structureLanguage.fillerOccurrences[0].startChar,12);
});
test('fabricated and ambiguous occurrences are excluded with explicit uncertainty', () => {
  const value=structuredClone(frameworkFixture);
  value.structureLanguage.fillerOccurrences=[{quote:'Um',startChar:100,endChar:102},{quote:'invented',startChar:2,endChar:10}];
  const result=validateFramework(value,'Um, daily practice. Um, another try.');
  assert.equal(result.structureLanguage.fillerOccurrences.length,0);
  assert.match(result.structureLanguage.transcriptLimitations.at(-1),/excluded/);
});

test('Gemini 3.5 coaching omits legacy thinkingBudget and validates complete response', async () => {
  let calls = 0;
  const mock = async (_url, options) => {
    calls++;
    const request = JSON.parse(options.body);
    assert.equal(request.generationConfig.thinkingConfig, undefined);
    const text = request.tools ? 'No independently verifiable claims.' : JSON.stringify(frameworkFixture);
    return Response.json({ candidates: [{ content: { parts: [{ text }] } }] });
  };
  const result = await generateCoaching('Daily practice helps.', {}, {wordCount:3},
    {geminiModel:'gemini-3.5-flash-lite',geminiKey:'test'}, new AbortController().signal, mock);
  assert.equal(calls,2);
  assert.equal(result.argumentLogic.applicability,'applicable');
  assert.equal(result.structureLanguage.fillerOccurrences.length,0);
});

test('free practice and challenge allowances are independent and persist reservations across restart',()=>{
 const dataDir=mkdtempSync(path.join(tmpdir(),'sa-separate-'));
 try {
  const ledger=analysisAllowance({dataDir});
  ledger.finish(ledger.reserve('free',false,'speech'),true);
  assert.throws(()=>ledger.reserve('free',false,'research'));
  assert.equal(ledger.usage('free',false,'daily-challenge').canAnalyze,true);
  ledger.reserve('free',false,'daily-challenge');
  const restarted=analysisAllowance({dataDir});
  assert.equal(restarted.usage('free',false,'daily-challenge').canAnalyze,false);
  assert.equal(restarted.usage('free',false,'debate').canAnalyze,false);
  assert.equal(restarted.usage('other',false).canAnalyze,true);
 } finally {rmSync(dataDir,{recursive:true,force:true});}
});

test('allowances reset at midnight UTC',()=>{
 const dataDir=mkdtempSync(path.join(tmpdir(),'sa-rollover-'));const RealDate=Date;
 try{
  let now=Date.parse('2026-10-11T23:59:00Z');
  globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
  const ledger=analysisAllowance({dataDir});ledger.finish(ledger.reserve('free',false),true);
  assert.equal(ledger.usage('free',false).canAnalyze,false);
  now=RealDate.parse('2026-10-12T00:00:00Z');
  assert.equal(ledger.usage('free',false).canAnalyze,true);
 }finally{globalThis.Date=RealDate;rmSync(dataDir,{recursive:true,force:true});}
});
