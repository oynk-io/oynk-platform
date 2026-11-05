# VFD-backed Oynk Pay accounts

Oynk Pay stable NGN accounts are provisioned by the API through VFD. VFD credentials are server-only. A connected SocketFi smart account begins at **Fiat Tier 0** and remains fully usable for crypto. The mobile app sends identity details only when the customer activates or upgrades Oynk Pay. The API sends those details directly to VFD and persists keyed fingerprints rather than raw NIN/BVN values.

## Progressive fiat verification

- **Tier 0:** smart-account and USDC features only. The customer can skip fiat activation during onboarding.
- **Tier 1:** either NIN or BVN, matching date of birth, consent, and VFD confirmation. Limit: ₦30,000 daily and ₦30,000 per transaction.
- **Tier 2:** the other identity number so both NIN and BVN are verified. Limit: ₦100,000 daily and ₦100,000 per transaction.
- **Tier 3:** verified residential address after Tier 2. Limit: ₦10,000,000 daily and ₦1,000,000 per transaction.

The API is authoritative for the tier. Device storage cannot grant verification. Tier 2 and Tier 3 are sequential account upgrades and appear in the Account area rather than first-run onboarding. Every fiat entry point blocks Tier 0 and opens Tier 1 activation. The rolling 24-hour and per-transaction limits apply to deposits, conversions, and bank withdrawals.

## Local configuration

Set these in `apps/api/.env`:

```dotenv
VFD_CONSUMER_KEY=<sandbox consumer key>
VFD_CONSUMER_SECRET=<sandbox consumer secret>
VFD_ENVIRONMENT=TEST
VFD_WEBHOOK_SECRET=<at least 32 random characters>
```

Run migrations before restarting the API:

```bash
pnpm --filter @oynk/api db:migrate
```

Configure VFD's settled inward-credit webhook as:

```text
POST https://<public-api>/api/vfd/webhook
Authorization: Bearer <VFD_WEBHOOK_SECRET>
```

Initial inward-credit notifications are acknowledged but never credited. Only the settled inward notification can create an idempotent `BANK_DEPOSIT` ledger entry. `session_id` is the replay key. A credit above the user's rolling tier limit is retained for review and does not increase the spendable balance.

VFD's dedicated 1-to-1 account is the source of truth for each user's Oynk Pay
balance. The API reconciles its cached balance from VFD account enquiry. Direct
bank transfers may enter that dedicated account normally.

Conversions use Oynk's separate settlement account:

- Smart to Pay escrows USDC, then transfers NGN from Oynk's VFD account into
  the user's dedicated VFD account.
- Pay to Smart transfers NGN from the user's dedicated VFD account into Oynk's
  VFD account before the Soroban orchestrator releases USDC.

The ledger records and VFD webhooks provide an idempotent audit trail; they do
not mint or destroy a naira balance independently of VFD settlement.

## Sandbox identity

Never use real identity data in the VFD test environment. One VFD-documented fixture is:

```text
NIN: 23230042941
BVN: 22222222252
Date of birth: 1994-04-05
BVN OTP: 111162
```

Tier 1 may use the fixture NIN or BVN with the matching date of birth. Use only VFD-provided sandbox fixtures in TEST.

## Failure behavior

- A definitive VFD validation rejection releases the local provisioning record so corrected details can be submitted.
- A network timeout leaves the account in `PENDING`; Oynk does not retry creation automatically because VFD may have created the account before the response was lost.
- A pending account must be reconciled through VFD before an operator retries it.
- No account number, NGN balance or successful credit is invented locally.
- `TEST` credentials are accepted only for TESTNET Oynk accounts; `LIVE` credentials are accepted only for PUBLIC accounts.
# Tier 3 document verification

Tier 3 is available only after Tier 2. The mobile app collects the user's residential address, a government ID image (NIN, national ID, driver's licence, or passport), a recent utility bill, and explicit consent. It uploads each JPG/PNG image directly through the authenticated Oynk API to VFD's KYC bundle endpoint. Oynk stores the document type, content hash, provider response status, and audit events; it does not store the images or NIN/BVN values in this document table.

The upload response proves only that VFD received the document. It does **not** approve Tier 3. Oynk calls VFD `/client/update` with the address after both uploads are confirmed. Oynk raises the tier and its limits only when VFD explicitly returns `currentTier: "3"`. If VFD explicitly reports pending review, the request is recorded as `PENDING_REVIEW`, displayed to the user, and Tier 2 remains active. An ambiguous response is `UNKNOWN` and blocks repeat submissions until an operator reconciles it with VFD. VFD's published KYC upload API does not provide a documented asynchronous review callback/status endpoint; automated finalization after review must wait for a verified provider mechanism. Do not manually change local tier without provider confirmation.
