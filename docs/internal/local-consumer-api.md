# Local consumer API

The local backend uses PostgreSQL database `oynk_consumer_local` on `127.0.0.1:5432` and listens on port `4000`. Provider credentials and local connection settings are in `apps/api/.env` (ignored by Git, user-owned, mode 600).

`CONSUMER_ONLY=true` mounts consumer funding, Paystack webhook and health routes. It disables legacy dashboard/auth/compliance routes and scheduled chain synchronization. The BSC/Solana URL fields are unused loopback values in this mode. Keep `SEED_OFFCHAIN_TRANSACTIONS=false` for this database.

To restart the API from the platform repository:

```sh
pnpm --filter @oynk/api build
pnpm --filter @oynk/api start
```

To restart the tunnel in another terminal:

```sh
ngrok http http://127.0.0.1:4000 --inspect=false
```

During this setup the public origin is `https://antacid-spoiling-rocklike.ngrok-free.dev`. Check ngrok's current forwarding address after restarting. If it changes, update the API's `API_PUBLIC_URL`, the mobile app's `EXPO_PUBLIC_OYNK_API_URL`, and Paystack's test webhook URL, then restart the API and rebuild the mobile app.

Set the Paystack **test webhook** in Settings → API Keys & Webhooks to:

```text
https://antacid-spoiling-rocklike.ngrok-free.dev/api/paystack/webhook
```

The coding agent verified public `/health/ready`, authenticated SocketFi key discovery, Paystack test-key acceptance, and rejection of unsigned webhook requests. The Paystack dashboard webhook still needs to be saved by the account operator. No payments were created for these checks.

The API and tunnel run on the Mac; keep it awake and online during tests. Setup logs are `/private/tmp/oynk-local-api.log` and `/private/tmp/oynk-ngrok.log`. Do not publish these logs without reviewing them. ngrok request inspection is disabled so it does not retain payment payloads or bearer credentials in the local inspector.
