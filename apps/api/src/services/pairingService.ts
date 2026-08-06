import { pool } from "../db/pool.js";

type UnpairedInflowRow = {
  id: string;
  asset_symbol: string;
  usd_value: string;
  block_time: Date | string;
};

type MatchingOutflowRow = {
  id: string;
};

/**
 * Match each confirmed inflow with the closest available confirmed outflow.
 * Same-asset legs are preferred, then amount and time proximity. Amount
 * differences are ranked using PostgreSQL NUMERIC values so exact indexed
 * amounts never pass through floating-point arithmetic.
 */
export async function pairComplementaryTransferLegs(): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const inflows = await client.query<UnpairedInflowRow>(
      `
        SELECT id, asset_symbol, usd_value::TEXT, block_time
        FROM transfers
        WHERE pair_id IS NULL
          AND status = 'CONFIRMED'
          AND direction = 'INFLOW'
        ORDER BY block_time ASC, id ASC
        FOR UPDATE
      `
    );

    for (const inflow of inflows.rows) {
      const outflow = await client.query<MatchingOutflowRow>(
        `
          SELECT id
          FROM transfers
          WHERE pair_id IS NULL
            AND status = 'CONFIRMED'
            AND direction = 'OUTFLOW'
          ORDER BY
            CASE WHEN asset_symbol = $1 THEN 0 ELSE 1 END ASC,
            ABS(usd_value - $2::NUMERIC) ASC,
            ABS(EXTRACT(EPOCH FROM (block_time - $3::TIMESTAMPTZ))) ASC,
            block_time ASC,
            id ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        `,
        [inflow.asset_symbol, inflow.usd_value, inflow.block_time]
      );

      const outflowId = outflow.rows[0]?.id;

      if (!outflowId) {
        continue;
      }

      await client.query(
        `
          UPDATE transfers
          SET pair_id = CASE
            WHEN id = $1 THEN $2
            WHEN id = $2 THEN $1
          END,
          pairing_method = 'HEURISTIC',
          pairing_confidence = 0.5000,
          paired_at = NOW()
          WHERE id IN ($1, $2)
            AND pair_id IS NULL
        `,
        [inflow.id, outflowId]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
