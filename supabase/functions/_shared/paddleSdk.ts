// Server-only SDK. Deno selects the SDK's edge runtime export.
import {Paddle,Environment} from 'npm:@paddle/paddle-node-sdk@3.10.0';
let instance:Paddle|undefined;
export function getPaddleSdk(config:{environment:string,key:string}){
 if(!['sandbox','production'].includes(config.environment))throw new Error('Invalid billing environment.');
 if(!config.key)throw new Error('Set PADDLE_API_KEY on the server.');
 instance??=new Paddle(config.key,{environment:config.environment==='sandbox'?Environment.sandbox:Environment.production});return instance;
}
