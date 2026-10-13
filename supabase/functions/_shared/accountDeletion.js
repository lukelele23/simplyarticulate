export function accountName(user){const m=user?.user_metadata||{};return m.username||m.full_name||m.name||user?.email||'';}
export function verifyDeletion(user,confirmation,now=Date.now()){
 if(!user?.id||!accountName(user)||confirmation!==accountName(user))throw Object.assign(Error('Type your account name exactly to confirm deletion.'),{status:400});
 const signedIn=Date.parse(user.last_sign_in_at||'');
 if(!Number.isFinite(signedIn)||signedIn>now+60000||now-signedIn>600000)throw Object.assign(Error('Sign in again to verify account deletion, then retry within ten minutes.'),{status:409});
}
export async function runDeletion(adapter){
 let state=await adapter.load();
 for(const stage of adapter.stages){if(state.completed.includes(stage.name))continue;await stage.run();state={...state,completed:[...state.completed,stage.name]};await adapter.save(state);}
 return {message:'Account and associated data deleted.',completed:true};
}
export async function removeAccountFiles(storage,owner){
 const folders=[owner];
 while(folders.length){const folder=folders.pop();let offset=0,files=[],subfolders=[];
  while(true){const result=await storage.list(folder,{limit:1000,offset});if(result.error)throw result.error;const entries=result.data||[];for(const entry of entries){const file=folder+'/'+entry.name;if(entry.id===null)subfolders.push(file);else files.push(file);}if(entries.length<1000)break;offset+=entries.length;}
  folders.push(...subfolders);for(let i=0;i<files.length;i+=100){const result=await storage.remove(files.slice(i,i+100));if(result.error)throw result.error;}
 }
}
