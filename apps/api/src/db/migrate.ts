import { pool } from "./pool.js";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { seedOffchainTransactions } from "./seedOffchainTransactions.js";
const sql = `
CREATE TABLE IF NOT EXISTS tracked_wallets (
 id TEXT PRIMARY KEY, chain TEXT NOT NULL CHECK(chain IN ('BSC','SOLANA')), address TEXT NOT NULL,
 label TEXT NOT NULL, enabled BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(chain,address)
);
CREATE TABLE IF NOT EXISTS transfers (
 id TEXT PRIMARY KEY, chain TEXT NOT NULL, wallet_address TEXT NOT NULL, tx_hash TEXT NOT NULL,
 log_index INTEGER NOT NULL DEFAULT 0, block_number TEXT, block_time TIMESTAMPTZ NOT NULL,
 direction TEXT NOT NULL CHECK(direction IN ('INFLOW','OUTFLOW')), token_address TEXT NOT NULL,
 asset_symbol TEXT NOT NULL, decimals INTEGER NOT NULL, raw_amount NUMERIC(78,0) NOT NULL,
 amount NUMERIC(38,18) NOT NULL, usd_value NUMERIC(38,18) NOT NULL, counterparty TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'CONFIRMED', explorer_url TEXT NOT NULL, pair_id TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(chain,tx_hash,log_index,wallet_address,direction)
);
CREATE INDEX IF NOT EXISTS transfers_time_idx ON transfers(block_time DESC);
CREATE INDEX IF NOT EXISTS transfers_wallet_idx ON transfers(chain,wallet_address);
CREATE TABLE IF NOT EXISTS sync_state (
 key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO tracked_wallets(id,chain,address,label) VALUES
 ('bsc-1','BSC','0x6ff1c6f616362cabbd9cda20392045af6e09437d','BSC Settlement 1'),
 ('bsc-2','BSC','0x9b15fd8ffbd01bd6cd0e2c5299510a3a9c798c59','BSC Settlement 2'),
 ('bsc-3','BSC','0xc2F90cD4EC29fb2554B9074c832b411A38560c5a','BSC Settlement 3'),
 ('sol-1','SOLANA','HBWd7cSX5DrJiFTSSjuWhj5GV83kNtvJ8AutvgqLteTN','Solana Settlement 1'),
 ('sol-2','SOLANA','D338mf3WW935Ef3z3CceoQYzmJu2YYPft1HaedDk5MsD','Solana Settlement 2')
ON CONFLICT DO NOTHING;`;
await pool.query(sql);
await pool.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`);

const migrationsDirectory = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "migrations"
);
const migrationNames = (await readdir(migrationsDirectory))
  .filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/.test(name))
  .sort();

for (const migrationName of migrationNames) {
  const applied = await pool.query<{ name: string }>(
    "SELECT name FROM schema_migrations WHERE name = $1",
    [migrationName]
  );
  if (applied.rowCount !== 0) continue;
  const migration = await readFile(path.join(migrationsDirectory, migrationName), "utf8");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(migration);
    await client.query("INSERT INTO schema_migrations(name) VALUES ($1)", [migrationName]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
let offchainTransactionCount = 0;
if (config.SEED_OFFCHAIN_TRANSACTIONS) {
  const seedClient = await pool.connect();
  try {
    await seedClient.query("BEGIN");
    offchainTransactionCount = await seedOffchainTransactions(seedClient);
    await seedClient.query("COMMIT");
  } catch (error) {
    await seedClient.query("ROLLBACK");
    throw error;
  } finally {
    seedClient.release();
  }
}
console.log(
  config.SEED_OFFCHAIN_TRANSACTIONS
    ? `Database migrations applied; ${offchainTransactionCount} offchain transactions seeded.`
    : "Database migrations applied; offchain transaction seed skipped.",
);
await pool.end();
