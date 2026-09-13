# Newsletter signup

The website posts email, explicit consent and a honeypot field to `POST /api/newsletter/subscribe`. The API normalizes email case, records newsletter-v1 consent and subscription time, and persists the confirmation job in PostgreSQL before replying. Duplicate active subscriptions return the same response without sending another welcome message. No newsletter service is required.

## Setup

1. Run `pnpm --filter @oynk/api db:migrate` (migration 008).
2. Configure the existing Zoho transport using `apps/api/.env.newsletter.example`. Use the SMTP hostname appropriate to your Zoho region and an authorized sender. Store the username and app password only in the backend environment.
3. Set `API_PUBLIC_URL` to the publicly reachable backend for unsubscribe links. Configure `CORS_ORIGINS` for the website when using separate origins.
4. The local Vite server proxies `/api` to port 4000. Production must either proxy `/api` to the backend or build the website with `VITE_API_URL` set to its API origin.
5. Build and restart the API after configuration changes. The queue runs in consumer-only mode too.

With `EMAIL_PROVIDER=development`, delivery is recorded as `previewed`; no message is sent and `confirmation_sent_at` remains null. These preview jobs are not automatically resent when switching providers. Local testing used only a temporary example.invalid address and cleaned up its records. No real SMTP delivery has been tested.

## Delivery and subscriptions

A five-second worker leases one due message from PostgreSQL. Multiple instances use SKIP LOCKED and a lease UUID; failures retry after 15 minutes up to five queue attempts. A 15-minute lease lets interrupted jobs recover. As with most SMTP delivery, acceptance followed by a crash before the database update can cause a duplicate email; this is at-least-once delivery, not exactly-once. The existing SMTP transport also retries transient failures within a queue attempt.

Welcome emails include a random-token unsubscribe link. GET shows a confirmation form so email link scanners cannot silently unsubscribe users; POST records the opt-out. Treat tokens as private and redact unsubscribe query strings from infrastructure request logs. Future newsletter campaigns must select only rows with `unsubscribed_at IS NULL`. This change implements subscription and welcome delivery, not a campaign editor or bulk sender.

Failed or unsubscribed addresses can rejoin after a one-day cooldown. Request limits are persisted per hashed `request.ip` (10/hour); do not blindly trust forwarded IP headers. Behind a reverse proxy the default Express configuration conservatively shares the proxy's allowance, so configure trusted proxy hops or edge rate limits for the actual deployment before public launch. The honeypot and per-address deduplication reduce automated retries.

## Verification

API and web builds pass. Newsletter integration tests use an isolated PostgreSQL schema with an injected sender: concurrent duplicate signup, delivery failure/retry, parallel worker leasing, unsubscribe, resubscription, development delivery status and rate limits. Browser checks covered responsive layouts, server failure recovery, actual local signup persistence, case-normalized duplicates and explicit unsubscribe without sending email. Existing API suite: 19 passed, two optional integration tests skipped; newsletter database tests were run separately with a real local database.
