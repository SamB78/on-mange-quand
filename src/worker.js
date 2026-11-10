// Serveur de « On mange quand ? » : sert la page (public/) et une petite API de sondages.
//
//   POST   /api/polls                     créer un sondage (organisateur = compte connecté, s'il y en a un)
//   GET    /api/polls/:id                 lire un sondage et ses réponses
//   PUT    /api/polls/:id/answers         ajouter ou modifier une réponse { name, ans, note?, prev?, slotsKey? }
//   DELETE /api/polls/:id/answers         supprimer une réponse { name }
//   PUT    /api/polls/:id/final           choisir le créneau final { i } (-1 pour annuler)
//   PUT    /api/polls/:id                 modifier les réglages (organisateur)
//   PUT    /api/polls/:id/closed          clôturer ou rouvrir { closed } (organisateur)
//   DELETE /api/polls/:id                 supprimer le sondage (organisateur)
//   GET    /api/polls/:id/evenement.ics   le créneau choisi, à ajouter dans un agenda
//   GET    /api/me/polls                  les sondages du compte connecté
//   DELETE /api/me                        détacher le compte de ses sondages et réponses (avant sa suppression)
//
// Connexion : en-tête « Authorization: Bearer <jeton Firebase> », vérifié dans src/auth.js.
// Sans compte, tout reste possible : le compte ne sert qu'à organiser et à protéger ses réponses.

import { verifyIdToken } from './auth.js';

const MAX_DAYS = 92;
const MAX_SLOTS = 200;
const MAX_PEOPLE = 40;
const MAX_NOTE = 140;
const MAX_BODY = 20000;
// Horaires indicatifs de chaque moment, heure de Paris (null = journée entière). Mêmes valeurs dans la page.
const MOMENT_HOURS = [null, ['0900', '1200'], ['1200', '1430'], ['1400', '1800'], ['1930', '2300']];
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

// Créneaux d'un sondage, dans l'ordre : mêmes règles que la page.
function buildSlots(cfg) {
  const s = parseYmd(cfg.s), e = parseYmd(cfg.e);
  const ex = new Set(cfg.x);
  const slots = [];
  for (let d = s; d <= e; d++) {
    if (ex.has(d - s)) continue;
    const r = cfg.m[weekday(d)];
    for (let t = 0; t < MOMENT_HOURS.length; t++) if (r & (1 << t)) slots.push({ d, t });
  }
  return slots;
}
const slotCount = (cfg) => buildSlots(cfg).length;

/* ---------- Fichier agenda (.ics) ---------- */
const ymdOf = (d) => new Date(d * DAY_MS).toISOString().slice(0, 10).replace(/-/g, '');
const icsText = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
// Une ligne de fichier agenda fait au plus 75 octets ; la suite repart à la ligne après une espace.
function foldLine(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = '', len = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (len + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; len = 0; }
    cur += ch; len += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}
const PARIS_TZ = [
  'BEGIN:VTIMEZONE', 'TZID:Europe/Paris',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
  'END:VTIMEZONE',
];
function buildIcs(id, cfg, slot, pollUrl) {
  const day = ymdOf(slot.d);
  const hours = MOMENT_HOURS[slot.t];
  const when = hours
    ? [`DTSTART;TZID=Europe/Paris:${day}T${hours[0]}00`, `DTEND;TZID=Europe/Paris:${day}T${hours[1]}00`]
    : [`DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${ymdOf(slot.d + 1)}`];
  const details = (cfg.n ? cfg.n + '\n\n' : '') + 'Horaires indicatifs. Sondage : ' + pollUrl;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//On mange quand//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    ...(hours ? PARIS_TZ : []),
    'BEGIN:VEVENT',
    `UID:${id}@on-mange-quand`,
    `DTSTAMP:${stamp}`,
    ...when,
    `SUMMARY:${icsText(cfg.t)}`,
    `DESCRIPTION:${icsText(details)}`,
    `URL:${pollUrl}`,
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
const fileSlug = (t) => norm(t).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'repas';

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

/* ---------- Comptes et droits ---------- */
// Les réglages qui fixent la liste des créneaux. La page les renvoie pour prouver qu'elle est à jour.
const slotsKey = (cfg) => [cfg.s, cfg.e, cfg.m.join('.'), cfg.x.join('.')].join('|');

// Compte connecté (jeton Firebase vérifié), ou null. Un jeton invalide renvoie 401 pour que la page se reconnecte.
async function currentUser(request, env, url) {
  const match = /^Bearer\s+(\S+)$/.exec(request.headers.get('authorization') || '');
  if (!match || !env.FIREBASE_PROJECT_ID) return null;
  // Les jetons non signés de l'émulateur ne sont acceptés qu'en local, et seulement si « npm run dev » l'a demandé.
  const local = env.AUTH_EMULATOR_LOCAL_ONLY === '1' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  const user = await verifyIdToken(match[1], env.FIREBASE_PROJECT_ID, { allowUnsigned: local });
  if (!user) throw new HttpError(401, 'Votre session a expiré. Reconnectez-vous.');
  return user;
}

async function loadPoll(env, id) {
  const row = await env.DB.prepare('SELECT id, config, final_idx, owner_uid, closed FROM polls WHERE id = ?').bind(id).first();
  if (!row) throw new HttpError(404, 'Ce sondage n’existe pas ou a été supprimé.');
  return row;
}

// Règles :
// - sondage sans organisateur (créé sans compte) : tout le monde peut tout faire, sauf modifier les réglages ou supprimer ;
// - sondage avec organisateur : lui seul choisit la date, modifie, clôture ou supprime ;
//   une réponse donnée en étant connecté n'est modifiable que par son auteur ou l'organisateur ;
// - sondage clôturé : plus personne ne modifie les réponses, sauf l'organisateur.
const isOwner = (row, user) => !!(row.owner_uid && user && row.owner_uid === user.uid);
function canEditAnswer(row, user, answer) {
  if (isOwner(row, user)) return true;
  if (row.closed) return false;
  if (!row.owner_uid || !answer || !answer.uid) return true;
  return !!user && answer.uid === user.uid;
}

async function pollResponse(env, row, user) {
  const { results } = await env.DB
    .prepare('SELECT name, ans, updated_at, note, uid FROM answers WHERE poll_id = ? ORDER BY created_at, name_key')
    .bind(row.id)
    .all();
  return {
    i: row.id,
    ...JSON.parse(row.config),
    f: row.final_idx ?? -1,
    owned: !!row.owner_uid,
    isOwner: isOwner(row, user),
    closed: !!row.closed,
    p: results.map((r) => [r.name, r.ans, r.updated_at, r.note, canEditAnswer(row, user, r), !!user && r.uid === user.uid]),
  };
}

async function handleMe(request, env, url, parts) {
  const user = await currentUser(request, env, url);
  if (!user) throw new HttpError(401, 'Connectez-vous pour voir cette page.');
  if (parts.length === 3 && parts[2] === 'polls' && request.method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT p.id, p.config, p.updated_at, p.owner_uid = ?1 AS owner,
              (SELECT COUNT(*) FROM answers a WHERE a.poll_id = p.id) AS answers
         FROM polls p
        WHERE p.owner_uid = ?1 OR p.id IN (SELECT poll_id FROM answers WHERE uid = ?1)
        ORDER BY p.updated_at DESC
        LIMIT 100`
    ).bind(user.uid).all();
    return json({
      polls: results.map((r) => {
        const cfg = JSON.parse(r.config);
        return { i: r.id, t: cfg.t, s: cfg.s, e: cfg.e, owner: !!r.owner, answers: r.answers };
      }),
    });
  }
  if (parts.length === 2 && request.method === 'DELETE') {
    // Avant la suppression du compte : ses réponses restent mais ne lui sont plus liées,
    // ses sondages restent accessibles à leurs participants, sans organisateur ni clôture.
    await env.DB.batch([
      env.DB.prepare('UPDATE answers SET uid = NULL WHERE uid = ?').bind(user.uid),
      env.DB.prepare('UPDATE polls SET owner_uid = NULL, closed = 0 WHERE owner_uid = ?').bind(user.uid),
    ]);
    return json({ detached: true });
  }
  throw new HttpError(404, 'Adresse inconnue.');
}

async function handleApi(request, env, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', 'polls' | 'me', ...]
  const method = request.method;
  if (parts[1] === 'me') return handleMe(request, env, url, parts);
  if (parts[1] !== 'polls' || parts.length > 4) throw new HttpError(404, 'Adresse inconnue.');
  const user = await currentUser(request, env, url);

  if (parts.length === 2) {
    if (method !== 'POST') throw new HttpError(405, 'Méthode non autorisée.');
    const cfg = validateConfig(await readBody(request));
    const id = newId();
    const now = Date.now();
    const row = { id, config: JSON.stringify(cfg), final_idx: null, owner_uid: user ? user.uid : null, closed: 0 };
    await env.DB.prepare('INSERT INTO polls (id, config, final_idx, owner_uid, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, ?)')
      .bind(id, row.config, row.owner_uid, now, now)
      .run();
    return json(await pollResponse(env, row, user), 201);
  }

  const id = parts[2];
  if (!ID_RE.test(id)) throw new HttpError(404, 'Ce sondage n’existe pas ou a été supprimé.');
  const row = await loadPoll(env, id);
  const cfg = JSON.parse(row.config);
  const action = parts[3] || '';
  const now = Date.now();
  const touch = env.DB.prepare('UPDATE polls SET updated_at = ? WHERE id = ?').bind(now, id);
  const ownerOnly = (message) => { if (!isOwner(row, user)) throw new HttpError(403, message); };
  const ownerIfOwned = (message) => { if (row.owner_uid) ownerOnly(message); };
  const notClosed = () => {
    if (row.closed && !isOwner(row, user)) throw new HttpError(403, 'Le sondage est clôturé : les réponses ne peuvent plus changer.');
  };

  if (!action) {
    if (method === 'GET') return json(await pollResponse(env, row, user));

    if (method === 'PUT') {
      ownerOnly(row.owner_uid
        ? 'Seul l’organisateur peut modifier le sondage.'
        : 'Ce sondage a été créé sans compte : ses réglages ne peuvent plus être modifiés.');
      const next = validateConfig(await readBody(request));
      // Les dispos déjà données suivent leur créneau (même jour, même moment) ; celles des créneaux retirés sont perdues.
      const oldSlots = buildSlots(cfg), newSlots = buildSlots(next);
      const slotKey = (sl) => sl.d * 8 + sl.t;
      const oldIndex = new Map(oldSlots.map((sl, i) => [slotKey(sl), i]));
      const remap = (ans) => newSlots.map((sl) => { const i = oldIndex.get(slotKey(sl)); return i == null ? '0' : ans[i] || '0'; }).join('');
      const finalSlot = row.final_idx == null ? null : oldSlots[row.final_idx];
      const found = finalSlot ? newSlots.findIndex((sl) => slotKey(sl) === slotKey(finalSlot)) : -1;
      const finalIdx = found >= 0 ? found : null;
      const config = JSON.stringify(next);
      const { results } = await env.DB.prepare('SELECT name_key, ans FROM answers WHERE poll_id = ?').bind(id).all();
      await env.DB.batch([
        env.DB.prepare('UPDATE polls SET config = ?, final_idx = ?, updated_at = ? WHERE id = ?').bind(config, finalIdx, now, id),
        ...results.map((r) => env.DB.prepare('UPDATE answers SET ans = ? WHERE poll_id = ? AND name_key = ?').bind(remap(r.ans), id, r.name_key)),
      ]);
      return json(await pollResponse(env, { ...row, config, final_idx: finalIdx }, user));
    }

    if (method === 'DELETE') {
      ownerOnly(row.owner_uid
        ? 'Seul l’organisateur peut supprimer le sondage.'
        : 'Ce sondage a été créé sans compte : il ne peut pas être supprimé.');
      await env.DB.batch([
        env.DB.prepare('DELETE FROM answers WHERE poll_id = ?').bind(id),
        env.DB.prepare('DELETE FROM polls WHERE id = ?').bind(id),
      ]);
      return json({ deleted: true });
    }
    throw new HttpError(405, 'Méthode non autorisée.');
  }

  if (action === 'answers' && method === 'PUT') {
    notClosed();
    const body = await readBody(request);
    if (body.slotsKey != null && body.slotsKey !== slotsKey(cfg)) {
      throw new HttpError(409, 'L’organisateur vient de modifier les dates du sondage. Rechargez la page, puis cochez à nouveau vos dispos.');
    }
    const slots = slotCount(cfg);
    const name = cleanText(body.name, 40);
    if (!name) throw new HttpError(400, 'Indiquez votre prénom pour enregistrer.');
    const ans = String(body.ans ?? '');
    if (!/^[012]*$/.test(ans) || ans.length > slots) throw new HttpError(400, 'Réponse invalide. Rechargez la page et réessayez.');
    const note = cleanText(body.note, MAX_NOTE);
    const key = norm(name);
    const prevKey = body.prev ? norm(cleanText(body.prev, 40)) : '';
    const renamed = prevKey && prevKey !== key;
    const find = (k) => env.DB.prepare('SELECT uid FROM answers WHERE poll_id = ? AND name_key = ?').bind(id, k).first();
    const target = await find(key);
    const previous = renamed ? await find(prevKey) : null;
    if (target && !canEditAnswer(row, user, target)) {
      throw new HttpError(403, `${name} a répondu avec son compte : seul ${name} ou l’organisateur peut modifier cette réponse. Ajoutez une initiale pour vous distinguer.`);
    }
    if (previous && !canEditAnswer(row, user, previous)) {
      throw new HttpError(403, 'Seule la personne qui a donné cette réponse, ou l’organisateur, peut la modifier.');
    }
    if (!target) {
      const { c } = await env.DB.prepare('SELECT COUNT(*) AS c FROM answers WHERE poll_id = ?').bind(id).first();
      if (c - (previous ? 1 : 0) >= MAX_PEOPLE) throw new HttpError(409, `Le sondage est complet (${MAX_PEOPLE} personnes maximum).`);
    }
    // Une réponse garde son auteur ; une nouvelle réponse est liée au compte connecté, s'il y en a un.
    const author = previous ? previous.uid : target ? target.uid : user ? user.uid : null;
    const statements = [];
    if (previous) statements.push(env.DB.prepare('DELETE FROM answers WHERE poll_id = ? AND name_key = ?').bind(id, prevKey));
    statements.push(
      env.DB.prepare(
        `INSERT INTO answers (poll_id, name_key, name, ans, note, uid, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (poll_id, name_key) DO UPDATE SET name = excluded.name, ans = excluded.ans, note = excluded.note,
           uid = excluded.uid, updated_at = excluded.updated_at`
      ).bind(id, key, name, ans.padEnd(slots, '0'), note, author ?? null, now, now),
      touch
    );
    await env.DB.batch(statements);
    return json(await pollResponse(env, row, user));
  }

  if (action === 'answers' && method === 'DELETE') {
    notClosed();
    const key = norm(cleanText((await readBody(request)).name, 40));
    if (!key) throw new HttpError(400, 'Réponse à supprimer introuvable.');
    const target = await env.DB.prepare('SELECT uid FROM answers WHERE poll_id = ? AND name_key = ?').bind(id, key).first();
    if (target && !canEditAnswer(row, user, target)) {
      throw new HttpError(403, 'Seule la personne qui a donné cette réponse, ou l’organisateur, peut la supprimer.');
    }
    await env.DB.batch([env.DB.prepare('DELETE FROM answers WHERE poll_id = ? AND name_key = ?').bind(id, key), touch]);
    return json(await pollResponse(env, row, user));
  }

  if (action === 'final' && method === 'PUT') {
    ownerIfOwned('Seul l’organisateur peut choisir la date finale.');
    const i = Number((await readBody(request)).i);
    const finalIdx = Number.isInteger(i) && i >= 0 && i < slotCount(cfg) ? i : null;
    await env.DB.prepare('UPDATE polls SET final_idx = ?, updated_at = ? WHERE id = ?').bind(finalIdx, now, id).run();
    return json(await pollResponse(env, { ...row, final_idx: finalIdx }, user));
  }

  if (action === 'closed' && method === 'PUT') {
    ownerOnly('Seul l’organisateur peut clôturer le sondage.');
    const closed = (await readBody(request)).closed ? 1 : 0;
    await env.DB.prepare('UPDATE polls SET closed = ?, updated_at = ? WHERE id = ?').bind(closed, now, id).run();
    return json(await pollResponse(env, { ...row, closed }, user));
  }

  if (action === 'evenement.ics' && method === 'GET') {
    const slot = row.final_idx == null ? null : buildSlots(cfg)[row.final_idx];
    if (!slot) throw new HttpError(404, 'Aucun créneau n’a encore été choisi pour ce repas.');
    return new Response(buildIcs(id, cfg, slot, `${url.origin}/#${id}`), {
      headers: {
        'content-type': 'text/calendar; charset=utf-8',
        'content-disposition': `attachment; filename="${fileSlug(cfg.t)}.ics"`,
        'cache-control': 'no-store',
      },
    });
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
