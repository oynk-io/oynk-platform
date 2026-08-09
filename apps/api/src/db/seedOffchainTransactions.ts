import { readFile } from "node:fs/promises";
import path from "node:path";

import type { PoolClient } from "pg";

const REPORT_FILE_NAME = "updated-offchain-tx.csv";
const EXPECTED_COLUMNS = 14;
const INSERT_BATCH_SIZE = 250;

type OffchainSeedRow = {
  id: string;
  occurredAt: string;
  direction: "INFLOW" | "OUTFLOW";
  amountUsd: string;
  transactionId: string | null;
  referenceId: string;
  transactionType: string;
  description: string;
};

function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error("Offchain transaction report contains an unterminated quoted field");
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

function reportDateToIso(value: string, rowNumber: number): string {
  const match = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2}), (\d{4})$/.exec(value);
  if (!match) throw new Error(`Invalid offchain report date at row ${rowNumber}`);
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(match[1]) + 1;
  return `${match[3]}-${String(month).padStart(2, "0")}-${match[2].padStart(2, "0")}T12:00:00.000Z`;
}

function normalizeAmount(value: string, rowNumber: number): { direction: "INFLOW" | "OUTFLOW"; amount: string } {
  if (!/^-?\d+(?:\.\d+)?$/.test(value)) {
    throw new Error(`Invalid USD amount in offchain report at row ${rowNumber}`);
  }
  const direction = value.startsWith("-") ? "OUTFLOW" : "INFLOW";
  const amount = value.startsWith("-") ? value.slice(1) : value;
  return { direction, amount };
}

export function parseOffchainReport(csv: string): OffchainSeedRow[] {
  const [header, ...rows] = parseCsv(csv);
  if (
    !header ||
    header.length !== EXPECTED_COLUMNS ||
    header[1] !== "Date" ||
    header[3] !== "Transaction ID" ||
    header[11] !== "Ref ID" ||
    header[13] !== "Amount $"
  ) {
    throw new Error("Offchain transaction report columns do not match the expected export format");
  }

  const parsedRows = rows.filter((row) => row.some(Boolean)).map((row, index) => {
    const rowNumber = index + 2;
    if (row.length !== EXPECTED_COLUMNS) throw new Error(`Invalid column count in offchain report at row ${rowNumber}`);
    const referenceId = row[11].trim();
    if (!/^\d+$/.test(referenceId)) throw new Error(`Invalid reference ID in offchain report at row ${rowNumber}`);
    const { direction, amount } = normalizeAmount(row[13].trim(), rowNumber);
    const description = row[5].trim() || row[4].trim();
    return {
      id: `offchain-${referenceId}`,
      occurredAt: reportDateToIso(row[1].trim(), rowNumber),
      direction,
      amountUsd: amount,
      transactionId: row[3].trim() || null,
      referenceId,
      transactionType: row[4].trim(),
      description,
    };
  });

  if (parsedRows.length === 0) {
    throw new Error("Offchain transaction report contains no transaction rows");
  }

  const referenceIds = new Set(parsedRows.map((row) => row.referenceId));
  if (referenceIds.size !== parsedRows.length) {
    throw new Error("Offchain transaction report contains duplicate reference IDs");
  }

  return parsedRows;
}

async function readReport(): Promise<string> {
  const candidates = [
    path.resolve(process.cwd(), REPORT_FILE_NAME),
    path.resolve(process.cwd(), "../..", REPORT_FILE_NAME),
  ];
  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return await readFile(candidate, "utf8");
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Unable to read ${REPORT_FILE_NAME}`, { cause: lastError });
}

export async function seedOffchainTransactions(client: PoolClient): Promise<number> {
  const rows = parseOffchainReport(await readReport());
  for (let offset = 0; offset < rows.length; offset += INSERT_BATCH_SIZE) {
    const batch = rows.slice(offset, offset + INSERT_BATCH_SIZE);
    const values: string[] = [];
    const parameters: Array<string | null> = [];
    batch.forEach((row, index) => {
      const start = index * 8;
      values.push(`($${start + 1}, $${start + 2}, $${start + 3}, $${start + 4}, $${start + 5}, $${start + 6}, $${start + 7}, $${start + 8})`);
      parameters.push(row.id, row.occurredAt, row.direction, row.amountUsd, row.transactionId, row.referenceId, row.transactionType, row.description);
    });
    await client.query(
      `INSERT INTO offchain_transactions (id, occurred_at, direction, amount_usd, transaction_id, reference_id, transaction_type, description)
       VALUES ${values.join(", ")}
       ON CONFLICT (reference_id) DO UPDATE SET
         occurred_at = EXCLUDED.occurred_at,
         direction = EXCLUDED.direction,
         amount_usd = EXCLUDED.amount_usd,
         transaction_id = EXCLUDED.transaction_id,
         transaction_type = EXCLUDED.transaction_type,
         description = EXCLUDED.description`,
      parameters,
    );
  }
  await client.query(
    "DELETE FROM offchain_transactions WHERE NOT (reference_id = ANY($1::TEXT[]))",
    [rows.map((row) => row.referenceId)],
  );
  return rows.length;
}
