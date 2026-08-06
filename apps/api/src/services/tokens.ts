export type BscTokenSymbol = "USDT" | "USDC" | "BTCB";

export type BscToken = {
  symbol: BscTokenSymbol;
  address: string;
  decimals: number;

  /**
   * Fixed operational USD price used by the dashboard.
   *
   * This is not a live market price.
   */
  fixedUsdPrice: string;
  startBlock?: number;
};

export type SolanaTokenSymbol = "USDT" | "USDC";

export type SolanaToken = {
  symbol: SolanaTokenSymbol;
  decimals: number;
  fixedUsdPrice: string;
};

export const BSC_TOKENS: readonly BscToken[] = [
  {
    symbol: "BTCB",
    address: "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c",
    decimals: 18,
    fixedUsdPrice: "25000",
  },
  {
    symbol: "USDT",
    address: "0x55d398326f99059ff775485246999027b3197955",
    decimals: 18,
    fixedUsdPrice: "1",
  },
  {
    symbol: "USDC",
    address: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
    decimals: 18,
    fixedUsdPrice: "1",
  },
] as const;

export const SOLANA_TOKENS = new Map([
  [
    "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    {
      symbol: "USDT",
      decimals: 6,
      fixedUsdPrice: "1",
    },
  ],
  [
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    {
      symbol: "USDC",
      decimals: 6,
      fixedUsdPrice: "1",
    },
  ],
]);
