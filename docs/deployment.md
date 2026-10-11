# Deploy SimplyArticulate

The source is prepared for a Netlify frontend and a separately hosted Node.js analysis server. The analysis server is not hosted yet. Do not publish a complete production release until its HTTPS address is available.

## 1. Host the analysis server

Deploy this folder using the included Dockerfile on a service that supports a continuously running container and a persistent disk. Run exactly one instance. Mount the disk at `/data`, writable by the container's `node` user (UID 1000). Keep that disk when redeploying.

The disk retains topic votes, survey answers and earned analysis credits, analysis allowances, competitive attempts, and leaderboard entries. Jobs run in memory; restart only after active jobs finish. Completed practice feedback should be saved/exported by the user. Daily-challenge recovery data is retained on disk. Do not use ephemeral storage or multiple replicas with this implementation.

Set the backend environment variables listed in `.env.backend.example`. Enter real values through the hosting service's settings, not committed files. AssemblyAI and Gemini keys belong only on the backend. Set `AI_DATA_DIR=/data`, `NODE_ENV=production`, and `AI_ENABLED=true`; keep demo mode off. Platforms that provide `PORT` automatically are supported; leave `AI_PORT` unset on those platforms. The default container port is 8787.

Use `/api/analysis/health` for the hosting readiness check. It must return HTTP 200 and `{"ready":true}`. The health check confirms configured service readiness; it does not purchase a provider analysis. Run `npm run ai:check` on the backend to check provider credentials/model access without submitting a recording.

The backend's `AI_ALLOWED_ORIGINS` must contain `https://simplyarticulate.com` and `https://www.simplyarticulate.com`. Add your exact Netlify site URL if users will access that address. Deploy previews also need explicit permitted origins and matching Supabase redirect URLs if sign-in will be tested there. Avoid enabling arbitrary origins.

The Node start command is `npm start`, with production environment settings supplied by the host. Before starting, you can run `npm run deployment:check:backend` when development/build dependencies are installed. The Docker image runs the server directly and includes its own health check. Its build has not been verified locally because Docker is not installed on this computer.

## 2. Configure Netlify

Deploy the source project using the included `netlify.toml`:

- Node: 24
- Build command: `npm run build:netlify`
- Publish directory: `dist`

Set these Netlify build environment variables:

| Variable | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | Existing Supabase project HTTPS URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Existing Supabase publishable key, never a secret/service-role key |
| `ANALYSIS_BACKEND_URL` | HTTPS origin of your hosted analysis server, without `/api/analysis` or other paths |

The production build stops when any required setting is missing, when the backend address is localhost/the frontend domain, or when provider secrets are assigned to frontend variables. It runs the automated tests and then creates `dist/_redirects`. Analysis routes proxy to the hosted backend before the single-page application fallback. Unrecognized API routes return JSON rather than the website HTML.

For a local production preparation, put the frontend settings in an ignored `.env.production.local`. Run:

```text
npm ci
npm run deployment:check
npm run deployment:check:online
npm run build:netlify
```

The online check calls only the hosted readiness endpoint. Do not upload a plain `npm run build` output as the complete production deployment; that command is for ordinary local builds and does not create the required hosted analysis routing.

Netlify proxy requests have a 26-second timeout. Initial analysis, coaching retries, and review retries now return job IDs promptly; the frontend polls for results. Hosting the backend separately also keeps its persistent ledgers and running jobs available. See [Netlify proxy documentation](https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/).

## 3. Sign-in and domain settings

In Supabase Authentication URL Configuration, set the production Site URL to `https://simplyarticulate.com` and allow the exact production callback URLs used by the app, including the `www` address if it is supported. Keep localhost redirects for local testing. Confirm email-link and Google sign-in work on the published domain. Do not put the Supabase service-role key in Netlify's frontend variables.

Keep the custom domain attached to the intended Netlify project. Confirm both domain addresses resolve publicly and HTTPS is active. Domain DNS changes are separate from these source changes.

## 4. Verify before publishing

Check the generated build and preview using the Netlify deployment workflow. Confirm `/api/analysis/config` returns JSON with `enabled:true` rather than HTML. Verify guest local recording/download, authenticated email and Google sign-in, one free analysis in each section, the survey reward, three-choice topic voting, leaderboard scoring, and recovery after a brief connection loss. Use a test account for provider analysis; it can incur provider charges. Confirm persistence across one controlled backend restart.

Run local development with `npm run dev`; it starts and waits for the local backend. `npm run preview` starts the built frontend and local backend together. In VS Code, Terminal > Run Task exposes local launch, automated checks, deployment settings checks, and the Netlify build task.

The dependency versions and lockfile are pinned. Environment files, provider data, logs, and work files are excluded from source control and the Docker build context. No hosting subscription, DNS setting, billing integration, or live deployment was changed during preparation.
