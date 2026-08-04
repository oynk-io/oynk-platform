import { syncBsc } from "../indexers/bscIndexer.js";
import { syncSolanaWallet } from "../indexers/solanaIndexer.js";
import { pool } from "../db/pool.js";

type SolanaWalletRow = {
  address: string;
};

let synchronizationRunning = false;

async function getSolanaWallets(): Promise<string[]> {
  const result = await pool.query<SolanaWalletRow>(
    `
      SELECT address
      FROM tracked_wallets
      WHERE chain = 'SOLANA'
        AND enabled = TRUE
      ORDER BY id ASC
    `
  );

  return result.rows.map((row) => row.address);
}

export async function syncAll(): Promise<void> {
  if (synchronizationRunning) {
    console.info("[sync] Synchronization already running; skipping");

    return;
  }

  synchronizationRunning = true;

  try {
    console.info("[sync] Starting BSC synchronization");

    try {
      await syncBsc();

      console.info("[sync] BSC synchronization completed");
    } catch (error) {
      console.error("[sync] BSC synchronization failed", error);
    }

    const solanaWallets = await getSolanaWallets();

    for (const address of solanaWallets) {
      console.info(`[sync] Starting Solana synchronization for ${address}`);

      try {
        await syncSolanaWallet(address);

        console.info(`[sync] Solana synchronization completed for ${address}`);
      } catch (error) {
        console.error(
          `[sync] Solana synchronization failed for ${address}`,
          error
        );
      }
    }
  } finally {
    synchronizationRunning = false;
  }
}

export function isSyncRunning(): boolean {
  return synchronizationRunning;
}
