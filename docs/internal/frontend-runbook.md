# Frontend runbook

## Local development

```bash
pnpm --filter @oynk/shared build
pnpm --filter @oynk/web dev
```

The web development proxy forwards `/api` to `http://127.0.0.1:4000`. Run the API and database separately when connected data is required.

## Environment

- `VITE_API_URL` optionally points to a deployed API.
- `VITE_NETWORK_ENV` controls the visible environment badge and defaults to `Mainnet`.
- Demo fixtures are not implemented. Real API mode is always the default.

## Quality gates

```bash
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

## Route deployment

The web application uses a lightweight pathname router. Hosting must rewrite `/dashboard`, `/dashboard/transactions`, and other valid frontend paths to `index.html`. API paths must not be rewritten to the frontend.

## Adding metrics and filters

Add shared fields in `@oynk/shared`, preserve existing response fields, implement server aggregation in the API, then format through `lib/format.ts`. Client filters must say `loaded` when they apply only to a bounded response. Use server pagination for a complete ledger.

## Error conventions

- Initial requests use skeletons.
- Persistent failures use inline alerts and an explicit retry.
- Existing data remains visible during a failed refresh.
- No-result and no-data states use different copy.
- Unauthorized administrative actions must not be exposed through public browser controls.

