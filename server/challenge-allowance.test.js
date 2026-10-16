import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {analysisAllowance} from './analysis-allowance.js';
test('competitive allowance renews with the EST challenge even within the same UTC usage day',t=>{
 const dataDir=mkdtempSync(path.join(tmpdir(),'sa-challenge-est-'));t.after(()=>rmSync(dataDir,{recursive:true,force:true}));
 let time=Date.parse('2026-07-02T04:59:59Z');const config={dataDir},now=()=>time;
 const allowance=analysisAllowance(config,now);
 const old=allowance.reserve('owner',false,'daily-challenge');allowance.finish(old,true);
 assert.equal(allowance.usage('owner',false,'daily-challenge').canAnalyze,false);
 time=Date.parse('2026-07-02T05:00:00Z');
 assert.equal(allowance.usage('owner',false,'daily-challenge').canAnalyze,true);
 const next=allowance.reserve('owner',false,'daily-challenge');allowance.finish(next,true);
 assert.equal(analysisAllowance(config,now).usage('owner',false,'daily-challenge').canAnalyze,false);
 assert.equal(allowance.usage('owner',false,'speech').canAnalyze,true);
});
