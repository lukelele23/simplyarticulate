import {isAllowedOrigin as allowed} from '../supabase/functions/_shared/origins.js';
export function isAllowedOrigin(origin,config){return allowed(origin,config.allowedOrigins,!config.production&&config.host==='127.0.0.1');}
