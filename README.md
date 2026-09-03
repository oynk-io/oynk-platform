# Oynk Platform

A pnpm monorepo for Oynk's programmable payment and settlement platform. It contains the public web experience, organization operations console, transaction-visibility application, API and shared domain models, technical documentation, and blockchain indexers for BNB Smart Chain and Solana.

## Soroban protocol

The open-source Soroban contract workspace is included as the
[`settlement-aggregator-protocol`](settlement-aggregator-protocol) submodule. It
contains the contract implementation, locked unit and WASM lifecycle tests,
and machine-readable build and deployment evidence. The contract is maintained
by [Emmanuel Ekoja (`emmanuelekoja`)](https://github.com/emmanuelekoja).

After cloning, initialize it with:

```bash
git submodule update --init --recursive
```

## Included

- Five seeded settlement wallets supplied for the MVP
- Direct BNB Chain ERC-20 `Transfer` log indexing for USDT and USDC
- Direct Solana RPC indexing using transaction signatures and token balance deltas
- PostgreSQL cache for fast dashboard loading and incremental BSC sync state
- Total/inflow/outflow USD metrics and 30-day timeline
- Newest-first transaction ledger
- BscScan and Solscan links
- Conservative inflow/outflow pairing with links to both legs
- Manual and scheduled synchronization
- React 19, TypeScript, Tailwind CSS 4, Recharts, Express 5

## Important interpretation

The application treats USDT and USDC as USD 1.00 for operational reporting. It stores both raw and normalized token amounts. Pairing is heuristic: opposite-direction transfers are paired only when the asset matches, values differ by no more than 1%, and timestamps are within six hours. For production, replace this with your internal settlement/payment reference.

## Run

Requirements: Node.js 20+, pnpm 10+, Docker.

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm db:migrate
pnpm dev
```

Open `http://localhost:5173`. The API runs on `http://localhost:4000` and Vite proxies `/api` to it.

To trigger a one-time sync:

```bash
pnpm sync
```

The API also syncs on startup and then every `SYNC_INTERVAL_MINUTES`.

## Production RPCs

Public RPC endpoints are suitable only for a demo and may throttle historical queries. Configure reliable provider URLs in `.env` before indexing a large history:

```env
BSC_RPC_URL=https://your-bsc-rpc
SOLANA_RPC_URL=https://your-solana-rpc
```

## Main extension points

- `apps/api/src/services/tokens.ts`: supported stablecoins
- `apps/api/src/db/migrate.ts`: tracked settlement wallets
- `apps/api/src/indexers/bscIndexer.ts`: EVM transfer ingestion
- `apps/api/src/indexers/solanaIndexer.ts`: Solana token transfer ingestion
- `apps/api/src/services/pairingService.ts`: replace heuristic pairing with internal references
- `apps/web/src/App.tsx`: dashboard UI

## Data model

`tracked_wallets` stores configured settlement addresses. `transfers` stores each observed wallet-relative token movement. A transfer is recorded independently for every tracked wallet it affects, preserving operational visibility. `sync_state` stores indexing checkpoints.

## Notes

- Solana public RPC history can be limited. The MVP requests the latest configured number of signatures per wallet.
- BSC history begins at `latest - BSC_INITIAL_BLOCK_LOOKBACK` on first run, then advances incrementally.
- Failed Solana transactions are retained with `FAILED` status but are excluded from automatic pairing.

cp .env.example .env

docker compose up -d

pnpm install

pnpm db:migrate

pnpm dev
