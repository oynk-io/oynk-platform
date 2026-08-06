# AGENTS.md

# Oynk Dashboard Monorepo Instructions

These instructions apply to every task in this repository.

Read this file before inspecting or modifying any code.

---

# Repository

This repository is a pnpm workspace.

Primary packages include:

* `@oynk/shared`
* `@oynk/api`
* `@oynk/web`

Shared domain models belong in `@oynk/shared`.

Business logic belongs in `@oynk/api`.

Presentation logic belongs in `@oynk/web`.

Respect package boundaries.

---

# Package manager

Use **pnpm only**.

Never use:

* npm
* yarn
* bun

Do not regenerate:

* pnpm-lock.yaml

Do not change dependency versions unless explicitly requested.

Do not install packages unless required by the task.

---

# Before touching code

Always begin by understanding the existing implementation.

Inspect:

* AGENTS.md
* package.json
* pnpm-workspace.yaml
* tsconfig files
* affected package manifests
* existing implementation
* related types
* related tests
* related services
* related routes
* related components

Do not immediately edit code.

First determine:

* how it currently works
* where ownership belongs
* root cause
* existing patterns
* possible side effects

---

# Working philosophy

Prefer:

* small diffs
* minimal changes
* existing abstractions
* consistency

Avoid:

* rewriting working code
* broad refactors
* stylistic cleanup
* unnecessary renaming
* changing unrelated files

Never "improve" code outside the requested scope.

---

# Root cause

Always fix the root cause.

Do not patch symptoms.

Before implementing a solution explain internally:

* what caused the issue
* why it happens
* why the chosen solution is correct

---

# Package boundaries

Shared code belongs in:

`@oynk/shared`

Examples:

* enums
* interfaces
* shared schemas
* validation
* utility types
* constants

Do not duplicate types between packages.

Never import:

web → api

api → web

Only depend on shared.

---

# TypeScript

Maintain strict typing.

Never introduce:

* any
* @ts-ignore
* @ts-nocheck

unless explicitly approved.

Prefer:

* narrowing
* discriminated unions
* reusable types
* proper inference

Do not weaken types to silence errors.

---

# React

Reuse existing:

* layouts
* components
* hooks
* providers
* contexts

Avoid:

* duplicated state
* duplicated API calls
* duplicated UI logic

Business logic should not live inside components.

---

# Backend

Follow existing patterns.

Validate all external input.

Never trust:

* wallet addresses
* payment identifiers
* settlement identifiers
* chain identifiers
* currencies
* amounts
* user roles

Authorization belongs on the server.

Never rely solely on frontend checks.

---

# Payments

Treat every amount as exact.

Never use floating point arithmetic.

Respect existing decimal helpers.

Never modify settlement logic unless required.

Preserve:

* idempotency
* state transitions
* replay safety

Never mark payments successful without confirmation.

---

# Blockchain

Preserve:

* checkpoint logic
* replay handling
* synchronization behavior
* retry logic

Never mix:

* testnet
* mainnet

Never hardcode:

* RPC URLs
* issuers
* contract IDs
* explorers

Use configuration.

---

# Database

Inspect schema before modifying queries.

Never edit historical migrations.

Create new migrations instead.

Avoid destructive schema changes.

Preserve existing data.

---

# Environment

Never commit:

* secrets
* credentials
* API keys

Never hardcode environment values.

Update `.env.example` whenever introducing required configuration.

---

# Logging

Never log:

* secrets
* API keys
* tokens
* signed payloads
* private keys

Avoid noisy logs.

Remove temporary debugging before finishing.

---

# Dead code

Do **not** delete code merely because it appears unused.

Before deleting anything verify:

* no imports
* no dynamic imports
* no lazy loading
* no route registration
* no package exports
* no barrel exports
* no CLI usage
* no build references
* no Docker references
* no deployment references
* no configuration references
* no environment references
* no test references
* no documentation references

Search using repository-wide search.

When uncertain:

Do **not** delete.

Report it instead.

Prefer removing:

* unused imports
* unused locals
* unreachable branches

before deleting entire files.

Never batch-delete large numbers of files.

---

# Refactoring

Only refactor when:

* required
* explicitly requested
* necessary to solve the problem

Do not combine:

bug fixes

architecture changes

cleanup

styling

into one PR-sized change.

---

# Validation

After every logical change run the repository validation commands.

Minimum:

```bash
pnpm typecheck
```

If build output is affected:

```bash
pnpm build
```

If tests exist:

Run the relevant tests.

Do not claim validation passed unless it actually passed.

---

# Audit mode

When asked to audit:

Never modify code.

Never format.

Never delete.

Never rename.

Never create files.

Only inspect.

Produce findings with:

* severity
* evidence
* affected files
* explanation
* recommendation

Avoid speculation.

---

# Cleanup mode

When asked to clean up:

Only remove code proven to be dead.

Use repository search to prove safety.

Limit changes to one logical category.

Validate after each category.

Stop if validation fails.

---

# Large tasks

Break work into phases.

Recommended order:

1. Audit
2. Review findings
3. Approval
4. Small implementation
5. Validation
6. Next task

Never perform a massive repository-wide rewrite.

---

# Security

Favor conservative changes.

Never weaken:

* authentication
* authorization
* validation
* payment checks
* settlement rules
* replay protection

Security takes priority over convenience.

---

# Completion checklist

Before finishing:

* reviewed diff
* no unrelated edits
* no debug code
* no commented-out code added
* no secrets
* package boundaries respected
* validation completed
* no dependency changes
* no lockfile changes

Report:

* root cause
* files changed
* validation performed
* remaining risks

---

# General principle

When in doubt:

Prefer preserving working production code over making speculative improvements.

Small, well-validated changes are always preferred over large refactors.
