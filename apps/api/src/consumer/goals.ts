import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import type { Identity } from './auth.js';
import { accountFor, transaction } from './service.js';

export class GoalError extends Error { constructor(message: string, readonly status = 400) { super(message); } }

const goalSchema = z.object({
  category: z.enum(['car', 'house', 'equipment', 'business', 'other']),
  customGoal: z.string().trim().min(2).max(100).optional(),
  profession: z.string().trim().min(2).max(100),
  targetAmountNaira: z.string().regex(/^\d{1,10}$/),
  targetDate: z.iso.date(),
}).superRefine((value, context) => {
  if (value.category === 'other' && !value.customGoal) context.addIssue({ code: 'custom', path: ['customGoal'], message: 'Describe your goal.' });
  if (value.category !== 'other' && value.customGoal) context.addIssue({ code: 'custom', path: ['customGoal'], message: 'Custom details are only valid for other goals.' });
  const amount = BigInt(value.targetAmountNaira);
  if (amount < 10_000n || amount > 5_000_000_000n) context.addIssue({ code: 'custom', path: ['targetAmountNaira'], message: 'Choose a target between ₦10,000 and ₦5 billion.' });
  const date = new Date(`${value.targetDate}T00:00:00.000Z`);
  const earliest = new Date(); earliest.setUTCDate(earliest.getUTCDate() + 7);
  const latest = new Date(); latest.setUTCFullYear(latest.getUTCFullYear() + 10);
  if (!Number.isFinite(date.getTime()) || date < earliest || date > latest) context.addIssue({ code: 'custom', path: ['targetDate'], message: 'Choose a target date between one week and ten years away.' });
});

function response(row: any) {
  return {
    id: row.id,
    category: row.category,
    customGoal: row.custom_goal ?? null,
    profession: row.profession,
    targetAmountNaira: (BigInt(row.target_amount_kobo) / 100n).toString(),
    targetDate: row.target_date instanceof Date ? row.target_date.toISOString().slice(0, 10) : String(row.target_date).slice(0, 10),
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function activeGoal(identity: Identity) {
  const account = await accountFor(identity);
  const result = await pool.query('SELECT * FROM consumer_goals WHERE account_id=$1 AND status=\'ACTIVE\' ORDER BY created_at DESC LIMIT 1', [account.id]);
  return { goal: result.rows[0] ? response(result.rows[0]) : null };
}

export async function saveGoal(identity: Identity, raw: unknown) {
  const parsed = goalSchema.safeParse(raw);
  if (!parsed.success) throw new GoalError(parsed.error.issues[0]?.message ?? 'Review your goal details.');
  const targetAmountKobo = (BigInt(parsed.data.targetAmountNaira) * 100n).toString();
  return transaction(async db => {
    const account = await accountFor(identity, db, true);
    await db.query("UPDATE consumer_goals SET status='ARCHIVED',updated_at=NOW() WHERE account_id=$1 AND status='ACTIVE'", [account.id]);
    const result = await db.query(
      `INSERT INTO consumer_goals(id,account_id,category,custom_goal,profession,target_amount_kobo,target_date)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [randomUUID(), account.id, parsed.data.category, parsed.data.category === 'other' ? parsed.data.customGoal : null, parsed.data.profession, targetAmountKobo, parsed.data.targetDate],
    );
    return { goal: response(result.rows[0]) };
  });
}

export const goalInputSchema = goalSchema;
