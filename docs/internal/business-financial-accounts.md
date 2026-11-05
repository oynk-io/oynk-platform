# Business financial accounts

This document is the implementation source of truth for Oynk business account provisioning.

## Account model

Each approved business receives a dedicated VFD corporate account under VFD's **1:1** implementation. Funds remain in that business account. Oynk does not represent multiple business balances with a pooled internal ledger.

The business also selects one owner-controlled Stellar settlement account:

- a dedicated SocketFi smart account (`C...`), created or connected through SocketFi hosted authentication; or
- a classic Stellar account (`G...`) connected through Stellar Wallets Kit.

A classic account is ready only after it has a USDC trustline to the issuer configured for the business network. A SocketFi smart account uses Soroban token balances and does not require a classic trustline.

An external Nigerian bank account is an optional scheduled-settlement destination. It does not replace the dedicated VFD account.

## Provisioning lifecycle

1. The business submits compliance information.
2. Oynk Control approves the business application.
3. The owner opens **Console → Accounts**.
4. The owner provides director BVN, NIN, and consent. Oynk calls VFD `POST /client/tiers/corporate` with the reviewed registration profile.
5. Oynk stores the returned account metadata and a keyed identity fingerprint. Raw BVN and NIN are not persisted.
6. The owner creates/connects a SocketFi account or connects a G account.
7. For a G account, Oynk issues a five-minute transaction challenge. The wallet signs it; Oynk verifies the transaction hash and Ed25519 signature. If USDC is missing, Oynk prepares an exact `changeTrust` transaction for the configured issuer, the wallet signs it, and Oynk submits it to Horizon.
8. When both the VFD account and verified USDC account are ready, provisioning becomes `READY`.
9. An authorized Oynk operator activates the business in Control. Terminal requests can then be approved.

VFD calls are idempotent at the local business level. An ambiguous provider/network failure enters `RECONCILIATION_REQUIRED`; the API does not blindly create another corporate account.

## Required configuration

API:

```env
VFD_ENVIRONMENT=TEST
VFD_CONSUMER_KEY=...
VFD_CONSUMER_SECRET=...
STELLAR_TESTNET_HORIZON_URL=https://horizon-testnet.stellar.org
USDC_TESTNET_ISSUER=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5
```

Console:

```env
VITE_SOCKETFI_API_URL=https://api.socket.fi
VITE_SOCKETFI_CLIENT_ID=sf_client_live_u3zqxglr2dhozi7z5z73o3wchwkm
```

VFD must enable corporate account creation and configure Oynk's tenant for the 1:1 implementation. SocketFi must register the Console origins and `/business/accounts` callback URLs before its hosted create/connect flow will work.

## Security boundaries

- A VFD account number and a Stellar settlement account are each unique across Oynk businesses.
- G-account control is proven with a short-lived, single-use signed transaction challenge.
- The USDC trustline transaction is constructed by Oynk and checked against the stored challenge before submission.
- SocketFi ownership is accepted only from a valid Oynk project-bound SocketFi access token.
- Account and trustline network must match the organization's platform mode.
- Account provisioning and operator activation remain separate actions with audit events.

## Control business registry

**Control → Businesses** reads all `BUSINESS` organizations, including registrations that have not yet submitted compliance information or provisioned accounts. It is separate from **Applications**, which remains the review and activation queue.

`GET /api/control/businesses` requires an internal organization session with `compliance:read`. Business and partner sessions cannot access it. The endpoint accepts optional `q`, `status`, and `mode` filters, with bounded `limit` (default 50, maximum 100) and `offset` pagination. Search matches a partial business name, registration number, bank account number, or business ID; wildcard characters are treated literally.

The response contains `businesses`, filtered `total`, `nextOffset`, and global `summary` counts. Rows include review status, environment, registration date, and bank/USDC account readiness. Missing compliance and financial records do not hide the business. BVN, NIN, credentials and private keys are excluded. Loading failures display an error and retry action instead of an empty-business message.

Each registry row opens a dedicated business page with Overview, Accounts, Requests and History sections. The URL uses a stable readable slug, for example `/internal/businesses/app-vest-ltd`. Migration `051_business_registry_management.sql` backfills existing businesses and assigns slugs during registration. Equal names receive a suffix from the business UUID; concurrent registrations are serialized during slug allocation. A later legal-name change does not invalidate the URL. Old UUID links still resolve and are replaced with the readable URL in the browser. Internal UUIDs remain the relational account identifiers; a slug is not an authorization credential or tenant boundary.

`GET /api/control/businesses/profiles/:identifier` accepts the slug or legacy UUID and requires the same internal `compliance:read` permission as the registry. It returns registration fields, account metadata, active owner contacts, the latest 50 review/account events and the latest 100 information requests. It does not expose BVN/NIN, provider payloads, secret material or raw event metadata.

### Business management actions

The page shows only actions available for the current state and operator permissions. Each action opens a confirmation dialog; the server independently checks permissions, CSRF, business scope and state. Activation, review decisions and their audit records commit in one database transaction.

| Action | Permission | Allowed transition / behavior |
| --- | --- | --- |
| Approve application | `applications:approve` | Submitted / under review / more information needed → approved. Creates pending account setup if absent. Repeated approval does not duplicate history. |
| Reject application | `applications:reject` | The same review states → rejected, with a reason. Repeated rejection does not duplicate history. |
| Activate | `accounts:activate` | Approved → active, only with ready bank and verified USDC accounts. |
| Deactivate | `accounts:suspend` | Active → suspended, with a reason. |
| Reactivate | `accounts:activate` | Previously activated, suspended → active, only when both financial accounts remain ready. |
| Request / close information | `compliance:review` | Separate request lifecycle; does not implicitly change business activation. |

Deactivation stops new business payments and hides the business from public Mart discovery through existing active-business checks. A terminal payment still awaiting its PIN cannot be authorized for a suspended business. Authorization locks the business row alongside the payment and customer policy, so it is serialized with deactivation. Payments already authorized or submitted to a provider continue reconciliation. Deactivation does not unlink financial accounts, move or freeze funds at VFD, or revoke individual terminal credentials; those remain separate operations.

### Information request lifecycle

1. The operator sends `POST /api/control/businesses/:id/information-requests` with a client-generated UUID `requestId` and `note`. The request becomes `OPEN`. Retries with the same ID and content reuse the record; changed content or another business using that ID is rejected.
2. Business Console displays a **View requests** notice. `GET /api/business/information-requests` is scoped to the selected business and requires `compliance:read`.
3. A business user with `compliance:submit` posts a response to `/api/business/information-requests/:requestId/respond`. The request becomes `RESPONDED`. Another business cannot read or respond to it. Repeating the same response is idempotent.
4. The operator reviews the response on the business page and closes the request via `POST /api/control/businesses/:id/information-requests/:requestId/resolve`, optionally recording a review note. The request becomes `RESOLVED` and remains in history. An operator may also close an unanswered request when no longer needed.

Creation, response and resolution write business history and audit-log events with the acting user and request ID. Request delivery is inside Console; this implementation does not send email/SMS notifications. Asking an active business for information leaves payments active unless an authorized operator separately deactivates it.

`apps/api/src/business/registry.integration.test.ts` verifies the registry, slug migration/collisions, state transitions, financial readiness, CSRF/RBAC boundaries, idempotency, audit creation, scoped information responses and pending-terminal authorization after deactivation using a temporary database schema. Existing development accounts are not modified by this test.
