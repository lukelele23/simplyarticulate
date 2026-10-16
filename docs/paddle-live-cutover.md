# SimplyArticulate live cutover — prepared October 15, 2026

Live catalog and public client token have been created. The local code supports production. Customer release, live payments, database conversion and remote function deployment remain disabled pending the checks below.

## Configuration

`.env.local` and `.env.live.local` contain the live public Paddle configuration. The server-only `.env.live.server.local` holds the new destination signing secret and live price IDs. It is ignored by Git; never bundle it into the frontend. Upload server settings to the existing Supabase project's Edge Functions Secrets only during the coordinated cutover. Keep BILLING_ENABLED=false and BILLING_LIVE_RELEASE_APPROVED=false until approved. The public build also keeps VITE_BILLING_ENABLED=false.

Create a live API key with price.read, customer.write, transaction.write, subscription.write and customer_portal_session.write. Write scopes include reads. Store it in PADDLE_API_KEY server-side. The key is not created by the catalog MCP connection.

Paddle.js uses production as its environment name for live. Production initialization omits the environment option, so it never calls Paddle.Environment.set('sandbox'). The backend selects api.paddle.com in production. Sandbox branches are retained for regression tests and explicit sandbox development.

Paddle Retain receives pwCustomer.id from authenticated server billing status / checkout responses, never the application's user ID or email. Public pages omit customer identity; sign-out clears it. Existing sandbox customer IDs must not be passed to the live SDK.

## Existing Supabase project conversion

Target project: vyssmktvorjpubfzihmz. The owner requested conversion of this project. Do not apply docs/convert-billing-to-live.sql while sandbox functions or scheduled workers can still write to the billing tables. Back up the database, pause sandbox notification delivery and worker invocations, and disable billing APIs before the coordinated cutover.

The SQL plan moves all eight sandbox billing tables into a private billing_sandbox_archive schema, revokes application access, and recreates empty production billing tables and provider functions. It preserves users, speech records and all archived billing rows. It is intentionally single-use; rerunning it fails. Paid analysis provisioning remains false until the live entitlement flow has been verified. The archive is owner-only and is not exposed to application clients.

This plan passed a local PostgreSQL-compatible integration test, including retained sandbox identities, fresh live customer reservations, private archive permissions and disabled provisioning. It has NOT been applied to the remote project and has not been tested against a restored production backup. Review advisors and verify backup restoration before remote application. Do not rerun historical sandbox migrations after conversion.

## Webhook security and activation

The new live notification destination is inactive. See paddle-live-id-mapping.json for its ID. Its signing secret is saved only in the ignored server environment file. Subscribe to customer.created, customer.updated, subscription.created, subscription.updated, subscription.canceled and transaction.completed. Keep traffic_source=platform.

The hosted Supabase function cannot infer a trusted sender from an arbitrary forwarded header. Deploy scripts/paddle-webhook-ingress.mjs on a public TLS endpoint where the socket peer is the actual sender, with route /paddle/webhook. Set TLS_KEY_FILE, TLS_CERT_FILE, PADDLE_WEBHOOK_UPSTREAM=https://vyssmktvorjpubfzihmz.supabase.co/functions/v1/billing-webhook and a randomly generated private PADDLE_WEBHOOK_INGRESS_TOKEN of at least 32 characters. Set the same ingress token in the Edge Function's server secrets. If another proxy terminates the public connection, enforce the allowlist at that outermost proxy instead; do not trust arbitrary X-Forwarded-For values.

The ingress fetches https://api.paddle.com/ips and reads data.ipv4_cidrs. It uses a five-minute cache, refreshes expired data, fails closed when the endpoint cannot supply a valid list, and rejects socket peers outside the list. It forwards the exact body and Paddle-Signature header. The function independently checks the ingress token/source and verifies the Paddle signature before database work. Direct requests to the Supabase URL are rejected in production without the private ingress token.

Once this ingress is deployed, change the inactive live destination URL to its public HTTPS /paddle/webhook URL. Verify rejected non-Paddle requests, forged forwarded headers, valid signature delivery, invalid signatures and duplicate handling in staging. Only then activate the destination. The dynamic allowlist code is prepared, but no server ingress or firewall has been deployed or changed yet.

## Public readiness blockers

The homepage and www redirect serve the real product over HTTPS. /terms/, /privacy/ and /support/ return 200. Homepage → Help → support email takes two clicks. The product describes speaking practice, recording/replay and optional AI feedback.

/refund/ and /refunds/ return 404. Publish a clearly linked refund/cancellation policy with the owner's actual refund eligibility, request process, support address, trial conversion terms and cancellation timing. Add a footer link on the homepage, pricing page and policy pages. Do not invent a refund window on the owner's behalf.

The Terms still say paid subscriptions are unavailable. Replace that sentence with approved Pro billing/trial/renewal/cancellation terms before launching subscriptions. The Privacy page does not currently describe Paddle billing processing; update the data categories and billing provider disclosure to reflect the real implementation. Confirm that the Terms identify the seller/company or sole proprietor brand.

/subscription and /pricing return 404 publicly. Publish pricing information or provide Paddle a pricing screenshot for review. The local application has the subscription route, but the deployed site is an older build. Keep checkout disabled during publication of informational pages. Actual localized recurring catalog prices are USD 6.99/month and 72.99/year; GB GBP 4.99/month and 52.99/year; IE EUR 5.99/month and 62.99/year; AU AUD 9.99/month and 104.99/year. All have a three-day free trial requiring a payment method, quantity exactly one, and location tax mode. No public paid pricing was available to compare, so parity is unverified rather than a confirmed numerical match.

Submit simplyarticulate.com and each actual checkout subdomain under My account → Settings → Website approval. www.simplyarticulate.com redirects to the apex; no additional checkout-serving subdomain was found in the code. Submit www too if checkout will actually launch there rather than after the redirect. Never infer approval from the sandbox account.

The proposed default payment link is https://simplyarticulate.com/subscription. It must first return a real checkout page with Paddle.js and the apex must be approved. Only then set it under Checkout → Checkout configuration → Default payment link. Do not use localhost.

## Verification and release

Paddle onboarding was pending for account setup, domain review, identity verification and final review. Do not accept a real payment or deploy the enabled live build to customers yet. Once policy, pricing, domain, API key, database, ingress and staging delivery checks are complete, follow the live dashboard verification steps at https://vendors.paddle.com. After verification passes and the checkout domain is approved, perform an owner-controlled real-payment test and verify fulfillment, portal access and cancellation. Enable the customer release only after that passes.

Official requirements checked: https://www.paddle.com/help/start/account-verification/what-is-domain-verification and https://developer.paddle.com/build/go-live-checklist/. Paddle explicitly asks for product description, price details (a screenshot can be accepted), purchased features, navigable Terms/Refund/Privacy policies, seller identification in Terms, HTTPS and each checkout domain/subdomain. Contact within two clicks is the owner's requested audit criterion, not a claim of a universal Paddle rule. Additional business/identity checks are determined by Paddle.
