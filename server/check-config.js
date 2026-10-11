// Read-only credential/model checks. Never transcribes audio or generates text.
import { readConfig } from './index.js';
const config=readConfig();
console.log(`Live AI enabled: ${config.enabled}; demo: ${config.demo}`);
for(const [name,url,headers] of [
 ['AssemblyAI',`${config.assemblyBase}/v2/transcript?limit=1`,{authorization:config.assemblyKey}],
 ['Gemini model metadata (generation not verified)',`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.geminiModel)}`,{'x-goog-api-key':config.geminiKey}]
]){try{const response=await fetch(url,{headers,signal:AbortSignal.timeout(15000)});console.log(`${name}: ${response.ok?'credential/model check passed':`HTTP ${response.status}`}`);await response.body?.cancel();}catch(error){console.log(`${name}: connection check failed (${error.name})`);}}
