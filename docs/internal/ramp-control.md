# Ramp transaction control and observability

**Status:** Backend control foundation and internal Control Panel implemented. Paystack on-ramp ingestion is connected. Stellar settlement execution, event indexing and provider-neutral off-ramp payout adapters remain pending.

This layer is the operational source for Oynk on-ramp and off-ramp activity. Provider records such as Paystack charges are evidence attached to a canonical `ramp_transactions` row; they are not an independent transaction ledger.

## Lifecycle and separation of concerns

Transaction state is one of `CREATED`, `POLICY_CHECK`, `PENDING_APPROVAL`, `APPROVED`, `PROCESSING`, `COMPLETED`, `FAILED`, `REJECTED`, or `CANCELLED`. Approval state is stored separately as `NOT_REQUIRED`, `PENDING`, `APPROVED`, or `REJECTED`. Risk state is stored separately as `CLEAR`, `REVIEW_REQUIRED`, `FLAGGED`, or `BLOCKED`.

An automatically cleared quote remains `CREATED` until its provider leg is confirmed. A confirmed transaction becomes `APPROVED` only when no manual decision is pending. `PROCESSING` begins only when an idempotent execution attempt has been claimed. `COMPLETED` requires a successful execution result and its persisted chain/provider reference.

Every material transition inserts an append-only `ramp_transaction_events` row. Policy evaluations, approval actions and execution attempts have separate tables so the current projection cannot erase their history.

## Policy behavior

`ramp_policy_configs` contains separate `ON_RAMP` and `OFF_RAMP` policies. The initial threshold is 500 USDC, represented as `5000000000` Stellar atomic units. The comparison is strict:

- exactly 500 USDC: automatic policy clearance;
- greater than 500 USDC: manual approval;
- unknown USDC amount: manual approval;
- disabled direction: blocked/manual operations review.

The model includes optional cumulative thresholds and windows. They are disabled initially, but can enforce rules such as more than 1,500 USDC per user within 24 hours. Every change increments a version, writes `ramp_policy_versions`, and also writes the platform `audit_logs` table. Each transaction stores the evaluated version and snapshot, so edits do not alter an in-flight decision.

## Control API

The protected API is mounted at `/api/control/ramps` in every deployment mode. Authentication still uses the console session flow, so a consumer-only deployment does not expose a way for consumers to gain operator access:

- `GET /transactions` with direction, state, approval state, provider and search filters;
- `GET /transactions/:id` for transaction, events, policy decisions, approvals and attempts;
- `GET /approvals` for the manual queue;
- `POST /transactions/:id/approve` and `/reject`;
- `POST /transactions/:id/retry` with an `Idempotency-Key` header;
- `GET /policies` and `PUT /policies/:direction`;
- `GET /metrics` for state/amount aggregates.
- `GET /protocol` for contract addresses, Vault total/available/reserved liquidity,
  Pool statistics, ramp-rate health, and the Vault rebalancing policy;
- `POST /rebalancing/orders` creates an idempotent, partially fillable provider
  order in the direction required by the live liquidity difference;
- `GET /rebalancing/orders` lists the durable order records and chain references.
- `GET /settlements/:requestId` and `/settlements/:requestId/fills/:fillId`
  for exact provider-settlement and partial-fill state;
- `GET /corridors/:sourceCurrency/:destinationCurrency` for contract-authoritative
  corridor rates;
- `GET /providers/:operator` for provider capabilities, status and exposure.

Control access requires an authenticated console session in an `INTERNAL` organization plus the explicit permission. Mutations additionally require CSRF validation. The permissions are `ramp_transactions:read`, `ramp_transactions:approve`, `ramp_transactions:retry`, and `ramp_policies:manage`. Ordinary consumer access tokens cannot call these endpoints.

## Provider integration

`FiatRampProvider` is the adapter boundary for payment instruction creation and authenticated receipt verification. Paystack is the first registered implementation. VFD, Wema or another provider should implement this interface and use a stable provider ID. Provider callbacks must resolve to an existing Oynk reference; client claims never confirm fiat receipt.

An off-ramp adapter will add payout creation and payout verification beside this inbound interface. It must first observe exact USDC escrow in the Soroban flow, then create the fiat payout. Payout completion must preserve the provider reference before moving the canonical transaction to `COMPLETED`.

## Idempotency and recovery

Transaction creation has a unique idempotency key. Provider references are unique within a provider. Approval has a single terminal record; repeating the same decision returns the existing result while a conflicting decision is rejected. Execution and retry calls require unique idempotency keys. Repeated completion callbacks return the prior terminal state and cannot submit a second payment.

Structured ramp logs contain only allow-listed operational fields. They exclude phone numbers, email addresses, bank details, access tokens, secrets and raw provider payloads. The database events remain the durable audit source; logs are transport for monitoring and alerts.

## Remaining execution work

The next slice should connect the `APPROVED` queue to the Settlement Orchestrator and Vault:

1. On-ramp: persist the provider confirmation, submit the signed fiat attestation, claim execution, submit the Soroban transaction, persist its hash, wait for finality, then complete.
2. Off-ramp: create the canonical transaction and policy decision, verify Vault escrow, request/approve fiat payout, persist provider status, reconcile, then complete or refund.
3. Add reconciliation workers that compare provider records, the canonical ledger and Soroban events, raising `FLAGGED` records instead of guessing.
4. Index Soroban settlement, fill, Vault and provider-attestation events into a
   durable projection so the Control Panel can list every provider order without
   requiring an exact request ID. Contract storage remains authoritative.
5. Add wallet-signed manager/admin transaction preparation for ramp and corridor
   rates, provider registration/suspension, rebalancing policy, liquidity orders,
   refunds and pause controls. Never place admin or manager signing secrets in the
   API or browser configuration.

## Current Control Panel

The internal console now exposes live protocol balances, available versus
reserved Vault liquidity, the actual Oynk-funded buffer, Pool totals, depositor
count, pending redemptions, RWA deployment and its utilization cap. There is no
fixed operating-liquidity amount. Required liquid backing is derived from active
Pool claims minus RWA principal deployed, plus pending redemptions and the actual
admin-funded buffer. Temporary ramp imbalances are corrected with provider
orders in the required direction. The Settlement Network screen can
inspect provider-to-provider orders, Vault liquidity orders, partial fills,
corridor rates and registered providers directly from Soroban.

The existing transaction ledger, approval queue and policy editor remain scoped
to consumer `ON_RAMP` and `OFF_RAMP` transactions. Provider settlements must not
be inserted into that table as pretend ramp transactions. They require the event
projection described above so cross-border, P2P and rebalancing lifecycles retain
their native contract semantics.
