export const USERNAME_PATTERN=/^[A-Za-z0-9_-]{3,24}$/;
export function accountUsername(user){const name=user?.user_metadata?.username;return typeof name==='string'&&USERNAME_PATTERN.test(name)?name:'';}
export function usernameError(value){return USERNAME_PATTERN.test(value.trim())?'':'Use 3–24 letters, numbers, underscores or hyphens.';}
export async function saveAccountUsername(client,value){
 const username=value.trim();
 const invalid=usernameError(username);if(invalid)throw Error(invalid);
 const availability=await client.rpc('sa_username_available',{p_username:username});
 if(availability.error)throw Error('Username setup is unavailable. Please try again shortly.');
 if(availability.data!==true)throw Error('That username is taken. Try another.');
 const {data,error}=await client.auth.updateUser({data:{username}});
 if(error){const check=await client.rpc('sa_username_available',{p_username:username});throw Error(check.data===false?'That username was just taken. Try another.':'Your username could not be saved. Please try again.');}
 if(accountUsername(data.user)!==username)throw Error('Your account did not confirm the username. Please try again.');
 return data.user;
}
