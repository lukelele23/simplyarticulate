# Analysis integration — October 10, 2026

Implemented in the existing recording → AssemblyAI → Gemini → feedback flow:

- Two structured feedback sections, revision, and next step.
- Separate Google Search grounding verification and source registry. Unsourced corrections are rejected; unavailable checks remain unverified.
- Contextual filler occurrences and visible disfluencies validated against exact original text. Original timestamp-based recording metrics remain separate.
- One successful analysis per UTC day for free signed-in users; ten for paid users, without displaying the paid numeric cap.
- Reservations block concurrent overuse; failures release the analysis count. Existing transcription-minute and global cost controls are retained separately. Paid users bypass the old per-user minute cap.
- Idempotency protects repeated upload requests while the job remains in the server. Unchanged coaching is returned without charging again; changed transcripts use a new analysis slot.

## Paid entitlement wiring

No payment provider or verified webhook exists in this project. All accounts remain free unless a trusted backend maintains the following **Supabase app_metadata**, never user_metadata:

```json
{
  "simplyarticulate_subscription": {
    "status": "active",
    "validUntil": "2026-11-10T00:00:00Z"
  }
}
```

An active, unexpired record grants paid allowance. A future billing webhook must verify payment events and maintain this record on renewal, cancellation, and expiry. No existing accounts were granted paid access during this change.

## Deployment and limitations

This is a local source integration, not a website deployment. Restart the AI backend after applying it. No provider credentials, billing settings, account state, or cloud database were changed.

The existing backend remains a single-process service with a persistent JSON usage ledger. Analysis results and request keys still expire from memory after 30 minutes and disappear on restart. Browser history/export remain available. For multiple backend instances or durable cross-restart job recovery, migrate jobs and reservations to transactional shared storage before scaling. The framework document describes that target architecture; this integration retains the current project's deployment model.

Failed transcription can still consume the existing provider-minute budget; it does not consume the new successful-analysis count. Verification is limited to selected central claims and is not a guarantee of truth. The sample demo intentionally retains its prior sample report; live reports use the two-section format.

Google Search suggestions are displayed in a sandboxed attribution frame. Source links and evidence labels appear alongside claims. Validate live Gemini output, provider availability, attribution layout, and authenticated flows before deploying. No paid provider calls or production deployment were performed in validation.
