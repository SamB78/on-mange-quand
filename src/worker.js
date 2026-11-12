// Serveur de « Dispos » : sert la page (public/) et l'API des sondages.
//
//   POST   /api/polls                     créer un sondage (organisateur = compte connecté ; sans compte, tout le monde le gère)
//   GET    /api/polls/:id                 lire un sondage et ses réponses
//   POST   /api/polls/:id/pin             donner le code d'accès { pin } ; le bon code pose un cookie pour ce sondage
//   PUT    /api/polls/:id/answers         ajouter ou modifier une réponse { name, ans, note?, prev?, slotsKey? }
//   DELETE /api/polls/:id/answers         supprimer une réponse { name }
//   PUT    /api/polls/:id/final           choisir le créneau final { i } (-1 pour annuler)
//   PUT    /api/polls/:id                 modifier les réglages (qui gère le sondage)
//   PUT    /api/polls/:id/closed          clôturer ou rouvrir { closed } (qui gère le sondage)
//   POST   /api/polls/:id/claim           devenir l'organisateur d'un sondage qui n'en a pas (toute personne connectée)
//   DELETE /api/polls/:id                 mettre le sondage à la corbeille, 30 jours (qui gère le sondage)
//   POST   /api/polls/:id/restore         sortir le sondage de la corbeille (qui gère le sondage)
//   GET    /api/polls/:id/evenement.ics   le créneau choisi, à ajouter dans un agenda
//   GET    /api/me/polls                  les sondages du compte connecté
//   GET    /api/me/agenda                 le lien d'agenda personnel du compte ({ url } ou { url: null })
//   POST   /api/me/agenda                 créer le lien d'agenda, ou le remplacer par un nouveau
//   DELETE /api/me/agenda                 désactiver le lien d'agenda
//   DELETE /api/me                        détacher le compte de ses sondages et réponses (avant sa suppression)
//   GET    /api/agenda/:token.ics         le lien d'agenda : les dates choisies du compte (sans connexion, le jeton suffit)
//
// Toute autre adresse sans extension (/, /nouveau, /s/:id, /compte, /mentions-legales…) rend la page ; pour /s/:id, le titre du sondage
// est glissé dans l'aperçu du lien (sauf s'il est protégé par un code).
//
// Connexion : en-tête « Authorization: Bearer <jeton Firebase> », vérifié dans src/auth.js.

import { verifyIdToken } from './auth.js';
import {
  DAY_MS, MAX_DAYS, MAX_SLOTS, MAX_PEOPLE, MAX_GUESTS, MAX_NOTE, MOMENT_HOURS, ICONS, SITE_NAME, FEED_NAME, DEFAULT_TITLE,
  TRASH_DAYS, KEEP_MONTHS,
  norm, weekday, parseYmd, ymd, buildSlots, slotsKey, isLate,
} from '../public/shared.js';

const MAX_BODY = 20000;
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

// En-têtes de sécurité de toutes les réponses du serveur. Les fichiers servis tels quels reçoivent les mêmes
// depuis public/_headers : garder les deux listes identiques (npm test le vérifie). La CSP est dans index.html.
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Strict-Transport-Security': 'max-age=31536000',
};
function secured(res) {
  const out = new Response(res.body, res);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) out.headers.set(name, value);
  return out;
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

const cleanText = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const slotCount = (cfg) => buildSlots(cfg).length;

/* ---------- Fichier agenda (.ics) ---------- */
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
const pollUrlOf = (url, id) => `${url.origin}/s/${id}`;
// Une date choisie. L'identifiant ne dépend que du sondage : si la date change, l'agenda déplace le même événement.
function icsEvent(id, cfg, slot, pollUrl, stampMs) {
  const day = ymd(slot.d);
  const hours = MOMENT_HOURS[slot.t];
  const when = hours
    ? [`DTSTART;TZID=Europe/Paris:${day}T${hours[0]}00`, `DTEND;TZID=Europe/Paris:${day}T${hours[1]}00`]
    : [`DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${ymd(slot.d + 1)}`];
  const details = (cfg.n ? cfg.n + '\n\n' : '') + 'Horaires indicatifs. Sondage : ' + pollUrl;
  return [
    'BEGIN:VEVENT',
    `UID:${id}@on-mange-quand`, // ancien nom du projet, gardé : sinon les agendas verraient de nouveaux événements
    `DTSTAMP:${icsStamp(stampMs)}`,
    ...when,
    `SUMMARY:${icsText(cfg.t)}`,
    ...(cfg.l ? [`LOCATION:${icsText(cfg.l)}`] : []),
    `DESCRIPTION:${icsText(details)}`,
    `URL:${pollUrl}`,
    'END:VEVENT',
  ];
}
// Fichier agenda complet. extra : en-têtes du lien d'agenda (nom, fréquence de mise à jour).
function icsCalendar(events, extra = []) {
  const timed = events.some((ev) => ev.some((l) => l.startsWith('DTSTART;TZID')));
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Dispos//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    ...extra,
    ...(timed ? PARIS_TZ : []),
    ...events.flat(),
    'END:VCALENDAR',
  ];
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
const fileSlug = (t) => norm(t).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'dispos';

/* ---------- Réglages d'un sondage ---------- */
// Champs : t nom, n précisions, l lieu, ic pictogramme, s/e période, m moments par jour de la semaine,
// x jours exclus, a jours ajoutés (ancienne forme), o jours réglés à part, dl date limite de réponse, q nombre minimum de personnes,
// g invités attendus, r invités indispensables. Les champs facultatifs vides ne sont pas enregistrés.
function validateConfig(b) {
  const s = parseYmd(b.s), e = parseYmd(b.e);
  if (!Number.isFinite(s) || !Number.isFinite(e)) throw new HttpError(400, 'Choisissez une date de début et une date de fin.');
  if (e < s) throw new HttpError(400, 'La date de fin doit être après la date de début.');
  if (e - s >= MAX_DAYS) throw new HttpError(400, 'Période trop longue : 3 mois maximum.');
  if (!Array.isArray(b.m) || b.m.length !== 7 || !b.m.every(Number.isInteger)) throw new HttpError(400, 'Jours ou moments invalides.');
  // « Journée » couvre tout le jour : elle remplace les autres moments.
  const moments = (r) => (r & 1 ? 1 : r & 31);
  const m = b.m.map(moments);
  const allMoments = m.reduce((u, r) => u | r, 0);
  const offsets = (list, keep) => (Array.isArray(list)
    ? [...new Set(list.filter((o) => Number.isInteger(o) && o >= 0 && o <= e - s && keep(o)))].sort((p, q) => p - q)
    : []);
  const cfg = {
    t: cleanText(b.t, 80) || DEFAULT_TITLE,
    n: cleanText(b.n, 160),
    s: ymd(s),
    e: ymd(e),
    m,
    x: offsets(b.x, () => true),
    // Un jour ajouté n'a de sens que si son jour de la semaine n'a pas déjà tous les moments du sondage.
    a: offsets(b.a, (o) => m[weekday(s + o)] !== allMoments),
  };
  // Jours réglés à part : [jour, moments]. Un jour exclu, sans moment ou identique à la règle n'est pas gardé.
  if (Array.isArray(b.o)) {
    const seen = new Set(cfg.x), own = [];
    for (const p of b.o) {
      if (!Array.isArray(p) || !Number.isInteger(p[0]) || !Number.isInteger(p[1])) continue;
      const o = p[0], r = moments(p[1]);
      if (o < 0 || o > e - s || seen.has(o) || !r || r === m[weekday(s + o)]) continue;
      seen.add(o);
      own.push([o, r]);
    }
    if (own.length) cfg.o = own.sort((p, q) => p[0] - q[0]);
  }
  const place = cleanText(b.l, 80);
  if (place) cfg.l = place;
  if (ICONS.includes(b.ic)) cfg.ic = b.ic;
  if (b.dl != null && b.dl !== '') {
    const dl = parseYmd(b.dl);
    if (!Number.isFinite(dl)) throw new HttpError(400, 'Date limite de réponse invalide.');
    if (dl > e) throw new HttpError(400, 'La date limite de réponse doit tomber avant la fin de la période.');
    cfg.dl = ymd(dl);
  }
  const q = Number(b.q);
  if (Number.isInteger(q) && q >= 2 && q <= MAX_PEOPLE) cfg.q = q;
  if (Array.isArray(b.g)) {
    const seen = new Set();
    const guests = [];
    for (const raw of b.g.slice(0, 200)) {
      const name = cleanText(raw, 40), key = norm(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      guests.push(name);
      if (guests.length >= MAX_GUESTS) break;
    }
    if (guests.length) {
      cfg.g = guests;
      const wanted = new Set((Array.isArray(b.r) ? b.r : []).map((x) => norm(cleanText(x, 40))));
      const required = guests.filter((name) => wanted.has(norm(name)));
      if (required.length) cfg.r = required;
    }
  }
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
  const row = await env.DB.prepare('SELECT id, config, final_idx, owner_uid, closed, pin, deleted_at FROM polls WHERE id = ?').bind(id).first();
  if (!row) throw new HttpError(404, 'Ce sondage n’existe pas ou a été supprimé.');
  return row;
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Règles :
// - sondage avec organisateur (créé en étant connecté, ou rattaché depuis) : lui seul choisit la date, modifie,
//   clôture ou supprime ; lui seul peut poser un code d'accès ;
// - sondage sans organisateur (créé sans compte) : toute personne qui a le lien répond, choisit la date, le modifie,
//   le clôture, le rouvre ou le supprime ; toute personne connectée peut en devenir l'organisateur ;
// - une réponse donnée en étant connecté n'est modifiable que par son auteur ou par l'organisateur ;
// - sondage clôturé ou date limite passée : seul l'organisateur modifie encore les réponses (sans organisateur,
//   personne : il faut d'abord rouvrir le sondage ou repousser la date limite) ;
// - sondage protégé par un code : rien n'est lisible ni modifiable sans le code, sauf pour l'organisateur.
const isOwner = (row, user) => !!(row.owner_uid && user && row.owner_uid === user.uid);
// acc = { user, owner, manage } : manage = peut modifier, clôturer, supprimer (l'organisateur ; sans organisateur, tout le monde).
function accessOf(row, user) {
  const owner = isOwner(row, user);
  return { user, owner, manage: owner || !row.owner_uid };
}
const isFrozen = (row, cfg) => !!row.closed || isLate(cfg);
function canEditAnswer(row, cfg, acc, answer) {
  if (acc.owner) return true;
  if (isFrozen(row, cfg)) return false;
  if (!answer || !answer.uid) return true;
  return !!acc.user && answer.uid === acc.user.uid;
}

/* ---------- Code d'accès ---------- */
// Le code est facultatif et réservé aux organisateurs connectés : ils le retrouvent toujours sur la page du sondage.
function cleanPin(v) {
  const pin = String(v ?? '').trim();
  if (!pin) return null;
  if (!PIN_RE.test(pin)) throw new HttpError(400, 'Le code d’accès doit faire 4 à 6 chiffres.');
  return pin;
}
// Le cookie ne contient pas le code mais une empreinte : il ne vaut plus rien si l'organisateur change le code.
// Le préfixe garde l'ancien nom du projet : le changer invaliderait les cookies déjà posés.
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

/* ---------- Réponses de l'API ---------- */
async function pollResponse(env, row, acc) {
  const cfg = JSON.parse(row.config);
  const { results } = await env.DB
    .prepare('SELECT name, ans, updated_at, note, uid FROM answers WHERE poll_id = ? ORDER BY created_at, name_key')
    .bind(row.id)
    .all();
  return {
    i: row.id,
    ...cfg,
    f: row.final_idx ?? -1,
    owned: !!row.owner_uid,
    isOwner: acc.owner,
    canManage: acc.manage,
    closed: !!row.closed,
    late: isLate(cfg),
    hasPin: !!row.pin,
    pin: acc.owner ? row.pin || '' : undefined, // le code lui-même, pour l'organisateur seulement
    // Une réponse : n prénom, a dispos (un caractère par créneau), u dernière modification, note petit mot,
    // edit : ce visiteur peut la modifier ; mine : elle est liée à son compte.
    p: results.map((r) => ({
      n: r.name, a: r.ans, u: r.updated_at, note: r.note,
      edit: canEditAnswer(row, cfg, acc, r), mine: !!acc.user && r.uid === acc.user.uid,
    })),
  };
}

// Réponse avec le sondage. Si le sondage a un code et que ce navigateur n'a pas encore le cookie
// (l'organisateur sur un nouvel appareil, ou quelqu'un qui vient de donner le code), on le pose.
async function pollJson(env, request, url, row, acc, status = 200, extra = {}) {
  const res = json({ ...(await pollResponse(env, row, acc)), ...extra }, status);
  if (row.pin && !(await hasPinCookie(request, row))) res.headers.append('set-cookie', await pinCookie(url, row));
  return res;
}

// Sondages d'un compte (organisés ou répondus), avec le créneau choisi et s'il y participe :
// l'organisateur toujours ; sinon il faut qu'une réponse du compte soit « dispo » ou « si besoin » sur ce créneau.
async function accountPolls(env, uid) {
  const { results } = await env.DB.prepare(
    `SELECT p.id, p.config, p.final_idx, p.closed, p.updated_at, p.owner_uid = ?1 AS owner,
            (SELECT COUNT(*) FROM answers a WHERE a.poll_id = p.id) AS answers,
            (SELECT GROUP_CONCAT(a.ans) FROM answers a WHERE a.poll_id = p.id AND a.uid = ?1) AS mine
       FROM polls p
      WHERE p.deleted_at IS NULL AND (p.owner_uid = ?1 OR p.id IN (SELECT poll_id FROM answers WHERE uid = ?1))
      ORDER BY p.updated_at DESC
      LIMIT 100`
  ).bind(uid).all();
  return results.map((r) => {
    const cfg = JSON.parse(r.config);
    const slot = r.final_idx == null ? null : buildSlots(cfg)[r.final_idx] || null;
    const yes = String(r.mine || '').split(',').some((ans) => ans[r.final_idx] === '1' || ans[r.final_idx] === '2');
    return {
      id: r.id, cfg, owner: !!r.owner, answers: r.answers, answered: r.mine != null, closed: !!r.closed,
      updated: r.updated_at, slot, going: !!slot && (!!r.owner || yes),
    };
  });
}

async function handleMe(request, env, url, parts) {
  const user = await currentUser(request, env, url);
  if (!user) throw new HttpError(401, 'Connectez-vous pour voir cette page.');
  const method = request.method;
  if (parts.length === 3 && parts[2] === 'polls' && method === 'GET') {
    // dd, dt : jour et moment choisis ; going : le compte y participe (la page s'en sert pour signaler les conflits).
    return json({
      polls: (await accountPolls(env, user.uid)).map((p) => ({
        i: p.id, t: p.cfg.t, ic: p.cfg.ic || '', s: p.cfg.s, e: p.cfg.e, owner: p.owner, answers: p.answers,
        answered: p.answered, closed: p.closed || isLate(p.cfg),
        ...(p.slot ? { dd: ymd(p.slot.d), dt: p.slot.t, going: p.going } : {}),
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
    // Avant la suppression du compte : ses réponses restent mais ne lui sont plus liées ; ses sondages restent
    // accessibles à leurs participants, sans organisateur, sans clôture et sans code (plus personne ne pourrait le retrouver).
    await env.DB.batch([
      env.DB.prepare('UPDATE answers SET uid = NULL WHERE uid = ?').bind(user.uid),
      env.DB.prepare('UPDATE polls SET owner_uid = NULL, closed = 0, pin = NULL WHERE owner_uid = ?').bind(user.uid),
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
    .map((p) => icsEvent(p.id, p.cfg, p.slot, pollUrlOf(url, p.id), p.updated));
  const body = icsCalendar(events, [
    `X-WR-CALNAME:${FEED_NAME}`,
    'X-WR-TIMEZONE:Europe/Paris',
    // Indication pour les agendas qui la suivent (Apple, Outlook) ; Google Agenda choisit son propre rythme.
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ]);
  return new Response(request.method === 'HEAD' ? null : body, {
    headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'no-store' },
  });
}

// Limite de débit, par adresse IP : approximative (comptée par emplacement Cloudflare), elle freine les scripts
// sans jamais gêner un groupe normal. Seules les écritures sont comptées. Sans la liaison (wrangler.jsonc), pas de limite.
async function tooFast(env, name, request) {
  const limiter = env[name];
  if (!limiter) return false;
  try {
    const { success } = await limiter.limit({ key: request.headers.get('cf-connecting-ip') || 'local' });
    return !success;
  } catch (e) {
    return false; // limiteur indisponible : on laisse passer plutôt que de bloquer tout le monde
  }
}
const TOO_FAST = 'Trop de demandes en peu de temps : patientez une minute, puis réessayez.';

async function handleApi(request, env, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', 'polls' | 'me' | 'agenda', ...]
  const method = request.method;
  if (method !== 'GET' && method !== 'HEAD') {
    if (await tooFast(env, 'LIMIT_WRITE', request)) throw new HttpError(429, TOO_FAST);
    if (parts[1] === 'polls' && parts.length === 2 && await tooFast(env, 'LIMIT_CREATE', request)) throw new HttpError(429, TOO_FAST);
  }
  if (parts[1] === 'me') return handleMe(request, env, url, parts);
  if (parts[1] === 'agenda') return handleFeed(request, env, url, parts);
  if (parts[1] !== 'polls' || parts.length > 4) throw new HttpError(404, 'Adresse inconnue.');
  const user = await currentUser(request, env, url);

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
    return pollJson(env, request, url, row, accessOf(row, user), 201);
  }

  const id = parts[2];
  if (!ID_RE.test(id)) throw new HttpError(404, 'Ce sondage n’existe pas ou a été supprimé.');
  const row = await loadPoll(env, id);
  const cfg = JSON.parse(row.config);
  const acc = accessOf(row, user);
  const action = parts[3] || '';
  const now = Date.now();
  const reply = (r, status) => pollJson(env, request, url, r, acc, status);

  // Sondage dans la corbeille : rien n'est lisible ni modifiable ; qui le gère peut le restaurer pendant TRASH_DAYS jours.
  if (row.deleted_at) {
    if (action === 'restore' && method === 'POST' && acc.manage) {
      await env.DB.prepare('UPDATE polls SET deleted_at = NULL, updated_at = ? WHERE id = ?').bind(now, id).run();
      return reply({ ...row, deleted_at: null });
    }
    throw new HttpError(410, 'Ce sondage a été supprimé.', { deleted: true, canRestore: acc.manage, until: row.deleted_at + TRASH_DAYS * DAY_MS });
  }
  if (action === 'restore') throw new HttpError(409, 'Ce sondage n’est pas dans la corbeille.');

  if (action === 'pin') {
    if (method !== 'POST') throw new HttpError(405, 'Méthode non autorisée.');
    if (row.pin && !acc.owner) await checkPin(env, request, row, String((await readBody(request)).pin ?? '').trim());
    return reply(row);
  }
  if (row.pin && !acc.owner && !(await hasPinCookie(request, row))) {
    throw new HttpError(403, 'Ce sondage est protégé par un code.', { pin: true });
  }

  const touch = env.DB.prepare('UPDATE polls SET updated_at = ? WHERE id = ?').bind(now, id);
  const manageOnly = (what) => {
    if (!acc.manage) throw new HttpError(403, `Seul l’organisateur peut ${what}.`);
  };
  const notFrozen = () => {
    if (acc.owner) return;
    if (row.closed) throw new HttpError(403, 'Le sondage est clôturé : les réponses ne peuvent plus changer.');
    if (isLate(cfg)) throw new HttpError(403, 'La date limite de réponse est passée : les réponses ne peuvent plus changer.');
  };

  if (!action) {
    if (method === 'GET') return reply(row);

    if (method === 'PUT') {
      manageOnly('modifier le sondage');
      const body = await readBody(request);
      const next = validateConfig(body);
      // Le code reste réservé à l'organisateur connecté. Sans champ « pin », il ne change pas ; vide, il est retiré.
      const pin = acc.owner && 'pin' in body ? cleanPin(body.pin) : row.pin;
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
      manageOnly('supprimer le sondage');
      // À la corbeille seulement : la tâche programmée l'effacera pour de bon après TRASH_DAYS jours.
      await env.DB.prepare('UPDATE polls SET deleted_at = ?, updated_at = ? WHERE id = ?').bind(now, now, id).run();
      return json({ deleted: true, canRestore: true, until: now + TRASH_DAYS * DAY_MS });
    }
    throw new HttpError(405, 'Méthode non autorisée.');
  }

  if (action === 'answers' && method === 'PUT') {
    notFrozen();
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
    if (target && !canEditAnswer(row, cfg, acc, target)) {
      throw new HttpError(403, `${name} a répondu avec son compte : seul ${name} ou l’organisateur peut modifier cette réponse. Ajoutez une initiale pour vous distinguer.`);
    }
    if (previous && !canEditAnswer(row, cfg, acc, previous)) {
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
    notFrozen();
    const key = norm(cleanText((await readBody(request)).name, 40));
    if (!key) throw new HttpError(400, 'Réponse à supprimer introuvable.');
    const target = await env.DB.prepare('SELECT uid FROM answers WHERE poll_id = ? AND name_key = ?').bind(id, key).first();
    if (target && !canEditAnswer(row, cfg, acc, target)) {
      throw new HttpError(403, 'Seule la personne qui a donné cette réponse, ou l’organisateur, peut la supprimer.');
    }
    await env.DB.batch([env.DB.prepare('DELETE FROM answers WHERE poll_id = ? AND name_key = ?').bind(id, key), touch]);
    return reply(row);
  }

  if (action === 'final' && method === 'PUT') {
    // Avec un organisateur, lui seul décide ; sans organisateur, tout le monde peut choisir la date.
    if (row.owner_uid && !acc.owner) throw new HttpError(403, 'Seul l’organisateur peut choisir la date finale.');
    const i = Number((await readBody(request)).i);
    const finalIdx = Number.isInteger(i) && i >= 0 && i < slotCount(cfg) ? i : null;
    await env.DB.prepare('UPDATE polls SET final_idx = ?, updated_at = ? WHERE id = ?').bind(finalIdx, now, id).run();
    return reply({ ...row, final_idx: finalIdx });
  }

  if (action === 'closed' && method === 'PUT') {
    manageOnly('clôturer le sondage');
    const closed = (await readBody(request)).closed ? 1 : 0;
    await env.DB.prepare('UPDATE polls SET closed = ?, updated_at = ? WHERE id = ?').bind(closed, now, id).run();
    return reply({ ...row, closed });
  }

  if (action === 'claim' && method === 'POST') {
    // Sondage sans organisateur : la première personne connectée qui le demande en devient l'organisateur.
    if (!user) throw new HttpError(401, 'Connectez-vous pour rattacher ce sondage à votre compte.');
    if (row.owner_uid) throw new HttpError(409, 'Ce sondage a déjà un organisateur.');
    const { meta } = await env.DB.prepare('UPDATE polls SET owner_uid = ?, updated_at = ? WHERE id = ? AND owner_uid IS NULL').bind(user.uid, now, id).run();
    if (!meta.changes) throw new HttpError(409, 'Ce sondage vient d’être rattaché par quelqu’un d’autre.');
    const claimed = { ...row, owner_uid: user.uid };
    return pollJson(env, request, url, claimed, accessOf(claimed, user));
  }

  if (action === 'evenement.ics' && method === 'GET') {
    const slot = row.final_idx == null ? null : buildSlots(cfg)[row.final_idx];
    if (!slot) throw new HttpError(404, 'Aucun créneau n’a encore été choisi pour ce sondage.');
    return new Response(icsCalendar([icsEvent(id, cfg, slot, pollUrlOf(url, id), now)]), {
      headers: {
        'content-type': 'text/calendar; charset=utf-8',
        'content-disposition': `attachment; filename="${fileSlug(cfg.t)}.ics"`,
        'cache-control': 'no-store',
      },
    });
  }

  throw new HttpError(404, 'Adresse inconnue.');
}

/* ---------- La page ---------- */
// Toutes les adresses de l'app rendent la même page ; elle lit l'adresse et affiche la bonne vue.
// Pour un sondage, on glisse son nom dans l'aperçu du lien (WhatsApp, iMessage…), sauf s'il est protégé par un code.
async function route(request, env) {
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
  const last = url.pathname.split('/').pop();
  if ((request.method === 'GET' || request.method === 'HEAD') && !last.includes('.')) return servePage(request, env, url);
  return env.ASSETS.fetch(request);
}

async function servePage(request, env, url) {
  const res = await env.ASSETS.fetch(new Request(new URL('/', url), { method: 'GET' }));
  const match = /^\/s\/([a-z2-7]{10})\/?$/.exec(url.pathname);
  if (!match || res.status !== 200) return res;
  let title = '';
  try {
    const row = await env.DB.prepare('SELECT config, pin, deleted_at FROM polls WHERE id = ?').bind(match[1]).first();
    if (row && !row.pin && !row.deleted_at) title = JSON.parse(row.config).t || '';
  } catch (e) {
    // base indisponible : la page s'affiche quand même, avec son aperçu habituel
  }
  let rewriter = new HTMLRewriter()
    // Un sondage ne regarde que son groupe : on demande aux moteurs de recherche de l'ignorer.
    .on('head', { element(el) { el.append('<meta name="robots" content="noindex">', { html: true }); } });
  if (title) {
    rewriter = rewriter
      .on('title', { element(el) { el.setInnerContent(`${title} · ${SITE_NAME}`); } })
      .on('meta[property="og:title"]', { element(el) { el.setAttribute('content', `${title} : t’es dispo quand ?`); } })
      .on('meta[property="og:description"]', { element(el) { el.setAttribute('content', 'Ajoute tes dispos en deux clics, sans compte.'); } });
  }
  const out = new Response(rewriter.transform(res).body, res);
  out.headers.delete('etag');
  out.headers.set('cache-control', 'no-cache');
  return out;
}

// Effacement automatique (tâche programmée, wrangler.jsonc) : corbeille de plus de TRASH_DAYS jours, et sondages
// dont la dernière date proposée (e) est passée depuis KEEP_MONTHS mois sans modification depuis. Réponses comprises.
export async function purge(env, now = Date.now()) {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - KEEP_MONTHS);
  const where = `(deleted_at IS NOT NULL AND deleted_at < ?1)
              OR (json_extract(config, '$.e') < ?2 AND updated_at < ?3)`;
  const args = [now - TRASH_DAYS * DAY_MS, ymd(Math.floor(cutoff.getTime() / DAY_MS)), cutoff.getTime()];
  const [answers, tries, polls] = await env.DB.batch([
    env.DB.prepare(`DELETE FROM answers WHERE poll_id IN (SELECT id FROM polls WHERE ${where})`).bind(...args),
    env.DB.prepare(`DELETE FROM pin_tries WHERE poll_id IN (SELECT id FROM polls WHERE ${where})`).bind(...args),
    env.DB.prepare(`DELETE FROM polls WHERE ${where}`).bind(...args),
  ]);
  const done = { polls: polls.meta.changes, answers: answers.meta.changes, pinTries: tries.meta.changes };
  console.log('Effacement automatique', JSON.stringify(done));
  return done;
}

export default {
  async fetch(request, env) {
    return secured(await route(request, env));
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(purge(env));
  },
};
