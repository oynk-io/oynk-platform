# Oynk documentation

This directory is a native Mintlify documentation project. Mintlify should be configured with `apps/docs` as its project root.

## Local authoring

Requirements: Node.js 20.17+ and the Mintlify CLI (`mint`). This repository uses pnpm only. Install the CLI with `pnpm add -g mint` if it is not already available.

```bash
pnpm --filter @oynk/docs dev
```

The preview opens at `http://localhost:4173`. The repository-safe validator does not require network access:

```bash
pnpm --filter @oynk/docs typecheck
```

## Publish

Connect the repository in Mintlify, set the docs path to `apps/docs`, select the production branch, and configure `docs.oynk.io` in the Mintlify dashboard. Every push to that branch is then deployable by Mintlify. Do not configure a guessed DNS target; use the value shown by Mintlify during custom-domain setup.

The HTTP reference is generated from `../api/openapi.yaml`, keeping endpoint documentation tied to the API source specification.
