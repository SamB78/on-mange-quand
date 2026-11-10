// Serveur de « On mange quand ? » : sert la page (public/) et une petite API de sondages.
//
//   POST   /api/polls                     créer un sondage (organisateur = compte connecté, s'il y en a un)
//   GET    /api/polls/:id                 lire un sondage et ses réponses
//   POST   /api/polls/:id/pin             donner le code d'accès { pin } ; le bon code pose un cookie pour ce sondage
//   PUT    /api/polls/:id/answers         ajouter ou modifier une réponse { name, ans, note?, prev?, slotsKey? }
//   DELETE /api/polls/:id/answers         supprimer une réponse { name }
//   PUT    /api/polls/:id/final           choisir le créneau final { i } (-1 pour annuler)
//   PUT    /api/polls/:id                 modifier les réglages (organisateur)
//   PUT    /api/polls/:id/closed          clôturer ou rouvrir { closed } (organisateur)
//   DELETE /api/polls/:id                 supprimer le sondage (organisateur)
//   GET    /api/polls/:id/evenement.ics   le créneau choisi, à ajouter dans un agenda
//   GET    /api/me/polls                  les sondages du compte connecté (avec la date choisie, pour signaler les conflits)
//   GET    /api/me/agenda                 le lien d'agenda personnel du compte ({ url } ou { url: null })
//   POST   /api/me/agenda                 créer le lien d'agenda, ou le remplacer par un nouveau
//   DELETE /api/me/agenda                 désactiver le lien d'agenda
//   DELETE /api/me                        détacher le compte de ses sondages et réponses (avant sa suppression)
//   GET    /api/agenda/:token.ics         le lien d'agenda : les repas décidés du compte (sans connexion, le jeton suffit)
//
// Connexion : en-tête « Authorization: Bearer <jeton Firebase> », vérifié dans src/auth.js.
// Sans compte, tout reste possible : le compte ne sert qu'à organiser et à protéger ses réponses.
// Un sondage protégé par un code (choisi par l'organisateur) ne s'ouvre qu'à l'organisateur et à ceux qui ont donné le code.

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
const FEED_FILE_RE = /^([a-z2-7]{32})\.ics$/; // adresse du lien d'agenda : jeton secret + .ics
const B32 = 'abcdefghijklmnopqrstuvwxyz234567';
const PIN_RE = /^\d{4,6}$/;
const PIN_MAX_TRIES = 5; // essais de code par sondage et par adresse IP…
const PIN_WINDOW_MS = 15 * 60000; // …sur 15 minutes

class HttpError extends Error {
  // extra : champs ajoutés à la réponse d'erreur (ex. { pin: true } pour que la page demande le code).
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

function newId(length = 10) {
  const bytes = new Uint8Array(length);
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
// x : jours exclus ; a : jours ajoutés hors des jours de la semaine choisis (jours fériés),
// avec tous les moments du sondage. Les sondages d'avant les jours ajoutés n'ont pas de « a ».
function buildSlots(cfg) {
  const s = parseYmd(cfg.s), e = parseYmd(cfg.e);
  const ex = new Set(cfg.x), add = new Set(cfg.a || []);
  const all = cfg.m.reduce((u, r) => u | r, 0);
  const slots = [];
  for (let d = s; d <= e; d++) {
    if (ex.has(d - s)) continue;
    const r = cfg.m[weekday(d)] || (add.has(d - s) ? all : 0);
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
const icsStamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
// Un repas décidé. L'identifiant ne dépend que du sondage : si la date change, l'agenda déplace le même événement.
function icsEvent(id, cfg, slot, pollUrl, stampMs) {
  const day = ymdOf(slot.d);
  const hours = MOMENT_HOURS[slot.t];
  const when = hours
    ? [`DTSTART;TZID=Europe/Paris:${day}T${hours[0]}00`, `DTEND;TZID=Europe/Paris:${day}T${hours[1]}00`]
    : [`DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${ymdOf(slot.d + 1)}`];
  const details = (cfg.n ? cfg.n + '\n\n' : '') + 'Horaires indicatifs. Sondage : ' + pollUrl;
  return [
    'BEGIN:VEVENT',
    `UID:${id}@on-mange-quand`,
    `DTSTAMP:${icsStamp(stampMs)}`,
    ...when,
    `SUMMARY:${icsText(cfg.t)}`,
    `DESCRIPTION:${icsText(details)}`,
    `URL:${pollUrl}`,
    'END:VEVENT',
  ];
}
// Fichier agenda complet. extra : en-têtes du lien d'agenda (nom, fréquence de mise à jour).
function icsCalendar(events, extra = []) {
  const timed = events.some((ev) => ev.some((l) => l.startsWith('DTSTART;TZID')));
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//On mange quand//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    ...extra,
    ...(timed ? PARIS_TZ : []),
    ...events.flat(),
    'END:VCALENDAR',
  ];
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
const buildIcs = (id, cfg, slot, pollUrl) => icsCalendar([icsEvent(id, cfg, slot, pollUrl, Date.now())]);
const fileSlug = (t) => norm(t).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'repas';

function validateConfig(b) {
  const s = parseYmd(String(b.s ?? '')), e = parseYmd(String(b.e ?? ''));
  if (!Number.isFinite(s) || !Number.isFinite(e)) throw new HttpError(400, 'Choisissez une date de début et une date de fin.');
  if (e < s) throw new HttpError(400, 'La date de fin doit être après la date de début.');
  if (e - s >= MAX_DAYS) throw new HttpError(400, 'Période trop longue : 3 mois maximum.');
  if (!Array.isArray(b.m) || b.m.length !== 7 || !b.m.every(Number.isInteger)) throw new HttpError(400, 'Jours ou moments invalides.');
  const m = b.m.map((r) => r & 31);
  const offsets = (list, keep) => (Array.isArray(list)
    ? [...new Set(list.filter((o) => Number.isInteger(o) && o >= 0 && o <= e - s && keep(o)))].sort((p, q) => p - q)
    : []);
  const cfg = {
    t: cleanText(b.t, 80) || 'Repas entre amis',
    n: cleanText(b.n, 160),
    s: String(b.s),
    e: String(b.e),
    m,
    x: offsets(b.x, () => true),
    // Un jour ajouté n'a de sens que si son jour de la semaine n'est pas déjà choisi.
    a: offsets(b.a, (o) => !m[weekday(s + o)]),
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
// Les jours ajoutés n'y figurent que s'il y en a : la clé des sondages sans jour ajouté ne change pas.
const slotsKey = (cfg) => [cfg.s, cfg.e, cfg.m.join('.'), cfg.x.join('.')].concat(cfg.a && cfg.a.length ? [cfg.a.join('.')] : []).join('|');

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
  const row = await env.DB.prepare('SELECT id, config, final_idx, owner_uid, closed, pin FROM polls WHERE id = ?').bind(id).first();
  if (!row) throw new HttpError(404, 'Ce sondage n’existe pas ou a été supprimé.');
  return row;
}

/* ---------- Code d'accès ---------- */
// Le code est facultatif et réservé aux organisateurs connectés : ils le retrouvent toujours sur la page du sondage.
function cleanPin(v) {
  const pin = String(v ?? '').trim();
  if (!pin) return null;
  if (!PIN_RE.test(pin)) throw new HttpError(400, 'Le code d’accès doit faire 4 à 6 chiffres.');
  return pin;
}
async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
// Le cookie ne contient pas le code mais une empreinte : il ne vaut plus rien si l'organisateur change le code.
const pinToken = async (id, pin) => (await sha256Hex(`on-mange-quand|${id}|${pin}`)).slice(0, 32);
const pinCookieName = (id) => `omq_pin_${id}`;
function readCookie(request, name) {
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}
async function hasPinCookie(request, row) {
  return readCookie(request, pinCookieName(row.id)) === await pinToken(row.id, row.pin);
}
// Cookie limité aux adresses de ce sondage : il accompagne aussi le lien du fichier agenda.
async function pinCookie(url, row) {
  return `${pinCookieName(row.id)}=${await pinToken(row.id, row.pin)}; Path=/api/polls/${row.id}; Max-Age=31536000; HttpOnly; SameSite=Lax${url.protocol === 'https:' ? '; Secure' : ''}`;
}
// Compte un essai avant de comparer, en une seule requête : des essais lancés en parallèle ne passent pas entre les mailles.
async function checkPin(env, request, row, pin) {
  const now = Date.now();
  const ipHash = (await sha256Hex(`${row.id}|${request.headers.get('cf-connecting-ip') || ''}`)).slice(0, 32);
  const [, counted] = await env.DB.batch([
    env.DB.prepare('DELETE FROM pin_tries WHERE since <= ?').bind(now - PIN_WINDOW_MS),
    env.DB.prepare(
      `INSERT INTO pin_tries (poll_id, ip_hash, tries, since) VALUES (?, ?, 1, ?)
       ON CONFLICT (poll_id, ip_hash) DO UPDATE SET tries = tries + 1
       RETURNING tries, since`
    ).bind(row.id, ipHash, now),
  ]);
  const { tries, since } = counted.results[0];
  if (tries > PIN_MAX_TRIES) {
    const minutes = Math.max(1, Math.ceil((since + PIN_WINDOW_MS - now) / 60000));
    throw new HttpError(429, `Trop d’essais. Réessayez dans ${minutes} minute${minutes > 1 ? 's' : ''}.`, { pin: true });
  }
  if (pin !== row.pin) {
    const left = PIN_MAX_TRIES - tries;
    throw new HttpError(403, left === 0
      ? 'Code incorrect. Trop d’essais : réessayez dans 15 minutes.'
      : `Code incorrect.${left <= 2 ? ` Encore ${left} essai${left > 1 ? 's' : ''}.` : ''}`, { pin: true });
  }
  await env.DB.prepare('DELETE FROM pin_tries WHERE poll_id = ? AND ip_hash = ?').bind(row.id, ipHash).run();
}

// Règles :
// - sondage sans organisateur (créé sans compte) : tout le monde peut tout faire, sauf modifier les réglages ou supprimer ;
// - sondage avec organisateur : lui seul choisit la date, modifie, clôture ou supprime ;
//   une réponse donnée en étant connecté n'est modifiable que par son auteur ou l'organisateur ;
// - sondage clôturé : plus personne ne modifie les réponses, sauf l'organisateur ;
// - sondage protégé par un code : rien n'est lisible ni modifiable sans le code, sauf pour l'organisateur.
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
    hasPin: !!row.pin,
    pin: isOwner(row, user) ? row.pin || '' : undefined, // le code lui-même, pour l'organisateur seulement
    p: results.map((r) => [r.name, r.ans, r.updated_at, r.note, canEditAnswer(row, user, r), !!user && r.uid === user.uid]),
  };
}

// Réponse avec le sondage. Si le sondage a un code et que ce navigateur n'a pas encore le cookie
// (l'organisateur sur un nouvel appareil, ou quelqu'un qui vient de donner le code), on le pose.
async function pollJson(env, request, url, row, user, status = 200) {
  const res = json(await pollResponse(env, row, user), status);
  if (row.pin && !(await hasPinCookie(request, row))) res.headers.append('set-cookie', await pinCookie(url, row));
  return res;
}

// Sondages d'un compte (organisés ou répondus), avec le créneau choisi et s'il y participe :
// l'organisateur toujours ; sinon il faut qu'une réponse du compte soit « dispo » ou « si besoin » sur ce créneau.
async function accountPolls(env, uid) {
  const { results } = await env.DB.prepare(
    `SELECT p.id, p.config, p.final_idx, p.updated_at, p.owner_uid = ?1 AS owner,
            (SELECT COUNT(*) FROM answers a WHERE a.poll_id = p.id) AS answers,
            (SELECT GROUP_CONCAT(a.ans) FROM answers a WHERE a.poll_id = p.id AND a.uid = ?1) AS mine
       FROM polls p
      WHERE p.owner_uid = ?1 OR p.id IN (SELECT poll_id FROM answers WHERE uid = ?1)
      ORDER BY p.updated_at DESC
      LIMIT 100`
  ).bind(uid).all();
  return results.map((r) => {
    const cfg = JSON.parse(r.config);
    const slot = r.final_idx == null ? null : buildSlots(cfg)[r.final_idx] || null;
    const yes = String(r.mine || '').split(',').some((ans) => ans[r.final_idx] === '1' || ans[r.final_idx] === '2');
    return { id: r.id, cfg, owner: !!r.owner, answers: r.answers, updated: r.updated_at, slot, going: !!slot && (!!r.owner || yes) };
  });
}

async function handleMe(request, env, url, parts) {
  const user = await currentUser(request, env, url);
  if (!user) throw new HttpError(401, 'Connectez-vous pour voir cette page.');
  const method = request.method;
  if (parts.length === 3 && parts[2] === 'polls' && method === 'GET') {
    // fd, ft : jour et moment choisis, quand le compte y participe (la page s'en sert pour signaler les conflits).
    return json({
      polls: (await accountPolls(env, user.uid)).map((p) => ({
        i: p.id, t: p.cfg.t, s: p.cfg.s, e: p.cfg.e, owner: p.owner, answers: p.answers,
        ...(p.going ? { fd: ymdOf(p.slot.d), ft: p.slot.t } : {}),
      })),
    });
  }
  if (parts.length === 3 && parts[2] === 'agenda') {
    const feedUrl = (token) => (token ? `${url.origin}/api/agenda/${token}.ics` : null);
    if (method === 'GET') {
      const row = await env.DB.prepare('SELECT token FROM feeds WHERE uid = ?').bind(user.uid).first();
      return json({ url: feedUrl(row && row.token) });
    }
    if (method === 'POST') {
      // Un nouveau jeton remplace l'ancien : l'ancien lien cesse aussitôt de marcher.
      const token = newId(32);
      await env.DB.prepare(
        'INSERT INTO feeds (uid, token, created_at) VALUES (?, ?, ?) ON CONFLICT (uid) DO UPDATE SET token = excluded.token, created_at = excluded.created_at'
      ).bind(user.uid, token, Date.now()).run();
      return json({ url: feedUrl(token) });
    }
    if (method === 'DELETE') {
      await env.DB.prepare('DELETE FROM feeds WHERE uid = ?').bind(user.uid).run();
      return json({ url: null });
    }
  }
  if (parts.length === 2 && method === 'DELETE') {
    // Avant la suppression du compte : ses réponses restent mais ne lui sont plus liées,
    // ses sondages restent accessibles à leurs participants, sans organisateur ni clôture.
    await env.DB.batch([
      env.DB.prepare('UPDATE answers SET uid = NULL WHERE uid = ?').bind(user.uid),
      env.DB.prepare('UPDATE polls SET owner_uid = NULL, closed = 0 WHERE owner_uid = ?').bind(user.uid),
      env.DB.prepare('DELETE FROM feeds WHERE uid = ?').bind(user.uid),
    ]);
    return json({ detached: true });
  }
  throw new HttpError(404, 'Adresse inconnue.');
}

// Lien d'agenda : lu par les applications d'agenda, sans connexion. Le jeton secret de l'adresse désigne le compte.
async function handleFeed(request, env, url, parts) {
  const match = parts.length === 3 && (request.method === 'GET' || request.method === 'HEAD') ? FEED_FILE_RE.exec(parts[2]) : null;
  if (!match) throw new HttpError(404, 'Adresse inconnue.');
  const row = await env.DB.prepare('SELECT uid FROM feeds WHERE token = ?').bind(match[1]).first();
  if (!row) throw new HttpError(404, 'Ce lien d’agenda n’existe plus. Créez-en un nouveau dans « Mon compte ».');
  const events = (await accountPolls(env, row.uid))
    .filter((p) => p.going)
    .map((p) => icsEvent(p.id, p.cfg, p.slot, `${url.origin}/#${p.id}`, p.updated));
  const body = icsCalendar(events, [
    'X-WR-CALNAME:Repas · On mange quand ?',
    'X-WR-TIMEZONE:Europe/Paris',
    // Indication pour les agendas qui la suivent (Apple, Outlook) ; Google Agenda choisit son propre rythme.
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ]);
  return new Response(request.method === 'HEAD' ? null : body, {
    headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'no-store' },
  });
}

async function handleApi(request, env, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', 'polls' | 'me' | 'agenda', ...]
  const method = request.method;
  if (parts[1] === 'me') return handleMe(request, env, url, parts);
  if (parts[1] === 'agenda') return handleFeed(request, env, url, parts);
  if (parts[1] !== 'polls' || parts.length > 4) throw new HttpError(404, 'Adresse inconnue.');
  const user = await currentUser(request, env, url);
  const reply = (r, status) => pollJson(env, request, url, r, user, status);

  if (parts.length === 2) {
    if (method !== 'POST') throw new HttpError(405, 'Méthode non autorisée.');
    const body = await readBody(request);
    const cfg = validateConfig(body);
    const pin = cleanPin(body.pin);
    // Sans compte, personne ne pourrait retrouver un code perdu : il est réservé aux organisateurs connectés.
    if (pin && !user) throw new HttpError(400, 'Connectez-vous pour protéger le sondage par un code : vous pourrez toujours le retrouver.');
    const id = newId();
    const now = Date.now();
    const row = { id, config: JSON.stringify(cfg), final_idx: null, owner_uid: user ? user.uid : null, closed: 0, pin };
    await env.DB.prepare('INSERT INTO polls (id, config, final_idx, owner_uid, pin, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, ?, ?)')
      .bind(id, row.config, row.owner_uid, pin, now, now)
      .run();
    return reply(row, 201);
  }

  const id = parts[2];
  if (!ID_RE.test(id)) throw new HttpError(404, 'Ce sondage n’existe pas ou a été supprimé.');
  const row = await loadPoll(env, id);
  const cfg = JSON.parse(row.config);
  const action = parts[3] || '';
  const now = Date.now();

  if (action === 'pin') {
    if (method !== 'POST') throw new HttpError(405, 'Méthode non autorisée.');
    if (row.pin && !isOwner(row, user)) await checkPin(env, request, row, String((await readBody(request)).pin ?? '').trim());
    return reply(row);
  }
  if (row.pin && !isOwner(row, user) && !(await hasPinCookie(request, row))) {
    throw new HttpError(403, 'Ce sondage est protégé par un code.', { pin: true });
  }

  const touch = env.DB.prepare('UPDATE polls SET updated_at = ? WHERE id = ?').bind(now, id);
  const ownerOnly = (message) => { if (!isOwner(row, user)) throw new HttpError(403, message); };
  const ownerIfOwned = (message) => { if (row.owner_uid) ownerOnly(message); };
  const notClosed = () => {
    if (row.closed && !isOwner(row, user)) throw new HttpError(403, 'Le sondage est clôturé : les réponses ne peuvent plus changer.');
  };

  if (!action) {
    if (method === 'GET') return reply(row);

    if (method === 'PUT') {
      ownerOnly(row.owner_uid
        ? 'Seul l’organisateur peut modifier le sondage.'
        : 'Ce sondage a été créé sans compte : ses réglages ne peuvent plus être modifiés.');
      const body = await readBody(request);
      const next = validateConfig(body);
      // Sans champ « pin » (page d'avant les codes), le code ne change pas ; vide, il est retiré.
      const pin = 'pin' in body ? cleanPin(body.pin) : row.pin;
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
        env.DB.prepare('UPDATE polls SET config = ?, final_idx = ?, pin = ?, updated_at = ? WHERE id = ?').bind(config, finalIdx, pin, now, id),
        ...results.map((r) => env.DB.prepare('UPDATE answers SET ans = ? WHERE poll_id = ? AND name_key = ?').bind(remap(r.ans), id, r.name_key)),
      ]);
      return reply({ ...row, config, final_idx: finalIdx, pin });
    }

    if (method === 'DELETE') {
      ownerOnly(row.owner_uid
        ? 'Seul l’organisateur peut supprimer le sondage.'
        : 'Ce sondage a été créé sans compte : il ne peut pas être supprimé.');
      await env.DB.batch([
        env.DB.prepare('DELETE FROM answers WHERE poll_id = ?').bind(id),
        env.DB.prepare('DELETE FROM pin_tries WHERE poll_id = ?').bind(id),
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
    return reply(row);
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
    return reply(row);
  }

  if (action === 'final' && method === 'PUT') {
    ownerIfOwned('Seul l’organisateur peut choisir la date finale.');
    const i = Number((await readBody(request)).i);
    const finalIdx = Number.isInteger(i) && i >= 0 && i < slotCount(cfg) ? i : null;
    await env.DB.prepare('UPDATE polls SET final_idx = ?, updated_at = ? WHERE id = ?').bind(finalIdx, now, id).run();
    return reply({ ...row, final_idx: finalIdx });
  }

  if (action === 'closed' && method === 'PUT') {
    ownerOnly('Seul l’organisateur peut clôturer le sondage.');
    const closed = (await readBody(request)).closed ? 1 : 0;
    await env.DB.prepare('UPDATE polls SET closed = ?, updated_at = ? WHERE id = ?').bind(closed, now, id).run();
    return reply({ ...row, closed });
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
        if (err instanceof HttpError) return json({ ...err.extra, error: err.message }, err.status);
        console.error(err);
        return json({ error: 'Le serveur a rencontré un problème. Réessayez dans un instant.' }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  },
};
