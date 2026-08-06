import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { z } from "zod";

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);

/** Load the package environment, then fill missing values from the monorepo root. */
dotenv.config({
	path: path.resolve(currentDirectory, "../.env"),
	override: false,
	quiet: true,
});

dotenv.config({
	path: path.resolve(currentDirectory, "../../../.env"),
	override: false,
	quiet: true,
});

const schema = z.object({
	DATABASE_URL: z.string().min(1),

	API_PORT: z.coerce.number().int().positive().default(4000),
	ALLOWED_ORIGIN: z.string().default("http://localhost:5173"),

	/**
	 * Comma-separated list of origins allowed to call the API.
	 * When unset, falls back to ALLOWED_ORIGIN.
	 */
	CORS_ORIGINS: z.string().default("http://localhost:5173,http://localhost:5174,https://oynk.io,https://console.oynk.io"),

	BSC_RPC_URL: z.string().url(),
	SOLANA_RPC_URL: z.string().url(),
	ADMIN_API_KEY: z.string().min(32).default("development-only-admin-key-change-me"),
	SOLANA_ADDITIONAL_SOURCE_ACCOUNTS: z.string().default(""),

	/**
	 * Conservative historical start.
	 *
	 * This is based on the oldest transaction block you supplied.
	 * If the earliest relevant USDT/USDC transfer is later, you may
	 * increase this value to speed up the initial backfill.
	 */
	BSC_START_BLOCK: z.coerce.number().int().nonnegative().default(19_746_745),

	/**
	 * Initial block range attempted by eth_getLogs.
	 * The indexer automatically reduces this when the RPC rejects
	 * a large range.
	 */
	BSC_INITIAL_CHUNK_SIZE: z.coerce.number().int().min(500).default(50_000),

	/**
	 * Largest range the adaptive indexer may use.
	 */
	BSC_MAX_CHUNK_SIZE: z.coerce.number().int().min(500).default(50_000),

	/**
	 * Smallest allowed range before a provider error is surfaced.
	 */
	BSC_MIN_CHUNK_SIZE: z.coerce.number().int().min(10).default(500),
	BSC_CONFIRMATION_DEPTH: z.coerce.number().int().nonnegative().default(20),
	BSC_REORG_REWIND_BLOCKS: z.coerce.number().int().nonnegative().default(30),
	BSC_CHUNK_GROWTH_SUCCESS_RANGES: z.coerce.number().int().positive().default(5),
	BSC_CHUNK_GROWTH_STEP: z.coerce.number().int().positive().default(250),
	BSC_CHUNK_JITTER_MS: z.coerce.number().int().nonnegative().default(100),

	/**
	 * Pause after each successfully indexed range.
	 */
	BSC_CHUNK_DELAY_MS: z.coerce.number().int().nonnegative().default(100),

	/**
	 * Number of attempts for temporary RPC errors.
	 */
	RPC_RETRY_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),

	SOLANA_SIGNATURE_LIMIT: z.coerce
		.number()
		.int()
		.min(1)
		.max(1_000)
		.default(100),

	SYNC_INTERVAL_MINUTES: z.coerce.number().int().positive().default(15),

	/**
	 * Set false after the initial backfill if you do not want a
	 * startup synchronization.
	 */
	SYNC_ON_START: z
		.enum(["true", "false"])
		.default("true")
		.transform((value) => value === "true"),
	APP_ENV: z.enum(["development", "test", "production"]).default("development"),
	PLATFORM_MODE: z.enum(["SANDBOX", "TEST", "LIVE"]).default("SANDBOX"),
	PUBLIC_SITE_URL: z.string().url().default("http://localhost:5173"),
	CONSOLE_SITE_URL: z.string().url().default("http://localhost:5174"),
	API_PUBLIC_URL: z.string().url().default("http://localhost:4000"),
	AUTH_SESSION_COOKIE_NAME: z.string().min(1).default("oynk_session"),
	AUTH_SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(12),
	AUTH_PREAUTH_TTL_MINUTES: z.coerce.number().int().min(5).max(60).default(15),
	AUTH_TOKEN_PEPPER: z.string().min(32).default("development-only-pepper-change-me-000000"),
	AUTH_PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(120).default(30),
	AUTH_OTP_TTL_MINUTES: z.coerce.number().int().min(2).max(30).default(10),
	AUTH_OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
	AUTH_OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(15).max(600).default(60),
	EMAIL_PROVIDER: z.enum(["development", "zoho-smtp"]).default("development"),
	ZOHO_SMTP_HOST: z.string().min(1).default("smtp.zoho.com"),
	ZOHO_SMTP_PORT: z.coerce.number().int().positive().default(465),
	ZOHO_SMTP_SECURE: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
	ZOHO_SMTP_USERNAME: z.string().default(""),
	ZOHO_SMTP_APP_PASSWORD: z.string().default(""),
	EMAIL_FROM_NAME: z.string().min(1).default("Oynk"),
	EMAIL_FROM_ADDRESS: z.string().email().default("no-reply@oynk.io"),
	EMAIL_REPLY_TO: z.string().email().default("support@oynk.io"),
});

export const config = schema.parse(process.env);

if (config.APP_ENV === "production" && config.EMAIL_PROVIDER === "development") {
	throw new Error("EMAIL_PROVIDER=development is not allowed in production");
}
if (config.APP_ENV === "production" && config.AUTH_TOKEN_PEPPER.startsWith("development-only")) {
	throw new Error("AUTH_TOKEN_PEPPER must be configured in production");
}
if (config.APP_ENV === "production" && config.ADMIN_API_KEY.startsWith("development-only")) {
	throw new Error("ADMIN_API_KEY must be configured in production");
}
if (config.EMAIL_PROVIDER === "zoho-smtp" && (!config.ZOHO_SMTP_USERNAME || !config.ZOHO_SMTP_APP_PASSWORD)) {
	throw new Error("Zoho SMTP requires ZOHO_SMTP_USERNAME and ZOHO_SMTP_APP_PASSWORD");
}

export const allowedOrigins = (() => {
	const list = (config.CORS_ORIGINS || "")
		.split(",")
		.map((origin) => origin.trim())
		.filter((origin) => origin.length > 0);

	return list.length > 0 ? list : [config.ALLOWED_ORIGIN];
})();

function maskDatabaseUrl(value: string): string {
	return value.replace(/:[^:@/]+@/, ":***@");
}

function redactUrl(value: string): string {
	try {
		const url = new URL(value);
		return `${url.protocol}//${url.host}/…`;
	} catch {
		return "[redacted]";
	}
}

console.info("[config]", {
	database: maskDatabaseUrl(config.DATABASE_URL),
	allowedOrigins,
	bscRpc: redactUrl(config.BSC_RPC_URL),
	solanaRpc: redactUrl(config.SOLANA_RPC_URL),
	bscStartBlock: config.BSC_START_BLOCK,
	bscInitialChunkSize: config.BSC_INITIAL_CHUNK_SIZE,
	bscMaximumChunkSize: config.BSC_MAX_CHUNK_SIZE,
	bscMinimumChunkSize: config.BSC_MIN_CHUNK_SIZE,
	solanaSignatureLimit: config.SOLANA_SIGNATURE_LIMIT,
	syncIntervalMinutes: config.SYNC_INTERVAL_MINUTES,
	syncOnStart: config.SYNC_ON_START,
	appEnvironment: config.APP_ENV,
	platformMode: config.PLATFORM_MODE,
	emailProvider: config.EMAIL_PROVIDER,
});
