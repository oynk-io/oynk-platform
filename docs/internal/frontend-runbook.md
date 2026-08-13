# Frontend runbook

## Local development

```bash
pnpm --filter @oynk/shared build
pnpm --filter @oynk/web dev
pnpm --filter @oynk/transactions dev
```

The marketing website runs at `http://localhost:5173`. The standalone transactions application runs at `http://localhost:5175`, and its development proxy forwards `/api` to `http://127.0.0.1:4000`. Run the API and database separately when connected data is required.

## Environment

- `apps/transactions/.env` owns `VITE_API_URL`, which optionally points to a deployed API.
- `apps/transactions/.env` owns `VITE_NETWORK_ENV`, which controls the visible environment badge and defaults to `Mainnet`.
- `apps/transactions/.env` owns `VITE_PUBLIC_SITE_URL`, which links back to the public website.
- `apps/web/.env` owns `VITE_TRANSACTIONS_SITE_URL`, which defaults to `https://transactions.oynk.io`.
- Demo fixtures are not implemented. Real API mode is always the default.

## Quality gates

```bash
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

## Route deployment

The transactions application uses a lightweight pathname router. Hosting for `transactions.oynk.io` must rewrite `/transactions` to `index.html`. API paths must not be rewritten to the frontend. The public website retains compatibility redirects from `/dashboard` and `/dashboard/transactions` to the standalone application.

## Adding metrics and filters

Add shared fields in `@oynk/shared`, preserve existing response fields, implement server aggregation in the API, then format through `lib/format.ts`. Client filters must say `loaded` when they apply only to a bounded response. Use server pagination for a complete ledger.

## Error conventions

- Initial requests use skeletons.
- Persistent failures use inline alerts and an explicit retry.
- Existing data remains visible during a failed refresh.
- No-result and no-data states use different copy.
- Unauthorized administrative actions must not be exposed through public browser controls.
