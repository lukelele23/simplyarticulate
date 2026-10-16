# Migration note
Live IDs below supersede the original sandbox IDs. See paddle-live-cutover.md for current configuration and release blockers. Sandbox testing instructions below remain historical reference.

# Paddle fulfillment — sandbox

## Installed state

The billing baseline and `20261015000200_billing_fulfillment.sql` were applied to Supabase project `vyssmktvorjpubfzihmz`. The updated `delete-account`, `billing-api`, `billing-webhook`, and `billing-worker` functions are deployed. Pro remains the only configured tier, following the latest pricing decision. No existing Paddle entities or financial records were deleted.

The server requires explicit sandbox configuration. Missing secrets fail closed; deploying functions does not configure Paddle or prove delivery. Local tests use isolated databases, never production billing rows.

## Server behavior

- Official Paddle Node SDK 3.10.0 verifies the exact raw request text with `webhooks.unmarshal(raw, signingSecret, signature)` before routing or writing anything. Invalid signatures return non-2xx.
- Supported events: `subscription.created`, `subscription.updated`, `subscription.canceled`, `customer.created`, `customer.updated`, `transaction.completed`. Other verified types are ignored safely.
- A minimal event-ID queue is persisted before acknowledgment. Background processing starts immediately; the recurring worker retries failures with bounded backoff and fenced leases. Never rely on background execution alone.
- Typed handlers fetch canonical objects from Paddle. Permanent customer/subscription/transaction IDs and provider timestamps prevent duplicate records and older snapshots overwriting newer state.
- Only server-created checkout intent ownership can link a customer to an app account. Unbound Paddle customers are still mirrored but grant nobody access. Transaction completion alone never grants access.
- `grantsPaidAccess`, `accountAccess`, and the SQL access helper grant eligible `active` and `trialing` subscriptions access. Scheduled cancellation/pause and period boundaries do not revoke it. Actual `canceled`, `paused`, and `past_due` statuses deny access.
- Settings → Manage billing authenticates the user, resolves their pinned customer and subscriptions server-side, then mints a fresh SDK portal session. Client customer IDs are rejected. Portal URLs are not persisted or cached.
- Customers, subscriptions and transactions are permanent. Auth account deletion unlinks ownership instead of deleting financial mirrors; statement triggers reject DELETE/TRUNCATE on those three tables. Closing an account still stops recurring billing first.

## Remaining configuration

In Supabase → Edge Functions → Secrets, configure the following server-only values. Never use VITE_ for these secrets or send them in chat.

```text
BILLING_ENVIRONMENT=sandbox
BILLING_ENABLED=true
PADDLE_API_KEY=<sandbox server API key>
PADDLE_CLIENT_TOKEN=<public sandbox test_ token>
PADDLE_WEBHOOK_SECRET=<notification destination signing secret, not the API key>
BILLING_WORKER_TOKEN=<random private value at least 32 characters>
PADDLE_PRO_MONTH_PRICE_ID=pri_01m51kmkks1f042pbk3m4d60vq
PADDLE_PRO_YEAR_PRICE_ID=pri_01m51kmkpe87642qajgbmwypba
```

The API key must permit the existing checkout operations, canonical customer/subscription/transaction reads, subscription cancellation during account deletion, and customer portal session creation. Use Paddle's dashboard permission labels. Keep it server-side.

No Paddle MCP is available. Create a permanent sandbox destination in Paddle → Events → Notifications:

```text
https://vyssmktvorjpubfzihmz.supabase.co/functions/v1/billing-webhook
```

Select exactly the six supported event types listed above. Save its signing secret as PADDLE_WEBHOOK_SECRET. Leave the destination and secret in place permanently.

Schedule a server-side POST every minute to:

```text
https://vyssmktvorjpubfzihmz.supabase.co/functions/v1/billing-worker
```

Include `x-sa-billing-token` with the private BILLING_WORKER_TOKEN value. Use your scheduler's secret store or Supabase Vault; never hard-code the token in frontend code or checked-in SQL. A schedule has not been installed because its secret is not yet configured. Monitor failed events, attempts >= 8, and checkout intents stuck in creating/uncertain. Replay missing initial events using Paddle's delivery tools; periodic reconciliation scans existing subscriptions only.

Set the sandbox default payment link in Paddle → Checkout → Checkout configuration. This is a dashboard setting; sandbox localhost is acceptable. Live requires an approved real domain and is intentionally rejected by this implementation.

## Analysis provisioning

Subscription access is available through the authenticated billing API `{"action":"access"}` and authenticated SQL RPC `billing_my_access()` (no user-ID argument). The server-only helper `requirePaidAccess` is available for paid endpoints.

Sandbox analysis quota provisioning is separately disabled by default to preserve the existing allowance policy. After sandbox verification, enable the database switch if desired:

```sql
update public.billing_settings
set provisioning_enabled = true
where environment = 'sandbox';
```

For local Node analysis also set `BILLING_PROVISIONING_ENABLED=true`. The Node backend verifies the signed-in user's access via their authenticated RPC; hosted analysis uses the SQL policy. Both preserve existing usage/reward ledgers and existing paid quota limits. This does not introduce unlimited AI processing or new feature restrictions.

## Verification and retention

Local coverage includes SDK raw-body verification, signature failures, duplicate queue entries, stale snapshots, scheduled changes, both access-granting statuses, portal ownership, retry retention, and permanent financial record protections. A frontend production build passes.

After secrets and the destination are configured, complete an authorized sandbox checkout and verify mirrored customer/subscription/transaction state, access during trial, portal redirect, and subsequent lifecycle events. Do not call this end-to-end verified until real signed deliveries and authenticated portal creation succeed. Keep every resulting customer, subscription, transaction and notification destination. Do not delete DB rows, financial entities, catalog entries or secrets as cleanup, including after testing.

Official references: [SDK signature verification](https://developer.paddle.com/webhooks/about/signature-verification/), [customer portal](https://developer.paddle.com/build/customers/integrate-customer-portal/).
