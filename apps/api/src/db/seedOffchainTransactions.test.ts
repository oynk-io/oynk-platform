import assert from "node:assert/strict";
import test from "node:test";

import { parseOffchainReport } from "./seedOffchainTransactions.js";

test("offchain report is parsed as non-cancelling exact cash flow", async () => {
  const report = [
    "Index,Date,Status,Transaction ID,Transaction Type,Description,Sender,Recipient,Sender Account,Recipient Account,Currency,Ref ID,Channel,Amount $",
    '1,"Oct 19, 2022",Completed,tx-1,Collection,Test inflow,Sender A,Recipient A,Account A,Account B,USD,1001,Test,10.64',
    '2,"Oct 20, 2022",Completed,tx-2,Payout,Test outflow,Sender B,Recipient B,Account C,Account D,USD,1002,Test,-10.00',
  ].join("\n");
  const rows = parseOffchainReport(report);

  assert.equal(rows.length, 2);
  const toCents = (amount: string): bigint => {
    const [whole, fraction = ""] = amount.split(".");
    return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  };
  const cents = rows.reduce((total, row) => total + toCents(row.amountUsd), 0n);
  const inflowCents = rows.filter((row) => row.direction === "INFLOW").reduce((total, row) => total + toCents(row.amountUsd), 0n);
  const outflowCents = rows.filter((row) => row.direction === "OUTFLOW").reduce((total, row) => total + toCents(row.amountUsd), 0n);

  assert.equal(cents, 2_064n);
  assert.equal(inflowCents, 1_064n);
  assert.equal(outflowCents, 1_000n);
  assert.equal(rows[0]?.occurredAt, "2022-10-19T12:00:00.000Z");
  assert.equal(rows[0]?.amountUsd, "10.64");
});
