import { Connection, PublicKey, type TokenBalance } from "@solana/web3.js";

import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { SOLANA_TOKENS } from "../services/tokens.js";
import { multiplyDecimalStrings } from "../utils/decimal.js";

const connection = new Connection(config.SOLANA_RPC_URL, "confirmed");

type Direction = "INFLOW" | "OUTFLOW";
type TransferStatus = "CONFIRMED" | "FAILED";

type OwnerBalance = {
  rawAmount: bigint;
  decimals: number;
};

type MintOwnerBalances = Map<string, Map<string, OwnerBalance>>;

type SyncStateRow = {
  value: string;
};

type SignatureInfo = Awaited<
  ReturnType<Connection["getSignaturesForAddress"]>
>[number];

const SOLANA_PAGE_DELAY_MS = 250;
const SOLANA_TRANSACTION_DELAY_MS = 200;
const SOLANA_MAX_SIGNATURE_PAGES = 10_000;

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRetryableRpcError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();

  return (
    message.includes("429") ||
    message.includes("too many requests") ||
    message.includes("rate limit") ||
    message.includes("rate-limit") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("socket hang up") ||
    message.includes("connection reset") ||
    message.includes("temporarily unavailable") ||
    message.includes("bad gateway") ||
    message.includes("gateway timeout") ||
    message.includes("fetch failed")
  );
}

async function withRetry<T>(
  operation: () => Promise<T>,
  label: string,
  attempts = config.RPC_RETRY_ATTEMPTS
): Promise<T> {
  let delayMilliseconds = 1_000;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const finalAttempt = attempt === attempts;

      if (!isRetryableRpcError(error) || finalAttempt) {
        throw error;
      }

      console.warn(
        `[solana] ${label} failed. ` +
          `Retrying in ${delayMilliseconds}ms ` +
          `(${attempt}/${attempts})`
      );

      await sleep(delayMilliseconds);

      delayMilliseconds = Math.min(delayMilliseconds * 2, 20_000);
    }
  }

  throw new Error(`${label} exhausted retries`);
}

function absoluteBigInt(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function formatTokenAmount(rawAmount: bigint, decimals: number): string {
  if (rawAmount < 0n) {
    throw new Error("formatTokenAmount requires a non-negative amount");
  }

  if (decimals === 0) {
    return rawAmount.toString();
  }

  const padded = rawAmount.toString().padStart(decimals + 1, "0");

  const integerPart = padded.slice(0, -decimals);

  const fractionPart = padded.slice(-decimals).replace(/0+$/, "");

  return fractionPart.length > 0
    ? `${integerPart}.${fractionPart}`
    : integerPart;
}

function aggregateBalances(
  balances: readonly TokenBalance[] | null | undefined
): MintOwnerBalances {
  const result: MintOwnerBalances = new Map();

  for (const balance of balances ?? []) {
    const owner = balance.owner;

    if (!owner || !balance.mint) {
      continue;
    }

    let owners = result.get(balance.mint);

    if (!owners) {
      owners = new Map();
      result.set(balance.mint, owners);
    }

    const existing = owners.get(owner);

    owners.set(owner, {
      rawAmount:
        (existing?.rawAmount ?? 0n) + BigInt(balance.uiTokenAmount.amount),
      decimals: balance.uiTokenAmount.decimals,
    });
  }

  return result;
}

function getOwnerBalance(
  balances: MintOwnerBalances,
  mint: string,
  owner: string
): OwnerBalance {
  return (
    balances.get(mint)?.get(owner) ?? {
      rawAmount: 0n,
      decimals: SOLANA_TOKENS.get(mint)?.decimals ?? 0,
    }
  );
}

function getAllOwnersForMint(
  preBalances: MintOwnerBalances,
  postBalances: MintOwnerBalances,
  mint: string
): Set<string> {
  return new Set([
    ...(preBalances.get(mint)?.keys() ?? []),
    ...(postBalances.get(mint)?.keys() ?? []),
  ]);
}

function findCounterparty(input: {
  preBalances: MintOwnerBalances;
  postBalances: MintOwnerBalances;
  mint: string;
  trackedWallet: string;
  trackedDelta: bigint;
}): string {
  const owners = getAllOwnersForMint(
    input.preBalances,
    input.postBalances,
    input.mint
  );

  const trackedMagnitude = absoluteBigInt(input.trackedDelta);

  let bestOwner: string | null = null;
  let bestDifference: bigint | null = null;

  for (const owner of owners) {
    if (owner === input.trackedWallet) {
      continue;
    }

    const before = getOwnerBalance(
      input.preBalances,
      input.mint,
      owner
    ).rawAmount;

    const after = getOwnerBalance(
      input.postBalances,
      input.mint,
      owner
    ).rawAmount;

    const ownerDelta = after - before;

    const movedOppositeToTrackedWallet =
      (input.trackedDelta > 0n && ownerDelta < 0n) ||
      (input.trackedDelta < 0n && ownerDelta > 0n);

    if (!movedOppositeToTrackedWallet) {
      continue;
    }

    const ownerMagnitude = absoluteBigInt(ownerDelta);

    const difference =
      ownerMagnitude > trackedMagnitude
        ? ownerMagnitude - trackedMagnitude
        : trackedMagnitude - ownerMagnitude;

    if (bestDifference === null || difference < bestDifference) {
      bestOwner = owner;
      bestDifference = difference;
    }
  }

  return bestOwner ?? "Unknown";
}

function stateKeyForWallet(walletAddress: string, mintFilter?: string): string {
  if (mintFilter) {
    return [
      "solana",
      walletAddress,
      mintFilter,
      "newest-indexed-signature",
    ].join(":");
  }

  return [
    "solana",
    walletAddress,
    "all-supported-mints",
    "newest-indexed-signature",
  ].join(":");
}

async function getStoredSignature(
  stateKey: string
): Promise<string | undefined> {
  const result = await pool.query<SyncStateRow>(
    `
        SELECT value
        FROM sync_state
        WHERE key = $1
      `,
    [stateKey]
  );

  return result.rows[0]?.value || undefined;
}

async function saveStoredSignature(
  stateKey: string,
  signature: string
): Promise<void> {
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
    [stateKey, signature]
  );
}

async function fetchSolanaSignatures(input: {
  publicKey: PublicKey;
  newestStoredSignature?: string;
}): Promise<SignatureInfo[]> {
  const allSignatures: SignatureInfo[] = [];

  const seenSignatures = new Set<string>();

  let before: string | undefined;

  for (
    let pageNumber = 1;
    pageNumber <= SOLANA_MAX_SIGNATURE_PAGES;
    pageNumber += 1
  ) {
    const page = await withRetry(
      () =>
        connection.getSignaturesForAddress(
          input.publicKey,
          {
            limit: config.SOLANA_SIGNATURE_LIMIT,
            before,
            until: input.newestStoredSignature,
          },
          "confirmed"
        ),
      `signatures:${input.publicKey.toBase58()}:page:${pageNumber}`
    );

    console.info(
      `[solana] ${input.publicKey.toBase58()} ` +
        `signature page ${pageNumber}: ` +
        `${page.length} records`
    );

    if (page.length === 0) {
      break;
    }

    let newlyAdded = 0;

    for (const signatureInfo of page) {
      if (seenSignatures.has(signatureInfo.signature)) {
        continue;
      }

      seenSignatures.add(signatureInfo.signature);

      allSignatures.push(signatureInfo);

      newlyAdded += 1;
    }

    if (newlyAdded === 0) {
      console.warn(
        `[solana] Pagination produced no ` +
          `new signatures for ` +
          input.publicKey.toBase58()
      );

      break;
    }

    if (page.length < config.SOLANA_SIGNATURE_LIMIT) {
      break;
    }

    const oldestSignature = page[page.length - 1]?.signature;

    if (!oldestSignature) {
      break;
    }

    if (oldestSignature === before) {
      throw new Error(
        `Solana pagination cursor did not advance for ` +
          input.publicKey.toBase58()
      );
    }

    before = oldestSignature;

    await sleep(SOLANA_PAGE_DELAY_MS);
  }

  return allSignatures;
}

async function storeTransfer(input: {
  walletAddress: string;
  signature: string;
  transferIndex: number;
  slot: number;
  blockTime: number;
  mint: string;
  symbol: string;
  decimals: number;
  rawAmount: bigint;
  amount: string;
  usdValue: string;
  direction: Direction;
  counterparty: string;
  status: TransferStatus;
}): Promise<void> {
  const explorerUrl = `https://solscan.io/tx/` + input.signature;

  const transferId = [
    "SOLANA",
    input.signature,
    String(input.transferIndex),
    input.walletAddress,
    input.direction,
    input.mint,
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
        'SOLANA',
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
        $15,
        $16
      )
      ON CONFLICT (
        chain,
        tx_hash,
        log_index,
        wallet_address,
        direction
      )
      DO UPDATE SET
        block_number =
          EXCLUDED.block_number,
        block_time =
          EXCLUDED.block_time,
        token_address =
          EXCLUDED.token_address,
        asset_symbol =
          EXCLUDED.asset_symbol,
        decimals =
          EXCLUDED.decimals,
        raw_amount =
          EXCLUDED.raw_amount,
        amount =
          EXCLUDED.amount,
        usd_value =
          EXCLUDED.usd_value,
        counterparty =
          EXCLUDED.counterparty,
        status =
          EXCLUDED.status,
        explorer_url =
          EXCLUDED.explorer_url
    `,
    [
      transferId,
      input.walletAddress,
      input.signature,
      input.transferIndex,
      String(input.slot),
      input.blockTime,
      input.direction,
      input.mint,
      input.symbol,
      input.decimals,
      input.rawAmount.toString(),
      input.amount,
      input.usdValue,
      input.counterparty,
      input.status,
      explorerUrl,
    ]
  );
}

export async function syncSolanaWallet(
  walletAddress: string,
  mintFilter?: string
): Promise<void> {
  const publicKey = new PublicKey(walletAddress);

  if (mintFilter && !SOLANA_TOKENS.has(mintFilter)) {
    throw new Error(`Unsupported Solana mint: ${mintFilter}`);
  }

  const stateKey = stateKeyForWallet(walletAddress, mintFilter);

  const newestStoredSignature = await getStoredSignature(stateKey);

  console.info(`[solana] Starting wallet ${walletAddress}`, {
    mode: newestStoredSignature ? "incremental" : "historical-backfill",
    mintFilter: mintFilter ?? "ALL_SUPPORTED",
    cursor: newestStoredSignature ?? null,
    pageLimit: config.SOLANA_SIGNATURE_LIMIT,
  });

  const signatures = await fetchSolanaSignatures({
    publicKey,
    newestStoredSignature,
  });

  console.info(
    `[solana] ${walletAddress}: ` +
      `${signatures.length} signatures ` +
      `to inspect`
  );

  if (signatures.length === 0) {
    return;
  }

  const newestFetchedSignature = signatures[0]?.signature;

  if (!newestFetchedSignature) {
    return;
  }

  let storedTransfers = 0;

  for (const signatureInfo of [...signatures].reverse()) {
    const transaction = await withRetry(
      () =>
        connection.getParsedTransaction(signatureInfo.signature, {
          maxSupportedTransactionVersion: 0,
          commitment: "confirmed",
        }),
      `transaction:${signatureInfo.signature}`
    );

    if (!transaction) {
      throw new Error(
        `Solana transaction unavailable: ` + signatureInfo.signature
      );
    }

    if (transaction.blockTime === null || transaction.blockTime === undefined) {
      throw new Error(
        `Solana transaction has no block time: ` + signatureInfo.signature
      );
    }

    if (!transaction.meta) {
      throw new Error(
        `Solana transaction has no metadata: ` + signatureInfo.signature
      );
    }

    const preBalances = aggregateBalances(transaction.meta.preTokenBalances);

    const postBalances = aggregateBalances(transaction.meta.postTokenBalances);

    const mints = new Set([...preBalances.keys(), ...postBalances.keys()]);

    let transferIndex = 0;

    for (const mint of mints) {
      if (mintFilter && mint !== mintFilter) {
        continue;
      }

      const token = SOLANA_TOKENS.get(mint);

      if (!token) {
        continue;
      }

      const before = getOwnerBalance(
        preBalances,
        mint,
        walletAddress
      ).rawAmount;

      const after = getOwnerBalance(
        postBalances,
        mint,
        walletAddress
      ).rawAmount;

      const delta = after - before;

      if (delta === 0n) {
        continue;
      }

      const direction: Direction = delta > 0n ? "INFLOW" : "OUTFLOW";

      const rawAmount = absoluteBigInt(delta);

      const amount = formatTokenAmount(rawAmount, token.decimals);

      const usdValue = multiplyDecimalStrings(amount, token.fixedUsdPrice);

      const counterparty = findCounterparty({
        preBalances,
        postBalances,
        mint,
        trackedWallet: walletAddress,
        trackedDelta: delta,
      });

      const status: TransferStatus = transaction.meta.err
        ? "FAILED"
        : "CONFIRMED";

      await storeTransfer({
        walletAddress,
        signature: signatureInfo.signature,
        transferIndex,
        slot: transaction.slot,
        blockTime: transaction.blockTime,
        mint,
        symbol: token.symbol,
        decimals: token.decimals,
        rawAmount,
        amount,
        usdValue,
        direction,
        counterparty,
        status,
      });

      storedTransfers += 1;
      transferIndex += 1;

      console.info(
        `[solana] Stored ${direction} ` +
          `${amount} ${token.symbol} ` +
          `for ${walletAddress}; ` +
          `mint=${mint}; ` +
          `usd=${usdValue}; ` +
          `counterparty=${counterparty}`
      );
    }

    await sleep(SOLANA_TRANSACTION_DELAY_MS);
  }

  await saveStoredSignature(stateKey, newestFetchedSignature);

  console.info(
    `[solana] ${walletAddress}: ` +
      `${storedTransfers} supported transfers stored; ` +
      `mint=${mintFilter ?? "ALL_SUPPORTED"}; ` +
      `cursor=${newestFetchedSignature}`
  );
}
