# Activate SimplyArticulate on Supabase

The project contains the new analysis API, scheduled worker, and private database records for voting, rewards, allowances, and leaderboard entries. Nothing has been applied to your live Supabase project yet. Keep local Node mode until activation is complete.

Use Node 24 and run these commands in the SimplyArticulate project folder in VS Code. Replace `YOUR_PROJECT_REF` with the reference printed during preparation.

## 1. Apply the database migration

In your existing Supabase project's SQL Editor, run all of `supabase/migrations/20261011190000_sa_edge_backend.sql`. It creates private tables, server-only database functions, and a private temporary recording bucket. Existing authentication and saved recordings remain in place.

Apply only this migration. Do not run `db push` over older authentication migrations: some describe the previously removed authenticator requirement.

## 2. Prepare the private activation files

Your ignored `.env.local` or `.env.server.local` must contain your existing `ASSEMBLYAI_API_KEY` and `GEMINI_API_KEY`; `.env.local` must also contain `VITE_SUPABASE_URL`.

```powershell
npm ci
npm run supabase:prepare
```

Preparation prints your project reference and creates `.env.supabase.local` with your provider keys and a random worker token, plus `work/supabase-worker-schedule.sql` containing the scheduling SQL. Keep both files private. An existing generated token is retained when rerunning preparation.

If users access your Netlify site address, add its exact HTTPS origin to `SPEECH_ALLOWED_ORIGINS` in `.env.supabase.local` before uploading secrets. Defaults include both SimplyArticulate domain addresses and local development addresses.

## 3. Deploy the functions

```powershell
npx supabase@latest login
npx supabase@latest secrets set --env-file .env.supabase.local --project-ref YOUR_PROJECT_REF
npx supabase@latest functions deploy speech-api --project-ref YOUR_PROJECT_REF --use-api --no-verify-jwt
npx supabase@latest functions deploy speech-worker --project-ref YOUR_PROJECT_REF --use-api --no-verify-jwt
```

The API validates user sessions through Supabase Auth itself; the worker requires its private token. Public topics and leaderboard reads remain accessible. Provider keys and service-role keys must never become frontend variables. `--use-api` uses the server bundler, so these commands do not require Docker. References: [deployment](https://supabase.com/docs/guides/functions/deploy), [CLI](https://supabase.com/docs/reference/cli/introduction), [secrets](https://supabase.com/docs/guides/functions/secrets).

## 4. Preserve local votes and rewards

Let local analyses finish and pause new local submissions before switching. Run:

```powershell
npm run supabase:export
```

Apply the generated private `work/supabase-local-state.sql` in the SQL Editor. It imports local votes, rewards, allowances, daily attempts, and leaderboard entries for accounts that still exist. Import before opening the cloud topic screen to preserve the cached daily topic. Spent survey credits are not granted again. Running provider jobs and local recordings are not transferred; save completed feedback and retain the old local data as a backup. An empty export is harmless. The export respects the configured `AI_DATA_DIR`.

## 5. Activate the scheduled worker

Run the generated `work/supabase-worker-schedule.sql` in the SQL Editor. It enables Cron, HTTP requests, and Vault; stores the private token; and schedules the worker every minute. See [Supabase scheduling](https://supabase.com/docs/guides/functions/schedule-functions).

Open the following address, replacing the project reference:

```text
https://YOUR_PROJECT_REF.supabase.co/functions/v1/speech-api/api/analysis/health
```

It must return HTTP 200 with `ready: true`. This checks configuration and the active schedule without purchasing an analysis. If false, finish activating the SQL, secrets, functions, and schedule. Check Supabase Cron history and function logs for successful worker calls. Live extension availability and provider connectivity have not been verified during source preparation.

## 6. Connect Netlify and localhost

Set these Netlify build variables:

| Variable | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | Existing Supabase HTTPS project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Existing public publishable key |
| `VITE_ANALYSIS_SERVICE` | `supabase` |

Use Node 24, build command `npm run build:netlify`, and publish directory `dist`, as configured in `netlify.toml`. A separate Node backend URL is no longer needed in Supabase mode. The build stops if the cloud backend is not ready.

For localhost, add `VITE_ANALYSIS_SERVICE=supabase` to your ignored `.env.local` and restart `npm run dev`. Leaving it unset keeps the local Node backend. To prepare a production build locally, put the public Netlify settings above in `.env.production.local` and run:

```powershell
npm run deployment:check
npm run deployment:check:online
npm run build:netlify
```

Keep Supabase Authentication's Site URL and callback allowlist set for your actual domains and supported localhost addresses. Verify Google and email sign-in after publishing. Domain DNS and Netlify's custom domain settings still need to resolve correctly.

## Final checks and behavior

Guests retain local recording, replay, and download. Signed-in users retain daily practice and challenge allowances. Paid access uses trusted administrator-managed subscription metadata; this change does not collect payments or alter subscriptions. Survey rewards remain once per account. Every signed-in account can vote, with three options per poll. The leaderboard uses the AI rubric and handles tied ranks.

Analysis runs in durable stages. Duplicate submissions do not consume another allowance; failures before transcription restore the user's allowance. Coaching retries reuse the original transcript. Competitive retries retain the original audio and metadata. Temporary audio is private and queued for deletion after processing or cancellation; provider outages can delay provider-side cleanup. Completed private job results normally expire after 30 minutes, so save feedback. Public leaderboard entries persist until withdrawn or the account is deleted.

Verify guest recording, both sign-in methods, analysis in both sections, recovery after a connection loss, survey rewards, voting, leaderboard publishing and withdrawal, and account deletion using a test account. A real analysis incurs provider charges. Monitor Supabase usage and provider spending. No plan was upgraded, and moving the backend does not make AI provider usage free.

The automated checks execute the migration in real PostgreSQL with test Auth/Storage schemas, exercise mocked provider processing, and type-check the Edge Functions. Live activation and a real speech analysis remain the final deployment checks.
