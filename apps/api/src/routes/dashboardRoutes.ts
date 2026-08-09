import { Router } from "express";
import { randomUUID, timingSafeEqual } from "node:crypto";

import { getDashboardData } from "../services/dashboardService.js";
import {
  getSyncStatus,
  isSyncRunning,
  syncAll,
} from "../services/syncService.js";
import { config } from "../config.js";

export const dashboardRouter = Router();

dashboardRouter.get("/", async (request, response) => {
  try {
    const chain =
      typeof request.query.chain === "string"
        ? request.query.chain.toUpperCase()
        : "ALL";

    if (!["ALL", "BSC", "SOLANA", "OFFCHAIN"].includes(chain)) {
      response.status(400).json({
        error: "Invalid chain filter",
      });

      return;
    }

    const dashboard = await getDashboardData(chain as "ALL" | "BSC" | "SOLANA" | "OFFCHAIN");

    response.json(dashboard);
  } catch (error) {
    console.error("[dashboard] Unable to load data", error);

    response.status(500).json({
      error: "Unable to load dashboard data",
    });
  }
});

const syncRequests = new Map<string, number[]>();

function authorized(value: string | undefined): boolean {
  if (!value) return false;
  const provided = Buffer.from(value);
  const expected = Buffer.from(config.ADMIN_API_KEY);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

dashboardRouter.post("/sync", async (request, response) => {
  if (!authorized(request.header("x-admin-api-key"))) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }

  const source = request.ip ?? "unknown";
  const now = Date.now();
  const recent = (syncRequests.get(source) ?? []).filter((time) => now - time < 60_000);
  if (recent.length >= 3) {
    response.status(429).json({ error: "Too many synchronization requests" });
    return;
  }
  recent.push(now);
  syncRequests.set(source, recent);

  if (isSyncRunning()) {
    response.status(409).json({
      error: "Synchronization is already running",
      status: getSyncStatus(),
    });

    return;
  }

  const runId = randomUUID();
  void syncAll("MANUAL", runId).catch((error) => {
    console.error("[dashboard] Manual sync failed", error);
  });

  response.status(202).json({
    accepted: true,
    runId,
    status: getSyncStatus(),
  });
});

dashboardRouter.get("/sync", (_request, response) => {
  response.json(getSyncStatus());
});
