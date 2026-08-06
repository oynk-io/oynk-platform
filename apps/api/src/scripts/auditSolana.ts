import { Connection, PublicKey } from "@solana/web3.js";
import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { SOLANA_TOKENS } from "../services/tokens.js";

async function main(): Promise<void> {
  let critical = 0;
  const connection = new Connection(config.SOLANA_RPC_URL, "confirmed");
  const wallets = await pool.query<{ address: string }>("SELECT address FROM tracked_wallets WHERE chain='SOLANA' AND enabled=TRUE ORDER BY id");
  for (const wallet of wallets.rows) {
    try {
      const owner = new PublicKey(wallet.address);
      const sources = await connection.getTokenAccountsByOwner(owner, { programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") });
      const manual = await pool.query("SELECT * FROM tracked_solana_sources WHERE wallet_address=$1 AND enabled=TRUE", [wallet.address]);
      const cursors = await pool.query("SELECT key,value,updated_at FROM sync_state WHERE key LIKE $1 ORDER BY key", [`solana:${wallet.address}:%`]);
      const failures = await pool.query<{ count: string }>("SELECT COUNT(*)::TEXT AS count FROM indexer_failures WHERE chain='SOLANA' AND source=$1 AND resolved_at IS NULL", [wallet.address]);
      console.info({ wallet: wallet.address, supportedMints: [...SOLANA_TOKENS.keys()], currentTokenAccounts: sources.value.length, manualSources: manual.rowCount, cursors: cursors.rows, unresolvedFailures: Number(failures.rows[0]?.count ?? 0) });
    } catch (error) {
      critical += 1;
      console.error({ wallet: wallet.address, error: error instanceof Error ? error.message : String(error) });
    }
  }
  console.warn("RPC archival history varies by provider; closed historical token accounts require manual source configuration.");
  process.exitCode = critical > 0 ? 1 : 0;
}

void main().finally(() => pool.end());
