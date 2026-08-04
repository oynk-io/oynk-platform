import { Connection, PublicKey, type TokenBalance } from "@solana/web3.js";

import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { SOLANA_TOKENS } from "../services/tokens.js";
import { multiplyDecimalStrings } from "../utils/decimal.js";

const connection = new Connection(config.SOLANA_RPC_URL, "confirmed");

type OwnerBalance = {
  rawAmount: bigint;
  decimals: number;
};

type MintOwnerBalances = Map<string, Map<string, OwnerBalance>>;

type SyncStateRow = {
  value: string;
};

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
    message.includes("gateway timeout")
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
        `[solana] ${label} failed. Retrying in ` +
          `${delayMilliseconds}ms ` +
          `(${attempt}/${attempts})`
      );

      await sleep(delayMilliseconds);

      delayMilliseconds = Math.min(delayMilliseconds * 2, 20_000);
    }
  }

  throw new Error(`${label} exhausted retries`);
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

  let bestOwner = "Unknown";
  let bestDifference = 0n;

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

    const ownerDifference = ownerDelta < 0n ? -ownerDelta : ownerDelta;

    const trackedDifference =
      input.trackedDelta < 0n ? -input.trackedDelta : input.trackedDelta;

    const amountDifference =
      ownerDifference > trackedDifference
        ? ownerDifference - trackedDifference
        : trackedDifference - ownerDifference;

    if (bestOwner === "Unknown" || amountDifference < bestDifference) {
      bestOwner = owner;
      bestDifference = amountDifference;
    }
  }

  return bestOwner;
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

export async function syncSolanaWallet(walletAddress: string): Promise<void> {
  const publicKey = new PublicKey(walletAddress);

  const stateKey = `solana:${walletAddress}:signature`;

  const newestStoredSignature = await getStoredSignature(stateKey);

  const signatures = await withRetry(
    () =>
      connection.getSignaturesForAddress(
        publicKey,
        {
          limit: config.SOLANA_SIGNATURE_LIMIT,
          until: newestStoredSignature,
        },
        "confirmed"
      ),
    `signatures:${walletAddress}`
  );

  console.info(
    `[solana] ${walletAddress}: ` + `${signatures.length} new signatures`
  );

  if (signatures.length === 0) {
    return;
  }

  let storedTransfers = 0;

  /*
   * getSignaturesForAddress returns newest first.
   * Process oldest first so records are inserted chronologically.
   */
  for (const signatureInfo of [...signatures].reverse()) {
    const transaction = await withRetry(
      () =>
        connection.getParsedTransaction(signatureInfo.signature, {
          maxSupportedTransactionVersion: 0,
          commitment: "confirmed",
        }),
      `transaction:${signatureInfo.signature}`
    );

    if (
      !transaction?.meta ||
      transaction.blockTime === null ||
      transaction.blockTime === undefined
    ) {
      console.warn(
        `[solana] Skipping unavailable transaction ` + signatureInfo.signature
      );

      continue;
    }

    const preBalances = aggregateBalances(transaction.meta.preTokenBalances);

    const postBalances = aggregateBalances(transaction.meta.postTokenBalances);

    const mints = new Set([...preBalances.keys(), ...postBalances.keys()]);

    let transferIndex = 0;

    for (const mint of mints) {
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

      const direction = delta > 0n ? "INFLOW" : "OUTFLOW";

      const rawAmount = delta > 0n ? delta : -delta;

      const amount = formatTokenAmount(rawAmount, token.decimals);

      const usdValue = multiplyDecimalStrings(amount, token.fixedUsdPrice);

      const counterparty = findCounterparty({
        preBalances,
        postBalances,
        mint,
        trackedWallet: walletAddress,
        trackedDelta: delta,
      });

      const status = transaction.meta.err ? "FAILED" : "CONFIRMED";

      const explorerUrl = `https://solscan.io/tx/` + signatureInfo.signature;

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
          [
            "SOLANA",
            signatureInfo.signature,
            String(transferIndex),
            walletAddress,
            direction,
          ].join(":"),
          walletAddress,
          signatureInfo.signature,
          transferIndex,
          String(transaction.slot),
          transaction.blockTime,
          direction,
          mint,
          token.symbol,
          token.decimals,
          rawAmount.toString(),
          amount,
          usdValue,
          counterparty,
          status,
          explorerUrl,
        ]
      );

      storedTransfers += 1;
      transferIndex += 1;

      console.info(
        `[solana] Stored ${direction} ` +
          `${amount} ${token.symbol} ` +
          `for ${walletAddress}; ` +
          `counterparty=${counterparty}`
      );
    }

    await sleep(250);
  }

  const newestFetchedSignature = signatures[0]?.signature;

  if (newestFetchedSignature) {
    await saveStoredSignature(stateKey, newestFetchedSignature);
  }

  console.info(
    `[solana] ${walletAddress}: ` +
      `${storedTransfers} supported transfers stored`
  );
}
