# Deploy SimplyArticulate with complete account features

Source changes are prepared locally. This checklist does not establish the state of the live project. Review existing migration history before applying anything. Never paste generated secret files into chat or commit them.

## Database prerequisites and migrations

Use the Supabase migration history and inspect existing tables. On an existing project, do not rerun migrations already applied. On a fresh project apply these feature migrations in this order:

1. 20261003000000_speech_recordings.sql — private recording table, bucket and policies.
2. 20261011000000_practice_sync.sql — account progress records and access policies.
3. 20261011190000_sa_edge_backend.sql — durable analysis, survey rewards, votes, community and cleanup.
4. 20261013 feature migrations in order: progress_versions, focused_retry, account_lifecycle, readiness.

Older authentication migrations describe previous authenticator behavior. Review the current authentication configuration separately; do not blindly replay obsolete authentication migrations. The progress migration preserves historical rows, including retired topic records. The latest writes use version-checked RPC calls. No historical score conversion is performed.

## Prepare and publish functions

Use Node 24. Run npm ci and npm run supabase:prepare. Generated .env.supabase.local and work/supabase-worker-schedule.sql are private. Configure exact production website origins in SPEECH_ALLOWED_ORIGINS, including any Netlify origin actually used. Keep SPEECH_ENABLE_LOCAL_DEV=false in production. A development-only backend may set it true to permit HTTP loopback on alternate ports; production stays on exact origins.

Deploy speech-api, speech-worker, AND delete-account with the Supabase CLI, the intended project reference, --use-api and --no-verify-jwt. These functions verify sessions or worker credentials themselves. Upload secrets from the private environment file; never expose provider/service-role keys as VITE variables.

Apply the generated worker schedule, then check /functions/v1/speech-api/api/analysis/health. Its features must report scheduler, progress, focusedRetry, survey, deletion and recordings as ready. Independently send OPTIONS to delete-account to confirm that function is deployed; schema readiness alone cannot prove it is published.

## Migrate existing local state

Stop new local submissions and let active work settle. Run npm run supabase:export and apply the generated private import SQL before accepting cloud submissions. Preserve used rewards and allowances. Local recordings remain device-local unless explicitly saved. Do not delete local account ledgers until migration and retention requirements are satisfied.

## Publish frontend and verify

Set VITE_ANALYSIS_SERVICE=supabase with the project URL and publishable key. Allow /settings as an authentication return URL along with ordinary sign-in URLs. Configure SPA fallback for direct paths such as /practice and /progress. Build with npm run build:netlify; publish only the generated site output.

Run npm run deployment:check:online. Use disposable accounts to verify initial analysis plus one focused retry, repeat survey submissions, cross-device progress, stale offline edit conflicts, saving/removing feedback, recording playback and staged deletion. Verify the public entry disappears after deletion. Never use a real account for destructive smoke tests.

## Local Node mode

Use one Node backend process and a persistent writable AI_DATA_DIR. Account deletion purges local survey, usage, votes, community, retry records and job content before calling the deployed Supabase delete-account function. That function and the account_lifecycle migration are required even in Node mode. Production Node replicas must not share these JSON ledgers concurrently; use the Supabase backend for multiple instances.

## Limits and recovery

Focused practice retries are one per eligible initial take, within 24 hours, same topic/format/difficulty, maximum 60 seconds. Provider processing is bounded independently of browser metadata. Retry failures allow only recovery of the original retry recording. Daily challenge rules remain separate. Deletion stages are idempotent and may already have removed data when a later stage fails; retry while signed in to resume. Local recovery cleanup applies only to the device requesting it.

Deletion requests use an opaque operation receipt to acknowledge a lost final response after the Auth account is removed. Completed receipts retain no account identity or speech content and expire after 24 hours through the scheduled worker.
