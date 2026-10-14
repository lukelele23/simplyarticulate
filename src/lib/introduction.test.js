import test from 'node:test';
import assert from 'node:assert/strict';
import {introductionForLoad} from './introduction.js';
function store(initial={}){const values=new Map(Object.entries(initial));return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};}
test('introduction appears on first visit and every fourth refresh after dismissal',()=>{
 const storage=store();assert.equal(introductionForLoad(storage,'navigate'),true);
 storage.setItem('sa-introduction-seen','1');
 assert.deepEqual(Array.from({length:8},()=>introductionForLoad(storage,'reload')),[false,false,false,true,false,false,false,true]);
});
test('ordinary visits and back navigation do not advance refresh count',()=>{
 const storage=store({'sa-introduction-seen':'1','sa-introduction-refreshes':'3'});
 assert.equal(introductionForLoad(storage,'navigate'),false);
 assert.equal(introductionForLoad(storage,'back_forward'),false);
 assert.equal(introductionForLoad(storage,'reload'),true);
});
test('invalid counters reset and unavailable storage does not block the page',()=>{
 const storage=store({'sa-introduction-seen':'1','sa-introduction-refreshes':'NaN'});
 assert.equal(introductionForLoad(storage,'reload'),false);
 assert.equal(introductionForLoad({getItem(){throw Error('Unavailable');}},'reload'),true);
});
