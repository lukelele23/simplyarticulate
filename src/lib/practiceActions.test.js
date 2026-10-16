import test from 'node:test';
import assert from 'node:assert/strict';
import {evidenceTime,practiceActions,cleanPracticeActions,updatePracticeActions,practicePlanText} from './practiceActions.js';
const report={transcript:'My claim needs an example.',words:[{text:'My',start:0,end:100},{text:'claim',start:200,end:400},{text:'needs',start:500,end:650},{text:'an',start:700,end:800},{text:'example.',start:900,end:1200}],coaching:{nextStep:'Add one specific example.',argumentLogic:{issues:[{quote:'claim needs',suggestion:'Explain why this matters.'}]}}};
test('actions use validated corrections and real, unambiguous audio evidence',()=>{
 const actions=practiceActions(report);assert.equal(actions.length,2);assert.equal(actions[1].startSeconds,.2);assert.equal(actions[0].startSeconds,null);
 assert.equal(evidenceTime(report,'made up'),null);assert.equal(evidenceTime({...report,demo:true},'claim'),null);
 const repeated={transcript:'Yes yes',words:[{text:'Yes',start:0,end:100},{text:'yes',start:200,end:300}]};assert.equal(evidenceTime(repeated,'yes'),null);
 assert.equal(practiceActions({...report,demo:true}).length,0);
});
test('stable IDs preserve checks when issues reorder, never transferring to changed guidance',()=>{
 const first=practiceActions(report)[1];const changed=structuredClone(report);changed.coaching.argumentLogic.issues.unshift({quote:'My',suggestion:'Keep your point clear.'});
 assert.equal(practiceActions(changed).find(a=>a.label===first.label).id,first.id);
 changed.coaching.argumentLogic.issues[1].suggestion='Give a different example.';assert.notEqual(practiceActions(changed)[2].id,first.id);
});
test('annotation updates preserve feedback, isolate takes and keep private text out of status keys',()=>{
 const id=practiceActions(report)[0].id;const original=[{id:'a',analysis:report},{id:'b'}];
 const result=updatePracticeActions(original,'a',{checks:{[id]:true},note:'Try a clearer opening.'});assert.equal(result[0].analysis,report);assert.equal(result[1],original[1]);assert.equal(original[0].practiceActions,undefined);
 assert.deepEqual(cleanPracticeActions({checks:{bad:true,[id]:'true'},note:'x'.repeat(700)}),{version:1,checks:{},note:'x'.repeat(600)});
 assert.match(practicePlanText(practiceActions(report),result[0].practiceActions),/\[x\]/);
});
