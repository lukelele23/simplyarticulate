// Sessions come from Supabase Auth. The API independently validates their access tokens.
// Email and Google sign-ins do not require an additional authenticator step.
export function sessionAccess(session) {
 return session?.user ?? null;
}
