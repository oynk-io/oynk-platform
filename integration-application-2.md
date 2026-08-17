# Oynk — SCF Build Award Integration Track Application

> Final structured narrative draft. Replace the clearly marked submission placeholders and verify all public evidence before submitting.

## Submission Information

### Project

Oynk Technologies

### Round

SCF #45 Build Award

### Build Award Track

Integration Track

### Submission Title

Oynk — A Permissioned Liquidity and Settlement Network for High-Volume Commercial Payments

### Project Type

End-User Application / Payments Infrastructure

### Project URL

https://www.oynk.io

### Technical Architecture Document

https://docs.oynk.io/full-technical-architecture

### GitHub URL

https://github.com/oynk-io/oynk-platform

### Video URL

[ADD PUBLIC YOUTUBE OR VIMEO URL — UNDER THREE MINUTES]

## Elevator Pitch

Stellar can settle value globally in seconds at very low cost, but many businesses in fast-growing, import-dependent markets never experience that efficiency. Their payments still pass through fragmented layers of banks, FX counterparties, on-ramps, liquidity providers, payment agents, and local payout partners. Each participant adds time, spread, fees, and another point of reconciliation.

This is especially painful for importers and wholesalers moving hundreds of thousands of dollars repeatedly. At $500,000 per week, a 1% all-in payment and conversion cost consumes approximately $260,000 per year. For these businesses, basis points materially affect margins.

Oynk is building the missing coordination layer at the fiat–stablecoin boundary: a permissioned network where verified liquidity and settlement providers publish capacity, compete through quotes, commit to time-bounded rates, and settle through Stellar USDC and Soroban. Oynk standardizes participant eligibility, payment instructions, rate locks, settlement state, monitoring, reconciliation, and exceptions while regulated financial institutions and eligible local providers perform the fiat legs.

The SCF-funded work will combine Anchor Platform, Privy, Stellar Wallets Kit, and Blend v2 with Oynk's existing Soroban settlement MVP. The result will be a usable end-to-end commercial payment flow that exposes Stellar's settlement efficiency to businesses instead of losing it beneath a stack of intermediaries.

# Problem, Insight, and Solution

## The problem

Cross-border commercial payments are not inefficient simply because the underlying ledger is slow. They are inefficient because liquidity and execution are fragmented.

A business paying an overseas supplier may need separate relationships for:

- Fiat collection and banking access.
- Foreign-exchange pricing.
- Stablecoin acquisition.
- Cross-border settlement.
- Destination liquidity.
- Local bank payout.
- Transaction monitoring and compliance.
- Reconciliation when one leg succeeds and another is delayed.

A conventional fintech can hide this fragmentation behind one interface, but it does not remove it. If every payment is routed sequentially through several providers, every provider still charges a fee or spread. The customer receives a convenient interface while the underlying economics remain expensive.

That model is particularly weak for high-volume importers, wholesalers, and commercial payment businesses. A fee that appears tolerable on a small consumer remittance becomes economically significant when a business moves $100,000–$500,000 repeatedly.

The underlying commercial activity already exists. Nigerian wholesale clusters such as Computer Village, Alaba International Market, Ladipo, and ASPMDA serve businesses that depend heavily on imported electronics, machinery, and automotive parts. More broadly, China–Africa merchandise trade reached approximately $348 billion in 2025, including approximately $225 billion of Chinese exports to Africa. World Bank research found that China supplied approximately 35% of Africa's imported digital goods, with Nigeria among five countries collectively responsible for approximately 70% of the continent's digital-goods imports.

These trade figures are not presented as Oynk's addressable payment volume. They demonstrate the scale of the underlying goods flows. The associated business-payment layer remains poorly observable because settlement is distributed across banking, FX, OTC, agent, supplier-credit, and bilateral relationships.

## The key insight

The opportunity is not to invent commercial liquidity. Liquidity already exists across banks, payment companies, VASPs, OTC providers, professional liquidity businesses, corporate treasuries, and other market participants.

The opportunity is to turn those fragmented relationships into structured, competitive, observable infrastructure.

Today, a payment may be coordinated through phone calls, messaging applications, screenshots, manual rate agreements, and bilateral trust. Oynk transforms that workflow into:

```text
verified provider
    → declared corridor and capacity
    → eligible payment request
    → competitive quote
    → time-bounded rate lock
    → referenced fiat and USDC legs
    → Soroban settlement
    → reconciliation and transaction history
```

This approach is not designed to avoid regulated providers. It is designed to minimize unnecessary intermediation while making every required participant a first-class, accountable member of the network.

## How Oynk solves it

Oynk connects payment demand with a permissioned network of liquidity and settlement providers.

Businesses or payment applications submit a payment request containing the source market, destination market, fiat amounts, settlement asset, payment purpose, timing, and required execution conditions. Only providers eligible for that corridor and transaction may participate. Eligible providers publish capacity and submit quotes. Oynk validates the quote, enforces limits, and creates an immutable rate lock when the business accepts.

Oynk then coordinates the payment through four layers:

1. **Access and interoperability:** Anchor Platform exposes standardized Stellar authentication, customer, payment, and quote interfaces.
2. **Liquidity and policy:** Oynk determines which providers may participate, manages capacity and competing quotes, applies transaction controls, and assigns the payment legs.
3. **Settlement:** Stellar USDC provides the common digital settlement asset, while Soroban coordinates provider commitments, exact escrow accounting, deadlines, claims, refunds, and disputes.
4. **Fiat execution and reconciliation:** Regulated financial institutions and eligible settlement providers execute the approved fiat collection or payout legs. Oynk links their evidence and status to the authoritative payment record without treating a blockchain transfer alone as proof of fiat completion.

The result is not merely another cross-border payment interface. It is a reusable liquidity and settlement network in which more eligible providers can create tighter spreads, greater capacity, and better route resilience.

## Why Stellar

Stellar is not being added as a cosmetic payment rail. It is the common settlement layer that makes the network economically and technically coherent.

Oynk needs:

- Fast, low-cost settlement for repeated commercial payments.
- A widely recognized settlement asset such as USDC.
- Programmable authorization and settlement state through Soroban.
- Standardized anchor interfaces for customer, quote, and cross-border payment workflows.
- Wallet infrastructure for both mainstream businesses and existing Stellar participants.
- Composable liquidity infrastructure such as Blend for carefully bounded capital-efficiency features.

Without Stellar, each provider relationship risks becoming another bespoke ledger and reconciliation process. With Stellar, independent providers can coordinate around a common asset, transaction record, and programmable settlement layer.

## Why the Integration Track

Oynk is not requesting SCF funding to rebuild wallet infrastructure, an anchor protocol, or a lending market. It is integrating existing Stellar building blocks into a product with demonstrated payment experience, live product foundations, and an existing Soroban mainnet MVP.

The selected integrations are:

- **Anchor Platform:** standardized entry into Oynk's on/off-ramp and cross-border workflows.
- **Privy:** embedded Stellar wallet onboarding for businesses that need an integrated experience.
- **Stellar Wallets Kit:** external-wallet access for existing Stellar users and liquidity providers.
- **Blend v2:** optional yield on eligible excess business deposits that are not required to honor a rate lock.

Oynk's liquidity engine, policy controls, business ledger, Soroban contract, event indexer, and reconciliation service are the connective product layer that makes these integrations useful together.

Bridge and Circle CCTP are not included in the funded scope of this application.

# Products & Services

## 1. Permissioned Liquidity Network

Oynk provides a structured marketplace for commercial payment demand and eligible liquidity.

Each provider has a verified identity, provider classification, supported corridors, assets, fiat capabilities, transaction limits, available capacity, compliance status, and suspension state. Eligibility is evaluated for the specific payment—not inferred merely from a provider having completed KYC.

Providers may eventually include regulated banks, payment companies, VASPs, OTC providers, professional liquidity businesses, corporate treasury participants, and other entities where their activity is permitted. Oynk will not assume that identity verification substitutes for any authorization a provider's activity requires.

**Use of Stellar:** Accepted quotes produce referenced Stellar USDC settlement obligations. Provider commitments and settlement outcomes are enforced and observed through Soroban.

**Impact:** Competitive provider participation can reduce spreads and concentration risk while converting informal bilateral coordination into transparent, programmable infrastructure.

## 2. Anchor Platform Integration

Oynk intends to build into an on/off-ramp anchor. The grant will fund Anchor Platform deployment and the Oynk business server that connects Stellar's standardized interfaces to Oynk's internal systems.

The initial scope includes:

- SEP-12 for business/customer information requirements and compliance status.
- SEP-31 for cross-border payment workflows.
- SEP-38 for indicative rates and firm, expiring quotes.
- SEP-10 and SEP-45 for supported Stellar account authentication.
- Authenticated transaction-status updates for off-chain collection, payout, refund, and exception events.

Anchor Platform will not make compliance or fiat-execution decisions for Oynk. Oynk's business server will provide customer status, quote logic, transaction decisions, and off-chain updates. Detailed identity information will remain off-chain.

**Use of Stellar:** Anchor Platform makes Oynk discoverable and interoperable through recognized Stellar Ecosystem Proposals.

**Impact:** Wallets and payment applications can reach Oynk's liquidity network through standardized interfaces rather than bespoke integrations.

## 3. Soroban Settlement Coordination

Oynk will harden its existing mainnet settlement MVP into an open-source, production-oriented contract and application integration.

The contract will manage:

- Unique settlement references.
- Exact asset and amount commitments.
- Provider assignments and authorization.
- Per-request escrow accounting.
- Funding and claim deadlines.
- Claim, cancellation, refund, and dispute transitions.
- Mutually exclusive terminal outcomes.
- Versioned events for deterministic indexing and reconciliation.
- Governed upgrade and emergency-pause controls.

**Use of Stellar:** Soroban provides the shared programmable state for the USDC settlement leg.

**Impact:** Independent participants can rely on a consistent settlement workflow while Oynk retains off-chain authority for identity, provider eligibility, fiat evidence, compliance decisions, and exception handling.

## 4. Business Wallet Access

Privy will provide embedded Stellar wallet onboarding for businesses that want wallet access inside Oynk. Stellar Wallets Kit will support compatible external wallets for businesses and providers that already manage Stellar accounts.

Oynk will document the custody and authorization model of each path. The application will verify the active network, account, contract, asset, amount, and intended operation before requesting a signature.

**Use of Stellar:** Businesses and providers authorize funding, settlement participation, claims, refunds, and supported balance operations through Stellar accounts.

**Impact:** Oynk can onboard mainstream businesses without excluding experienced Stellar participants or forcing every user into an application-controlled wallet.

## 5. Rate Locks and Business Deposits

High-volume businesses often need predictable exchange rates before completing payment. Oynk allows an eligible provider to commit a firm quote for a defined period. A business may be required to prefund a percentage of the transaction as a rate-lock deposit.

Oynk records:

- Exact source and destination amounts.
- Settlement asset and amount.
- Provider commitment.
- Quote and funding expiry.
- Required deposit.
- Fees and permitted slippage.
- Cancellation and refund behavior.
- Provider and business obligations.

Accepted commercial terms become immutable for that payment. Expired or underfunded quotes cannot settle silently at a stale rate.

**Use of Stellar:** The deposit and resulting settlement obligation are denominated and reconciled through official Stellar USDC and the Soroban settlement reference.

**Impact:** Businesses gain price certainty while providers gain explicit, enforceable commitment conditions.

## 6. Optional Blend v2 Yield

Businesses may deposit more than the reserve required to support an active rate lock. Oynk will allow an eligible business to affirmatively opt into deploying a bounded percentage of only that excess balance into an approved Blend v2 USDC lending pool.

Each deposit is divided into:

- **Reserved:** immediately available funds required to satisfy the maximum active rate-lock obligation.
- **Liquid excess:** funds not required for the rate lock and not deployed.
- **Yield pending/deployed:** opted-in excess funds moving into or supplied to Blend.

The core invariant is:

> A Blend allocation must never reduce immediately available funds below the maximum obligation created by the business's active rate locks.

The funded MVP will not borrow, use leverage, enter Blend's backstop module, promise yield, guarantee principal, or deploy customer funds required for settlement. Oynk will maintain exact per-business principal, yield, loss, fee, and withdrawal accounting.

**Use of Stellar:** Blend v2 provides the on-chain lending market for eligible excess USDC balances.

**Impact:** Businesses can choose to improve the capital efficiency of excess prefunding without weakening the payment guarantee.

## 7. Compliance and Transaction Controls

Compliance is a product workstream, not a sentence stating that users are KYC-verified.

Oynk will implement adapter-driven and policy-versioned controls for:

- Business KYB, individual KYC where applicable, and beneficial-owner requirements.
- Sanctions and PEP results.
- Wallet and transaction risk signals.
- Provider type and jurisdiction-specific eligibility.
- Corridor, currency, asset, and transaction permissions.
- Per-transaction and rolling exposure limits.
- Source of funds and payment purpose.
- Manual review, transaction holds, alerts, and provider suspension.
- Auditable decisions and reconciliation exports.

Production activation of a fiat/stablecoin corridor will remain subject to the applicable approvals and/or regulated-partner arrangements. Oynk will not claim that KYC eliminates licensing requirements.

**Use of Stellar:** Policy gates control who may quote, fund, settle, claim, receive refunds, or allocate excess funds to Blend. No names, bank details, identity documents, screening results, or raw payout evidence will be placed on-chain.

**Impact:** Existing fragmented liquidity can participate through a controlled, reviewable network rather than opaque bilateral arrangements.

# Traction Evidence

## Payment experience

Oynk has facilitated more than **$1,600,000 in cross-border payments** across Africa, China, and the United States.

Evidence: https://traction.oynk.io

This evidence validates the problem and the team's operating experience with liquidity fragmentation, FX pricing, payout coordination, delays, and reconciliation. Before submission, Oynk will ensure that the traction page states the measurement period and consistently distinguishes Oynk-facilitated activity, founder-led historical activity, indexed blockchain movement, off-chain records, Soroban settlement principal, customer funds, and revenue.

## Soroban mainnet MVP

Oynk deployed a settlement-contract MVP on Stellar mainnet:

- Contract: https://stellar.expert/explorer/public/contract/CDTDCQ2Y6OASQVJGOFBA2EHP3AV7N6FFULJNEFGMORLYMNHECX7OO2W6
- Deployment transaction: `58eb6b55c774aeff2a54b90358fe459bf60f0089113b45caa6f697ef100d2fa0`
- Deployment date: July 11, 2026.
- Completed settlement principal: 4,360 USDC across three request lifecycles—500, 1,500, and 2,360 USDC.

The activity demonstrates execution of the MVP state machine with real Stellar USDC. Settlement principal counts each request once and does not double-count the later release of escrow. It does not claim an audit, broad adoption, or independent proof of fiat payout finality.

[ADD PUBLIC CONTRACT SOURCE, IMMUTABLE COMMIT, COMPLETE WASM HASH, DEPLOYMENT LEDGER, ADMIN/MANAGER ADDRESSES, AND UPGRADE POLICY.]

## Existing platform

Oynk's existing platform includes:

- A live public website and transaction-activity dashboard.
- PostgreSQL-backed settlement and transfer records.
- BNB Smart Chain and Solana transaction indexing.
- Replay-aware synchronization and failure tracking.
- Operations tooling and transaction APIs.
- Email verification, OTP sign-in, sessions, CSRF, organizations, roles, permissions, and audit records.
- A validated business compliance-profile foundation.
- Public product and technical documentation.

Links:

- Website: https://www.oynk.io
- Traction: https://traction.oynk.io
- Documentation: https://docs.oynk.io
- GitHub: https://github.com/oynk-io

## Customer and partner validation

[ADD REDACTED IMPORTER INTERVIEWS, CUSTOMER EXPRESSIONS OF INTEREST, PILOT COMMITMENTS, PROVIDER LETTERS, OR LOIs. INCLUDE TYPICAL PAYMENT SIZE, FREQUENCY, CURRENT COST, SETTLEMENT TIME, AND WILLINGNESS TO PILOT. DO NOT CLAIM A PARTNERSHIP WITHOUT WRITTEN AUTHORIZATION.]

# Team

## Team Members

Each member will create an SCF account before being added to the submission.

### Precious Ayorinde — Co-Founder, Business Development & Strategy

Precious leads business development, partnerships, commercial validation, and market strategy. Precious brings experience across digital transformation, project management, energy, sustainable mobility, business operations, government engagement, and multinational partnerships.

LinkedIn: https://www.linkedin.com/in/precious-ayorinde-847085177

### Emmanuel Ekoja — Software Engineer, Blockchain & Backend

Emmanuel leads blockchain and backend implementation, including settlement systems, Soroban integrations, APIs, event processing, and payment infrastructure.

LinkedIn: https://www.linkedin.com/in/emmanuel-ekoja-4b924826/  
GitHub: [ADD PROFILE]

### Basit Yusuf — Full-Stack Software Engineer

Basit builds Oynk's web applications, backend services, APIs, dashboards, and business/provider workflows.

LinkedIn: https://www.linkedin.com/in/jideotetic/  
GitHub: [ADD PROFILE]

### Ogunlana Olushola — Fintech & Financial Infrastructure Consultant

Olushola advises Oynk on fintech architecture, regulated-partner integrations, payment infrastructure, product delivery, and scaling financial services across African markets.

LinkedIn: https://www.linkedin.com/in/ogunlana-olushola-134aa942/

[VERIFY AND ADD OLUSHOLA'S CURRENT AUTHORIZED TITLE, AFFILIATION, GRANT RESPONSIBILITIES, AND WEEKLY AVAILABILITY.]

## Team Description

Oynk is a four-person team combining direct cross-border payment experience, business development, fintech strategy, blockchain/backend engineering, and full-stack product delivery. The team has already shipped Oynk's application foundation, multi-chain transaction visibility, identity and organization controls, and a Soroban mainnet settlement MVP using real USDC.

[ADD EACH MEMBER'S WEEKLY GRANT COMMITMENT AND ASSIGN OWNERS FOR ANCHOR PLATFORM, SOROBAN, BLEND, WALLETS, COMPLIANCE ENGINEERING, QA, AND MAINNET OPERATIONS.]

## Mailing List

Primary: Precious Ayorinde  
Technical: Emmanuel Ekoja

[SELECT AT LEAST ONE REGISTERED TEAM MEMBER IN THE FORM.]

## Ambassador Affiliation

[ENTER VERIFIED AFFILIATION OR “NONE.”]

## Resubmission Feedback

Not applicable — first-time submission.

## Thumbnail

[ATTACH A 1920×1080, 16:9 THUMBNAIL.]

Suggested copy:

> **Oynk**  
> Permissioned liquidity and settlement for high-volume commercial payments  
> Anchor Platform · Stellar USDC · Soroban · Blend v2

# Integration Track Deliverables and Budget

## Track Confirmation

Oynk confirms that it understands the Integration Track requirements:

- The funded integrations must come from the official Integration List for the selected round.
- Most funding must directly support those integrations and the product work required to use them.
- Deliverables must be specific, measurable, testable, and reviewer-accessible.
- The final milestone must launch on mainnet or an approved equivalent.
- SCF funds will not be used for marketing, promotion, user incentives, liquidity capital, legal or licensing fees, prior work, entity registration, or external audit fees.
- Contract source will be open-sourced, and audit support will be pursued separately through the Audit Bank where eligible.

Before submission, Oynk will reconfirm that Anchor Platform, Blend v2, Privy, and Stellar Wallets Kit remain eligible building blocks for the selected round.

## Budget Request

**$135,000 worth of XLM**

The budget supports approximately five months of focused development by the four-person team. The request is below the $150,000 maximum and reflects the scope of four integrations plus the Oynk product components necessary to connect them safely.

| Payment | Percentage | Amount |
|---|---:|---:|
| Tranche #0 — award acceptance | 10% | $13,500 |
| Tranche #1 — integration MVP | 20% | $27,000 |
| Tranche #2 — complete testnet system | 30% | $40,500 |
| Tranche #3 — controlled mainnet launch | 40% | $54,000 |
| **Total** | **100%** | **$135,000** |

Tranche #0 supports engineering mobilization, integration environments, provider onboarding, and the first portion of approved development work. It has no separate completion milestone.

## Tranche #1 — Integration MVP

**Completion date:** October 30, 2026  
**Budget:** $27,000

### Deliverable 1.1 — Anchor Platform and Oynk business server — $10,000

Implement a reproducible Anchor Platform environment and Oynk business-server MVP for SEP-12, SEP-31, SEP-38, SEP-10, and SEP-45.

**Completion evidence:**

- A reviewer can authenticate, receive compliance requirements, obtain and accept a firm quote, and create a test Anchor transaction.
- Callback authentication, exact amounts, quote expiry, invalid transitions, and idempotency are covered by automated tests.
- Anchor and Oynk states are explicitly mapped and documented.

### Deliverable 1.2 — Permissioned provider, quote, and rate-lock engine — $7,000

Implement provider profiles, corridor capabilities, capacity, eligibility, competitive quotes, quote acceptance, rate-lock deposits, expiry, and provider assignment.

**Completion evidence:**

- At least two eligible test providers compete for one test payment.
- Ineligible, suspended, over-limit, or over-capacity providers cannot participate.
- Accepted quotes are immutable, exact, expiring, and replay-safe.

### Deliverable 1.3 — Open-source Soroban testnet candidate — $6,000

Release and deploy the hardened contract candidate with per-request escrow, authorization, deadlines, claims, refunds, disputes, terminal-state exclusivity, and versioned events.

**Completion evidence:**

- Public source, license, immutable release, generated bindings, WASM hash, reproducible build, and testnet manifest.
- Tests for authorization, conservation of value, invalid transitions, replay, expiry, cancellation, claim, refund, and dispute outcomes.
- A referenced testnet settlement can be created, funded, and indexed.

### Deliverable 1.4 — Privy and Stellar Wallets Kit integration proof — $4,000

Implement testnet embedded-wallet and external-wallet flows.

**Completion evidence:**

- A reviewer can access a Privy embedded Stellar wallet or connect a compatible wallet through Stellar Wallets Kit.
- The application detects the wrong network and displays the account, asset, amount, contract, and intended operation before signing.

## Tranche #2 — End-to-End Testnet, Threat Model, and Monitoring

**Completion date:** December 18, 2026  
**Budget:** $40,500

### Deliverable 2.1 — Complete commercial payment flow — $13,000

Connect wallets, Anchor Platform, compliance eligibility, provider competition, rate locks, deposits, Soroban settlement, provider evidence, and reconciliation.

**Completion evidence:**

- A reviewer completes the documented testnet journey from onboarding through payment completion.
- Stable references link the Anchor transaction, payment, quote, rate lock, provider legs, Soroban request, and Stellar transaction.
- Tests cover success, duplicate callbacks, mismatched amounts, expiry, provider failure, delayed payout evidence, refund, and dispute.

### Deliverable 2.2 — Blend v2 excess-deposit integration — $9,500

Implement `RESERVED`, `LIQUID`, `YIELD_PENDING`, and `YIELD_DEPLOYED` balances with explicit business opt-in and an allowlisted Blend USDC pool.

**Completion evidence:**

- The system prevents allocations that would impair active rate-lock obligations.
- A reviewer can opt in, allocate excess test funds, see the on-chain position, observe yield or loss attribution, request withdrawal, and opt out.
- Tests cover insufficient liquidity, delayed withdrawal, stale pool data, pool suspension, loss, allocation-limit breach, and settlement demand while funds are deployed.

### Deliverable 2.3 — Compliance and provider policy engine — $8,000

Implement policy-versioned KYB/KYC, beneficial-owner, sanctions/PEP, wallet-risk, provider-type, corridor, limit, source-of-funds, payment-purpose, manual-review, and suspension gates through provider-neutral adapters.

**Completion evidence:**

- Automated approval, rejection, manual-review, stale-screening, sanctions-match, high-risk-wallet, exceeded-limit, unsupported-corridor, and suspended-provider cases.
- Each decision retains its policy version, reason, actor, timestamp, and payment/provider reference.
- No personal information is written to Stellar.

### Deliverable 2.4 — Required threat model and on-chain monitoring plan — $6,000

Publish a threat model covering Soroban authorization and upgrades, escrow deficits, replay, quote manipulation, Anchor callback forgery, fiat/on-chain mismatch, false payout evidence, provider collusion, wallet compromise, Blend liquidity and pool risk, oracle/admin risk, sanctions evasion, privacy leakage, and infrastructure failure.

Implement monitoring for:

- Contract events, upgrade/admin/pause changes, escrow imbalance, stuck or expired settlements, abnormal claims/refunds, and reconciliation mismatch.
- Blend positions, allocation limits, pool/liquidity health, oracle freshness, and withdrawal backlog.
- Stellar transaction failures, event-ingestion lag, RPC/Horizon health, ledger lag, resource anomalies, and signer failures.
- Alert severity, ownership, escalation, pause criteria, evidence retention, and recovery.

**Completion evidence:**

- Public threat model with assets, actors, trust boundaries, threats, controls, residual risks, and owners.
- Reviewer-accessible testnet monitoring.
- Demonstrated alerts for an upgrade, escrow mismatch, stuck settlement, indexer lag, Blend allocation breach, and failed transaction.
- Completed incident tabletop and remediation report.

### Deliverable 2.5 — Testnet product experience and documentation — $4,000

Deliver reviewer-ready business and provider interfaces for requests, quotes, rate locks, deposits, settlement status, Blend consent and balances, exceptions, and history.

**Completion evidence:**

- Public testnet release and recorded demonstration.
- Documentation explains custody, fees, quote timing, reserve rules, Blend risks, transaction states, refunds, and support.
- Automated and manual QA covers supported desktop/mobile and accessible error/status presentation.

## Tranche #3 — Controlled Mainnet Launch

**Completion date:** February 12, 2027  
**Budget:** $54,000

### Deliverable 3.1 — Production Anchor Platform and approved payment flow — $18,000

Deploy Anchor Platform and the Oynk business server and activate one narrowly defined mainnet payment flow using official Stellar USDC and approved participants. Any fiat leg will activate only under an appropriate regulated-partner arrangement and documented launch approval.

**Completion evidence:**

- Public `stellar.toml` and applicable SEP endpoints pass interoperability testing.
- Platform APIs and callbacks are authenticated and production secrets remain outside source control.
- At least one reviewer-verifiable transaction completes from Oynk payment reference through Stellar settlement and reconciliation.
- Unsupported corridors remain server-side disabled.

### Deliverable 3.2 — Verified Soroban mainnet release — $13,000

Deploy the hardened contract with reproducible build evidence, least-privilege roles, governed upgrades, emergency pause, storage-lifecycle handling, and versioned events.

**Completion evidence:**

- Public contract ID, source commit, full WASM hash, network, deployment transaction, roles, and upgrade/pause policy.
- Passing authorization, invariant/property, replay, migration, timeout, dispute, and adversarial-sequence tests.
- Mainnet contract events reconcile to the Oynk ledger without unexplained balance differences.

### Deliverable 3.3 — Mainnet wallet and provider experience — $7,000

Release Privy and Stellar Wallets Kit access for approved businesses and providers.

**Completion evidence:**

- Approved users can authorize the supported flow through either wallet path.
- Transaction confirmation displays the network, asset, exact amount, recipient/contract, fee, purpose, and expiry.
- Relevant MFA, approval, allowlist, limit, session, recovery, and suspension controls are tested and documented.

### Deliverable 3.4 — Limited Blend v2 mainnet release — $8,000

Enable Blend for eligible, affirmatively opted-in businesses under a low aggregate cap, per-business allocation limits, an approved pool allowlist, and emergency-disable policy.

**Completion evidence:**

- Required rate-lock reserves cannot enter Blend.
- Per-business principal, yield, loss, fees, pending withdrawals, and on-chain position reconcile exactly.
- Pool monitoring can automatically suspend new allocations.
- The interface clearly presents consent, risk, allocation, performance, withdrawal, and opt-out state.

### Deliverable 3.5 — Production monitoring and operational readiness — $5,000

Deploy the monitoring plan, runbooks, transaction holds, provider suspension, backups, restoration, and incident procedures.

**Completion evidence:**

- Live monitoring covers Anchor Platform, Stellar, Soroban, Blend, wallet, provider-adapter, database, and reconciliation health.
- Oynk completes a restoration exercise and mainnet incident-response exercise.
- Reconciliation distinguishes initiated, funded, settled, completed, failed, expired, refunded, disputed, and manually reviewed payments.

### Deliverable 3.6 — Public documentation and launch report — $3,000

Publish API, event, SEP, contract, provider, user, security, and operational documentation plus an anonymized mainnet report.

**Completion evidence:**

- Reviewers can access the production product and documentation.
- Metrics separately report approved businesses/providers, wallets, payments, Stellar transactions, settlement principal, completion time, failures/refunds, Blend opt-ins, and Blend-deployed balances.
- Historical traction is not combined with grant-created mainnet usage.

# Mainnet Scope and Production Boundary

The final milestone is a controlled production release, not unrestricted global availability.

The initial release will use:

- One approved payment flow.
- Official Stellar USDC.
- Approved business and provider accounts.
- Explicit corridor, transaction, provider, and aggregate limits.
- Segregated rate-lock reserves.
- Optional Blend allocation only for eligible excess balances.
- Production compliance, monitoring, reconciliation, and incident controls appropriate to the activated flow.

Oynk coordinates the network but does not assume that software replaces licensing, sanctions controls, banking permissions, safeguarding, or local payout authorization. Production corridors will activate only under applicable approvals and/or regulated-partner arrangements.

# Remaining Submission Assets

Before submission:

- [ ] Add the public video URL.
- [ ] Attach the 16:9 thumbnail.
- [ ] Confirm the invited round and adjust milestone dates if necessary.
- [ ] Confirm all four selected integrations remain on the current Integration List.
- [ ] Verify provider technical access without implying endorsement.
- [ ] Publish the grant-specific architecture document.
- [ ] Publish Soroban source, full deployment evidence, roles, and reproducible build.
- [ ] Reconcile the $1.6 million traction claim and measurement period across all public surfaces.
- [ ] Add customer interviews, LOIs, or pilot evidence where supportable.
- [ ] Add team GitHub profiles, verified affiliations, responsibilities, availability, and SCF accounts.
- [ ] Select mailing-list recipients and enter the verified Ambassador affiliation.
- [ ] Confirm that no budget covers marketing, legal work, licensing, liquidity capital, incentives, past work, or audit fees.
