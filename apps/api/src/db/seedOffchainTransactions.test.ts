import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { parseOffchainReport } from "./seedOffchainTransactions.js";

test("offchain report is parsed as non-cancelling exact cash flow", async () => {
  const report = await readFile(path.resolve(process.cwd(), "../../updated-offchain-tx.csv"), "utf8");
  const rows = parseOffchainReport(report);

  assert.equal(rows.length, 1840);
  const toCents = (amount: string): bigint => {
    const [whole, fraction = ""] = amount.split(".");
    return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  };
  const cents = rows.reduce((total, row) => total + toCents(row.amountUsd), 0n);
  const inflowCents = rows.filter((row) => row.direction === "INFLOW").reduce((total, row) => total + toCents(row.amountUsd), 0n);
  const outflowCents = rows.filter((row) => row.direction === "OUTFLOW").reduce((total, row) => total + toCents(row.amountUsd), 0n);

  assert.equal(cents, 285_874_426n);
  assert.equal(inflowCents, 142_945_590n);
  assert.equal(outflowCents, 142_928_836n);
  assert.equal(rows[0]?.occurredAt, "2022-10-19T12:00:00.000Z");
  assert.equal(rows[0]?.amountUsd, "0.64");
});
