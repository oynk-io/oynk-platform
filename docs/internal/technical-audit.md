# Oynk technical audit

Audit date: 2026-08-06

This report distinguishes verified implementation from proposed architecture. An item is marked resolved only when the repository contains the corresponding implementation.

## Executive assessment

The repository is a compact pnpm monorepo with clear shared, API, and web package boundaries. Its strongest existing properties are exact decimal helpers, deterministic BSC log identity, per-source cursor storage, idempotent transfer upserts, and a focused operational dashboard. The original synchronization implementation was appropriate for a prototype but lacked the state, locking, finality, and failure reporting required for unattended production operation.

This change set resolves several critical controls: manual synchronization now requires an administrator key and is rate limited; processes coordinate through a PostgreSQL advisory lock; synchronization runs and individual indexing failures are durable; BSC uses contract-address cursor identity, confirmation depth, rewind, adaptive ranges, and round-robin pair scheduling; dashboard volume semantics separate gross movement from reference-paired estimated settlement; and health and run-inspection endpoints exist.

The system is **not yet production-ready**. Solana historical pagination remains memory-bound, failure retries are recorded but not yet scheduled, migration readiness is not independently verified, heuristic pairing remains legacy data, and comprehensive automated integration coverage is absent.

## Critical issues

### Resolved in this change

- **Unauthenticated manual synchronization.** `POST /api/dashboard/sync` previously allowed any caller to trigger expensive RPC and database work. It now requires `x-admin-api-key`, uses constant-time comparison, rate limits requests, and returns a run ID.
- **Cross-process overlap.** The previous in-memory flag protected only one Node process. Synchronization now acquires a session-level PostgreSQL advisory lock before starting.
- **Silent BSC partial failure.** Pair failures no longer produce an unqualified success result. BSC returns attempted, completed, failed, stored, timestamp, and failure details; the parent run becomes `PARTIAL` or `FAILED`.
- **Newest transaction time mislabeled as synchronization time.** Dashboard synchronization time now comes from completed or partial `sync_runs`, while latest transaction time remains separate.
- **Gross movement represented as settled volume.** Gross, inflow, outflow, unmatched, and reference-paired estimated settlement metrics are separate.

### Open

- **Solana cursor safety is incomplete.** The indexer has source-specific keys and records temporarily unavailable transactions, but it still loads the discovered signature history into memory and does not persist separate historical `before` and completion checkpoints. A process crash can repeat substantial work.
- **Failure queue lacks a worker.** `indexer_failures` prevents silent loss, but unresolved entries require an explicit retry processor before production use.
- **Cursor and page writes are not fully atomic.** BSC persists individual transfers before advancing a range cursor, which is replay-safe but not a single transaction. Solana has the same replay-based safety model. Atomic range/page commits remain required for stronger guarantees.

## High-priority issues

- **BSC preferred chunk is process-local.** Adaptive reduction and slow additive growth are implemented, but preferred range size is not persisted per pair. Restarts relearn provider limits.
- **BSC rewind is applied whenever a pair is resumed.** Idempotency makes this safe, but repeated single-range scheduling causes avoidable overlap during long backfills. Rewind should be applied once per incremental run, not between every historical slice.
- **Solana account discovery is incomplete.** Associated/current account discovery and `SOLANA_ADDITIONAL_SOURCE_ACCOUNTS` configuration are defined, but full source-table integration and Token-2022 discovery are not complete.
- **Solana transfer identity needs chain fixtures.** Identity no longer depends on a filtered array position, but real transactions containing repeated mint/owner/direction changes need fixtures proving collision resistance.
- **Readiness is shallow.** `/health/ready` verifies configuration and a database query. It does not yet verify migration version or recent RPC health.
- **Operational endpoints expose metadata.** Sync runs and failures should be protected by an operator read credential before deployment if transaction identifiers or provider details are considered sensitive.
- **No separate worker.** API startup, timer, and manual triggers share the web process. The advisory lock prevents overlap, but long backfills still consume API-process resources.

## Medium-priority issues

- The sync scheduler is `setInterval` based and has no persistent schedule, lease renewal, or missed-run accounting.
- RPC retry/reduction counts are logged but not exported to a metrics backend.
- `latestIndexedBlock` is a database maximum, not per-chain safe-tip progress; `chainLag` remains nullable until live tip sampling is integrated.
- Transfer queries return a bounded recent set and filter in the client; server-side cursor pagination is needed for large datasets.
- Existing heuristic pairs should be migrated to explicit `pairing_method = HEURISTIC` and never counted as authoritative settlement.
- Explorer URLs are stored at ingestion time. Configuration changes do not update historical rows.
- The simple in-memory rate limiter is process-local. A shared limiter is needed for multi-instance deployments.

## Low-priority improvements

- Add structured JSON logging with correlation and sync-run IDs.
- Add OpenTelemetry traces around RPC calls, database batches, and synchronization runs.
- Add retention policies for resolved failures and old run metadata.
- Add an operator UI for failure acknowledgement and retry after authorization is in place.

## Security findings

- Resolved: administrator authentication and throttling on manual sync.
- Resolved: configuration logging redacts RPC URL credentials.
- Open: admin key rotation and separate read/write operator roles are not implemented.
- Open: Express lacks a general security-header policy and deployment-level request size/timeout documentation must be enforced.
- Open: audit events for administrative actions are not durable beyond `sync_runs`.
- Open: database, RPC, reverse-proxy, and secret-manager controls remain deployment responsibilities.

## Data integrity findings

- BSC identity uses chain, transaction hash, log index, tracked wallet, and direction and is stable across replay.
- BSC cursor identity uses normalized wallet plus normalized contract, not a mutable token symbol.
- Confirmation depth and configurable rewind reduce reorganization risk.
- Solana unavailable parsed transactions are durable failures instead of silent skips.
- Reference-paired settlements use the conservative smaller leg for estimated volume.
- Open: full page/range atomicity and a scheduled failure reprocessor.
- Open: explicit settlement/payment/corridor references need to be populated by the payment control plane; indexed chain data alone cannot infer authoritative business settlement identity.

## Scalability and RPC-provider risks

- Public/shared RPCs commonly cap log ranges, signature history, response size, and archival access.
- BSC range reduction handles provider rejection and grows only after several successful ranges. Per-pair persistence and provider metrics remain open.
- Solana archival gaps, pruned transactions, closed historical token accounts, and rate limits cannot be solved solely in application code. Production should use an archival provider with documented retention and a secondary provider.
- Current single-process loops provide bounded concurrency but not horizontal worker scaling.
- Dashboard aggregation scans should be monitored and may eventually require materialized daily aggregates.

## Database risks

- Explicit migration tracking now exists, but the original bootstrap still uses `CREATE TABLE IF NOT EXISTS`; new deployments should run `pnpm db:migrate` before API startup.
- PostgreSQL advisory locks are session scoped. The implementation holds a dedicated client and releases it in `finally`; abrupt connection loss releases the lock automatically.
- No documented backup restore drill, point-in-time recovery target, or partitioning strategy exists.
- Large transfer tables need query-plan monitoring for ordering, chain filters, pair joins, and date windows.

## API risks

- Sync status and run endpoints are operational snapshots, not a stable public contract with pagination.
- Error responses are not yet unified under one documented envelope.
- No request correlation ID or distributed tracing is present.
- CORS is globally enabled and should be narrowed at deployment based on approved origins.

## Frontend risks

- The dashboard clearly separates gross and estimated settlement and discloses fixed BTCB valuation.
- Loading, empty, failure, chain, asset, direction, and search states exist, but server pagination, wallet/date filters, chain lag, and administrator-only failure warnings remain incomplete.
- Client filtering applies only to the returned recent-transfer window and must not be described as a complete ledger search.

## Deployment risks

- The API and indexer are not separated into independently scalable processes.
- Readiness does not yet include migration or recent RPC-health assertions.
- The repository has no production observability stack, backup automation, or recovery rehearsal.
- Direct-route SPA fallback depends on the hosting platform configuration.
- Documentation deployment needs its provider-assigned hostname before the `docs` CNAME can be finalized.

## Recommended implementation phases

1. Finish Solana bounded pagination, explicit historical checkpoints, source-table discovery, Token-2022 support, and retry worker.
2. Make database page/range commits atomic and persist BSC range preferences and counters.
3. Add integration fixtures for both chains and PostgreSQL-backed API/indexer tests.
4. Split indexing into a worker with leases, structured telemetry, alerts, and operator authorization.
5. Add server-side transfer pagination/filtering and live per-chain lag sampling.
6. Complete deployment hardening, backup/restore drills, RPC failover, and incident runbooks.

