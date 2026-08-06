import { syncBsc } from "../indexers/bscIndexer.js";
import { syncSolanaWallet } from "../indexers/solanaIndexer.js";
import { pool } from "../db/pool.js";
import type { Chain, SynchronizationStatus } from "@oynk/shared";
import { pairComplementaryTransferLegs } from "./pairingService.js";
import { randomUUID } from "node:crypto";

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

export async function syncAll(mode = "FULL", requestedRunId?: string): Promise<{ runId: string; status: SynchronizationStatus }> {
  const runId = requestedRunId ?? randomUUID();
  if (synchronizationRunning) {
    console.info("[sync] Synchronization already running; skipping");

    return { runId, status: getSyncStatus() };
  }

  const lockClient = await pool.connect();
  const lock = await lockClient.query<{ acquired: boolean }>(
    "SELECT pg_try_advisory_lock(764239105) AS acquired"
  );
  if (!lock.rows[0]?.acquired) {
    lockClient.release();
    throw new Error("Synchronization is already running in another process");
  }

  const startedAt = new Date().toISOString();
  const successfulChains: Chain[] = [];
  const failedChains: Chain[] = [];
  let transfersInserted = 0;

  try {
    await pool.query(
      "INSERT INTO sync_runs(id, chain, mode, status, started_at) VALUES ($1, 'ALL', $2, 'RUNNING', $3)",
      [runId, mode, startedAt]
    );
    synchronizationRunning = true;
    synchronizationStatus = {
      state: "RUNNING",
      startedAt,
      completedAt: null,
      successfulChains,
      failedChains,
    };
    console.info("[sync] Starting BSC synchronization");

    try {
      const result = await syncBsc();
      transfersInserted += result.transfersStored;
      (result.pairsFailed > 0 ? failedChains : successfulChains).push("BSC");

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
    try {
      await pool.query(
        `UPDATE sync_runs SET status = $2, completed_at = $3,
         transfers_inserted = $4, error_count = $5,
         metadata = $6::JSONB WHERE id = $1`,
        [runId, state, synchronizationStatus.completedAt, transfersInserted, failedChains.length, JSON.stringify({ successfulChains, failedChains })]
      );
    } finally {
      await lockClient.query("SELECT pg_advisory_unlock(764239105)");
      lockClient.release();
    }
  }

  return { runId, status: getSyncStatus() };
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
