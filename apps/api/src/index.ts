import http from "node:http";

import cors from "cors";
import express from "express";
import helmet from "helmet";

import { config } from "./config.js";
import { syncAll } from "./services/syncService.js";
import { dashboardRouter } from "./routes/dashboardRoutes.js";

// Keep your existing route imports here.
// import { createDashboardRouter } from "./routes/dashboardRoutes.js";

const app = express();
const server = http.createServer(app);

app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

app.use(
  cors({
    origin: config.WEB_ORIGIN,
    credentials: true,
  })
);

app.use(express.json({ limit: "256kb" }));

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    service: "oynk-crossborder-dashboard-api",
  });
});

app.use("/api/dashboard", dashboardRouter);
// Keep your existing API routes here.
// app.use("/api/dashboard", createDashboardRouter());

server.listen(config.API_PORT, "0.0.0.0", () => {
  console.info(
    `Oynk dashboard API on ` + `http://localhost:${config.API_PORT}`
  );

  if (config.SYNC_ON_START) {
    void syncAll().catch((error) => {
      console.error("[sync] Initial synchronization failed", error);
    });
  }

  const intervalMilliseconds = config.SYNC_INTERVAL_MINUTES * 60 * 1_000;

  setInterval(() => {
    void syncAll().catch((error) => {
      console.error("[sync] Scheduled synchronization failed", error);
    });
  }, intervalMilliseconds);
});
