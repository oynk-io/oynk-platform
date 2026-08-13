# Oynk frontend UI audit

Audit date: 2026-08-06

## Baseline

The frontend is a strict React 19, TypeScript, Vite, Tailwind CSS application without a routing or component-framework dependency. Baseline `pnpm typecheck`, `pnpm test`, and `pnpm build` all pass. The web production build is approximately 229 kB for the landing/router bundle and 419 kB for the lazy dashboard chunk before gzip.

## Existing routes

| Path | Surface | Data source |
| --- | --- | --- |
| `/` | Public landing page | Static, evidence-based public copy |
| `/dashboard` | Indexed activity overview and transaction ledger | `GET /api/dashboard` and `GET /api/dashboard/sync` |
| `/*` | Not-found page | None |

Routing is a pathname switch. It supports direct rendering under a correctly configured SPA host, but has no URL filter state, nested layouts, breadcrumbs, or browser-navigation abstraction.

## Existing component and data map

- `Router.tsx`: pathname selection, lazy dashboard loading, document metadata.
- `App.tsx`: dashboard data fetching, sync polling, all overview composition.
- `TransferTable.tsx`: client search, direction/asset/date filters, copy actions, explorer links, mobile cards, pagination.
- `VolumeChart.tsx`: Recharts timeline.
- `MetricCard.tsx`: repeated metric presentation.
- `lib/api.ts`: dashboard and sync HTTP calls.
- `lib/chains.ts`: frontend chain metadata.
- `lib/format.ts`: amount, date, USD, and identifier formatting.
- `LandingPage.tsx`: public site and mobile navigation.

There are no query hooks, layout primitives, modal/popover primitives, testable URL-filter helpers, or console navigation components.

## Design weaknesses

- The activity dashboard is a polished single page, not an operational console.
- Navigation consists only of the Oynk home link and chain select.
- Overview metrics, chart, and full ledger compete on one long canvas.
- Every metric receives equivalent card weight despite different operational importance.
- The dark dashboard and warm public site share branding but not a semantic design-token layer.
- Colors and spacing are primarily inline utility choices or page-specific CSS.
- No light/dark theme strategy exists for the console.

## Information hierarchy

- Gross transfer movement and estimated settlement are semantically distinct, but their visual prominence is equal.
- Sync health is compact and disappears below large-desktop width.
- Latest index time and latest transaction time are useful but visually detached from health.
- The ledger is labelled “recent” but filtering only covers the bounded API response; it is not a complete server-side ledger search.
- There is no first-class Transactions page or transaction detail route.

## Navigation

- No sidebar, grouped navigation, breadcrumbs, command launcher, docs shortcut, environment context, or active-route treatment.
- Unsupported payment, provider, corridor, developer, and settings workflows should not be exposed as functioning routes until APIs exist.
- Browser back/forward works for full navigations but the app has no client router or navigation-state preservation.

## Accessibility

Strengths include semantic tables, accessible labels, copy-button names, focus styles, mobile cards, live result counts, status text, and reduced-motion CSS.

Gaps:

- No skip link or console-wide landmark/navigation structure.
- No accessible drawer or focus restoration for console navigation.
- The chart has no concise textual summary.
- Dense table headings lack explicit scope attributes.
- No automated accessibility suite is configured.

## Mobile and responsive behavior

- Landing navigation and transaction cards are intentionally responsive.
- Dashboard controls fit small screens, but there is no mobile console drawer.
- Overview content remains a long stack and offers no persistent operational navigation.
- Filters wrap, but advanced filters would require a drawer if expanded further.

## Data visualization

- Recharts is route-lazy through the dashboard chunk.
- The timeline correctly distinguishes inflow/outflow and uses a 365-day window.
- There are no chain/asset breakdown visualizations because the API does not expose grouped series.
- `chainLag` exists in the shared response but is currently nullable; inventing a lag chart would be misleading.

## Loading, empty, and failure states

- Dashboard: initial skeleton, persistent API error with retry, and retained prior data.
- Transactions: no-data and no-filter-results states.
- Sync: running, partial, and failed status messages.
- Missing: explicit stale-data age, permission-denied state, offline event handling, and transaction-detail failure state.

## Duplication and consistency

- Button and focus styling is split between Tailwind strings and CSS classes.
- Status colors are composed inline in `App.tsx` and `TransferTable.tsx`.
- Dashboard header, page title, timestamps, and filters are not reusable shell primitives.
- No duplicated API response interfaces were found; shared contracts correctly come from `@oynk/shared`.

## Missing operational workflows

Backend-supported now:

- Indexed overview metrics
- Timeline activity
- Recent transfers
- Chain filtering
- Sync status
- Explorer verification

Not connected to frontend-ready APIs:

- Payments and settlement records
- Provider performance and corridors
- Wallet inventory and cursor detail
- Exception/reconciliation workflows
- API keys, webhooks, and API logs
- Organization, team, security, compliance, or notification settings
- Authorized browser-based manual synchronization

These must be shown as disabled roadmap destinations or honest “not connected” states, never with fabricated production data.

## Proposed information architecture

### Connected

- `/dashboard` — Overview
- `/dashboard/transactions` — Transaction operations

### Informational or disabled until backend support exists

- Payments
- Settlements
- Providers
- Settlement wallets
- Corridors
- Analytics/reports beyond existing aggregates
- Synchronization/exceptions/reconciliation/audit log
- API keys/webhooks/API logs
- Organization/team/security/compliance/notifications

Documentation remains an external destination at `https://docs.oynk.io`.

## Implementation plan

1. Introduce semantic console tokens and reusable shell primitives.
2. Build a responsive, keyboard-accessible sidebar/drawer and top bar.
3. Preserve `/dashboard` as the connected Overview route.
4. Add `/dashboard/transactions` using the existing real dashboard response.
5. Add honest disabled navigation entries for unsupported product areas.
6. Improve overview hierarchy, status presentation, table accessibility, and route metadata.
7. Add internal UI architecture/design-system/runbook documentation.
8. Validate typecheck, tests, production build, copy, routes, and diff.

## Scope decision

No new dependency is justified. The application has two connected console routes, so its lightweight pathname routing remains adequate. A routing/query/component framework should be reconsidered when server-side pagination, transaction details, authenticated operator workflows, and nested settings become real API-backed product surfaces.
