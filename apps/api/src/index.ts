import http from "node:http";

import cors from "cors";
import express from "express";
import helmet from "helmet";

import { allowedOrigins, config } from "./config.js";
import { syncAll } from "./services/syncService.js";
import { dashboardRouter } from "./routes/dashboardRoutes.js";
import { syncRouter } from "./routes/syncRoutes.js";
import { pool } from "./db/pool.js";
import { authRouter } from "./routes/authRoutes.js";
import { complianceRouter } from "./routes/complianceRoutes.js";

const app = express();
const server = http.createServer(app);

app.use(
	helmet({
		crossOriginResourcePolicy: false,
	}),
);

app.use(
	cors({
		origin: allowedOrigins,
		credentials: true,
	}),
);

app.use(express.json({ limit: "256kb" }));

app.get("/api/health", (_request, response) => {
	response.json({
		ok: true,
		service: "oynk-crossborder-dashboard-api",
	});
});
app.get("/health/live", (_request, response) => response.json({ ok: true }));
app.get("/health/ready", async (_request, response) => {
	try {
		await pool.query("SELECT 1");
		response.json({ ok: true, database: "available", configuration: "valid" });
	} catch {
		response.status(503).json({ ok: false, database: "unavailable" });
	}
});

app.use("/api/dashboard", dashboardRouter);
app.use("/api/sync", syncRouter);
app.use("/api/auth", authRouter);
app.use("/api/compliance", complianceRouter);

server.listen(config.API_PORT, "0.0.0.0", () => {
	console.info(
		`Oynk dashboard API on ` + `http://localhost:${config.API_PORT}`,
	);

	if (config.SYNC_ON_START) {
		void syncAll().catch((error) => {
			console.error("[sync] Initial synchronization failed", error);
		});
	}

	const intervalMilliseconds = config.SYNC_INTERVAL_MINUTES * 60 * 1_000;

	const syncInterval = setInterval(() => {
		void syncAll().catch((error) => {
			console.error("[sync] Scheduled synchronization failed", error);
		});
	}, intervalMilliseconds);

	async function shutdown(signal: string): Promise<void> {
		console.info(`[shutdown] ${signal} received`);
		clearInterval(syncInterval);
		server.close(async () => {
			await pool.end();
			process.exit(0);
		});
	}
	process.once("SIGINT", () => void shutdown("SIGINT"));
	process.once("SIGTERM", () => void shutdown("SIGTERM"));
});
