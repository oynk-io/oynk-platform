import { pool } from "./pool.js";
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
console.log("Database migrated and wallets seeded.");
await pool.end();
