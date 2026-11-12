// Règles communes à la page (public/app.js) et au serveur (src/worker.js).
// Un seul fichier pour les deux : la liste des créneaux ne peut plus diverger entre l'un et l'autre.

export const DAY_MS = 86400000;
export const MAX_DAYS = 92;
export const MAX_SLOTS = 200;
export const MAX_PEOPLE = 40;
export const MAX_GUESTS = 40;
export const MAX_NOTE = 140;

// L'ordre compte : il fixe l'ordre des créneaux dans une journée et les bits des réglages (m).
export const MOMENTS = ['Journée', 'Matin', 'Midi', 'Après-midi', 'Soir'];
export const MOMENT_SHORT = ['Jour', 'Matin', 'Midi', 'Aprèm', 'Soir'];
// Horaires indicatifs de chaque moment pour l'agenda, heure de Paris (null = journée entière).
export const MOMENT_HOURS = [null, ['0900', '1200'], ['1200', '1430'], ['1400', '1800'], ['1930', '2300']];

// Nom du site, nom du lien d'agenda, nom d'un sondage laissé sans nom.
export const SITE_NAME = 'Dispos';
export const FEED_NAME = 'Dispos · dates choisies';
export const DEFAULT_TITLE = 'Entre amis';

// Conservation (tâche programmée du serveur, chaque nuit) : un sondage supprimé reste TRASH_DAYS jours dans la corbeille ;
// un sondage dont la dernière date proposée est passée depuis KEEP_MONTHS mois, et qui n'a pas changé depuis, est effacé.
export const TRASH_DAYS = 30;
export const KEEP_MONTHS = 6;

// Pictogrammes proposés pour un sondage (le premier sert par défaut à l'affichage).
// On en ajoute à la fin sans en retirer : le serveur oublie un pictogramme qu'il ne connaît pas.
export const ICONS = [
  '🍽️', '🍕', '🧀', '🍝', '🍣', '🌮', '🍔', '🥗', '🥘', '🔥', '🥐', '☕', '🥂', '🍻', '🎂', '🧺',
  '🎲', '🎮', '🎬', '🎤', '⚽', '🥾', '🏡', '🎉',
];

// Prénom sans accents ni majuscules : sert de clé pour reconnaître une même personne.
export const norm = (s) =>
  String(s).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');

// Les jours sont comptés en jours entiers depuis 1970 (UTC), sans heure : pas de surprise aux changements d'heure.
export const weekday = (d) => (new Date(d * DAY_MS).getUTCDay() + 6) % 7; // 0 = lundi

// « 20261114 » ou « 2026-11-14 » → numéro du jour ; NaN si la date n'existe pas.
export function parseYmd(s) {
  const c = String(s ?? '').replace(/-/g, '');
  if (!/^\d{8}$/.test(c)) return NaN;
  const y = +c.slice(0, 4), m = +c.slice(4, 6) - 1, d = +c.slice(6, 8);
  const t = new Date(Date.UTC(y, m, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m || t.getUTCDate() !== d) return NaN;
  return t.getTime() / DAY_MS;
}

export function ymd(d, sep = '') {
  const t = new Date(d * DAY_MS);
  return [t.getUTCFullYear(), String(t.getUTCMonth() + 1).padStart(2, '0'), String(t.getUTCDate()).padStart(2, '0')].join(sep);
}

// Genre de créneaux d'un sondage (champ k) :
// - absent : des moments de la journée (MOMENTS), pour « Journée », « Demi-journée » et « Repas » ;
// - 'h' : des horaires précis. h liste les plages [début, fin] en « HHMM », triées ; m et o ont un bit par plage de h ;
// - 'j' : des séjours sur plusieurs jours (« Semaine », « Week-end »). j les liste en paires [a, b] de demi-journées
//   comptées depuis s (a = première demi-journée, b = dernière, comprises ; paire = matin, impaire = après-midi et soir).
//   La page les calcule (jours fériés compris) et les envoie tels quels ; jr garde les réglages qui les ont produits.
export const MAX_RANGES = 8;
// Un séjour déborde parfois de la période (week-end qui commence le vendredi) : la période s'allonge d'autant.
export const STAY_MARGIN = 14;

// Créneaux d'un sondage, dans l'ordre.
// s, e : début et fin ; m : pour chaque jour de la semaine, les moments possibles (un bit par moment) ;
// x : jours exclus ; o : jours réglés à part, en paires [jour, moments], qui passent avant les règles de m ;
// a : ancienne forme, jours ouverts à tous les moments du sondage (la page n'en écrit plus).
// Les jours de x, a et o sont des écarts en jours depuis s. Les anciens sondages n'ont ni « a » ni « o ».
// Un créneau : d jour, t moment (ou plage de h) ; h ses horaires précis ; un séjour va de d à d2,
// ah = 1 s'il commence l'après-midi ou le soir, bh = 0 s'il finit le matin.
export function buildSlots(cfg) {
  const s = parseYmd(cfg.s), e = parseYmd(cfg.e);
  if (cfg.k === 'j') return (cfg.j || []).map(([a, b]) => ({ d: s + (a >> 1), t: 0, ah: a & 1, d2: s + (b >> 1), bh: b & 1 }));
  const ex = new Set(cfg.x || []), add = new Set(cfg.a || []), own = new Map(cfg.o || []);
  const all = cfg.m.reduce((u, r) => u | r, 0);
  const n = cfg.k === 'h' ? cfg.h.length : MOMENTS.length;
  const slots = [];
  for (let d = s; d <= e; d++) {
    if (ex.has(d - s)) continue;
    const r = own.has(d - s) ? own.get(d - s) : add.has(d - s) ? all : cfg.m[weekday(d)];
    for (let t = 0; t < n; t++) if (r & (1 << t)) slots.push(cfg.k === 'h' ? { d, t, h: cfg.h[t] } : { d, t });
  }
  return slots;
}

// Horaires d'un créneau, heure de Paris : [début, fin] en « HHMM », ou null pour un jour entier ou un séjour.
export const slotTimes = (sl) => (sl.d2 != null ? null : sl.h || MOMENT_HOURS[sl.t]);
// Dernier jour d'un créneau : le jour même, ou la fin du séjour.
export const slotEnd = (sl) => (sl.d2 != null ? sl.d2 : sl.d);
// Ce qui identifie un créneau d'une version à l'autre du sondage : les dispos le suivent quand l'organisateur modifie.
export const slotId = (sl) => (sl.d2 != null ? `j${sl.d}.${sl.ah}.${sl.d2}.${sl.bh}` : sl.h ? `h${sl.d}.${sl.h.join('-')}` : `m${sl.d}.${sl.t}`);

// Ce qui fixe la liste des créneaux. La page la renvoie avec une réponse : le serveur refuse si elle est périmée.
// Les jours ajoutés ou réglés à part, les plages et les séjours n'y figurent que s'il y en a :
// la clé des anciens sondages ne change pas.
export const slotsKey = (cfg) =>
  [cfg.s, cfg.e, cfg.m.join('.'), (cfg.x || []).join('.')]
    .concat(cfg.a && cfg.a.length ? [cfg.a.join('.')] : [])
    .concat(cfg.o && cfg.o.length ? ['o' + cfg.o.map((p) => p.join(':')).join('.')] : [])
    .concat(cfg.k === 'h' ? ['h' + cfg.h.map((r) => r.join('-')).join('.')] : [])
    .concat(cfg.k === 'j' ? ['j' + cfg.j.map((p) => p.join(':')).join('.')] : [])
    .join('|');

// Numéro du jour d'aujourd'hui à Paris : la date limite de réponse se juge à l'heure de Paris.
const fParisDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' });
export const todayParis = (ms = Date.now()) => parseYmd(fParisDay.format(new Date(ms)));

// La date limite (dl) est passée : les réponses sont figées, sauf pour l'organisateur.
export const isLate = (cfg, ms = Date.now()) => !!cfg.dl && todayParis(ms) > parseYmd(cfg.dl);
