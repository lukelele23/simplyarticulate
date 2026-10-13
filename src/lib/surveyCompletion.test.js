import test from 'node:test';
import assert from 'node:assert/strict';
import {readSurveyCompletion,rememberSurveyCompletion,shouldShowSurvey} from './surveyCompletion.js';
test('confirmed completion survives remounts and is isolated by account',()=>{
 const map=new Map(),storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};
 rememberSurveyCompletion('a',{completed:false},storage);assert.equal(readSurveyCompletion('a',storage),false);
 rememberSurveyCompletion('a',{completed:true},storage);assert.equal(readSurveyCompletion('a',storage),true);
 assert.equal(readSurveyCompletion('b',storage),false);
 rememberSurveyCompletion('a',{completed:false},storage);assert.equal(readSurveyCompletion('a',storage),true);
});
test('unknown, failed and completed states never offer a repeat survey',()=>{
 assert.equal(shouldShowSurvey('a',null),false);
 assert.equal(shouldShowSurvey('a',{owner:'a',completed:true}),false);
 assert.equal(shouldShowSurvey('b',{owner:'a',completed:false}),false);
 assert.equal(shouldShowSurvey('a',{owner:'a',completed:false}),true);
});
