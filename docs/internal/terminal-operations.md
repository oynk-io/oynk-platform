# Oynk terminal operations

This document is the implementation source of truth for Oynk merchant terminals, Point of Sale payments, receipts, refunds, and provider reconciliation.

## Product surfaces

- **Oynk Console** (`console.oynk.io`) is the business workspace. A business can request hardware or software terminals, activate a software terminal, take an Offline Pay payment, inspect terminal-level volume, configure its devices, inspect receipts, and issue a partial or full refund.
- **Oynk Control** (`control.oynk.io`) is the internal operations workspace. Authorized operators review terminal requests, issue activation codes, inspect the terminal fleet, suspend or revoke a device, reissue an unused activation, and reconcile an uncertain provider result.
- **Oynk app** shows a customer's terminal payments, receipt number, refund history, and payment timeline in Activity.
- **Hardware terminal** and the Console software terminal use the same terminal API and payment state machine.

## Payment flow

1. The terminal authenticates with its terminal ID and device secret.
2. The terminal resolves a customer from the phone number or Oynk handle and creates a payment with an idempotency key.
3. The customer enters the Offline Pay PIN on the approved terminal.
4. Oynk validates the terminal, merchant, customer balance, Offline Pay status, expiry, per-payment ceiling, and rolling 24-hour allowance.
5. The database locks the customer funding state and records the payment before provider execution.
6. The business VFD account is credited from the customer's dedicated VFD account.
7. Oynk stores the provider reference, completes the payment, and exposes the stable receipt number to the business and customer.

The terminal is online throughout this flow. Offline Pay means the customer's own device can be unavailable; it does not mean the accepting terminal or Oynk ledger is offline.

## States and reconciliation

Terminal payments use explicit states including `CREATED`, `AUTHORIZING`, `PROCESSING`, `COMPLETED`, `DECLINED`, `FAILED`, `REVERSED`, and `RECONCILIATION_REQUIRED`.

Provider uncertainty never causes an immediate blind retry. The worker checks the provider using the stored provider reference with bounded exponential backoff. After eight unresolved attempts, the payment enters `RECONCILIATION_REQUIRED`. Control can then ask the provider for the latest state. Every transition is written to `terminal_payment_events`.

All create, authorize, refund, and reconciliation operations are idempotent. A repeated terminal or operator request must resolve to the original operation rather than move money twice.

## Receipts and refunds

Every payment has a stable receipt identifier derived from the payment ID. Console can copy or print it, and the customer sees the same identifier in Activity.

A business owner or business administrator can issue partial refunds up to the unrefunded payment amount. Refunds move money from the business's VFD account to the customer's VFD account and maintain their own provider reference, events, retry state, and idempotency key. A payment becomes `REVERSED` only after its full amount has been refunded.

## Terminal lifecycle and credentials

Terminal states are `PENDING_ACTIVATION`, `ACTIVE`, `SUSPENDED`, and `REVOKED`.

- Activation codes are one-time values with an expiry.
- An authorized business owner can rename its own terminal, generate a replacement activation code for a pending terminal, pause an active terminal, and resume a paused terminal. The business cannot revoke a terminal; revocation remains an internal Control action.
- Suspension blocks payments without destroying the device identity.
- Revocation removes the active credential and is terminal.
- Credential rotation is two-phase: an authenticated terminal requests a new credential, confirms it with the old credential, and only then replaces the active secret. This avoids bricking a device during an interrupted rotation.
- Operator actions are recorded in `terminal_operational_events` with the actor, reason, timestamp, and state change.

## APIs

Terminal device API:

- `POST /api/terminal/activate`
- `GET /api/terminal/status`
- `POST /api/terminal/payments`
- `POST /api/terminal/payments/:id/authorize`
- `GET /api/terminal/payments/:id`
- `POST /api/terminal/credentials/rotations`
- `POST /api/terminal/credentials/rotations/:id/confirm`

Business Console API:

- terminal requests and terminal inventory under `/api/business/terminal-requests` and `/api/business/terminals`
- payment list/detail under `/api/business/payments`
- refund creation at `POST /api/business/payments/:id/refunds`

Control API:

- terminal request approval and activation issuance under `/api/control/businesses/terminal-requests`
- fleet actions under `/api/control/businesses/terminals`
- payment inspection and reconciliation under `/api/control/businesses/payments`

## Production readiness still required

The application and API workflow are complete enough for sandbox end-to-end testing. Before live processing:

1. Replace the hardware prototype's development input path with a protected physical PIN-entry path and prevent the PIN from appearing in logs, crash reports, or general application memory longer than required.
2. Enable secure boot, signed firmware, flash encryption, device identity provisioning, and device attestation for production hardware.
3. Certify VFD transfer status and refund reconciliation behavior against the live product and failure cases.
4. Treat the browser software terminal as a managed merchant device. Production rollout needs device registration, attestation/risk checks, short sessions, and a clear lost-device revocation procedure.
5. Add optional SMS/email receipt delivery. The canonical receipt already exists in Console and customer Activity.
6. Add alerting for reconciliation backlog, repeated declines, terminal credential failures, suspended-device requests, and refund failures.
