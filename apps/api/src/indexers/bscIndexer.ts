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
  walletAddress: string;
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

const provider = new JsonRpcProvider(config.BSC_RPC_URL);

const transferInterface = new Interface([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

const transferTopic = id("Transfer(address,address,uint256)");

export function bscCursorKey(walletAddress: string, tokenAddress: string): string {
  return [
    "bsc",
    normalizeAddress(walletAddress),
    normalizeAddress(tokenAddress),
    "last-indexed-block",
  ].join(":");
}
export function normalizeBscAddress(value: string): string {
  return value.trim().toLowerCase();
}
const normalizeAddress = normalizeBscAddress;

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

async function getStartingBlock(
  walletAddress: string,
  token: BscToken,
  latestBlock: number
): Promise<number> {
  const key = bscCursorKey(walletAddress, token.address);

  const result = await pool.query<{ value: string }>(
    `
      SELECT value
      FROM sync_state
      WHERE key = $1
    `,
    [key]
  );

  const storedValue = result.rows[0]?.value;

  if (storedValue !== undefined) {
    const storedBlock = Number(storedValue);

    if (Number.isSafeInteger(storedBlock) && storedBlock >= 0) {
      const rewound = Math.max(
        Math.max(config.BSC_START_BLOCK, token.startBlock ?? 0),
        storedBlock + 1 - config.BSC_REORG_REWIND_BLOCKS
      );
      return Math.min(rewound, latestBlock + 1);
    }
  }

  return Math.min(
    Math.max(config.BSC_START_BLOCK, token.startBlock ?? 0),
    latestBlock
  );
}

async function saveCursor(
  walletAddress: string,
  token: BscToken,
  blockNumber: number
): Promise<void> {
  const key = bscCursorKey(walletAddress, token.address);

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
    [key, String(blockNumber)]
  );
}

async function readLogs(input: ReadRangeInput): Promise<Log[]> {
  const walletTopic = addressToTopic(input.walletAddress);

  const topics =
    input.direction === "INFLOW"
      ? [transferTopic, null, walletTopic]
      : [transferTopic, walletTopic];

  return withRetry(
    () =>
      provider.getLogs({
        address: normalizeAddress(input.token.address),
        fromBlock: input.fromBlock,
        toBlock: input.toBlock,
        topics,
      }),
    [
      normalizeAddress(input.walletAddress),
      input.token.symbol,
      input.direction,
      input.fromBlock,
      input.toBlock,
    ].join(":")
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

export async function syncBscWalletToken(input: {
  walletAddress: string;
  token: BscToken;
  latestBlock: number;
  blockTimestampCache: Map<number, number>;
  maxRanges?: number;
  currentBlock?: number;
  preferredChunkSize?: number;
  successfulRanges?: number;
}): Promise<{ stored: number; complete: boolean; nextBlock: number; preferredChunkSize: number; successfulRanges: number }> {
  const normalizedWallet = normalizeAddress(input.walletAddress);

  const trackedWallets = new Set([normalizedWallet]);

  let currentBlock = input.currentBlock ?? await getStartingBlock(
    normalizedWallet,
    input.token,
    input.latestBlock
  );

  if (currentBlock > input.latestBlock) {
    console.info(
      `[bsc] ${normalizedWallet} ` + `${input.token.symbol} already current`
    );

    return {
      stored: 0,
      complete: true,
      nextBlock: currentBlock,
      preferredChunkSize: input.preferredChunkSize ?? config.BSC_INITIAL_CHUNK_SIZE,
      successfulRanges: input.successfulRanges ?? 0,
    };
  }

  let chunkSize = Math.min(
    input.preferredChunkSize ?? config.BSC_INITIAL_CHUNK_SIZE,
    config.BSC_MAX_CHUNK_SIZE
  );

  let storedTotal = 0;
  let successfulRanges = input.successfulRanges ?? 0;
  let rangesProcessed = 0;

  console.info(
    `[bsc] Starting ${input.token.symbol} backup sync ` +
      `for ${normalizedWallet}`,
    {
      contract: input.token.address,
      fromBlock: currentBlock,
      latestBlock: input.latestBlock,
      initialChunkSize: chunkSize,
    }
  );

  while (currentBlock <= input.latestBlock) {
    const toBlock = Math.min(input.latestBlock, currentBlock + chunkSize - 1);

    try {
      const incomingLogs = await readLogs({
        token: input.token,
        walletAddress: normalizedWallet,
        direction: "INFLOW",
        fromBlock: currentBlock,
        toBlock,
      });

      const outgoingLogs = await readLogs({
        token: input.token,
        walletAddress: normalizedWallet,
        direction: "OUTFLOW",
        fromBlock: currentBlock,
        toBlock,
      });

      console.info(
        `[bsc] ${normalizedWallet} ` +
          `${input.token.symbol} ` +
          `${currentBlock}-${toBlock}: ` +
          `${incomingLogs.length} inflows, ` +
          `${outgoingLogs.length} outflows`
      );

      const incomingStored = await processLogs({
        logs: incomingLogs,
        token: input.token,
        direction: "INFLOW",
        trackedWallets,
        blockTimestampCache: input.blockTimestampCache,
      });

      const outgoingStored = await processLogs({
        logs: outgoingLogs,
        token: input.token,
        direction: "OUTFLOW",
        trackedWallets,
        blockTimestampCache: input.blockTimestampCache,
      });

      storedTotal += incomingStored + outgoingStored;

      await saveCursor(normalizedWallet, input.token, toBlock);

      currentBlock = toBlock + 1;
      successfulRanges += 1;
      rangesProcessed += 1;

      if (
        successfulRanges >= config.BSC_CHUNK_GROWTH_SUCCESS_RANGES &&
        chunkSize < config.BSC_MAX_CHUNK_SIZE
      ) {
        chunkSize = Math.min(
          config.BSC_MAX_CHUNK_SIZE,
          chunkSize + config.BSC_CHUNK_GROWTH_STEP
        );
        successfulRanges = 0;
      }

      if (config.BSC_CHUNK_DELAY_MS > 0) {
        const jitter = Math.floor(Math.random() * (config.BSC_CHUNK_JITTER_MS + 1));
        await sleep(config.BSC_CHUNK_DELAY_MS + jitter);
      }

      if (input.maxRanges && rangesProcessed >= input.maxRanges) {
        break;
      }
    } catch (error) {
      if (isBlockRangeError(error) && chunkSize > config.BSC_MIN_CHUNK_SIZE) {
        const reducedChunkSize = Math.max(
          config.BSC_MIN_CHUNK_SIZE,
          Math.floor(chunkSize / 2)
        );

        console.warn(
          `[bsc] RPC rejected ${normalizedWallet} ` +
            `${input.token.symbol} blocks ` +
            `${currentBlock}-${toBlock}; ` +
            `reducing chunk from ${chunkSize} ` +
            `to ${reducedChunkSize}`
        );

        chunkSize = reducedChunkSize;
        successfulRanges = 0;
        continue;
      }

      throw error;
    }
  }

  console.info(
    `[bsc] Backup sync completed for ` +
      `${normalizedWallet} ${input.token.symbol}; ` +
      `${storedTotal} records stored`
  );

  return {
    stored: storedTotal,
    complete: currentBlock > input.latestBlock,
    nextBlock: currentBlock,
    preferredChunkSize: chunkSize,
    successfulRanges,
  };
}

export type BscSyncResult = {
  chain: "BSC";
  startedAt: string;
  completedAt: string;
  pairsAttempted: number;
  pairsCompleted: number;
  pairsFailed: number;
  transfersStored: number;
  failures: Array<{ wallet: string; contract: string; error: string }>;
};

/**
 * Synchronizes every enabled BSC tracked wallet
 * using one shared historical scan.
 */
export async function syncBsc(): Promise<BscSyncResult> {
  const startedAt = new Date().toISOString();
  const walletAddresses = await getTrackedWallets();

  if (walletAddresses.length === 0) {
    console.info("[bsc] No enabled BSC wallets configured");
    return { chain: "BSC", startedAt, completedAt: new Date().toISOString(), pairsAttempted: 0, pairsCompleted: 0, pairsFailed: 0, transfersStored: 0, failures: [] };
  }

  const chainTip = await withRetry(
    () => provider.getBlockNumber(),
    "latest-block"
  );
  const latestBlock = Math.max(0, chainTip - config.BSC_CONFIRMATION_DEPTH);

  const blockTimestampCache = new Map<number, number>();

  let totalStored = 0;

  console.info("[bsc] Starting wallet-token synchronization", {
    wallets: walletAddresses.length,
    tokens: BSC_TOKENS.map((token) => token.symbol),
    latestBlock,
  });

  const unfinished = walletAddresses.flatMap((walletAddress) =>
    BSC_TOKENS.map((token) => ({
      walletAddress: normalizeAddress(walletAddress),
      token,
      currentBlock: undefined as number | undefined,
      preferredChunkSize: config.BSC_INITIAL_CHUNK_SIZE,
      successfulRanges: 0,
    }))
  );
  const failures: BscSyncResult["failures"] = [];
  let completed = 0;

  while (unfinished.length > 0) {
    for (let index = 0; index < unfinished.length; ) {
      const pair = unfinished[index];
      if (!pair) break;
      try {
        const result = await syncBscWalletToken({
          walletAddress: pair.walletAddress,
          token: pair.token,
          latestBlock,
          blockTimestampCache,
          maxRanges: 1,
          currentBlock: pair.currentBlock,
          preferredChunkSize: pair.preferredChunkSize,
          successfulRanges: pair.successfulRanges,
        });
        totalStored += result.stored;
        pair.currentBlock = result.nextBlock;
        pair.preferredChunkSize = result.preferredChunkSize;
        pair.successfulRanges = result.successfulRanges;
        if (result.complete) {
          completed += 1;
          unfinished.splice(index, 1);
        } else {
          index += 1;
        }
      } catch (error) {
        failures.push({ wallet: pair.walletAddress, contract: pair.token.address, error: getErrorMessage(error) });
        unfinished.splice(index, 1);
      }
    }
  }

  return { chain: "BSC", startedAt, completedAt: new Date().toISOString(), pairsAttempted: walletAddresses.length * BSC_TOKENS.length, pairsCompleted: completed, pairsFailed: failures.length, transfersStored: totalStored, failures };
}

export async function syncSingleBscContract(input: {
  walletAddress: string;
  token: BscToken;
}): Promise<number> {
  const chainTip = await withRetry(
    () => provider.getBlockNumber(),
    "latest-block"
  );
  const latestBlock = Math.max(0, chainTip - config.BSC_CONFIRMATION_DEPTH);

  const result = await syncBscWalletToken({
    walletAddress: normalizeAddress(input.walletAddress),
    token: input.token,
    latestBlock,
    blockTimestampCache: new Map<number, number>(),
  });
  return result.stored;
}
