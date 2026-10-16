# Migration note
Live IDs below supersede the original sandbox IDs. See paddle-live-cutover.md for current configuration and release blockers. Sandbox testing instructions below remain historical reference.

# Three-tier Paddle sandbox pricing setup

## What is implemented

React/Vite pricing page at /subscription, with Starter, Pro and Advanced cards, monthly/yearly controls,
Paddle.PricePreview localized formattedTotals, and an authenticated one-page overlay checkout.
Successful Paddle checkout redirects to /welcome. This route does not grant a plan: signed webhooks and the worker determine status.
Signed-out visitors can see localized prices and are asked to sign in before subscribing so purchases remain linked to their account.
Trialing subscriptions are recognized for the configured tier, with their period ending at Paddle's next_billed_at.
Sandbox still does not change analysis allowances or activate production feature locks.

## Required public frontend variables

Copy .env.example into your local environment file without overwriting existing Supabase configuration.
Set VITE_PADDLE_ENVIRONMENT=sandbox and VITE_PADDLE_CLIENT_TOKEN to your public test_ token.
Set the six VITE_PADDLE_{STARTER,PRO,ADVANCED}_{MONTH,YEAR}_PRICE_ID values to real pri_ IDs.
Each must be a distinct recurring price with a three-day free trial and quantity one. Configure regional price overrides in Paddle.
Restart Vite after editing environment values; rebuild hosted deployments after changing build variables.
VITE_BILLING_ENABLED=true enables the account billing status controls once the backend is deployed.
The pricing page fails visibly when the environment/token is missing and disables missing/unloaded prices.
No mock amounts, fabricated IDs, exchange-rate calculations or front-end currency formatting are used.

Names, descriptions and features are editable in src/lib/pricingModel.js (JSDoc Tier type).
Feature copy is a starting proposal, not a new entitlement policy; finalize actual paid benefits before launch.

## Backend and database

Apply the existing Paddle billing migration and deploy billing-api, billing-webhook, billing-worker and delete-account.
Set BILLING_ENVIRONMENT=sandbox explicitly; no implicit environment fallback is used.
Set the same six PADDLE_{STARTER,PRO,ADVANCED}_{MONTH,YEAR}_PRICE_ID values in Supabase Edge Function Secrets.
The server catalog is an allowlist: callers cannot supply another account, customer, price amount or arbitrary price ID.
The legacy PADDLE_PRO_PRICE_ID is accepted only as an alias for Pro monthly; do not set it to a different ID.
Set PADDLE_CLIENT_TOKEN to the same public test_ token used by the frontend, and retain your private PADDLE_API_KEY,
PADDLE_WEBHOOK_SECRET, BILLING_WORKER_TOKEN and BILLING_ENABLED=true on the backend only.
Never add a server API key to a VITE_ variable. No real credentials are included in .env.example.
See docs/paddle-billing.md for function deployment and worker scheduling. No cloud deployment has been performed by this change.

## Country detection

Netlify Function netlify/functions/paddle-context.mjs returns the hosting platform's context.geo.country.code,
or a validated x-vercel-ip-country / x-country header. The Vite dev/preview middleware implements the same endpoint.
The client passes this country into the component calling Paddle.PricePreview. Missing/invalid/sentinel values yield no address field,
allowing Paddle to detect location from the visitor's IP. The response is uncached; it never returns server secrets.
Your checkout price ID always matches the displayed interval/tier. The billing address confirmed at checkout can change final tax/localization.
Changing tiers after closing an unpaid checkout cancels the old draft/ready transaction before making a new reservation.
Ambiguous or processing payments remain blocked for safe reconciliation.

## Dashboard step YOU must perform

In Paddle sandbox go to Checkout > Checkout configuration and set Default payment link to your sandbox checkout page,
for example http://localhost:5173/subscription (use your actual dev server port). Sandbox allows localhost.
The default-link page must load Paddle.js and handle a returned _ptxn transaction. The subscription page initializes
Paddle.js for price previews as soon as valid public configuration and price IDs are present, so its normal checkout flow can load.
This setting is dashboard-only and has not been changed by the agent.
For live mode the page must use a real approved domain, not localhost. This implementation explicitly refuses live mode;
live launch requires a separate reviewed change and approved Paddle verification/domains.

## Verification status

Automated tests cover unknown/absent country omission, Netlify geo headers, exact formatted string preservation,
missing/incorrect environments, one-page overlay options, email prefill, price mismatch rejection and /welcome routing.
The local UI/build can be checked without a token, but **a real sandbox checkout is not confirmed until configured and completed**.
To complete verification: supply the sandbox public token and six catalog IDs, deploy the sandbox billing functions,
set the default payment link yourself, run a disposable-account checkout with Paddle's sandbox payment methods,
and observe the overlay, completion, /welcome redirect, verified tier, and cancellation through the portal.
Do not use real payment information in sandbox or take a live test payment during this step.

Official references:
- https://developer.paddle.com/paddle-js/methods/paddle-pricepreview/
- https://developer.paddle.com/paddle-js/methods/paddle-checkout-open/
- https://developer.paddle.com/build/transactions/default-payment-link/

## Pro catalog created and connected in this session

- Product: pro_01m51kmkh6jft92bac4b4nchq2
- Monthly: pri_01m51kmkks1f042pbk3m4d60vq — USD 6.99, three-day free trial
- Annual: pri_01m51kmkpe87642qajgbmwypba — USD 72.99, three-day free trial
- Both prices have GB, IE and AU overrides; see docs/paddle-sandbox-catalog.json for exact strings and currencies.
- The provided public sandbox token and Pro IDs are saved only in the ignored .env.local file.
- Starter and Advanced remain disabled, as requested while testing Pro first; do not reuse Pro IDs for those tiers.
- Real Paddle.PricePreview succeeded for both intervals. The visitor-specific formatted totals included applicable tax.
- The hosted billing-api, billing-webhook and billing-worker URLs returned HTTP 404 during verification.
- Therefore overlay completion, signed-event processing and the /welcome redirect have NOT been confirmed end-to-end.
- No live payments were taken, no default payment link was changed, and no cloud functions were deployed.

Next: apply the billing migration if not already applied; configure the private server API key and webhook/worker secrets
in Supabase (do not paste secrets in chat), add both Pro price IDs to the server allowlist, then deploy the three billing
functions plus the updated delete-account. Set the default payment link yourself in Paddle's Checkout configuration.
Use the same localhost port for testing as the configured allowlist (5173 by default; if testing on 5174, explicitly
add that exact localhost/127.0.0.1 origin to BILLING_ALLOWED_ORIGINS).