import test from 'node:test';
import assert from 'node:assert/strict';
import {isAllowedOrigin} from './allowed-origin.js';
const config={production:false,host:'127.0.0.1',allowedOrigins:new Set(['https://simplyarticulate.com'])};
test('local development accepts alternate Vite ports, with strict host matching',()=>{
 for(const origin of ['http://localhost:5174','http://127.0.0.1:5180','http://[::1]:4174'])assert.equal(isAllowedOrigin(origin,config),true);
 for(const origin of ['https://evil.example','http://localhost.evil.example:5174','null','http://localhost:5174/path'])assert.equal(isAllowedOrigin(origin,config),false);
});
test('production and publicly bound servers keep the exact origin allowlist',()=>{
 for(const strict of [{...config,production:true},{...config,host:'0.0.0.0'}]) {
 assert.equal(isAllowedOrigin('http://localhost:5174',strict),false);
 assert.equal(isAllowedOrigin('https://simplyarticulate.com',strict),true);
 }
});
