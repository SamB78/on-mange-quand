// Serveur de « On mange quand ? » : sert la page (public/) et une petite API de sondages.
//
//   POST   /api/polls                  créer un sondage
//   GET    /api/polls/:id              lire un sondage et ses réponses
//   PUT    /api/polls/:id/answers      ajouter ou modifier une réponse { name, ans, prev? }
//   DELETE /api/polls/:id/answers      supprimer une réponse { name }
//   PUT    /api/polls/:id/final        choisir le créneau final { i } (-1 pour annuler)

const MAX_DAYS = 92;
const MAX_SLOTS = 200;
const MAX_PEOPLE = 40;
const MAX_BODY = 20000;
const DAY_MS = 86400000;
const ID_RE = /^[a-z2-7]{10}$/;
const B32 = 'abcdefghijklmnopqrstuvwxyz234567';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

function newId() {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let id = '';
  for (const b of bytes) id += B32[b & 31];
  return id;
}

const norm = (s) =>
  String(s).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
const cleanText = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const weekday = (d) => (new Date(d * DAY_MS).getUTCDay() + 6) % 7;
const popcount = (r) => (r & 1) + ((r >> 1) & 1) + ((r >> 2) & 1) + ((r >> 3) & 1) + ((r >> 4) & 1);

function parseYmd(s) {
  if (!/^\d{8}$/.test(s)) return NaN;
  const y = +s.slice(0, 4), m = +s.slice(4, 6) - 1, d = +s.slice(6, 8);
  const t = new Date(Date.UTC(y, m, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m || t.getUTCDate() !== d) return NaN;
  return t.getTime() / DAY_MS;
}

// Nombre de créneaux d'un sondage : mêmes règles que la page.
function slotCount(cfg) {
  const s = parseYmd(cfg.s), e = parseYmd(cfg.e);
  const ex = new Set(cfg.x);
  let n = 0;
  for (let d = s; d <= e; d++) if (!ex.has(d - s)) n += popcount(cfg.m[weekday(d)]);
  return n;
}

function validateConfig(b) {
  const s = parseYmd(String(b.s ?? '')), e = parseYmd(String(b.e ?? ''));
  if (!Number.isFinite(s) || !Number.isFinite(e)) throw new HttpError(400, 'Choisissez une date de début et une date de fin.');
  if (e < s) throw new HttpError(400, 'La date de fin doit être après la date de début.');
  if (e - s >= MAX_DAYS) throw new HttpError(400, 'Période trop longue : 3 mois maximum.');
  if (!Array.isArray(b.m) || b.m.length !== 7 || !b.m.every(Number.isInteger)) throw new HttpError(400, 'Jours ou moments invalides.');
  const x = Array.isArray(b.x) ? [...new Set(b.x.filter((o) => Number.isInteger(o) && o >= 0 && o <= e - s))].sort((a, c) => a - c) : [];
  const cfg = {
    t: cleanText(b.t, 80) || 'Repas entre amis',
    n: cleanText(b.n, 160),
    s: String(b.s),
    e: String(b.e),
    m: b.m.map((r) => r & 31),
    x,
  };
  const n = slotCount(cfg);
  if (!n) throw new HttpError(400, 'Aucun créneau : choisissez au moins un jour et un moment.');
  if (n > MAX_SLOTS) throw new HttpError(400, `Trop de créneaux (${n}). ${MAX_SLOTS} maximum.`);
  return cfg;
}

async function readBody(request) {
  const text = await request.text();
  if (text.length > MAX_BODY) throw new HttpError(413, 'Requête trop volumineuse.');
  try {
    const body = JSON.parse(text || '{}');
    if (body && typeof body === 'object' && !Array.isArray(body)) return body;
  } catch (e) {
    // corps illisible : traité juste en dessous
  }
  throw new HttpError(400, 'Requête invalide.');
}

async function loadPoll(env, id) {
  const row = await env.DB.prepare('SELECT id, config, final_idx FROM polls WHERE id = ?').bind(id).first();
  if (!row) throw new HttpError(404, 'Ce sondage n’existe pas ou a été supprimé.');
  return row;
}

async function pollResponse(env, row) {
  const { results } = await env.DB
    .prepare('SELECT name, ans, updated_at FROM answers WHERE poll_id = ? ORDER BY created_at, name_key')
    .bind(row.id)
    .all();
  return {
    i: row.id,
    ...JSON.parse(row.config),
    f: row.final_idx ?? -1,
    p: results.map((r) => [r.name, r.ans, r.updated_at]),
  };
}

async function handleApi(request, env, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', 'polls', id?, action?]
  const method = request.method;
  if (parts[1] !== 'polls' || parts.length > 4) throw new HttpError(404, 'Adresse inconnue.');

  if (parts.length === 2) {
    if (method !== 'POST') throw new HttpError(405, 'Méthode non autorisée.');
    const cfg = validateConfig(await readBody(request));
    const id = newId();
    const now = Date.now();
    const config = JSON.stringify(cfg);
    await env.DB.prepare('INSERT INTO polls (id, config, final_idx, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)')
      .bind(id, config, now, now)
      .run();
    return json(await pollResponse(env, { id, config, final_idx: null }), 201);
  }

  const id = parts[2];
  if (!ID_RE.test(id)) throw new HttpError(404, 'Ce sondage n’existe pas ou a été supprimé.');
  const row = await loadPoll(env, id);
  const action = parts[3] || '';
  const now = Date.now();
  const touch = env.DB.prepare('UPDATE polls SET updated_at = ? WHERE id = ?').bind(now, id);

  if (!action) {
    if (method !== 'GET') throw new HttpError(405, 'Méthode non autorisée.');
    return json(await pollResponse(env, row));
  }

  if (action === 'answers' && method === 'PUT') {
    const body = await readBody(request);
    const cfg = JSON.parse(row.config);
    const slots = slotCount(cfg);
    const name = cleanText(body.name, 40);
    if (!name) throw new HttpError(400, 'Indiquez votre prénom pour enregistrer.');
    const ans = String(body.ans ?? '');
    if (!/^[012]*$/.test(ans) || ans.length > slots) throw new HttpError(400, 'Réponse invalide. Rechargez la page et réessayez.');
    const key = norm(name);
    const prevKey = body.prev ? norm(cleanText(body.prev, 40)) : '';
    const renamed = prevKey && prevKey !== key;

    const exists = await env.DB.prepare('SELECT 1 AS x FROM answers WHERE poll_id = ? AND name_key = ?').bind(id, key).first();
    if (!exists) {
      const { c } = await env.DB.prepare('SELECT COUNT(*) AS c FROM answers WHERE poll_id = ?').bind(id).first();
      if (c - (renamed ? 1 : 0) >= MAX_PEOPLE) throw new HttpError(409, `Le sondage est complet (${MAX_PEOPLE} personnes maximum).`);
    }
    const statements = [];
    if (renamed) statements.push(env.DB.prepare('DELETE FROM answers WHERE poll_id = ? AND name_key = ?').bind(id, prevKey));
    statements.push(
      env.DB.prepare(
        `INSERT INTO answers (poll_id, name_key, name, ans, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (poll_id, name_key) DO UPDATE SET name = excluded.name, ans = excluded.ans, updated_at = excluded.updated_at`
      ).bind(id, key, name, ans.padEnd(slots, '0'), now, now),
      touch
    );
    await env.DB.batch(statements);
    return json(await pollResponse(env, row));
  }

  if (action === 'answers' && method === 'DELETE') {
    const key = norm(cleanText((await readBody(request)).name, 40));
    if (!key) throw new HttpError(400, 'Réponse à supprimer introuvable.');
    await env.DB.batch([env.DB.prepare('DELETE FROM answers WHERE poll_id = ? AND name_key = ?').bind(id, key), touch]);
    return json(await pollResponse(env, row));
  }

  if (action === 'final' && method === 'PUT') {
    const i = Number((await readBody(request)).i);
    const slots = slotCount(JSON.parse(row.config));
    const finalIdx = Number.isInteger(i) && i >= 0 && i < slots ? i : null;
    await env.DB.prepare('UPDATE polls SET final_idx = ?, updated_at = ? WHERE id = ?').bind(finalIdx, now, id).run();
    return json(await pollResponse(env, { ...row, final_idx: finalIdx }));
  }

  throw new HttpError(404, 'Adresse inconnue.');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, url);
      } catch (err) {
        if (err instanceof HttpError) return json({ error: err.message }, err.status);
        console.error(err);
        return json({ error: 'Le serveur a rencontré un problème. Réessayez dans un instant.' }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  },
};
