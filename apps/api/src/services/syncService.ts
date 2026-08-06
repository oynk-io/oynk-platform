import { syncBsc } from "../indexers/bscIndexer.js";
import { syncSolanaWallet } from "../indexers/solanaIndexer.js";
import { pool } from "../db/pool.js";
import type { Chain, SynchronizationStatus } from "@oynk/shared";
import { pairComplementaryTransferLegs } from "./pairingService.js";

type SolanaWalletRow = {
  address: string;
};

let synchronizationRunning = false;
let synchronizationStatus: SynchronizationStatus = {
  state: "IDLE",
  startedAt: null,
  completedAt: null,
  successfulChains: [],
  failedChains: [],
};

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
  const startedAt = new Date().toISOString();
  const successfulChains: Chain[] = [];
  const failedChains: Chain[] = [];
  synchronizationStatus = {
    state: "RUNNING",
    startedAt,
    completedAt: null,
    successfulChains,
    failedChains,
  };

  try {
    console.info("[sync] Starting BSC synchronization");

    try {
      await syncBsc();
      successfulChains.push("BSC");

      console.info("[sync] BSC synchronization completed");
    } catch (error) {
      failedChains.push("BSC");
      console.error("[sync] BSC synchronization failed", error);
    }

    const solanaWallets = await getSolanaWallets();
    let solanaFailed = false;

    for (const address of solanaWallets) {
      console.info(`[sync] Starting Solana synchronization for ${address}`);

      try {
        await syncSolanaWallet(address);

        console.info(`[sync] Solana synchronization completed for ${address}`);
      } catch (error) {
        solanaFailed = true;
        console.error(
          `[sync] Solana synchronization failed for ${address}`,
          error
        );
      }
    }

    (solanaFailed ? failedChains : successfulChains).push("SOLANA");

    console.info("[sync] Matching complementary transfer legs");
    try {
      await pairComplementaryTransferLegs();
    } catch (error) {
      successfulChains.length = 0;

      for (const chain of ["BSC", "SOLANA"] as const) {
        if (!failedChains.includes(chain)) {
          failedChains.push(chain);
        }
      }

      throw error;
    }
    console.info("[sync] Complementary transfer legs matched");
  } catch (error) {
    for (const chain of ["BSC", "SOLANA"] as const) {
      if (!successfulChains.includes(chain) && !failedChains.includes(chain)) {
        failedChains.push(chain);
      }
    }

    throw error;
  } finally {
    synchronizationRunning = false;
    const state =
      failedChains.length === 0
        ? "COMPLETED"
        : successfulChains.length === 0
          ? "FAILED"
          : "PARTIAL";
    synchronizationStatus = {
      state,
      startedAt,
      completedAt: new Date().toISOString(),
      successfulChains: [...successfulChains],
      failedChains: [...failedChains],
    };
  }
}

export function isSyncRunning(): boolean {
  return synchronizationRunning;
}

export function getSyncStatus(): SynchronizationStatus {
  return {
    ...synchronizationStatus,
    successfulChains: [...synchronizationStatus.successfulChains],
    failedChains: [...synchronizationStatus.failedChains],
  };
}
