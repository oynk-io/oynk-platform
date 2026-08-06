import { JsonRpcProvider, isAddress } from "ethers";
import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { bscCursorKey, normalizeBscAddress } from "../indexers/bscIndexer.js";
import { BSC_TOKENS } from "../services/tokens.js";

async function main(): Promise<void> {
  let critical = 0;
  const identities = new Set<string>();
  for (const token of BSC_TOKENS) {
    const address = normalizeBscAddress(token.address);
    if (!isAddress(address) || identities.has(address)) critical += 1;
    identities.add(address);
  }
  const wallets = await pool.query<{ address: string }>("SELECT address FROM tracked_wallets WHERE chain = 'BSC' AND enabled = TRUE ORDER BY id");
  const tip = await new JsonRpcProvider(config.BSC_RPC_URL).getBlockNumber();
  const safeTip = Math.max(0, tip - config.BSC_CONFIRMATION_DEPTH);
  for (const wallet of wallets.rows) {
    if (!isAddress(wallet.address)) critical += 1;
    for (const token of BSC_TOKENS) {
      const key = bscCursorKey(wallet.address, token.address);
      const cursor = await pool.query<{ value: string }>("SELECT value FROM sync_state WHERE key = $1", [key]);
      const value = Number(cursor.rows[0]?.value ?? -1);
      const count = await pool.query<{ count: string }>("SELECT COUNT(*)::TEXT AS count FROM transfers WHERE chain='BSC' AND LOWER(wallet_address)=LOWER($1) AND LOWER(token_address)=LOWER($2)", [wallet.address, token.address]);
      console.info({ wallet: wallet.address, token: token.symbol, contract: token.address, cursor: value >= 0 ? value : null, lag: value >= 0 ? safeTip - value : null, transfers: Number(count.rows[0]?.count ?? 0) });
      if (value > safeTip) critical += 1;
    }
  }
  process.exitCode = critical > 0 ? 1 : 0;
}

void main().finally(() => pool.end());
