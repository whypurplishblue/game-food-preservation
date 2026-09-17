import { kv } from '@vercel/kv';
import { isCleanName } from '../../src/shared/nameFilter.js';

const MODES = new Set(['arcade', 'learning']);
const NAME_MAX = 20;
const ROUTE = '/api/leaderboard/submit';

function requestId(req) {
  const value = req.headers?.['x-vercel-id'];
  return Array.isArray(value) ? value[0] : value || null;
}

function writeLog(level, msg, req, startedAt, details = {}) {
  const payload = JSON.stringify({
    level, msg, route: ROUTE, requestId: requestId(req),
    ms: Date.now() - startedAt, ...details,
  });
  if (level === 'error') console.error(payload);
  else if (level === 'warn') console.warn(payload);
  else console.log(payload);
}

export default async function handler(req, res) {
  const startedAt = Date.now();
  writeLog('info', 'leaderboard submission started', req, startedAt, { method: req.method });

  if (req.method !== 'POST') {
    writeLog('warn', 'leaderboard submission rejected', req, startedAt, { reason: 'method_not_allowed' });
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }

  let body = req.body;
  let malformedJson = false;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; malformedJson = true; }
  }
  const { mode, name, score } = body || {};
  // Keep the logged value bounded exactly like the value eligible for storage.
  const cleanedName = String(name || '').trim().slice(0, NAME_MAX);

  if (!MODES.has(mode)) {
    writeLog('warn', 'leaderboard submission rejected', req, startedAt, {
      reason: 'invalid_mode', malformedJson,
      mode: typeof mode === 'string' ? mode.slice(0, 20) : null,
      nameLength: cleanedName.length,
    });
    res.status(400).json({ ok: false, error: 'invalid mode' });
    return;
  }
  const hasUnsafeCharacters = /[<>&"']/.test(cleanedName);
  const passesNameFilter = isCleanName(cleanedName);
  // Defense in depth: the leaderboard screen escapes names before rendering,
  // but reject HTML metacharacters here too so bad data never lands in KV in
  // the first place, regardless of what renders it later.
  if (!cleanedName || hasUnsafeCharacters || !passesNameFilter) {
    writeLog('warn', 'leaderboard submission rejected', req, startedAt, {
      reason: 'invalid_name', mode, nameLength: cleanedName.length,
      emptyName: !cleanedName, hasUnsafeCharacters,
      rejectedByNameFilter: !passesNameFilter,
    });
    res.status(400).json({ ok: false, error: 'invalid name' });
    return;
  }
  if (!Number.isFinite(score) || score < 0) {
    writeLog('warn', 'leaderboard submission rejected', req, startedAt, {
      reason: 'invalid_score', mode, nameLength: cleanedName.length,
      scoreType: typeof score, scoreFinite: Number.isFinite(score),
    });
    res.status(400).json({ ok: false, error: 'invalid score' });
    return;
  }

  try {
    const key = `leaderboard:${mode}`;
    const member = `${cleanedName}:${crypto.randomUUID()}`;
    await kv.zadd(key, { score, member });

    const rank = await kv.zrevrank(key, member);
    writeLog('info', 'leaderboard submission completed', req, startedAt, {
      mode, nameLength: cleanedName.length, rank: (rank ?? 0) + 1,
    });
    res.status(200).json({ ok: true, rank: (rank ?? 0) + 1 });
  } catch (error) {
    writeLog('error', 'leaderboard submission failed', req, startedAt, {
      mode, nameLength: cleanedName.length,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    res.status(500).json({ ok: false, error: 'internal error' });
  }
}
