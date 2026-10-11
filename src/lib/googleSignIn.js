export async function startGoogleSignIn(auth,origin,navigate){
 const {data,error}=await auth.signInWithOAuth({provider:'google',options:{redirectTo:`${origin}/`,skipBrowserRedirect:true,queryParams:{prompt:'select_account'}}});
 if(error)throw error;
 if(!data?.url)throw Error('Google sign-in could not be started. Please try again or use email sign-in.');
 let destination;try{destination=new URL(data.url);}catch{throw Error('Google sign-in returned an invalid address. Please try email sign-in.');}
 if(destination.protocol!=='https:'&&!(destination.protocol==='http:'&&['localhost','127.0.0.1'].includes(destination.hostname)))throw Error('Google sign-in returned an unsupported address. Please try email sign-in.');
 await navigate(destination.href);
}
