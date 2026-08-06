# Oynk console UI architecture

## Route map

- `/` — public product site.
- `/dashboard` — API-backed operational overview.
- `/dashboard/transactions` — API-backed indexed transaction workspace.
- Unknown paths — explicit not-found page.
- Product areas without APIs appear as disabled navigation entries marked `Planned`; they do not resolve to misleading empty routes.

## Component boundaries

- `ConsoleShell` owns workspace navigation, mobile drawer, breadcrumbs, environment context, documentation access, and content landmarks.
- `useDashboardData` owns dashboard requests, refresh state, synchronization polling, and consistent errors.
- Page components own route composition and filters.
- `TransferTable`, `VolumeChart`, and `MetricCard` remain presentational data surfaces.
- Shared API response types come from `@oynk/shared`.

## Data fetching

Requests remain in `lib/api.ts`. `useDashboardData` calls those functions with one active chain filter, retains prior data on refresh failure, polls only while a sync reports `RUNNING`, and clears poll timers on unmount. No query dependency is justified for the two connected routes.

## Navigation policy

Only a route backed by real data or a complete informational experience may be clickable. Future payments, settlements, providers, corridors, operational controls, developer tooling, and settings remain disabled until their API, authorization, states, and error contracts exist.

## Extending the console

1. Add shared contracts to `@oynk/shared` when consumed by API and web.
2. Add a typed API function.
3. Add a focused query hook.
4. Implement loading, successful, empty, filtered-empty, error, stale, and permission states.
5. Add the route to `Router.tsx` and convert the disabled navigation entry to a link.
6. Add route and formatting tests before describing the feature as connected.

