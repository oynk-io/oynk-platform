import { Router } from "express";
import { pool } from "../db/pool.js";
import { getSyncStatus } from "../services/syncService.js";

export const syncRouter = Router();

syncRouter.get("/status", (_request, response) => response.json(getSyncStatus()));

syncRouter.get("/runs", async (_request, response) => {
  const result = await pool.query("SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT 100");
  response.json({ runs: result.rows });
});

syncRouter.get("/runs/:id", async (request, response) => {
  const id = request.params.id;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    response.status(400).json({ error: "Invalid synchronization run ID" });
    return;
  }
  const result = await pool.query("SELECT * FROM sync_runs WHERE id = $1", [id]);
  if (!result.rows[0]) {
    response.status(404).json({ error: "Synchronization run not found" });
    return;
  }
  response.json(result.rows[0]);
});

syncRouter.get("/failures", async (_request, response) => {
  const result = await pool.query(
    "SELECT * FROM indexer_failures WHERE resolved_at IS NULL ORDER BY last_failed_at DESC LIMIT 200"
  );
  response.json({ failures: result.rows });
});
