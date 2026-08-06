import type { Chain } from "@oynk/shared";

export type ChainMetadata = {
  label: string;
  shortLabel: string;
  badgeClassName: string;
};

export const CHAIN_METADATA: Record<Chain, ChainMetadata> = {
  BSC: {
    label: "BNB Smart Chain",
    shortLabel: "BSC",
    badgeClassName: "border-amber-300/20 bg-amber-300/10 text-amber-200",
  },
  SOLANA: {
    label: "Solana",
    shortLabel: "SOL",
    badgeClassName: "border-violet-300/20 bg-violet-300/10 text-violet-200",
  },
};
