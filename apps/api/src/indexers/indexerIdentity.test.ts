import assert from "node:assert/strict";
import test from "node:test";

import { bscCursorKey, normalizeBscAddress } from "./bscIndexer.js";
import {
  deterministicSolanaTransferId,
  solanaStateKey,
} from "./solanaIndexer.js";

test("BSC addresses and cursor identity are normalized and contract-specific", () => {
  assert.equal(normalizeBscAddress(" 0xAbC "), "0xabc");
  assert.equal(
    bscCursorKey("0xWallet", "0xContract"),
    "bsc:0xwallet:0xcontract:last-indexed-block"
  );
  assert.notEqual(
    bscCursorKey("0xWallet", "0xContractA"),
    bscCursorKey("0xWallet", "0xContractB")
  );
});

test("Solana state separates source, scope, and historical key kind", () => {
  assert.equal(
    solanaStateKey("wallet", "source"),
    "solana:wallet:all-supported-mints:source:newest-processed-signature"
  );
  assert.equal(
    solanaStateKey("wallet", "source", "mint"),
    "solana:wallet:mint:source:newest-processed-signature"
  );
});

test("Solana transfer identity is independent of filtered array position", () => {
  const identity = deterministicSolanaTransferId({
    signature: "signature",
    mint: "mint",
    walletAddress: "wallet",
    direction: "INFLOW",
  });
  assert.equal(identity, "SOLANA:signature:mint:wallet:INFLOW");
  assert.notEqual(
    identity,
    deterministicSolanaTransferId({
      signature: "signature",
      mint: "mint",
      walletAddress: "wallet",
      direction: "OUTFLOW",
    })
  );
});
