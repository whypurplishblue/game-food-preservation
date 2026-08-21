import { kv } from '@vercel/kv';

const MODES = new Set(['arcade', 'learning']);

export default async function handler(req, res) {
  const mode = req.query?.mode;
  if (!MODES.has(mode)) {
    res.status(400).json({ ok: false, error: 'invalid mode' });
    return;
  }
  const limit = Math.min(50, Math.max(1, Number(req.query?.limit) || 10));
  const scoreParam = req.query?.score;
  const hasScore = scoreParam !== undefined && scoreParam !== null && scoreParam !== '';
  const score = hasScore ? Number(scoreParam) : null;
  if (hasScore && (!Number.isFinite(score) || score < 0)) {
    res.status(400).json({ ok: false, error: 'invalid score' });
    return;
  }

  const key = `leaderboard:${mode}`;
  const raw = await kv.zrange(key, 0, limit - 1, { rev: true, withScores: true });

  // node-redis-style flat [member, score, member, score, ...] pairs.
  const entries = [];
  for (let i = 0; i < raw.length; i += 2) {
    const member = raw[i];
    const score = Number(raw[i + 1]);
    const name = String(member).split(':')[0];
    entries.push({ name, score, rank: entries.length + 1 });
  }

  let rank;
  if (hasScore) {
    const higherScores = await kv.zcount(key, `(${score}`, '+inf');
    rank = Number(higherScores || 0) + 1;
  }
  res.status(200).json({ mode, entries, ...(rank === undefined ? {} : { rank }) });
}
