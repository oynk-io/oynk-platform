import { Router } from "express";
import { pool } from "../db/pool.js";
export const dashboardRouter = Router();
dashboardRouter.get("/", async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 100), 500);
    const chain = req.query.chain;
    const where = chain ? "WHERE chain=$2" : "";
    const params = chain ? [limit, chain] : [limit];
    const [summary, rows, timeline, lastSync] = await Promise.all([
      pool.query(
        `SELECT COALESCE(SUM(usd_value),0) total,COALESCE(SUM(usd_value) FILTER(WHERE direction='INFLOW'),0) inflow,COALESCE(SUM(usd_value) FILTER(WHERE direction='OUTFLOW'),0) outflow,COUNT(*)::int count,COUNT(DISTINCT wallet_address)::int wallets,COALESCE(SUM(usd_value) FILTER(WHERE chain='BSC'),0) bsc,COALESCE(SUM(usd_value) FILTER(WHERE chain='SOLANA'),0) solana FROM transfers`
      ),
      pool.query(
        `SELECT t.*,p.explorer_url pair_explorer_url FROM transfers t LEFT JOIN transfers p ON p.id=t.pair_id ${where} ORDER BY block_time DESC LIMIT $1`,
        params
      ),
      pool.query(
        `SELECT to_char(date_trunc('day',block_time),'YYYY-MM-DD') date,COALESCE(SUM(usd_value) FILTER(WHERE direction='INFLOW'),0)::float inflow,COALESCE(SUM(usd_value) FILTER(WHERE direction='OUTFLOW'),0)::float outflow,COALESCE(SUM(usd_value),0)::float total FROM transfers WHERE block_time>=NOW()-INTERVAL '30 days' GROUP BY 1 ORDER BY 1`
      ),
      pool.query("SELECT MAX(updated_at) last_synced FROM sync_state"),
    ]);
    const s = summary.rows[0];
    res.json({
      metrics: {
        totalUsd: s.total,
        inflowUsd: s.inflow,
        outflowUsd: s.outflow,
        transferCount: s.count,
        activeWallets: s.wallets,
        bscUsd: s.bsc,
        solanaUsd: s.solana,
        lastSyncedAt: lastSync.rows[0].last_synced,
      },
      timeline: timeline.rows.map((r) => ({
        date: r.date,
        inflowUsd: r.inflow,
        outflowUsd: r.outflow,
        totalUsd: r.total,
      })),
      transfers: rows.rows.map((r) => ({
        id: r.id,
        chain: r.chain,
        walletAddress: r.wallet_address,
        txHash: r.tx_hash,
        blockNumber: r.block_number,
        timestamp: r.block_time,
        direction: r.direction,
        assetSymbol: r.asset_symbol,
        tokenAddress: r.token_address,
        amount: r.amount,
        usdValue: r.usd_value,
        counterparty: r.counterparty,
        status: r.status,
        explorerUrl: r.explorer_url,
        pairId: r.pair_id,
        pairExplorerUrl: r.pair_explorer_url,
      })),
    });
  } catch (e) {
    next(e);
  }
});
