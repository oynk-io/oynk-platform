# Platform foundation runbook

## Local services

```bash
docker compose up -d postgres
pnpm db:migrate
pnpm dev
```

Local surfaces:

- Public website: `http://localhost:5173`
- Console: `http://localhost:5174`
- API: `http://localhost:4000`
- Documentation: use `pnpm docs:dev` and the port reported by the existing docs server

Run only the console with `pnpm dev:console`.

## Create the first internal owner

Apply migrations first, then run:

```bash
pnpm create:internal-owner -- \
  --email owner@example.com \
  --password 'replace-with-a-unique-strong-password' \
  --first-name Platform \
  --last-name Owner
```

In production the command additionally requires `--confirm-production CREATE`. Run it from a controlled administrative environment and remove the plaintext password from shell history according to the operator's secret-handling procedure.

## Sign in

1. Open `http://localhost:5174/login`.
2. Enter the internal-owner email and password.
3. With the development email adapter, use the code shown in the clearly labeled development preview.
4. With Zoho, use the code delivered to the configured mailbox.
5. The console resolves the internal organization to `/internal/home`.

## Operational checks

```bash
pnpm auth:audit
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

The current repository has no configured lint command. Add and enforce linting in a dedicated approved phase rather than silently claiming it ran.

## Current boundaries

Business and partner account creation, email verification, password-plus-OTP sign-in, password reset, organization selection, and role-specific home shells are connected. Compliance forms, payments, payouts, terminal management, partner execution, invitation acceptance, and internal review are visibly marked not connected or planned.
