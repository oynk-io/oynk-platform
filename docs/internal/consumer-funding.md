# Oynk consumer funding

The initial fiat flow uses Paystack **Pay with Transfer**, one temporary account per payment. No permanent DVA is generated during onboarding. No conversion contract, USDC credit, payout, or fiat-to-USDC settlement is implemented. Confirmed naira receipts remain separate from the on-chain USDC balance.

## Deployment

1. Deploy `apps/api` with migration `007_consumer_funding.sql`. Run the existing `pnpm --filter @oynk/api db:migrate` against the intended deployment database (the migration command also processes existing migrations; inspect the target first).
2. Set server-only `PAYSTACK_SECRET_KEY`, `SOCKETFI_CLIENT_ID` and `SOCKETFI_CLIENT_SECRET`. See `apps/api/.env.funding.example`. Use the client secret paired with Oynk's client ID. The backend fetches `/.well-known/socketfi-public-key` using the client ID/secret headers, caches the imported RS256 key for 24 hours, and refreshes on expiry or rotation. Concurrent fetches share one request; failure-triggered refreshes are limited to once every five seconds. Expired keys fail closed if refresh fails. `SOCKETFI_API_URL` defaults to `https://api.socket.fi`; no PEM file or PEM environment value is required. No client secret belongs in the mobile app.
3. Set Paystack's webhook to `https://<oynk-api>/api/paystack/webhook`. Enable Pay with Transfer for the merchant. Do not enable automatic customer fee passing in addition to Oynk's gross-up. The entire payment belongs to Oynk's Paystack integration; no split/subaccount is sent. Payout follows that merchant's configured settlement bank account and Paystack schedule.
4. Initially use a **test** secret with the **TESTNET** smart-account network. Live keys require PUBLIC; the backend rejects mixed environments. Merchant eligibility and business approval must be confirmed with Paystack before enabling live collection.
5. Configure the NGN on-ramp and off-ramp rates on the Soroban orchestrator with `set_rates`. Rates use kobo per whole USDC, carry a ledger expiry and version, and are the only executable conversion authority. The API simulates `quote_onramp`, persists the contract ID/version/expiry with the transaction, and refuses quotes when the contract rate is absent, expired or inconsistent.
6. Set mobile `EXPO_PUBLIC_OYNK_API_URL=https://<oynk-api>` and rebuild the device app. Only the API origin is public. Set secrets in the backend environment, not chat or `EXPO_PUBLIC_*`.
7. Deploy the local SocketFi API registration change: Oynk TESTNET permits only the canonical USDC contract's `transfer`. PUBLIC and other operations remain disallowed. The project paymaster must be available for transaction preparation/submission. No SocketFi web change is needed.

## Flow and ownership

SocketFi bearer tokens are cryptographically verified using `jose` (RS256, issuer, audience, subject, expiry, token type and matching active wallet/network). The server derives the consumer identity from the signed token. A request body cannot select another smart account or raise a tier. Personal data is stored in the consumer database; existing mobile drafts sync when accessing funding. Basic details create Tier 1. NIN/BVN verification remains a separate integration; there is no public tier-upgrade endpoint and submitting a document does not grant a higher tier.

`POST /api/consumer/quotes` accepts a decimal **naira** amount. The quote includes principal, estimated fee, gross transfer total, optional indicative USDC equivalent and a five-minute review expiry. Fees use standard Nigerian local-channel pricing: 1.5% + ₦100 (waived below ₦2,500), capped at ₦2,000, grossed up using integer arithmetic. Confirm merchant-specific pricing before live activation. Actual verified Paystack fees are recorded with the receipt; sending-bank charges are separate.

`POST /api/consumer/deposits` takes the server-issued reference and explicit consent. A row lock on the consumer serializes all reservations. Only one caller may transition a quote into creation and submit the charge. The reference maps immutably to a consumer and smart account. The temporary account is requested for 30 minutes; the provider's returned expiry is authoritative. The app displays/copies the exact gross amount and the actual bank/account name. It cannot set an amount-specific bank name through Paystack's documented charge parameters.

The webhook verifies HMAC-SHA512 over the **raw request body**, then retrieves the transaction independently from Paystack. It checks reference, domain, currency, channel, amount, fees and paid time. Unique transaction ID/reference constraints plus row locking prevent duplicate receipts. Wrong amounts and unmatched Oynk references are retained for review. Other merchant references are ignored. No receipt credits a smart-contract balance.

## Rolling allowance and uncertain results

Tier limits are ₦50,000 / ₦200,000 / ₦5,000,000 per rolling 24 hours. The displayed limit counts **confirmed deposit principal only**, excluding Paystack fees. Pending and review payments reserve principal separately to prevent overlapping requests; they do not reduce the displayed remaining allowance. A received payment releases allowance at its paid timestamp + 24 hours. For principal-only illustration: ₦10,000 + ₦20,000 uses ₦30,000, leaving ₦20,000; after the first payment expires, ₦30,000 is available, then ₦50,000 after the second expires.

Unused reservations do **not** disappear on the local clock alone. The API checks payment status every 30 seconds in bounded batches and on explicit deposit refresh. Reservations release only after provider-confirmed terminal failure/abandonment and expiry plus five minutes. Unknown outcomes remain held. This is deliberately conservative: ambiguous Paystack creation or prolonged pending status needs operator reconciliation, not a new POST with the same reference. Support must verify the reference in Paystack before resolving held funds; no unverified “clear pending” API exists. Monitor pending age and reconciliation failures in deployment.

Paystack documents automatic refunds for incorrect amounts, expired accounts and excess payments. A sending bank may debit before refund; do not promise pre-debit rejection or an instant refund. Transfers from supported Nigerian banks are accepted; this is not GTBank-specific. Paystack returns the receiving bank, not the user's sending bank. A bank may display an amount in its own UI, but this integration does not promise that behavior.

## Verification and remaining live checks

Tests cover integer arithmetic and fee boundaries, rolling expiry, signed identity, forged signatures, simultaneous reservations, duplicate creation, duplicate verified receipts, cross-account access and amount mismatch. `funding.integration.test.ts` runs only when `FUNDING_TEST_DATABASE_URL` explicitly names the isolated `127.0.0.1:55439/oynk_funding_test` database; it creates and removes its own schema. Paystack is mocked; it never moves money.

Before live enablement, run a real **test-mode** Paystack charge/webhook cycle with merchant credentials, verify account expiry and mismatched-amount refunds, reconcile a timed-out creation, and confirm the exact merchant fee schedule and trade-name display. Also exercise the native passkey withdrawal on the configured network. No live payment or withdrawal has been performed by the coding agent.

Official references: [Pay with Transfer API](https://paystack.com/docs/payments/payment-channels/#pay-with-transfer), [bank transfer behavior and naming](https://support.paystack.com/en/articles/2128642), [pricing](https://support.paystack.com/en/articles/2130306), [webhooks](https://paystack.com/docs/payments/webhooks/).
