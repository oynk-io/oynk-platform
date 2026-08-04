import { pool } from "../db/pool.js";
import { syncAll } from "../services/syncService.js";

async function main(): Promise<void> {
  try {
    console.info("[sync-script] Starting synchronization");

    await syncAll();

    console.info("[sync-script] Synchronization finished");
  } catch (error) {
    console.error("[sync-script] Synchronization failed", error);

    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
