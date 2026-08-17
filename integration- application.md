# Oynk — SCF Build Award Integration Track Application

> Submission draft prepared for SCF #45. Replace every `[REQUIRED BEFORE SUBMISSION: ...]` placeholder and confirm that every linked page is publicly accessible before submitting. Dates assume a September 2026 award; adjust them if the award date changes.

## Submission Information

### Project

Oynk Technologies

### Round

SCF #45 Build Award

### Build Award Track

Integration Track

### Submission Title

Oynk Permissioned Liquidity and Settlement Network on Stellar

### Project Type

End-User Application / Payments Infrastructure

### Project URL

https://www.oynk.io

### Technical Architecture Document

https://docs.oynk.io/full-technical-architecture

The architecture document distinguishes Oynk's implemented visibility and identity foundations, its separately deployed Soroban mainnet MVP, and the grant-funded integrations. It documents the Anchor Platform business-server boundary, SEP flows, permissioned liquidity model, compliance gates, Soroban settlement state machine, Blend reserve model, wallet authorization, trust boundaries, data model, failure handling, monitoring, and production-release gates.

Before submission, publish an application-specific revision that includes:

- Component and sequence diagrams for Anchor Platform, the Oynk business server, the liquidity engine, Privy, Stellar Wallets Kit, Blend v2, Soroban, fiat settlement partners, and the authoritative Oynk ledger.
- Exact SEP-12, SEP-31, SEP-38, SEP-10, and SEP-45 responsibilities.
- The reserved, liquid, and yield-deployed balance invariant.
- Network, asset, contract, signer, event-indexing, privacy, upgrade, pause, and reconciliation designs.
- A link to the Soroban source, immutable commit, complete WASM hash, deployment transaction, and reproducible-build instructions.

### GitHub URL

https://github.com/oynk-io/oynk-platform

Before submission, make the grant-relevant repository or a reviewable source repository public and add the Soroban source, license, immutable release tag, generated bindings, deployment manifest, test instructions, and source-to-WASM verification evidence.

### Video URL

[REQUIRED BEFORE SUBMISSION: Add a public YouTube or Vimeo URL for a video under three minutes, in 16:9 format.]

Suggested video structure:

1. **0:00–0:25 — Problem:** High-volume commercial payments lose Stellar's cost advantage at fragmented fiat, FX, liquidity, and payout boundaries.
2. **0:25–0:50 — Existing proof:** Show Oynk's live product, transaction dashboard, operations console, and the existing Soroban mainnet contract.
3. **0:50–1:55 — Product flow:** Create a business payment request, pass the compliance gate, receive competing eligible-provider quotes, accept a rate lock, fund the required deposit, settle USDC through Soroban, and show linked fiat and on-chain status.
4. **1:55–2:25 — Integrations:** Show how Anchor Platform, Privy/Stellar Wallets Kit, and Blend v2 fit into the flow.
5. **2:25–2:50 — Impact:** Explain how permissioned liquidity competition exposes Stellar's settlement efficiency to importers and payment platforms.

## Products & Services

### 1. Permissioned commercial liquidity network

Oynk connects commercial payment demand with eligible liquidity and settlement providers. Businesses create exact payment requests; approved providers publish corridor capacity and compete through time-bounded quotes; Oynk applies eligibility, exposure, and compliance policy before matching or assignment.

**How Stellar is used:** Quotes resolve to an approved Stellar settlement asset, initially official Stellar USDC. Provider commitments and settlement outcomes are coordinated through Soroban with stable Oynk settlement references.

**Project impact:** More qualified providers can create tighter spreads, reduce bilateral coordination, and make large commercial payments more observable and cost-efficient without making Oynk dependent on a single liquidity source.

### 2. Anchor Platform integration

Oynk will operate Anchor Platform and build the Oynk business server required to connect standardized Stellar payment interfaces to its compliance, quote, liquidity, fiat-partner, and reconciliation systems.

The initial implementation will support:

- SEP-12 customer and business compliance callbacks.
- SEP-31 cross-border payment workflows.
- SEP-38 indicative prices and firm, expiring quotes.
- SEP-10 and SEP-45 authentication for supported Stellar accounts.
- Authenticated status updates for off-chain collection, payout, refund, and exception events.

**How Stellar is used:** Anchor Platform provides the standardized entry point from Stellar wallets and applications into Oynk's cross-border payment and quote workflows.

**Project impact:** Oynk becomes interoperable with the Stellar anchor ecosystem while retaining an authoritative business ledger and supporting regulated institutions and settlement providers through modular fiat adapters.

### 3. Soroban settlement coordination

Oynk will harden its existing Soroban mainnet MVP into an open-source settlement contract and application integration for provider commitments, exact escrow accounting, deadlines, claims, refunds, disputes, and versioned lifecycle events.

**How Stellar is used:** Soroban coordinates the digital settlement leg using Stellar assets and explicit authorization. An event indexer links every transition to the corresponding Oynk payment and provider records.

**Project impact:** Payment platforms and providers gain a shared, auditable settlement state without placing personal information or raw fiat evidence on-chain. An on-chain transfer alone will never be treated as proof of completed fiat payout.

### 4. Business wallet access with Privy and Stellar Wallets Kit

Privy will provide embedded Stellar wallet onboarding for businesses that need an integrated account experience. Stellar Wallets Kit will let businesses and liquidity providers connect compatible external wallets and authorize Stellar transactions without surrendering their keys to Oynk.

**How Stellar is used:** Both paths produce Stellar account authorization for funding, provider participation, settlement, and balance visibility. The application will verify the selected network and intended transaction before requesting signatures.

**Project impact:** Oynk can serve both mainstream businesses and existing Stellar participants through explicit custody and authorization models rather than forcing every user into one wallet arrangement.

### 5. Optional Blend v2 yield for eligible excess deposits

Some businesses prefund a deposit to support an accepted rate lock. Oynk will separate each deposit into reserved, liquid, and yield-deployed balances. Funds required to honor the active rate lock remain segregated and immediately available. After the reserve requirement is satisfied, an eligible business may explicitly opt into allocating a bounded percentage of its excess balance to an approved Blend v2 USDC lending pool.

**How Stellar is used:** Blend v2 supplies the on-chain lending integration, while Oynk maintains exact per-business position, yield, loss, and withdrawal accounting. The MVP will not borrow, use leverage, deposit into Blend backstop modules, or deploy funds required to complete a rate-locked settlement.

**Project impact:** Businesses can optionally improve the capital efficiency of otherwise idle excess balances without weakening Oynk's settlement obligation. Yield and principal will not be represented as guaranteed.

### 6. Compliance, monitoring, and reconciliation

Oynk will implement technical policy gates for KYB/KYC status, beneficial-owner requirements, sanctions and PEP results, wallet/KYT risk, provider classification, corridor permissions, transaction and rolling limits, source of funds, payment purpose, manual review, provider suspension, and auditable reconciliation.

**How Stellar is used:** Compliance decisions gate Stellar funding, quoting, settlement, claim, and Blend-allocation actions. Only non-personal references and minimal settlement state are recorded on-chain.

**Project impact:** Oynk turns fragmented bilateral liquidity into a permissioned and reviewable network. Production activation of each fiat/stablecoin corridor remains subject to the applicable approvals and/or regulated partner arrangements.

## Traction Evidence

### Existing Stellar mainnet MVP

- Contract: https://stellar.expert/explorer/public/contract/CDTDCQ2Y6OASQVJGOFBA2EHP3AV7N6FFULJNEFGMORLYMNHECX7OO2W6
- Deployment transaction: `58eb6b55c774aeff2a54b90358fe459bf60f0089113b45caa6f697ef100d2fa0`
- Deployment time: July 11, 2026 at 17:06:19 UTC.
- Three completed request lifecycles used real Stellar USDC settlement principal of 500 USDC, 1,500 USDC, and 2,360 USDC, totaling 4,360 USDC.
- These requests demonstrate execution of fiat-to-crypto and fiat-to-fiat MVP states, including request creation, quotes, provider acceptance, escrow funding, confirmations, destination participation, and claims.

The 4,360 USDC figure counts each settlement principal once. Gross contract token movement would count both funding and later claims and would therefore double-count the same economic value. The mainnet activity demonstrates the MVP state machine with real assets; it does not establish an independent security audit, broad customer adoption, or independently verified fiat payout finality.

[REQUIRED BEFORE SUBMISSION: Add the public Soroban source URL, immutable commit, full WASM hash, deployment ledger, current administrator/manager addresses, and upgrade-control description.]

### Operating validation

Oynk has facilitated more than **$1,600,000** in cross-border payments across Africa, China, and the United States. This experience exposed recurring problems involving fragmented liquidity, foreign-exchange pricing, manual provider coordination, payout fulfillment, delays, and reconciliation.

Evidence: https://traction.oynk.io

Before submission, the traction page should state the measurement period and distinguish:

- Oynk-facilitated payment activity.
- Founder-led historical operating activity, if any.
- Indexed third-party blockchain movement.
- Off-chain transaction records.
- Soroban settlement principal.
- Revenue and customer funds, neither of which should be inferred from payment volume.

Use the same verified figure and cutoff date across the application, website, dashboard, and video.

### Existing product and technical foundation

- Public website: https://www.oynk.io
- Product and traction dashboard: https://traction.oynk.io
- Documentation: https://docs.oynk.io
- Public source organization: https://github.com/oynk-io
- PostgreSQL-backed BNB Smart Chain and Solana transaction indexing.
- Replay-aware synchronization state, confirmation handling, failure tracking, and operational repair tools.
- Public transaction and activity dashboards.
- Email verification, password and OTP sign-in, sessions, CSRF protection, organizations, roles, permissions, and audit records.
- Validated business compliance-profile foundation.

### Market validation

Oynk initially targets importers, wholesalers, payment platforms, and other high-volume commercial users for whom basis points materially affect margins. At $500,000 of weekly payment volume, a 1% all-in payment and conversion cost equals $5,000 per week or approximately $260,000 per year.

The underlying trade corridor is substantial. Public data reported for 2025 place China–Africa merchandise trade at approximately $348 billion, including approximately $225 billion of Chinese exports to Africa. World Bank research found that China supplied approximately 35% of Africa's imported digital goods and that Nigeria was among five countries collectively responsible for approximately 70% of the continent's digital-goods imports.

These trade values are not represented as Oynk's addressable payment volume. They establish the scale of underlying goods flows. Major Nigerian commercial clusters such as Computer Village, Alaba International Market, Ladipo, and ASPMDA illustrate the import-dependent businesses Oynk intends to serve, but Oynk will not present uncertain market-turnover estimates as measured cross-border payment volume.

[RECOMMENDED BEFORE SUBMISSION: Add redacted importer interviews, pilot expressions of interest, provider letters, or LOIs showing typical payment sizes, frequency, current costs, settlement time, and willingness to test Oynk. Do not name a bank or provider as a partner without written authorization.]

## Resubmission Feedback

Not applicable — first-time submission.

## Ambassador Affiliation

[REQUIRED BEFORE SUBMISSION: Select the applicable Stellar Ambassador affiliation. If none, enter “None.” Do not infer an affiliation from the referral alone.]

## Thumbnail

[REQUIRED BEFORE SUBMISSION: Attach a polished 16:9 image, ideally 1920×1080.]

Suggested thumbnail copy:

> **Oynk**  
> Permissioned liquidity and settlement for high-volume commercial payments  
> Anchor Platform · Stellar USDC · Soroban · Blend v2

The image should show commercial payment demand connecting to eligible liquidity providers through Oynk, with Stellar as the common settlement layer. Avoid depicting unsupported partners or claiming a live production corridor.

## Team Members

Each person must create an SCF account before being added:

1. Precious Ayorinde
2. Emmanuel Ekoja
3. Basit Yusuf
4. Ogunlana Olushola

## Mailing List

[REQUIRED BEFORE SUBMISSION: Select at least one registered team member to receive SCF communications. Recommended primary contact: Precious Ayorinde. Recommended technical contact: Emmanuel Ekoja.]

## Team Description

Oynk is built by a four-person team spanning business development, fintech strategy, blockchain/backend engineering, and full-stack product development. Together, the team combines direct cross-border payment experience with financial-infrastructure strategy and product engineering.

### Precious Ayorinde — Co-Founder, Business Development & Strategy

Precious leads Oynk's business development, partnerships, product strategy, and commercial validation, with a focus on high-volume markets and underserved transactional surfaces. Precious brings experience across digital transformation, project management, energy, sustainable mobility, business operations, and strategic partnerships, including work involving government agencies and multinational companies.

- LinkedIn: https://www.linkedin.com/in/precious-ayorinde-847085177
- GitHub: [ADD IF APPLICABLE]

### Emmanuel Ekoja — Software Engineer, Blockchain & Backend

Emmanuel focuses on Oynk's blockchain and backend infrastructure, including settlement systems, smart-contract integrations, APIs, event processing, and the technical infrastructure required to connect payment and settlement flows.

- LinkedIn: https://www.linkedin.com/in/emmanuel-ekoja-4b924826/
- GitHub: [REQUIRED BEFORE SUBMISSION: Add Emmanuel's GitHub profile.]

### Basit Yusuf — Full-Stack Software Engineer

Basit builds production-ready web applications, backend services, APIs, dashboards, and scalable payment integrations. Basit supports the business and provider interfaces required for payment initiation, quote acceptance, transaction visibility, and operational workflows.

- LinkedIn: https://www.linkedin.com/in/jideotetic/
- GitHub: [REQUIRED BEFORE SUBMISSION: Add Basit's GitHub profile.]

### Ogunlana Olushola — Fintech & Financial Infrastructure Consultant

Olushola provides strategic and technical guidance around fintech architecture, payment infrastructure, product delivery, regulated-partner integration, and scaling financial services across African markets.

- LinkedIn: https://www.linkedin.com/in/ogunlana-olushola-134aa942/
- GitHub: [ADD IF APPLICABLE]

[REQUIRED BEFORE SUBMISSION: Verify Olushola's current title and company affiliation and use the exact wording he authorizes. If advisory rather than full-time, state expected hours, responsibilities, and availability during the grant.]

### Team capacity

- Team size: 4.
- Core expertise: payment operations, business development, provider partnerships, backend systems, blockchain integrations, Soroban settlement, API development, React product development, transaction indexing, and fintech architecture.
- Existing execution: live Oynk product surfaces, multi-chain monitoring infrastructure, authentication and business-profile foundations, and a Soroban contract MVP deployed with real USDC on Stellar mainnet.

[REQUIRED BEFORE SUBMISSION: Add each member's expected grant allocation in hours per week and identify the person responsible for Anchor Platform, Soroban, Blend, frontend/wallet integration, compliance engineering, QA, and release operations.]

# Integration Track Deliverables & Budget

## Confirmation of Integration Track requirements

**Confirmed.** Oynk understands that:

- The Integration Track funds integrations with building blocks on the current official Integration List.
- Most of the requested budget must support the selected integrations and the product code required to make them usable.
- The project must be ready to build, with architecture substantially complete before the award.
- The award may not fund marketing, promotion, user acquisition, legal fees, entity registration, past work, or unrelated operating expenses.
- Security-audit costs are not included because audit support may be provided separately through the Audit Bank.
- Deliverables must be concrete, measurable, reviewer-accessible, and completed within the approved schedule.
- The final tranche must result in a usable mainnet launch or approved equivalent.
- Smart-contract source will be open-sourced.

## Budget

**Total request: $135,000 worth of XLM**

The request covers approximately five months of development by the four-person team. It does not include marketing, customer incentives, liquidity capital, legal or licensing costs, partner transaction fees unrelated to development, or external audit fees.

SCF payment structure:

| Payment | Percentage | Amount |
|---|---:|---:|
| Tranche #0 — award acceptance | 10% | $13,500 |
| Tranche #1 — integration MVP | 20% | $27,000 |
| Tranche #2 — testnet and risk controls | 30% | $40,500 |
| Tranche #3 — controlled mainnet launch | 40% | $54,000 |
| **Total** | **100%** | **$135,000** |

Tranche #0 supports engineering mobilization across the approved work: development environments, provider onboarding, implementation kickoff, and the first portion of engineering time. It has no separate completion deliverable.

## Integration Track Specifics

### Selected official building blocks

1. **Anchor Platform** — primary integration for standardized on/off-ramp and cross-border payment workflows.
2. **Blend v2** — optional yield for eligible excess business-deposit balances.
3. **Privy** — embedded Stellar wallet onboarding and controlled business-account access.
4. **Stellar Wallets Kit** — external Stellar wallet connectivity and signing.

Oynk's Soroban settlement contract, liquidity engine, compliance policy engine, fiat-partner adapter interface, ledger, indexer, and reconciliation services are the product components required to compose these listed integrations into a usable payment system. They are not presented as additional third-party Integration Track building blocks.

Bridge and Circle CCTP are not included in the funded scope or deliverables of this submission. They may be evaluated in later work only if they remain eligible, supported, legally appropriate, and separately approved.

## Tranche #1 Deliverables — Integration MVP

**Completion date: October 30, 2026**  
**Milestone budget: $27,000**

### Deliverable 1.1 — Anchor Platform and Oynk business-server MVP — $10,000

Implement a locally reproducible Anchor Platform deployment and the first Oynk business-server adapters for:

- SEP-12 business/customer status and required-field callbacks.
- SEP-31 payment creation and state updates.
- SEP-38 indicative prices and expiring firm quotes.
- SEP-10 and SEP-45 authentication configuration for supported account types.
- Authenticated Anchor Platform callbacks and private Platform API access.

**How completion is measured:**

- A reviewer can start the documented environment and complete a test flow from authentication through compliance requirements, quote acceptance, and creation of an Anchor Platform transaction.
- Automated contract tests validate callback authentication, exact decimal amounts, quote expiry, invalid state changes, and repeat requests.
- The repository contains configuration examples without secrets and maps every Anchor state to an Oynk state.

### Deliverable 1.2 — Permissioned liquidity, quote, and rate-lock MVP — $7,000

Implement business payment requests, provider profiles, corridor capabilities, capacity, eligibility, competing quotes, firm quote acceptance, rate-lock expiry, deposit requirements, provider assignment, and stable settlement references.

**How completion is measured:**

- At least two test providers can submit quotes for one test corridor.
- An ineligible, suspended, over-limit, or over-capacity provider cannot quote or accept assignment.
- Accepted quotes become immutable, expire deterministically, and cannot be replayed.
- Amounts and rates use exact decimal/integer representations without floating-point financial arithmetic.

### Deliverable 1.3 — Soroban source release and testnet settlement candidate — $6,000

Publish the contract source and deploy a testnet candidate implementing exact per-request escrow, explicit authorization, legal state transitions, deadlines, versioned events, mutually exclusive claim/refund outcomes, and replay protection.

**How completion is measured:**

- Public source, license, immutable tag, generated bindings, full WASM hash, reproducible-build instructions, and testnet deployment manifest are available.
- Tests cover unauthorized actions, duplicate funding, expiry, cancellation, claim/refund exclusivity, disputes, and conservation of escrowed value.
- The UI/API can create, fund, and observe a referenced testnet settlement.

### Deliverable 1.4 — Privy and Stellar Wallets Kit proof of integration — $4,000

Implement embedded wallet onboarding through Privy and external wallet connection through Stellar Wallets Kit in a test environment.

**How completion is measured:**

- A reviewer can create/access an embedded Stellar wallet or connect a compatible external wallet.
- The application displays the active address and network, rejects the wrong network, presents the intended action before signing, and signs a testnet funding transaction.
- Custody and authorization behavior are documented separately for embedded and external wallets.

## Tranche #2 Deliverables — End-to-End Testnet, Threat Model, and Monitoring

**Completion date: December 18, 2026**  
**Milestone budget: $40,500**

### Deliverable 2.1 — End-to-end Anchor, wallet, liquidity, and Soroban testnet flow — $13,000

Connect wallet authorization, Anchor Platform, the permissioned quote engine, rate-lock deposits, Soroban settlement, provider evidence, and the Oynk ledger into one reviewer-accessible testnet workflow.

**How completion is measured:**

- A reviewer can complete a documented business flow from onboarding and quote acceptance through testnet funding, provider assignment, settlement, and completion.
- Oynk records explicit identifiers linking the Anchor transaction, quote, payment, Soroban request, Stellar transaction, provider legs, and reconciliation result.
- Automated tests demonstrate success, timeout, duplicate callback, mismatched amount, provider failure, refund, dispute, and delayed fiat-evidence scenarios.

### Deliverable 2.2 — Blend v2 opt-in yield and reserve-accounting testnet integration — $9,500

Implement separate `RESERVED`, `LIQUID`, `YIELD_PENDING`, and `YIELD_DEPLOYED` balances for each eligible business deposit. The required rate-lock reserve must remain liquid. A business may explicitly opt into allocating a bounded share of excess funds to an allowlisted Blend v2 USDC lending pool.

The MVP will not borrow, use leverage, use the Blend backstop module, promise yield or principal, or deploy funds required to satisfy an active settlement.

**How completion is measured:**

- The system mathematically prevents an allocation that would reduce immediately available funds below the maximum active rate-lock obligation.
- A reviewer can opt in, allocate test funds, observe the Blend position, accrue/attribute yield, request withdrawal, and opt out.
- Per-business principal, yield, loss, fees, pending withdrawals, and reconciliation differences are exact and auditable.
- Tests cover withdrawal delay, insufficient pool liquidity, loss, stale data, pool suspension, duplicate events, and settlement demand arising while funds are deployed.

### Deliverable 2.3 — Compliance and provider-eligibility controls — $8,000

Implement policy-versioned gates for KYB/KYC state, beneficial-owner requirements, sanctions/PEP and wallet-risk results through adapter interfaces, corridor and provider permissions, transaction and rolling limits, source of funds, payment purpose, manual review, and provider suspension.

**How completion is measured:**

- Automated scenarios demonstrate approval, rejection, manual review, stale screening, sanction match, high-risk wallet, exceeded limit, unsupported corridor, and suspended provider.
- Every decision stores its policy version, non-sensitive reasons, reviewer/action history, and linked payment/provider reference.
- No PII, bank details, screening payloads, or raw evidence are written to Stellar.

### Deliverable 2.4 — Required threat model and on-chain monitoring plan — $6,000

Publish an application-specific threat model covering:

- Contract authorization, privileged roles, upgrades, pause, dispute resolution, and signer compromise.
- Escrow deficits, illegal transitions, replay, duplicate submission, quote manipulation, stale quotes, and oracle dependencies.
- Anchor callback forgery, SEP authentication, state desynchronization, fiat/on-chain mismatch, provider collusion, and false payout evidence.
- Wallet compromise, account recovery, malicious transaction presentation, wrong-network signing, and server-side signer misuse.
- Blend liquidity, bad debt, pool configuration, oracle, administrator, contract, depeg, withdrawal, and accounting risks.
- Sanctions evasion, identity fraud, mule providers, structuring, corridor misuse, insider activity, privacy leakage, and denial of service.

Publish and implement an on-chain monitoring plan covering:

- Contract event ingestion with deterministic `(network, contract, ledger, transaction, event)` identity and replay-safe checkpoints.
- Alerts for unauthorized/failed calls, upgrade and admin changes, pause changes, escrow-versus-liability imbalance, stuck states, expired requests, duplicate events, abnormal claims/refunds, and reconciliation mismatch.
- Blend position, utilization/liquidity indicators, pool/backstop health signals, oracle freshness, allocation-limit violations, and withdrawal backlog.
- Stellar RPC/Horizon health, ledger lag, ingestion lag, transaction finality, failed submissions, fee/resource anomalies, and signer failures.
- Severity levels, alert owners, response time, escalation, evidence retention, incident communication, pause criteria, and recovery procedure.

**How completion is measured:**

- The public threat-model document identifies assets, actors, trust boundaries, threats, controls, residual risk, and named owners.
- Monitoring runs against the testnet deployment and exposes a reviewer-accessible status view.
- Test alerts are triggered for an upgrade event, escrow mismatch fixture, stuck settlement, event-indexing lag, Blend allocation breach, and failed transaction.
- A tabletop incident exercise and remediation report are published with sensitive information removed.

### Deliverable 2.5 — Testnet UX, documentation, and QA — $4,000

Deliver business and provider interfaces for requests, quotes, rate locks, deposits, settlement status, Blend consent and position visibility, exceptions, and transaction history.

**How completion is measured:**

- Reviewer documentation explains fees, timing, custody, rate-lock reserve, Blend risks, statuses, refunds, and support paths.
- Automated and manual QA covers supported desktop/mobile flows and accessible status/error presentation.
- A recorded testnet demonstration and release notes are public.

## Tranche #3 Deliverables — Controlled Mainnet Launch

**Completion date: February 12, 2027**  
**Milestone budget: $54,000**

### Deliverable 3.1 — Production Anchor Platform and one approved mainnet payment flow — $18,000

Deploy Anchor Platform and the Oynk business server in a production topology and launch one narrowly defined mainnet flow using official Stellar USDC and approved participants. Fiat activation will occur only where Oynk has the required regulated-partner arrangement and documented launch approval.

**How completion is measured:**

- Public `stellar.toml` and applicable SEP endpoints pass documented interoperability tests.
- Platform APIs are private/authenticated; callbacks are authenticated; secrets are stored outside source control.
- At least one reviewer-verifiable mainnet transaction completes from an Oynk payment reference through Stellar settlement and reconciliation.
- Unsupported corridors remain disabled and cannot be activated through a client-side setting.

### Deliverable 3.2 — Verified Soroban mainnet settlement release — $13,000

Deploy the hardened settlement contract with open source, reproducible build evidence, generated bindings, least-privilege roles, governed upgrade controls, pause procedures, storage-lifecycle handling, and versioned events.

**How completion is measured:**

- The public deployment manifest contains network passphrase, contract ID, full WASM hash, source commit, deployment transaction, roles, and upgrade/pause policy.
- All critical test suites pass, including invariant/property, authorization, replay, migration/upgrade, timeout, dispute, and adverse sequence tests.
- The event indexer and Oynk ledger reconcile all launched mainnet settlements without unexplained balance differences.

### Deliverable 3.3 — Mainnet wallet and provider experience — $7,000

Release Privy embedded Stellar access and Stellar Wallets Kit external-wallet access for approved business and provider roles.

**How completion is measured:**

- Approved users can authorize the supported mainnet flow through either documented wallet path.
- Transaction confirmation displays network, asset, exact amount, recipient/contract, purpose, fees, and quote expiry.
- MFA/approval, address allowlists, amount limits, session expiry, recovery, and account-suspension behavior are documented and tested as applicable to the selected custody model.

### Deliverable 3.4 — Limited Blend v2 mainnet release — $8,000

Enable Blend only for eligible businesses that explicitly opt in, only for excess balances, only through an allowlisted pool, and only after reserve, risk, and withdrawal checks pass. Mainnet exposure will begin under a published low cap and an emergency-disable policy.

**How completion is measured:**

- No required rate-lock reserve can enter Blend.
- The production ledger reconciles business-level principal, yield, loss, fees, and withdrawals against the on-chain Blend position.
- Pool and position monitoring is live, tested, and linked to automatic allocation suspension.
- The interface presents affirmative consent, risk disclosure, allocation, withdrawal status, yield, loss, and opt-out controls.

### Deliverable 3.5 — Production monitoring, reconciliation, and operational readiness — $5,000

Deploy the Tranche #2 monitoring plan with production alerts, dashboards, runbooks, backup/recovery procedures, provider suspension, transaction holds, and incident ownership.

**How completion is measured:**

- Alerts cover Anchor, Stellar, Soroban, Blend, wallet, reconciliation, database, and provider-adapter health.
- A mainnet reconciliation report distinguishes initiated, funded, settled, completed, refunded, failed, disputed, and manually reviewed payments.
- Oynk completes a restore exercise and a mainnet incident-response exercise.

### Deliverable 3.6 — Public release, integration documentation, and launch report — $3,000

Publish setup documentation, API and event references, SEP mapping, contract documentation, provider-integration guidance, user documentation, security contacts, and an anonymized mainnet launch report.

**How completion is measured:**

- A reviewer can access and use the production application and documentation.
- The report provides wallet count, approved businesses/providers, initiated and completed payments, Stellar transaction count, settlement principal, completion time, failures/refunds, Blend opt-ins and deployed balance, without conflating historical activity with grant-created mainnet usage.
- No marketing, paid promotion, incentives, or user-acquisition cost is charged to the award.

## Mainnet launch boundaries

The mainnet milestone means a usable, controlled production release—not unrestricted global availability. The initial release will enforce:

- One approved payment flow and official Stellar USDC.
- Approved business and provider accounts.
- Corridor, transaction, provider, and aggregate exposure limits.
- Segregation of settlement reserves from Blend-eligible excess balances.
- Production KYB/KYC, screening, monitoring, case handling, and reconciliation appropriate to the activated flow.
- A release decision supported by technical, security, operational, partner, and compliance evidence.
- Immediate suspension capability for the affected provider, corridor, contract action, or Blend allocation without rewriting completed settlement history.

Oynk will not claim that KYC substitutes for licensing. Production fiat/stablecoin corridors will activate only under the applicable regulatory approvals and/or regulated-partner arrangements. Oynk will not place names, phone numbers, bank details, identity documents, sanctions results, or raw payout evidence on Stellar.

## Final pre-submission checklist

- [ ] Replace all `[REQUIRED BEFORE SUBMISSION: ...]` placeholders.
- [ ] Confirm the round number and milestone dates in the invitation.
- [ ] Confirm that Anchor Platform, Blend v2, Privy, and Stellar Wallets Kit remain on the current Integration List for the selected round.
- [ ] Confirm technical access and support with each integration provider; do not imply endorsement or partnership without written permission.
- [ ] Publish and test the architecture URL without authentication.
- [ ] Make the grant-relevant code and Soroban source reviewable.
- [ ] Add the full existing deployment evidence and current admin/upgrade policy.
- [ ] Reconcile the $1.6 million traction figure across every public surface and add a measurement period.
- [ ] Add a sub-three-minute public demo video.
- [ ] Add the 16:9 thumbnail.
- [ ] Register and add all team members, mailing-list contacts, GitHub profiles, roles, availability, and verified affiliations.
- [ ] Add only supportable customer/provider evidence and redact confidential information.
- [ ] Confirm that the total request is $135,000 and every tranche subtotal is correct.
- [ ] Exclude marketing, legal, licensing, liquidity capital, incentives, prior work, and external audit fees.
- [ ] Ensure the final application uses “permissioned liquidity network,” not an unrestricted P2P marketplace.
