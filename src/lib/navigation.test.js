import test from 'node:test';import assert from 'node:assert/strict';import {routeFor,MAIN_VIEWS} from './navigation.js';test('every main destination has a stable direct route',()=>{for(const view of MAIN_VIEWS)assert.deepEqual(routeFor('/'+view),{screen:'difficulty',view,path:'/'+view});assert.equal(routeFor('/settings').screen,'settings');assert.equal(routeFor('/practice/review').screen,'review');});

test('unknown paths do not masquerade as Home',()=>{assert.equal(routeFor('/missing-page').screen,'not-found');assert.equal(routeFor('/').view,'home');});
