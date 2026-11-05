# VFD collection and payout ramps

Oynk can select collection and payout providers independently at API startup:

```env
OYNK_DEFAULT_FIAT_PROVIDER=VFD
OYNK_FIAT_COLLECTION_PROVIDER=VFD
OYNK_FIAT_PAYOUT_PROVIDER=VFD
```

`OYNK_DEFAULT_FIAT_PROVIDER` is the backward-compatible fallback. Explicit
directional values take precedence. Supported values are `VFD` and `PAYSTACK`.
Changing a value requires an API restart, but no mobile rebuild. Every ramp row
stores its selected provider, so pending transactions continue through the
provider that originally created them after a configuration change.

## VFD configuration

```env
VFD_CONSUMER_KEY=
VFD_CONSUMER_SECRET=
VFD_ENVIRONMENT=TEST
VFD_WEBHOOK_SECRET=
VFD_WALLET_PREFIX=oynk
VFD_MERCHANT_NAME=Oynk Technologies
VFD_PAYOUT_ACCOUNT_NUMBER=1001708257
VFD_COLLECTION_FEE_BPS=0
VFD_COLLECTION_FEE_FLAT_KOBO=0
# VFD_COLLECTION_FEE_CAP_KOBO=
```

The wallet prefix must match the prefix assigned by VFD. The payout account is
Oynk's VFD corporate/disbursement account and is required for conversions.
Each consumer balance remains in its dedicated 1-to-1 VFD account. Configure the fee fields from
Oynk's VFD commercial agreement before live use; sandbox can use zero.

## Collection lifecycle

The Soroban orchestrator remains the rate and quote source. After the user
accepts a quote, the API creates the on-chain on-ramp request and requests a
one-time VFD virtual account with `amountValidation=A0`. The VFD account accepts
only the exact gross amount and expires after thirty minutes. Settled inward
credit is accepted only through the authenticated VFD webhook. The webhook is
matched by temporary account number, deduplicated by VFD session ID, checked
against the quoted amount and rolling limit, and then recorded in the canonical
ramp ledger. The existing policy engine decides whether settlement is automatic
or requires operator approval. Only the ramp worker can confirm the on-ramp and
release Vault USDC.

Permanent VFD customer accounts remain the funding rail for Oynk Pay. Their
inflows are mapped to the Quick Pay ledger and never implicitly buy USDC.

For a user-requested Pay-to-Smart conversion, the worker explicitly transfers
the quoted NGN amount from that user's dedicated account to Oynk's configured
settlement account. Only a successful VFD transfer becomes provider
confirmation and permits the Soroban on-ramp to release USDC. Policy approval,
when required, happens before this transfer.

## Payout lifecycle

The user first funds the Soroban off-ramp escrow. After on-chain verification
and policy approval, the worker resolves Oynk's VFD sender account, resolves the
beneficiary, signs the transfer payload with SHA-512 over the source and
destination account numbers, and submits the transfer with a stable Oynk
reference. Non-success submission responses remain in reconciliation until the
VFD transaction-status query reports a terminal result. A successful payout
completes the on-chain off-ramp; a confirmed failure refunds escrow according to
the orchestrator flow.

For Smart-to-Pay, the beneficiary is the same user's dedicated VFD account.
The source remains Oynk's settlement account, exactly as it does for an external
bank off-ramp; only the destination differs.

Configure both Wallet Inflow and Payout webhooks to:

```text
https://<oynk-api>/api/vfd/webhook
Authorization: Bearer <VFD_WEBHOOK_SECRET>
```

Initial-credit notifications never move a ledger. Only settled inflow events
are accepted. Provider callbacks are evidence; the Oynk ramp ledger and Soroban
contracts remain the operational and settlement sources of truth.
