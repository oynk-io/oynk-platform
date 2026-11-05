import { startChainActivityReconciliation } from './consumer/chainActivity.js';
import { randomUUID } from 'node:crypto';
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
import { vfdWebhook } from './consumer/vfdWebhook.js';

import { newsletterRouter, newsletterService } from './newsletter/routes.js';
import { sendEmail } from './email/emailService.js';
import { rampControlRouter } from './ramp/routes.js';
import { processRampExecutions } from './ramp/worker.js';
import { terminalRouter } from './terminal/routes.js';
import { reconcileTerminalPayments, reconcileTerminalRefunds } from './terminal/service.js';
import { businessControlRouter, businessRouter } from './business/routes.js';
import { martRouter } from './mart/routes.js';
import { reconcileMartLayawaySettlements, reconcileMartPayments, reconcileMartStock } from './mart/payments.js';
import { reconcileCartCheckouts, reconcileCartSettlements } from './mart/cart.js';
import { queueExpiredLayawayRefunds, reconcileMartRefunds } from './mart/refunds.js';
import { deliverMartPushNotifications } from './mart/notifications.js';
import { oynkGoRouter } from './oynkGo/routes.js';

const app = express();
app.set("trust proxy", config.TRUST_PROXY_HOPS);
app.use((_req,res,next)=>{res.setHeader("X-Request-ID",randomUUID());next();});
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
// Tier 3 images are capped at 4 MB each and uploaded one at a time. Other
// JSON endpoints retain the smaller request limit.
app.use('/api/consumer/quick-pay/tier-documents',express.json({limit:'6mb'}));
app.use('/api/mart/merchant/inventory/bulk',express.json({limit:'2mb'}));
app.use(express.json({ limit: "256kb" }));
app.use('/api/vfd/webhook',vfdWebhook);

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
 app.use('/api/business',businessRouter);
}
app.use('/api/consumer',consumerRouter);
app.use('/api/terminal',terminalRouter);
app.use('/api/mart',martRouter);
app.use('/api/oynk-go',oynkGoRouter);
app.use('/api/newsletter',newsletterRouter);
// Control APIs remain available in consumer-only deployments, but are guarded
// by internal-organization RBAC and CSRF on every mutation.
app.use('/api/control/ramps',rampControlRouter);
app.use('/api/control/businesses',businessControlRouter);

const stopChainReconciliation = startChainActivityReconciliation();
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
 const terminalReconciliationInterval=setInterval(()=>{void Promise.all([reconcileTerminalPayments(),reconcileTerminalRefunds()]).catch(()=>console.error('[terminal] Reconciliation unavailable'));},10000);
 const martPaymentReconciliationInterval=setInterval(()=>{void Promise.all([
  reconcileMartPayments(),
  reconcileMartLayawaySettlements(),
  reconcileCartCheckouts(),
  reconcileCartSettlements(),
  reconcileMartStock(),
  queueExpiredLayawayRefunds(),
  reconcileMartRefunds(),
  deliverMartPushNotifications(),
 ]).catch(()=>console.error('[mart] Payment, settlement, fulfillment, or notification reconciliation unavailable'));},15000);

	async function shutdown(signal: string): Promise<void> {
		console.info(`[shutdown] ${signal} received`);
		clearInterval(syncInterval);
  stopChainReconciliation();
  clearInterval(fundingInterval);
  clearInterval(rampExecutionInterval);
  clearInterval(terminalReconciliationInterval);
  clearInterval(martPaymentReconciliationInterval);
  clearInterval(newsletterInterval);
		server.close(async () => {
			await pool.end();
			process.exit(0);
		});
	}
	process.once("SIGINT", () => void shutdown("SIGINT"));
	process.once("SIGTERM", () => void shutdown("SIGTERM"));
});
