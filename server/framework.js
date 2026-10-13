import {readFileSync} from 'node:fs';
// Node and Edge share the same schema, evidence checks, score validation and fact verification.
export {FRAMEWORK_SCHEMA,validateFramework,verifyClaims} from '../supabase/functions/_shared/framework.js';
export const FRAMEWORK_PROMPT=readFileSync(new URL('./prompts/simplyarticulate.txt',import.meta.url),'utf8');
