import { pool } from "../db/pool.js";
import { syncSingleBscContract } from "../indexers/bscIndexer.js";
import { syncSolanaWallet } from "../indexers/solanaIndexer.js";
import {
  BSC_TOKENS,
  SOLANA_TOKENS,
  type BscToken,
} from "../services/tokens.js";

type Chain = "BSC" | "SOLANA";

type CliArguments = {
  chain?: Chain;
  wallet?: string;
  token?: string;
  contract?: string;
  reset: boolean;
  deleteTransfers: boolean;
  fromBlock?: number;
};

function normalizeEvmAddress(value: string): string {
  return value.trim().toLowerCase();
}

function readArgument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);

  if (index < 0) {
    return undefined;
  }

  return process.argv[index + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function parseArguments(): CliArguments {
  const chainValue = readArgument("chain")?.trim().toUpperCase();

  const fromBlockValue = readArgument("from-block");

  let fromBlock: number | undefined;

  if (fromBlockValue !== undefined) {
    fromBlock = Number(fromBlockValue);

    if (!Number.isSafeInteger(fromBlock) || fromBlock < 0) {
      throw new Error("--from-block must be a non-negative integer");
    }
  }

  return {
    chain:
      chainValue === "BSC" || chainValue === "SOLANA" ? chainValue : undefined,
    wallet: readArgument("wallet")?.trim(),
    token: readArgument("token")?.trim().toUpperCase(),
    contract: readArgument("contract")?.trim(),
    reset: hasFlag("reset"),
    deleteTransfers: hasFlag("delete-transfers"),
    fromBlock,
  };
}

function findBscToken(
  tokenSymbol?: string,
  contractAddress?: string
): BscToken {
  const normalizedContract = contractAddress
    ? normalizeEvmAddress(contractAddress)
    : undefined;

  const token = normalizedContract
    ? BSC_TOKENS.find(
        (candidate) => normalizeEvmAddress(candidate.address) === normalizedContract
      )
    : BSC_TOKENS.find((candidate) => tokenSymbol && candidate.symbol === tokenSymbol);

  if (!token) {
    throw new Error(
      `Unknown BSC token. Supported values: ` +
        BSC_TOKENS.map((item) => `${item.symbol}=${item.address}`).join(", ")
    );
  }

  if (tokenSymbol && token.symbol !== tokenSymbol) {
    throw new Error(
      `Token symbol ${tokenSymbol} does not match configured contract ${normalizedContract}`
    );
  }

  return token;
}

function findSolanaMint(tokenSymbol?: string, mintAddress?: string): string {
  if (mintAddress && SOLANA_TOKENS.has(mintAddress)) {
    return mintAddress;
  }

  for (const [mint, token] of SOLANA_TOKENS.entries()) {
    if (tokenSymbol && token.symbol === tokenSymbol) {
      return mint;
    }
  }

  throw new Error(
    `Unknown Solana token. Supported values: ` +
      [...SOLANA_TOKENS.entries()]
        .map(([mint, token]) => `${token.symbol}=${mint}`)
        .join(", ")
  );
}

function bscCursorKey(walletAddress: string, tokenAddress: string): string {
  return [
    "bsc",
    normalizeEvmAddress(walletAddress),
    normalizeEvmAddress(tokenAddress),
    "last-indexed-block",
  ].join(":");
}

function solanaCursorKey(walletAddress: string, mintAddress: string): string {
  return [
    "solana",
    walletAddress,
    mintAddress,
    "newest-indexed-signature",
  ].join(":");
}

async function prepareBscSync(input: {
  walletAddress: string;
  token: BscToken;
  reset: boolean;
  deleteTransfers: boolean;
  fromBlock?: number;
}): Promise<void> {
  const wallet = normalizeEvmAddress(input.walletAddress);

  const tokenAddress = normalizeEvmAddress(input.token.address);

  const cursor = bscCursorKey(wallet, tokenAddress);

  if (input.reset) {
    await pool.query(
      `
        DELETE FROM sync_state
        WHERE key = $1
      `,
      [cursor]
    );

    console.info(`[backup-sync] Reset BSC cursor ${cursor}`);
  }

  if (input.fromBlock !== undefined) {
    const cursorBlock = Math.max(0, input.fromBlock - 1);

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
      [cursor, String(cursorBlock)]
    );

    console.info(
      `[backup-sync] BSC sync will start from block ` + `${input.fromBlock}`
    );
  }

  if (input.deleteTransfers) {
    await pool.query(
      `
        DELETE FROM transfers
        WHERE chain = 'BSC'
          AND LOWER(wallet_address) = $1
          AND LOWER(token_address) = $2
      `,
      [wallet, tokenAddress]
    );

    console.info(
      `[backup-sync] Deleted existing BSC ` +
        `${input.token.symbol} rows for ${wallet}`
    );
  }
}

async function prepareSolanaSync(input: {
  walletAddress: string;
  mintAddress: string;
  reset: boolean;
  deleteTransfers: boolean;
}): Promise<void> {
  const cursor = solanaCursorKey(input.walletAddress, input.mintAddress);

  if (input.reset) {
    await pool.query(
      `
        DELETE FROM sync_state
        WHERE key = $1
      `,
      [cursor]
    );

    console.info(`[backup-sync] Reset Solana cursor ${cursor}`);
  }

  if (input.deleteTransfers) {
    await pool.query(
      `
        DELETE FROM transfers
        WHERE chain = 'SOLANA'
          AND wallet_address = $1
          AND token_address = $2
      `,
      [input.walletAddress, input.mintAddress]
    );

    console.info(
      `[backup-sync] Deleted existing Solana rows ` +
        `for ${input.walletAddress} ` +
        `${input.mintAddress}`
    );
  }
}

async function main(): Promise<void> {
  const argumentsValue = parseArguments();

  if (!argumentsValue.chain) {
    throw new Error("Required: --chain BSC|SOLANA");
  }

  if (!argumentsValue.wallet) {
    throw new Error("Required: --wallet <address>");
  }

  if (!argumentsValue.token && !argumentsValue.contract) {
    throw new Error(
      "Required: --token <symbol> or " + "--contract <address-or-mint>"
    );
  }

  if (argumentsValue.chain === "BSC") {
    const token = findBscToken(argumentsValue.token, argumentsValue.contract);

    await prepareBscSync({
      walletAddress: argumentsValue.wallet,
      token,
      reset: argumentsValue.reset,
      deleteTransfers: argumentsValue.deleteTransfers,
      fromBlock: argumentsValue.fromBlock,
    });

    console.info(`[backup-sync] Starting BSC ` + `${token.symbol} sync`, {
      wallet: argumentsValue.wallet,
      contract: token.address,
    });

    const stored = await syncSingleBscContract({
      walletAddress: argumentsValue.wallet,
      token,
    });

    console.info(
      `[backup-sync] BSC backup completed; ` + `${stored} records stored`
    );

    return;
  }

  const mintAddress = findSolanaMint(
    argumentsValue.token,
    argumentsValue.contract
  );

  await prepareSolanaSync({
    walletAddress: argumentsValue.wallet,
    mintAddress,
    reset: argumentsValue.reset,
    deleteTransfers: argumentsValue.deleteTransfers,
  });

  console.info("[backup-sync] Starting Solana mint sync", {
    wallet: argumentsValue.wallet,
    mint: mintAddress,
  });

  await syncSolanaWallet(argumentsValue.wallet, mintAddress);

  console.info("[backup-sync] Solana backup completed");
}

void main()
  .catch((error) => {
    console.error("[backup-sync] Synchronization failed", error);

    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
