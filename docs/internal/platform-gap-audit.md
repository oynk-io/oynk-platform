# Oynk platform gap audit

Date: 2026-08-06

Scope: Phase 0 repository audit only. This document records the repository's current state and does not mark proposed product functionality as implemented.

## Executive assessment

The repository currently provides three coherent capabilities:

1. A public website positioning Oynk as cross-border settlement infrastructure.
2. A read-oriented operations console for indexed BSC and Solana transfers.
3. An Express/PostgreSQL indexing service with synchronization runs, failure tracking, metrics, and repair tooling.

It is not yet a multi-tenant payment platform. There is no user identity system, organization model, role enforcement, business or partner onboarding, payment and payout ledger, POS management, compliance review workflow, secure document service, notification service, or Zoho email integration. Most of the broader console destinations are intentionally represented as disabled or planned navigation rather than live products.

The safest implementation path is to preserve the indexing subsystem and introduce the platform as explicit, versioned layers: identity first, then verified email and sessions, then compliance applications, then role-specific consoles, and only afterward transactional payment products.

## Repository map

| Path | Ownership | Current responsibility |
| --- | --- | --- |
| `package.json` | Workspace | pnpm orchestration for shared, API, web, and docs packages; database and indexer commands |
| `pnpm-workspace.yaml` | Workspace | Includes `apps/*` and `packages/*` |
| `docker-compose.yml` | Workspace | Local PostgreSQL service |
| `.env.example` | Workspace | API, database, RPC, indexing, and current frontend environment examples |
| `packages/shared` | Shared domain | Dashboard, transfer, metric, and synchronization response types |
| `apps/api` | Backend | Express API, PostgreSQL access, migrations, BSC/Solana indexers, metrics, synchronization operations |
| `apps/api/src/db/migrate.ts` | Backend/database | Legacy schema bootstrap plus versioned migration runner |
| `apps/api/src/db/migrations/001_reliability.sql` | Backend/database | Synchronization runs, indexing failures, Solana sources, and settlement-pair metadata |
| `apps/api/src/indexers` | Backend/blockchain | BSC and Solana indexing, cursor management, repair behavior, deterministic identities |
| `apps/api/src/routes` | Backend/API | Dashboard, synchronization, and health endpoints |
| `apps/api/src/services` | Backend/domain | Dashboard metrics, synchronization orchestration, token registry, and heuristic pairing |
| `apps/web` | Presentation | Public landing page and read-oriented operations console |
| `apps/web/src/Router.tsx` | Presentation/routing | Lightweight route selection for the public page, overview, transactions, and not-found view |
| `apps/web/src/components/console` | Presentation | Console shell, navigation, status banners, and reusable operational UI |
| `apps/docs` | Documentation | Dependency-light static documentation generator and public technical/product content |
| `docs/internal` | Internal docs | Technical, UI, design-system, and runbook documentation |

## Current feature inventory

### Implemented

- Public Oynk landing page focused on programmable cross-border settlement infrastructure.
- Public activity-console entry point and functional documentation destinations.
- Dashboard overview with semantically separated gross transfer and estimated settlement metrics.
- Transaction list with chain, asset, direction, wallet, search, date filtering, pagination, and explorer links.
- BSC indexing for configured token contracts with per-wallet/per-contract cursors.
- Solana indexing for supported mints and discovered/configured token sources.
- Exact-value storage using PostgreSQL numeric fields and decimal helpers in indexing paths.
- Synchronization runs, partial-failure reporting, indexing-failure records, and operational sync status.
- Admin-key protection and basic rate limiting for the manual synchronization trigger.
- Health endpoints, graceful process shutdown, and PostgreSQL advisory synchronization locking.
- Static technical documentation application.

### Partially implemented

- Operations console information architecture: the shell exposes a mature route hierarchy, but only overview and transactions are connected.
- Settlement semantics: transfer records include settlement, payment, corridor, and pairing fields, but there is no authoritative payment/settlement lifecycle model.
- Reconciliation: paired-transfer metrics exist, while pairing remains explicitly heuristic unless internal references are populated.
- Operational security: manual sync is protected, but read-side operational endpoints do not have user/session authorization.
- Environment context: the console can display a network/environment label, but no organization-scoped SANDBOX/TEST/LIVE entitlement exists.
- Readiness: database connectivity is checked, but migrations, configuration completeness, and last-known RPC health are not fully represented.
- Documentation: substantial indexing and architecture content exists; broader business, partner, authentication, and payment-product documentation does not.

### Placeholder or preview

- Console navigation entries for payments, settlements, providers, wallets, analytics, reconciliation, developers, and settings.
- Organization/command-menu affordances without multi-organization or global-search backends.
- Product concepts in documentation that are clearly marked proposed, planned, or not connected.

### Missing

- Personal, business, settlement-partner, and internal-operator identity models.
- Email/password credential storage and password policy.
- Email verification, sign-in OTP, password reset, pre-authentication challenges, and secure sessions.
- Zoho SMTP provider and email templates.
- Organizations, memberships, roles, permissions, and server-side authorization middleware.
- Business and partner applications, resumable KYB forms, review queues, and activation workflows.
- Private object-storage uploads and compliance-document access controls.
- Payments, service payments, refunds, payouts, beneficiaries, balances, settlement ledger, and authoritative reconciliation models.
- Provider opportunity, liquidity, corridor-capacity, and settlement-execution APIs.
- Terminal applications, terminal inventory, locations, assignments, transport routes, and device health.
- API keys, webhook registration/delivery, API logs, and organization-scoped developer tooling.
- Notifications, support cases, and platform-wide audit log.
- Public authentication and signup routes.
- Role-specific business, partner, and internal console routes.
- Automated frontend, API authorization, email, onboarding, accessibility, and end-to-end test coverage.
- Configured lint command and CI quality gates.

### Blocked by external integration or policy decisions

- Zoho delivery requires an application-specific password, verified sender, regional SMTP host choice, and SPF/DKIM/DMARC configuration.
- Document upload requires selection and configuration of a private S3-compatible provider and malware-scanning service.
- Identity verification, sanctions screening, and transaction monitoring require provider selection and legal/compliance requirements by jurisdiction.
- Payment collection and payouts require processors, banking partners, and corridor-specific operational approval.
- POS availability requires hardware/provider selection, certification, device-management integration, and pilot scope.
- Live-mode activation requires documented legal, compliance, risk, treasury, and operational approval—not a frontend feature flag.

## Existing API surface

| Method | Route | Current behavior | Gap |
| --- | --- | --- | --- |
| `GET` | `/health/live` | Process liveness | No authenticated diagnostics by design |
| `GET` | `/health/ready` | Database readiness | Does not fully verify migration and RPC state |
| `GET` | `/api/health` | Legacy health response | Should remain compatible until versioned deprecation |
| `GET` | `/api/dashboard` | Metrics, timeline, bounded transfer list | No organization scope or server cursor pagination |
| `POST` | `/api/dashboard/sync` | Admin-key protected sync trigger | API-key-only MVP control; no operator identity or CSRF/session policy |
| `GET` | `/api/dashboard/sync` | Sync state | No user/session authorization |
| `GET` | `/api/sync/status` | Synchronization status | Operational data is not permission scoped |
| `GET` | `/api/sync/runs` | Recent runs | Fixed result limit; no authorization or cursor pagination |
| `GET` | `/api/sync/runs/:id` | Run detail | No authorization |
| `GET` | `/api/sync/failures` | Unresolved failures | Potentially sensitive operations data; no authorization |

## Missing backend contracts

The following contracts should be defined in `@oynk/shared` before UI implementation. They must use exact decimal strings for monetary values and discriminated unions for states.

- Standard API envelope, request ID, field-error, problem-detail, cursor-page, filter, and sort contracts.
- Authentication contracts: signup, password sign-in, OTP challenge/verification, logout, password reset, invitation, and current session.
- Actor, user, organization, organization membership, environment mode, role, and permission contracts.
- Compliance progress, requirement, application, document metadata, review action, and review decision contracts.
- Business and partner profile contracts.
- Payment, payment event, service-payment detail, refund, payout, beneficiary, settlement, quote, and reconciliation contracts.
- Provider capability, corridor application, liquidity commitment, and settlement-opportunity contracts.
- Merchant location, terminal application, terminal, terminal assignment, and device-health contracts.
- Notification, audit-event, API-key metadata, webhook endpoint, webhook delivery, and API-log contracts.

No shared contract should expose password hashes, OTP hashes, session hashes, SMTP credentials, private storage keys, private identity-document URLs, or provider secrets.

## Missing frontend routes

### Public and authentication

- `/login`
- `/signup`
- `/signup/business`
- `/signup/partner`
- `/verify-otp`
- `/forgot-password`
- `/reset-password`
- `/invitation`
- `/access-denied`
- Public product, business, partner, personal, developer, company, and contact-sales pages or anchored destinations

### Business console

- `/business/home`
- `/business/payments/transactions`
- `/business/payments/links`
- `/business/payments/requests`
- `/business/payments/services`
- `/business/payments/refunds`
- `/business/payouts/new`
- `/business/payouts/bulk`
- `/business/payouts/beneficiaries`
- `/business/payouts/history`
- `/business/cross-border/transfers`
- `/business/cross-border/quotes`
- `/business/cross-border/recipients`
- `/business/cross-border/settlements`
- `/business/pos/terminals`
- `/business/pos/locations`
- `/business/pos/transactions`
- `/business/settlements/history`
- `/business/settlements/reconciliation`
- `/business/developers/*`
- `/business/compliance`
- `/business/team`, `/business/roles`, and `/business/settings`

### Partner console

- `/partner/home`
- `/partner/opportunities/*`
- `/partner/execution/*`
- `/partner/liquidity/*`
- `/partner/corridors/*`
- `/partner/performance/*`
- `/partner/compliance/*`
- `/partner/developers/*`
- `/partner/organization/*`
- `/partner/support/*`

### Internal console

- `/internal/applications/*`
- `/internal/businesses/*`
- `/internal/partners/*`
- `/internal/compliance-reviews/*`
- `/internal/payments/*`
- `/internal/settlements/*`
- `/internal/liquidity-requests/*`
- `/internal/corridors/*`
- `/internal/terminals/*`
- `/internal/risk-alerts/*`
- `/internal/audit-logs`
- `/internal/system-operations/*`
- `/internal/indexing/*`
- `/internal/configuration/*`

The existing `/dashboard` and `/dashboard/transactions` routes should remain compatible during migration and later redirect to the permission-appropriate operations location.

## Database assessment

### Existing schema strengths

- Transfer identity is deterministic and protected by a unique constraint.
- Amounts use exact PostgreSQL numeric storage.
- Synchronization state, runs, failures, and source configuration are separated.
- Reliability additions are present as an explicit migration.

### Existing schema risks

- Initial tables are still bootstrapped in application code with `CREATE TABLE IF NOT EXISTS`; new platform work must use ordered migrations and should later baseline the legacy schema without rewriting migration history.
- The migration command also seeds tracked blockchain wallets. Seed policy should be separated from schema evolution before multi-environment deployment.
- Blockchain operations data and future highly sensitive compliance data currently share one database boundary. At minimum they require separate schemas, database roles, retention policies, and backups; separate databases may be warranted.
- There is no tenant/organization identifier on existing transfer data. A deliberate ownership model is required before exposing it to external organizations.
- Existing operational queries are not permission scoped.

## Security findings

### Critical before account launch

- No authentication, secure session, password hashing, OTP, account-status gate, or organization authorization exists.
- No tenant boundary exists for future customer data.
- No secure compliance-document storage or authorization model exists.
- No server-enforced business, partner, or internal permissions exist.

### High priority

- Synchronization status, run, and failure endpoints disclose operational state without authenticated permissions.
- The admin API key is appropriate only as a temporary machine/admin control; it is not an operator identity, cannot provide per-user auditability, and should not be the long-term console authorization mechanism.
- There is no CSRF strategy, trusted-origin enforcement for authenticated mutations, session revocation, or security-event audit trail.
- CORS configuration must be explicitly separated for `oynk.io`, `console.oynk.io`, and trusted development origins before cookie authentication.
- There is no central request ID or normalized error contract.

### Medium priority

- Rate limiting is process-local and route-specific; distributed deployments require a shared limiter or gateway control.
- Readiness does not prove migration currency or current/last-known RPC health.
- No content-security policy tailored to the deployed web application is documented.
- No secret-rotation or SMTP delivery-failure procedure exists.

## Data-integrity and financial risks

- Indexed on-chain transfers are observations, not an authoritative payment ledger.
- Heuristic pairs must never become confirmed settlements without an Oynk settlement reference and validated state transition.
- Gross on-chain movement can include both legs of one economic settlement; it must stay separate from settled payment volume.
- BTCB uses a fixed operational estimate of USD 25,000 per BTCB, not historical market pricing.
- New payments, payouts, balances, fees, and exchange rates must use decimal strings and database numeric types; JavaScript floating point is prohibited.
- Idempotency keys and append-only state events are required before accepting payment or payout mutations.
- Organization scoping must be included in every unique identity and query where tenant ownership applies.

## Frontend assessment

### Strengths

- The public page and console have a coherent Oynk visual language.
- The current console presents accurate metric labels, operational status, accessible table semantics, mobile navigation, and explicit planned states.
- API refresh behavior does not replace populated tables with blocking spinners.

### Gaps

- Routing is a lightweight pathname switch and is not yet sufficient for nested, guarded, role-aware application flows.
- There is no current-session provider, organization context, permission boundary, or authenticated data client.
- No form architecture exists for long resumable onboarding flows.
- There is no frontend test runner or end-to-end test harness.
- Public content remains concentrated on settlement infrastructure and does not yet represent the broader, carefully labeled product portfolio.
- No configurable consumer product name is wired through build configuration.
- No real payment, payout, terminal, provider, or compliance data source exists.

## Deployment and operational risks

- Canonical domains are not yet represented as a tested four-surface deployment topology.
- Secure host-only API cookies, credentialed CORS, origin checks, and reverse-proxy trust must be tested together.
- Schema migration and application deployment ordering is not documented for zero-downtime identity changes.
- No email deliverability configuration or monitoring exists.
- No object-storage lifecycle, malware scanning, backup, restore, or retention implementation exists.
- No CI workflow enforces lint, typecheck, tests, migrations, and builds.
- No lint command is currently configured at the workspace root.

## Audit conclusion

The current indexing and dashboard behavior should be treated as a protected subsystem and integrated into a future internal operations console. The next approved phase should establish only the identity, organization, membership, permission, session, OTP-record, and audit-log foundations through explicit migrations and shared contracts. Public claims about payments, POS, consumer services, corridors, and partner availability must remain labeled as planned, pilot, sandbox, or request-access until their respective backends and operational approvals exist.
