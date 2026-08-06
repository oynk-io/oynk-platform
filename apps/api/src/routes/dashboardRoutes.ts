import { Router } from "express";

import { getDashboardData } from "../services/dashboardService.js";
import {
  getSyncStatus,
  isSyncRunning,
  syncAll,
} from "../services/syncService.js";

export const dashboardRouter = Router();

dashboardRouter.get("/", async (request, response) => {
  try {
    const chain =
      typeof request.query.chain === "string"
        ? request.query.chain.toUpperCase()
        : "ALL";

    if (!["ALL", "BSC", "SOLANA"].includes(chain)) {
      response.status(400).json({
        error: "Invalid chain filter",
      });

      return;
    }

    const dashboard = await getDashboardData(chain as "ALL" | "BSC" | "SOLANA");

    response.json(dashboard);
  } catch (error) {
    console.error("[dashboard] Unable to load data", error);

    response.status(500).json({
      error: "Unable to load dashboard data",
    });
  }
});

dashboardRouter.post("/sync", async (_request, response) => {
  if (isSyncRunning()) {
    response.status(409).json({
      error: "Synchronization is already running",
      status: getSyncStatus(),
    });

    return;
  }

  void syncAll().catch((error) => {
    console.error("[dashboard] Manual sync failed", error);
  });

  response.status(202).json({
    accepted: true,
    status: getSyncStatus(),
  });
});

dashboardRouter.get("/sync", (_request, response) => {
  response.json(getSyncStatus());
});
