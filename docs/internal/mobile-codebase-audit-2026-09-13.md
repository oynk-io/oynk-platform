# Oynk cross-repository implementation audit

Review date: 2026-09-13. Companion: [mobile implementation plan](mobile-implementation-plan.md).

## Scope and confidence

This review maps the application source, routes, state stores, database schema, integration boundaries, contract implementation, test inventory, native configuration, and existing documentation across the three repositories in this workspace. It is an implementation assessment, not a security certification or confirmation of live services. Generated native resources, dependency internals other than the bundled SocketFi adapter, and lockfile entries were not individually audited.

Baseline commits: mobile `ce93b4e`; platform `917a051`; settlement protocol `dbeffdb`. All three working trees were clean before this documentation work. No repository-local AGENTS.md was found. The platform references the protocol as a submodule, while this workspace supplies a separate sibling checkout; integration work must pin the intended version explicitly.

## Overall finding

Oynk currently has a wallet/payment mobile prototype, organization-account foundations, operational transaction visibility, and a separate Soroban settlement implementation. It does not yet have the capital pool, consumer ledger, marketplace, asset financing, or provider servicing system described in the product proposal.

The existing work is useful infrastructure, but a mobile redesign alone cannot deliver the proposed product. The critical new work is the authoritative financial and transaction domain behind the screens.

## Repository inventory

| Area | Implemented responsibility | Limit |
| --- | --- | --- |
| `oynk-mobile-app` | Expo/React Native app, navigation, SocketFi authentication invocation, wallet/payment prototype | No Oynk backend integration; money flows use local state |
| `oynk-platform/apps/web` | Public landing page, navigation, brand assets, external console/docs/activity links | Product positioning is not transaction execution |
| `oynk-platform/apps/console` | Business/partner/internal shells, authentication forms, organization selection, business compliance draft form | Most operational pages render informational empty states |
| `oynk-platform/apps/transactions` | Activity charts, metrics, transfer list, filters, details, explorer/copy interactions | Public reporting surface; no consumer account ledger |
| `oynk-platform/apps/api` | Express/PostgreSQL API, identity, compliance drafts, email, BSC/Solana indexing and operational tooling | No purchase, pool, facility, provider assignment, or Stellar integration API |
| `oynk-platform/packages/shared` | Dashboard, transfer, sync, organization, auth, compliance DTOs | No consumer/provider/credit/RWA models |
| `oynk-platform/apps/docs` | Mintlify pages, OpenAPI mirror, local validator | Contains both implemented and proposed architecture |
| `settlement-aggregator-protocol/contracts/settlement` | Active Soroban settlement contract | Settlement escrow only; not a savings or lending vault |
| `settlement-aggregator-protocol/packages/oynk-sdk` | Rust settlement types, errors, events and invariant tests | Not a mobile SDK |
| Protocol `registry`, `treasury`, `disputes` directories | Draft contract designs | Excluded from active workspace/build scripts |
| Protocol `typescript-client` | Generic transaction builder and Keypair signing helper | Stale contract identifiers; not aligned to the active single-contract interface |
| Protocol `indexer/schema.sql` | Event/settler metrics schema sketch | No running Stellar ingestion worker supplied |

## Mobile implementation

Stack declared in `package.json`: Expo 54, React Native 0.81, React 19.1, React Navigation 7, NativeWind 4, Zustand 5, and a local `@socketfi/react-native` 1.0.0 tarball. These are the checked-in choices, not a claim that they are the latest supported releases.

| Surface | Actual behavior |
| --- | --- |
| `App.tsx` | Wraps app in SocketFi provider, selects auth/tabs from in-memory session; hardcoded TESTNET configuration and RonPay redirect/branding |
| `LoginScreen.tsx` | Calls `authenticate()` and maps returned fields into local session; no server verification or Oynk session exchange |
| `ProfileSetupScreen.tsx` | Profile form component with callback; not registered in the auth navigator |
| `HomeScreen.tsx` | Creates local payment links, shows QR/share/copy modal and recent requests; “Mark as paid” locally simulates receipt |
| `WalletScreen.tsx` | Displays local balance and wallet address, validates payout input in UI, creates local pending payout |
| `TransactionsScreen.tsx` | Formats local transaction records |
| `SettingsScreen.tsx` | Account display and logout; preference rows largely have no action handlers |
| `useAppStore.ts` | In-memory money/session store, seeded sample transactions, mock link generation, simulated payments and payouts |
| `Button.tsx`, `Card.tsx` | Small reusable presentation primitives |

### Concrete repair backlog

1. Typecheck fails with four errors: two unused login copies call nonexistent `signIn`; active Login and ProfileSetup pass unsupported `disabled` to Button. Button also does not disable interaction while loading.
2. Wallet copy shows success but never calls `Clipboard.setStringAsync`, despite importing Clipboard.
3. `simulatePayment` has no paid-state guard; repeated store calls can credit the same request again. Payout mutation has no independent amount/balance validation and clamps balance to zero. These are prototype operations, not valid financial processing.
4. Logout clears only session. Transactions, requests, and balances can remain visible to the next account in the same app process. All state disappears on restart.
5. Tokens are held in ordinary app state and `App.tsx` logs authentication results. No secure session persistence, refresh, revocation bridge, or recovery integration exists.
6. SocketFi declaration says `authenticate(): Promise<SocketFiSession>`, with `wallet?: string`, while mobile expects `data.session.wallet.TESTNET`. The runtime returns the auth exchange JSON without validating that shape; its type permits arbitrary fields. Actual hosted response must be captured in staging and normalized explicitly before assuming the current mapping works.
7. Bundled SocketFi supports `requestTransaction` and `readContract`, but mobile does not call them. Its README describes a web SDK and includes methods absent from the native declaration. Treat bundled code plus verified provider behavior as the integration baseline.
8. Naming is split between Oynk repository, CG Pay package/README/payment-link domain, and RonPay UI/native identifiers. Both npm and pnpm lockfiles exist. README references a missing `src/services/mockApi.ts`.
9. No consumer KYC, deposits, bank beneficiaries, real fiat quotes, authoritative balance fetch, push notifications, marketplace, facility repayment, or asset service scheduling is implemented.

## Platform implementation

### Identity, access and compliance

The code has progressed beyond the August gap audit. Migration 002 supplies users, organizations, roles, permissions, memberships, OTP challenges, sessions, and audit logs. Passwords use scrypt; tokens/OTP values use keyed hashes; OTP consumption uses transactional row locking. Browser sessions use HttpOnly cookies and CSRF validation for supported authenticated mutations. Signup, email verification, password plus email OTP login, OTP resend, password reset, logout, and organization selection have route implementations.

Only BUSINESS, SETTLEMENT_PARTNER and INTERNAL organization types exist. Consumer profiles, external identity links, wallet ownership bindings, native refresh sessions, and provider capabilities are absent. `users.password_hash` is mandatory today, so passkey-only consumer identities need an explicit schema migration rather than dummy passwords.

Migration 005 plus compliance routes implement a validated, audited business profile draft. The partner compliance screen reuses this form. Document storage, application submission/review/activation, beneficial-owner workflows, and specialized provider onboarding are not complete implementations. Status and permission names in the schema do not establish working workflows for every named capability.

Email has a development adapter and a custom TLS SMTP implementation for Zoho, template generation, retry attempts, and delivery outcome records. This review did not exercise external email delivery. Authentication and sync rate limits use per-process maps.

### API surface present today

| Prefix | Implemented routes |
| --- | --- |
| Health | `/api/health`, `/health/live`, `/health/ready` |
| `/api/auth` | `/signup/business`, `/signup/partner`, `/verify-email`, `/login`, `/verify-otp`, `/otp/resend`, `/forgot-password`, `/reset-password`, `/session`, `/session/organization`, `/logout` |
| `/api/compliance` | GET/PUT `/business` |
| `/api/dashboard` | GET aggregate dashboard; GET/POST `/sync` |
| `/api/sync` | `/status`, `/runs`, `/runs/:id`, `/failures` |

Dashboard and sync read endpoints are mounted without user authorization; sync mutation uses an admin API key. Consumer and provider APIs must have separate authenticated, scoped contracts. The dashboard must not be reused as a user's balance or history endpoint.

### Indexing and reporting

- BSC: configured stablecoin ERC-20 logs, wallet/token cursors, confirmation depth and rewind, adaptive RPC ranges, retries, deterministic transfer identities and upserts.
- Solana: confirmed RPC transactions/signatures, parsed token balance deltas, source/cursor identities, pagination and failure records. Observed deltas are not authoritative payment intent or bank settlement evidence.
- Sync: process guard plus PostgreSQL advisory lock, run records, partial failures and manual/scheduled execution.
- Reporting: NUMERIC/raw amount storage, on/off-chain aggregation, 365-day timeline, most recent 500 combined transfer rows; frontend pagination and filtering operate on loaded rows.
- Off-chain records: optional CSV import into `offchain_transactions`, masked response fields, report-level amounts and references. Import is not a bank connector or double-entry ledger; the seed routine replaces records absent from the supplied report.
- Pairing: actual SQL ranks available outflows by same asset preference, amount difference and time proximity, without the README's claimed 1%/six-hour constraints. It labels pairs HEURISTIC. Dashboard reference-pair metrics and paired display use REFERENCE only. Neither heuristic matches nor report records can authorize customer credits.

Operational scripts cover migration, sync/backfill, chain audits, internal-owner bootstrap, auth audit, and email checks. `sync:contract` refers to BSC/Solana token indexing, not Soroban contract events.

## Settlement contract implementation and integration constraints

The active contract implements request creation, manager quotes, source/destination settler acceptance, token escrow deposits, manager fiat confirmations, claims, cancellation before funding, manager refunds, funded-request disputes, manager resolutions, and admin upgrades/admin-manager changes. Routes cover fiat-to-crypto, crypto-to-fiat, and fiat-to-fiat. Evidence is stored as hashes/references; the contract does not independently establish bank payout or asset ownership.

Important constraints for the mobile product:

1. `accept_settlement` authenticates the proposed settler but does not consult a provider registry or bind acceptance to the routing engine's chosen provider. A verified-only network needs enforceable assignment authorization; API filtering alone cannot prevent direct contract calls.
2. Crypto-to-fiat escrow is funded by the request creator in one required amount. It does not combine buyer and pool contributions. Purchase escrow/vault composition needs a separate design and tests.
3. Fiat-to-crypto claims go to the request creator; creation identity must match the intended wallet/custody flow.
4. No crypto-to-crypto purchase type, asset delivery milestone, partial principal repayments, insurance fee schedule, LP share accounting, yield or collateral servicing exists.
5. Manager confirmations/refunds/dispute decisions and admin upgrades are explicit trust boundaries. Expired funded requests need operational recovery; expiry does not automatically refund funds.
6. Storage helpers do not include a TTL extension/restore workflow. Long-lived asset servicing cannot depend solely on short-lived request storage assumptions.
7. TypeScript client expects `registry/payments/treasury/disputes`, signs with a raw Keypair, returns on PENDING, and has a limited i128 encoder. Replace its public integration boundary with generated/validated active-contract bindings and an external signing adapter.

The repository records five SDK invariant tests and twelve WASM integration tests plus reproducible build/mainnet deployment metadata. Those are checked-in evidence, not tests rerun or live chain assertions independently verified during this review. A deployed settlement artifact is not an implemented capital protocol.

## Validation performed

| Check | Result |
| --- | --- |
| Mobile `npm run typecheck` | Failed: four errors described above |
| `node oynk-platform/apps/docs/scripts/validate.mjs` | Passed: 32 Mintlify pages and local assets |
| Working tree baseline | Clean in all three repositories |
| Platform test/build suite | Not run; platform node_modules are absent in this checkout |
| Rust/WASM build suite | Not rerun; no prebuilt target artifacts in checkout |
| Mobile native/device flows | Not exercised |
| Live authentication, fiat rails, chain deployment, database migrations | Not exercised |

Existing platform tests cover security helpers, email templates, indexer identities, off-chain CSV parsing, console API error normalization, navigation/routes, country selection and form validation/feedback. They do not demonstrate the proposed financial lifecycles or full native end-to-end readiness.

## Reuse decision

Keep the React Native application, Express/PostgreSQL platform, organizational identity and console foundations, reporting subsystem, and active settlement contract as distinct reusable components. Add consumer identity, provider capabilities, accounting, credit, marketplace, and servicing as explicit domains. Preserve public activity reporting as reporting. Follow the companion plan for implementation order and completion gates.
