import {
  Interface,
  JsonRpcProvider,
  formatUnits,
  id,
  zeroPadValue,
  type Log,
} from "ethers";

import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { BSC_TOKENS, type BscToken } from "../services/tokens.js";
import { multiplyDecimalStrings } from "../utils/decimal.js";

type Direction = "INFLOW" | "OUTFLOW";

type TrackedWalletRow = {
  address: string;
};

type SyncStateRow = {
  value: string;
};

type ReadRangeInput = {
  token: BscToken;
  walletTopics: string[];
  direction: Direction;
  fromBlock: number;
  toBlock: number;
};

type PersistLogInput = {
  log: Log;
  token: BscToken;
  direction: Direction;
  trackedWallets: Set<string>;
  blockTimestamp: number;
};

type ProcessLogsInput = {
  logs: Log[];
  token: BscToken;
  direction: Direction;
  trackedWallets: Set<string>;
  blockTimestampCache: Map<number, number>;
};

type SyncBlockRangeInput = {
  fromBlock: number;
  toBlock: number;
  trackedWallets: Set<string>;
  walletTopics: string[];
  blockTimestampCache: Map<number, number>;
};

const provider = new JsonRpcProvider(config.BSC_RPC_URL);

const transferInterface = new Interface([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

const transferTopic = id("Transfer(address,address,uint256)");

const GLOBAL_CURSOR_KEY = "bsc:global:last-indexed-block";

function normalizeAddress(value: string): string {
  return value.trim().toLowerCase();
}

function addressToTopic(address: string): string {
  return zeroPadValue(normalizeAddress(address), 32);
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRateLimitError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();

  return (
    message.includes("429") ||
    message.includes("too many requests") ||
    message.includes("rate limit") ||
    message.includes("rate-limit") ||
    message.includes("request limit")
  );
}

function isRetryableRpcError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();

  return (
    isRateLimitError(error) ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("socket hang up") ||
    message.includes("network error") ||
    message.includes("connection reset") ||
    message.includes("temporarily unavailable") ||
    message.includes("gateway timeout") ||
    message.includes("bad gateway")
  );
}

function isBlockRangeError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();

  return (
    message.includes("block range") ||
    message.includes("range is too wide") ||
    message.includes("query returned more than") ||
    message.includes("query timeout exceeded") ||
    message.includes("response size exceeded") ||
    message.includes("too many results") ||
    message.includes("limit exceeded") ||
    message.includes("-32005") ||
    message.includes("-32602")
  );
}

async function withRetry<T>(
  operation: () => Promise<T>,
  label: string
): Promise<T> {
  let delayMilliseconds = 1_000;

  for (let attempt = 1; attempt <= config.RPC_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const finalAttempt = attempt === config.RPC_RETRY_ATTEMPTS;

      if (!isRetryableRpcError(error) || finalAttempt) {
        throw error;
      }

      console.warn(
        `[bsc] ${label} failed. Retrying in ` +
          `${delayMilliseconds}ms ` +
          `(${attempt}/${config.RPC_RETRY_ATTEMPTS})`
      );

      await sleep(delayMilliseconds);

      delayMilliseconds = Math.min(delayMilliseconds * 2, 20_000);
    }
  }

  throw new Error(`${label} exhausted retry attempts`);
}

async function getTrackedWallets(): Promise<string[]> {
  const result = await pool.query<TrackedWalletRow>(
    `
        SELECT address
        FROM tracked_wallets
        WHERE chain = 'BSC'
          AND enabled = TRUE
        ORDER BY id ASC
      `
  );

  return result.rows.map((row) => normalizeAddress(row.address));
}

async function getStartingBlock(latestBlock: number): Promise<number> {
  const result = await pool.query<SyncStateRow>(
    `
      SELECT value
      FROM sync_state
      WHERE key = $1
    `,
    [GLOBAL_CURSOR_KEY]
  );

  const storedValue = result.rows[0]?.value;

  if (storedValue !== undefined) {
    const storedBlock = Number(storedValue);

    if (Number.isSafeInteger(storedBlock) && storedBlock >= 0) {
      return Math.min(storedBlock + 1, latestBlock + 1);
    }
  }

  return Math.min(config.BSC_START_BLOCK, latestBlock);
}

async function saveCursor(blockNumber: number): Promise<void> {
  await pool.query(
    `
      INSERT INTO sync_state (
        key,
        value,
        updated_at
      )
      VALUES ($1, $2, NOW())
      ON CONFLICT (key)
      DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = NOW()
    `,
    [GLOBAL_CURSOR_KEY, String(blockNumber)]
  );
}

async function readLogs(input: ReadRangeInput): Promise<Log[]> {
  const topics =
    input.direction === "INFLOW"
      ? [transferTopic, null, input.walletTopics]
      : [transferTopic, input.walletTopics];

  return withRetry(
    () =>
      provider.getLogs({
        address: normalizeAddress(input.token.address),
        fromBlock: input.fromBlock,
        toBlock: input.toBlock,
        topics,
      }),
    [input.token.symbol, input.direction, input.fromBlock, input.toBlock].join(
      ":"
    )
  );
}

async function getBlockTimestamp(
  blockNumber: number,
  cache: Map<number, number>
): Promise<number> {
  const cachedTimestamp = cache.get(blockNumber);

  if (cachedTimestamp !== undefined) {
    return cachedTimestamp;
  }

  const block = await withRetry(
    () => provider.getBlock(blockNumber),
    `block:${blockNumber}`
  );

  if (!block) {
    throw new Error(`RPC returned no data for BSC block ${blockNumber}`);
  }

  cache.set(blockNumber, block.timestamp);

  return block.timestamp;
}

async function persistTransfer(input: PersistLogInput): Promise<boolean> {
  const parsed = transferInterface.parseLog(input.log);

  if (!parsed) {
    return false;
  }

  const sender = normalizeAddress(String(parsed.args.from));

  const recipient = normalizeAddress(String(parsed.args.to));

  const rawAmount = parsed.args.value as bigint;

  const trackedWallet = input.direction === "INFLOW" ? recipient : sender;

  if (!input.trackedWallets.has(trackedWallet)) {
    return false;
  }

  const counterparty = input.direction === "INFLOW" ? sender : recipient;

  const amount = formatUnits(rawAmount, input.token.decimals);

  const usdValue = multiplyDecimalStrings(amount, input.token.fixedUsdPrice);

  const transactionHash = input.log.transactionHash;

  const logIndex = input.log.index;

  const transferId = [
    "BSC",
    transactionHash,
    String(logIndex),
    trackedWallet,
    input.direction,
  ].join(":");

  await pool.query(
    `
      INSERT INTO transfers (
        id,
        chain,
        wallet_address,
        tx_hash,
        log_index,
        block_number,
        block_time,
        direction,
        token_address,
        asset_symbol,
        decimals,
        raw_amount,
        amount,
        usd_value,
        counterparty,
        status,
        explorer_url
      )
      VALUES (
        $1,
        'BSC',
        $2,
        $3,
        $4,
        $5,
        to_timestamp($6),
        $7,
        $8,
        $9,
        $10,
        $11,
        $12,
        $13,
        $14,
        'CONFIRMED',
        $15
      )
      ON CONFLICT (
        chain,
        tx_hash,
        log_index,
        wallet_address,
        direction
      )
      DO UPDATE SET
        block_number = EXCLUDED.block_number,
        block_time = EXCLUDED.block_time,
        token_address = EXCLUDED.token_address,
        asset_symbol = EXCLUDED.asset_symbol,
        decimals = EXCLUDED.decimals,
        raw_amount = EXCLUDED.raw_amount,
        amount = EXCLUDED.amount,
        usd_value = EXCLUDED.usd_value,
        counterparty = EXCLUDED.counterparty,
        status = EXCLUDED.status,
        explorer_url = EXCLUDED.explorer_url
    `,
    [
      transferId,
      trackedWallet,
      transactionHash,
      logIndex,
      String(input.log.blockNumber),
      input.blockTimestamp,
      input.direction,
      normalizeAddress(input.token.address),
      input.token.symbol,
      input.token.decimals,
      rawAmount.toString(),
      amount,
      usdValue,
      counterparty,
      `https://bscscan.com/tx/${transactionHash}`,
    ]
  );

  console.info(
    `[bsc] Stored ${input.direction} ` +
      `${amount} ${input.token.symbol} ` +
      `for ${trackedWallet}; ` +
      `usd=${usdValue}; ` +
      `counterparty=${counterparty}`
  );

  return true;
}

async function processLogs(input: ProcessLogsInput): Promise<number> {
  let storedCount = 0;

  for (const log of input.logs) {
    const blockTimestamp = await getBlockTimestamp(
      log.blockNumber,
      input.blockTimestampCache
    );

    const stored = await persistTransfer({
      log,
      token: input.token,
      direction: input.direction,
      trackedWallets: input.trackedWallets,
      blockTimestamp,
    });

    if (stored) {
      storedCount += 1;
    }
  }

  return storedCount;
}

async function syncBlockRange(input: SyncBlockRangeInput): Promise<number> {
  let storedCount = 0;

  for (const token of BSC_TOKENS) {
    const incomingLogs = await readLogs({
      token,
      walletTopics: input.walletTopics,
      direction: "INFLOW",
      fromBlock: input.fromBlock,
      toBlock: input.toBlock,
    });

    const outgoingLogs = await readLogs({
      token,
      walletTopics: input.walletTopics,
      direction: "OUTFLOW",
      fromBlock: input.fromBlock,
      toBlock: input.toBlock,
    });

    console.info(
      `[bsc] ${token.symbol} ` +
        `${input.fromBlock}-${input.toBlock}: ` +
        `${incomingLogs.length} inflows, ` +
        `${outgoingLogs.length} outflows`
    );

    storedCount += await processLogs({
      logs: incomingLogs,
      token,
      direction: "INFLOW",
      trackedWallets: input.trackedWallets,
      blockTimestampCache: input.blockTimestampCache,
    });

    storedCount += await processLogs({
      logs: outgoingLogs,
      token,
      direction: "OUTFLOW",
      trackedWallets: input.trackedWallets,
      blockTimestampCache: input.blockTimestampCache,
    });
  }

  return storedCount;
}

/**
 * Synchronizes every enabled BSC tracked wallet
 * using one shared historical scan.
 */
export async function syncBsc(): Promise<void> {
  const walletAddresses = await getTrackedWallets();

  if (walletAddresses.length === 0) {
    console.info("[bsc] No enabled BSC wallets configured");

    return;
  }

  const trackedWallets = new Set(walletAddresses.map(normalizeAddress));

  const walletTopics = walletAddresses.map(addressToTopic);

  const latestBlock = await withRetry(
    () => provider.getBlockNumber(),
    "latest-block"
  );

  let currentBlock = await getStartingBlock(latestBlock);

  if (currentBlock > latestBlock) {
    console.info(`[bsc] Already current at block ${latestBlock}`);

    return;
  }

  let chunkSize = Math.min(
    config.BSC_INITIAL_CHUNK_SIZE,
    config.BSC_MAX_CHUNK_SIZE
  );

  let totalStored = 0;

  const blockTimestampCache = new Map<number, number>();

  console.info("[bsc] Starting shared wallet sync", {
    wallets: walletAddresses.length,
    tokens: BSC_TOKENS.map((token) => token.symbol),
    fromBlock: currentBlock,
    latestBlock,
    initialChunkSize: chunkSize,
  });

  while (currentBlock <= latestBlock) {
    const toBlock = Math.min(latestBlock, currentBlock + chunkSize - 1);

    try {
      console.info(
        `[bsc] Processing blocks ` +
          `${currentBlock}-${toBlock} ` +
          `(chunk ${chunkSize})`
      );

      const rangeStored = await syncBlockRange({
        fromBlock: currentBlock,
        toBlock,
        trackedWallets,
        walletTopics,
        blockTimestampCache,
      });

      totalStored += rangeStored;

      await saveCursor(toBlock);

      console.info(
        `[bsc] Completed ` +
          `${currentBlock}-${toBlock}; ` +
          `${rangeStored} records stored; ` +
          `${totalStored} total`
      );

      currentBlock = toBlock + 1;

      if (chunkSize < config.BSC_MAX_CHUNK_SIZE) {
        chunkSize = Math.min(
          config.BSC_MAX_CHUNK_SIZE,
          Math.max(chunkSize + 1, Math.floor(chunkSize * 1.25))
        );
      }

      if (config.BSC_CHUNK_DELAY_MS > 0) {
        await sleep(config.BSC_CHUNK_DELAY_MS);
      }
    } catch (error) {
      if (isBlockRangeError(error) && chunkSize > config.BSC_MIN_CHUNK_SIZE) {
        const reducedChunkSize = Math.max(
          config.BSC_MIN_CHUNK_SIZE,
          Math.floor(chunkSize / 2)
        );

        console.warn(
          `[bsc] RPC rejected blocks ` +
            `${currentBlock}-${toBlock}. ` +
            `Reducing chunk from ` +
            `${chunkSize} to ` +
            `${reducedChunkSize}.`
        );

        chunkSize = reducedChunkSize;

        continue;
      }

      console.error(
        `[bsc] Failed at blocks ` + `${currentBlock}-${toBlock}`,
        error
      );

      throw error;
    }
  }

  console.info(
    `[bsc] Synchronization complete at ` +
      `block ${latestBlock}; ` +
      `${totalStored} records stored`
  );
}
