import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { z } from "zod";

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);

/**
 * Load the monorepo root environment first.
 *
 * apps/api/src/config.ts
 *          ↓ ../../../
 * repository/.env
 */
dotenv.config({
	path: path.resolve(currentDirectory, "../../../.env"),
	override: true,
	quiet: true,
});

/**
 * Allow apps/api/.env to override root values.
 */
dotenv.config({
	path: path.resolve(currentDirectory, "../../.env"),
	override: true,
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
	CORS_ORIGINS: z.string().default("http://localhost:5173,https://oynk.io"),

	BSC_RPC_URL: z.string().url(),
	SOLANA_RPC_URL: z.string().url(),

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
});

export const config = schema.parse(process.env);

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

console.info("[config]", {
	database: maskDatabaseUrl(config.DATABASE_URL),
	allowedOrigins,
	bscRpc: config.BSC_RPC_URL,
	solanaRpc: config.SOLANA_RPC_URL,
	bscStartBlock: config.BSC_START_BLOCK,
	bscInitialChunkSize: config.BSC_INITIAL_CHUNK_SIZE,
	bscMaximumChunkSize: config.BSC_MAX_CHUNK_SIZE,
	bscMinimumChunkSize: config.BSC_MIN_CHUNK_SIZE,
	solanaSignatureLimit: config.SOLANA_SIGNATURE_LIMIT,
	syncIntervalMinutes: config.SYNC_INTERVAL_MINUTES,
	syncOnStart: config.SYNC_ON_START,
});
