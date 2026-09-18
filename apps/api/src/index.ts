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
import { consumerRouter, paystackWebhook } from './consumer/routes.js';
import { reconcilePendingDeposits } from './consumer/service.js';

import { newsletterRouter, newsletterService } from './newsletter/routes.js';
import { sendEmail } from './email/emailService.js';
import { rampControlRouter } from './ramp/routes.js';
import { processRampExecutions } from './ramp/worker.js';

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

app.use('/api/paystack/webhook', paystackWebhook);
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

if (!config.CONSUMER_ONLY) {
 app.use("/api/dashboard", dashboardRouter);
 app.use("/api/sync", syncRouter);
 app.use("/api/auth", authRouter);
 app.use("/api/compliance", complianceRouter);
}
app.use('/api/consumer',consumerRouter);
app.use('/api/newsletter',newsletterRouter);
// Control APIs remain available in consumer-only deployments, but are guarded
// by internal-organization RBAC and CSRF on every mutation.
app.use('/api/control/ramps',rampControlRouter);

server.listen(config.API_PORT, "0.0.0.0", () => {
	console.info(
		`Oynk dashboard API on ` + `http://localhost:${config.API_PORT}`,
	);

	if (!config.CONSUMER_ONLY && config.SYNC_ON_START) {
		void syncAll().catch((error) => {
			console.error("[sync] Initial synchronization failed", error);
		});
	}

	const intervalMilliseconds = config.SYNC_INTERVAL_MINUTES * 60 * 1_000;

	const syncInterval = config.CONSUMER_ONLY ? undefined : setInterval(() => {
		void syncAll().catch((error) => {
			console.error("[sync] Scheduled synchronization failed", error);
		});
	}, intervalMilliseconds);
 let newsletterBusy = false;
 const newsletterInterval = setInterval(() => {
   if (newsletterBusy) return;
   newsletterBusy = true;
   void newsletterService.deliver(sendEmail,config.API_PUBLIC_URL,config.EMAIL_PROVIDER==='development')
     .then(()=>newsletterService.cleanup())
     .catch(()=>console.error('[newsletter] Queue unavailable'))
     .finally(()=>{newsletterBusy=false;});
 },5000);
 const fundingInterval = setInterval(() => { void reconcilePendingDeposits().catch(() => console.error('[funding] Reconciliation unavailable')); },30000);
 const rampExecutionInterval=setInterval(()=>{void processRampExecutions().catch(()=>console.error('[ramp] Execution unavailable'));},config.RAMP_EXECUTION_INTERVAL_MS);

	async function shutdown(signal: string): Promise<void> {
		console.info(`[shutdown] ${signal} received`);
		clearInterval(syncInterval);
  clearInterval(fundingInterval);
  clearInterval(rampExecutionInterval);
  clearInterval(newsletterInterval);
		server.close(async () => {
			await pool.end();
			process.exit(0);
		});
	}
	process.once("SIGINT", () => void shutdown("SIGINT"));
	process.once("SIGTERM", () => void shutdown("SIGTERM"));
});
