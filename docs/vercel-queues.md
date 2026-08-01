# Vercel Queues deployment

LeadHunter uses the official `@vercel/queue` SDK and a private push consumer for the `leadhunter-enrichment` topic. The browser never receives queue credentials or queue payloads. Vercel authenticates queue publishing and delivery through the linked project environment.

The current implementation follows the official push-mode API:

- Producers import `send` from `@vercel/queue`.
- The consumer imports `handleCallback` from `@vercel/queue`.
- `vercel.json` maps `app/api/queues/enrichment/route.ts` to a private `queue/v2beta` trigger.
- The trigger and producer both use the exact topic `leadhunter-enrichment`.
- Queue messages contain only `jobId`, `jobItemId`, `leadId`, `userId`, `forceRefresh`, and `schemaVersion`.
- Delivery is at least once. Database terminal-state checks, unique keys, item leases, and idempotency keys remain authoritative.

## Before staging

1. Link this repository to the intended Vercel project.
2. Apply `supabase/migrations/202608010001_add_durable_enrichment_jobs.sql` to the staging Supabase project.
3. Deploy the repository so Vercel registers the private `queue/v2beta` trigger in `vercel.json`.
4. Confirm the deployment contains `app/api/queues/enrichment/route.ts` and that the queue trigger is active.
5. Configure Upstash Redis for cross-instance item leases and the three-slot worker concurrency guard. Without Redis, the in-process fallback protects only one function instance.
6. Confirm the Vercel consumer group's maximum concurrency is set to three in the current Vercel Queues controls when that setting is available. The documented `queue/v2beta` trigger schema does not define a `maxConcurrency` field, so do not add an undocumented property to `vercel.json`.
7. Create a job with one disposable lead and verify queued, running, terminal, duplicate-delivery, and retry transitions before enabling larger jobs.

No queue API key belongs in `.env.local`. Do not add hard-coded OIDC credentials.

## Delivery model

- One minimal message is sent per lead.
- Messages contain only job, item, lead, user identifiers, a force flag, and schema version.
- Delivery is at least once, so the database unique constraints and item lease are authoritative.
- Terminal items acknowledge duplicate delivery without rerunning enrichment.
- Retryable failures are retried up to three total deliveries; no-data outcomes are acknowledged.
- Jobs retain queue messages for seven days and initially permit no more than 20 leads.

## Rollback

1. Set the UI back to basic enrichment or remove the private queue trigger in a rollback deployment.
2. Cancel active jobs through the job API so queued items become cancelled.
3. Preserve the additive tables and completed lead data; no destructive rollback is required.
4. Re-enable only after a one-lead staging job reaches a safe terminal state.

Official reference: [Vercel Queues documentation](https://vercel.com/docs/queues).
