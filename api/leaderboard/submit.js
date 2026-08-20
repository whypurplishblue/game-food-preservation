import { kv } from '@vercel/kv';
import { isCleanName } from '../../src/shared/nameFilter.js';

const MODES = new Set(['arcade', 'learning']);
const NAME_MAX = 20;
// Learning mode's score is a fixed, well-defined ceiling. Arcade's combo
// multiplier has no hard cap in principle, so this is a generous sanity
// bound against garbage/overflow submissions, not a precise validator.
const SCORE_MAX = { learning: 1350 + 9 * 5, arcade: 20000 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  const { mode, name, score } = body || {};

  if (!MODES.has(mode)) {
    res.status(400).json({ ok: false, error: 'invalid mode' });
    return;
  }
  const cleanedName = String(name || '').trim().slice(0, NAME_MAX);
  if (!cleanedName || !isCleanName(cleanedName)) {
    res.status(400).json({ ok: false, error: 'invalid name' });
    return;
  }
  if (!Number.isFinite(score) || score < 0 || score > SCORE_MAX[mode]) {
    res.status(400).json({ ok: false, error: 'invalid score' });
    return;
  }

  const key = `leaderboard:${mode}`;
  const member = `${cleanedName}:${crypto.randomUUID()}`;
  await kv.zadd(key, { score, member });

  const rank = await kv.zrevrank(key, member);
  res.status(200).json({ ok: true, rank: (rank ?? 0) + 1 });
}
