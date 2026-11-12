// La page de « Dispos » : accueil, création, sondage, compte. Sans dépendance ni étape de build.
// Les règles des créneaux viennent de shared.js, le même fichier que lit le serveur.
import {
  DAY_MS, MAX_DAYS, MAX_SLOTS, MAX_PEOPLE, MAX_GUESTS, MAX_NOTE, SITE_NAME, FEED_NAME, DEFAULT_TITLE, TRASH_DAYS, KEEP_MONTHS,
  MOMENTS, MOMENT_SHORT, MOMENT_HOURS, ICONS, norm, weekday, parseYmd, ymd, buildSlots, slotsKey,
} from '/shared.js';

// Ancien nom du projet, gardé : le navigateur y range déjà les sondages ouverts et le prénom.
const STORE_KEY = 'on-mange-quand:v2';
const THEME_KEY = 'on-mange-quand:theme';
const REFRESH_MS = 15000;
// Adresse de contact affichée (mentions légales, confidentialité) : questions, droits sur les données, signalements.
const CONTACT = 'contact@dispos.day';
const ID_RE = /^[a-z2-7]{10}$/;
const JOURNEE = 1 << 0, MIDI = 1 << 2, APREM = 1 << 3, SOIR = 1 << 4;
const WD = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
const WD_LONG = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const STATE_LABEL = ['pas dispo', 'dispo', 'si besoin'];

const app = document.getElementById('app');
const toastEl = document.getElementById('toast');
const topnav = document.getElementById('topnav');
const reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const $ = (sel) => document.querySelector(sel);

/* ---------- Outils ---------- */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plural = (n, one, many) => n + ' ' + (n > 1 ? (many || one + 's') : one);
const popcount = (r) => (r & 1) + ((r >> 1) & 1) + ((r >> 2) & 1) + ((r >> 3) & 1) + ((r >> 4) & 1);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// « a, b et c »
const list = (items) => (items.length < 2 ? items.join('') : items.slice(0, -1).join(', ') + ' et ' + items[items.length - 1]);

const ICON = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  left: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  right: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  calendar: '<path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/>',
  place: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  star: '<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  rules: '<path d="M3 6h18M3 12h18M3 18h18"/><circle cx="8" cy="6" r="2" fill="var(--surface)"/><circle cx="16" cy="12" r="2" fill="var(--surface)"/><circle cx="10" cy="18" r="2" fill="var(--surface)"/>',
};
const icon = (name, size = 18) =>
  `<svg class="ic" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;

const todayDay = (() => { const n = new Date(); return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) / DAY_MS; })();
const dateOf = (d) => new Date(d * DAY_MS).getUTCDate();
const monthKey = (d) => { const t = new Date(d * DAY_MS); return t.getUTCFullYear() * 12 + t.getUTCMonth(); };
const F = (o) => new Intl.DateTimeFormat('fr-FR', Object.assign({ timeZone: 'UTC' }, o));
const fShort = F({ weekday: 'short', day: 'numeric', month: 'short' });
const fLong = F({ weekday: 'long', day: 'numeric', month: 'long' });
const fMonth = F({ month: 'long', year: 'numeric' });
const fDM = F({ day: 'numeric', month: 'short' });
const fmt = (f, d) => f.format(new Date(d * DAY_MS));
const hourLabel = (s) => s.slice(0, 2).replace(/^0/, '') + ' h' + (s.slice(2) === '00' ? '' : ' ' + s.slice(2));

/* ---------- Jours fériés (France métropolitaine) ---------- */
// Connus de la page seulement : le serveur ne voit que les jours ajoutés (a).
// Dimanche de Pâques (calcul grégorien de Meeus), en jours depuis 1970.
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;
  return Date.UTC(y, Math.floor(n / 31) - 1, (n % 31) + 1) / DAY_MS;
}
const holidayYears = new Map();
function holidaysOf(y) {
  if (!holidayYears.has(y)) {
    const D = (mo, d) => Date.UTC(y, mo - 1, d) / DAY_MS;
    const p = easter(y);
    const map = new Map();
    [[D(1, 1), 'Jour de l’an'], [p + 1, 'Lundi de Pâques'], [D(5, 1), 'Fête du Travail'], [D(5, 8), 'Victoire 1945'],
      [p + 39, 'Ascension'], [p + 50, 'Lundi de Pentecôte'], [D(7, 14), 'Fête nationale'], [D(8, 15), 'Assomption'],
      [D(11, 1), 'Toussaint'], [D(11, 11), 'Armistice'], [D(12, 25), 'Noël'],
    ].forEach(([d, name]) => map.set(d, map.has(d) ? map.get(d) + ' et ' + name : name)); // l'Ascension tombe parfois un 1er ou un 8 mai
    holidayYears.set(y, map);
  }
  return holidayYears.get(y);
}
// Nom du jour férié, ou '' pour un jour ordinaire.
const holiday = (d) => holidaysOf(new Date(d * DAY_MS).getUTCFullYear()).get(d) || '';

let toastTimer = null;
function showToast(msg, isError) {
  toastEl.textContent = msg;
  toastEl.classList.toggle('err', !!isError);
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, isError ? 5000 : 3000);
}

/* ---------- Mémoire locale : vos sondages et votre prénom, sur cet appareil ---------- */
function loadStore() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (s && typeof s === 'object' && s.polls && typeof s.polls === 'object') return s;
  } catch (e) { /* stockage indisponible */ }
  return { polls: {} };
}
function saveStore(s) { try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) { /* ignoré */ } }
function storePatch(id, patch) {
  const s = loadStore();
  s.polls[id] = Object.assign({}, s.polls[id] || {}, patch);
  saveStore(s);
}
function remember(st, me) {
  const s = loadStore();
  const prev = s.polls[st.i] || {};
  const chosen = st.f >= 0 ? buildSlots(st)[st.f] : null;
  s.polls[st.i] = Object.assign({}, prev, {
    t: st.t, ic: st.ic || '', s: st.s, e: st.e, n: st.p.length, seen: Date.now(), own: !!st.isOwner,
    closed: !!(st.closed || st.late), dd: chosen ? ymd(chosen.d) : '', dt: chosen ? chosen.t : 0,
    me: me !== undefined ? me : (prev.me || null),
  });
  // On garde les 50 derniers sondages ouverts ; ceux créés sur cet appareil ne sont jamais oubliés.
  Object.keys(s.polls)
    .filter((id) => !s.polls[id].made)
    .sort((a, b) => (s.polls[b].seen || 0) - (s.polls[a].seen || 0))
    .slice(50)
    .forEach((id) => { delete s.polls[id]; });
  saveStore(s);
}
function forgetPoll(id) {
  const s = loadStore();
  delete s.polls[id];
  saveStore(s);
}
const localPolls = () => Object.entries(loadStore().polls)
  .map(([id, p]) => Object.assign({ id }, p))
  .filter((p) => ID_RE.test(p.id) && p.s && p.e)
  .sort((a, b) => (b.seen || 0) - (a.seen || 0));

/* ---------- Compte (Firebase, branché par firebase.js) ---------- */
// Sans compte, tout marche. Quand Firebase est prêt, il se branche ici ; s'il ne charge pas, l'app continue sans compte.
const auth = {
  enabled: false,
  user: null, // { uid, email, name, verified, provider }
  impl: null,
  token(force) { return this.impl && this.user ? this.impl.token(force) : Promise.resolve(null); },
  async logout() { if (this.impl) await this.impl.logout(); },
};
let authSettled;
const authReady = new Promise((resolve) => { authSettled = resolve; });
setTimeout(() => authSettled(), 4000);
window.omqAuthAttach = (impl) => {
  auth.impl = impl;
  auth.enabled = true;
  impl.onChange((user) => {
    const before = auth.user ? auth.user.uid : null;
    auth.user = user;
    renderTopnav();
    authSettled();
    if ((user ? user.uid : null) !== before) onAuthChanged();
  });
};
window.omqAuthDisabled = () => { authSettled(); renderTopnav(); };
const displayName = () => (auth.user ? auth.user.name || auth.user.email.split('@')[0] : '');

/* ---------- Serveur ---------- */
async function api(method, path, body, retry = true) {
  const headers = {};
  let token = null;
  try {
    token = await auth.token();
  } catch (e) {
    // Session inutilisable (compte supprimé ailleurs, jeton révoqué) : on se déconnecte et on continue sans compte.
    await auth.logout().catch(() => {});
    showToast('Votre session a expiré : vous êtes déconnecté.', true);
  }
  if (token) headers.authorization = 'Bearer ' + token;
  if (body) headers['content-type'] = 'application/json';
  let res;
  try {
    res = await fetch('/api' + path, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  } catch (e) {
    const err = new Error('Connexion impossible. Vérifiez votre réseau et réessayez.');
    err.status = 0;
    throw err;
  }
  if (res.status === 401 && token && retry) {
    // Jeton refusé : on en redemande un neuf ; si ça ne suffit pas, on se déconnecte et on continue sans compte.
    const fresh = await auth.token(true).catch(() => null);
    if (fresh && fresh !== token) return api(method, path, body, false);
    await auth.logout();
    showToast('Votre session a expiré : vous êtes déconnecté.', true);
    return api(method, path, body, false);
  }
  let data = null;
  try { data = await res.json(); } catch (e) { /* réponse vide */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || 'Le serveur a rencontré un problème. Réessayez dans un instant.');
    err.status = res.status;
    err.pin = !!(data && data.pin); // sondage protégé : il faut (re)donner le code
    err.deleted = data && data.deleted ? data : null; // sondage à la corbeille : { canRestore, until }
    throw err;
  }
  return data;
}

/* ---------- Créneaux, règles et classement ---------- */
const slotLong = (sl) => cap(fmt(fLong, sl.d)) + ' · ' + MOMENTS[sl.t];
const slotShort = (sl) => fmt(fShort, sl.d) + ' · ' + MOMENTS[sl.t].toLowerCase();
const slotHours = (sl) => (MOMENT_HOURS[sl.t] ? `${hourLabel(MOMENT_HOURS[sl.t][0])} – ${hourLabel(MOMENT_HOURS[sl.t][1])}` : 'toute la journée');

function daysPhrase(ws) {
  const key = ws.join('');
  if (ws.length === 7) return 'tous les jours';
  if (key === '01234') return 'en semaine';
  if (key === '56') return 'le week-end';
  const run = ws.every((w, i) => i === 0 || w === ws[i - 1] + 1);
  if (run && ws.length >= 3) return `du ${WD_LONG[ws[0]]} au ${WD_LONG[ws[ws.length - 1]]}`;
  return 'le ' + list(ws.map((w) => WD_LONG[w]));
}
// Les règles d'un sondage en phrases : « Soir · en semaine », « Midi et soir · le week-end ».
function rulesLines(m) {
  const groups = new Map();
  m.forEach((mask, w) => { if (mask) groups.set(mask, (groups.get(mask) || []).concat(w)); });
  return [...groups].sort((a, b) => a[1][0] - b[1][0]).map(([mask, ws]) =>
    cap(list(MOMENTS.filter((_, t) => mask & (1 << t)).map((x) => x.toLowerCase()))) + ' · ' + daysPhrase(ws));
}

// Pour chaque créneau : y dispos, mb si besoin, tot = les deux ; missing = indispensables qui ont répondu « pas dispo ».
function computeStats(st, slots) {
  const required = new Set((st.r || []).map(norm));
  const musts = st.p.filter((p) => required.has(norm(p.n)));
  return slots.map((sl, i) => {
    let y = 0, mb = 0;
    for (const p of st.p) { const c = p.a[i]; if (c === '1') y++; else if (c === '2') mb++; }
    const missing = musts.filter((p) => p.a[i] !== '1' && p.a[i] !== '2').map((p) => p.n);
    return { i, y, mb, tot: y + mb, missing, ok: !missing.length, past: sl.d < todayDay };
  });
}
// Les créneaux passés et ceux où manque un indispensable passent après ; ensuite le plus de monde, puis le plus de « dispo ».
const rank = (stats) => stats.slice().sort((a, b) => (a.past - b.past) || (b.ok - a.ok) || (b.tot - a.tot) || (b.y - a.y) || (a.i - b.i));
const sameRank = (a, b) => a.past === b.past && a.ok === b.ok && a.tot === b.tot && a.y === b.y;
const usedCols = (slots) => [...new Set(slots.map((sl) => weekday(sl.d)))].sort((a, b) => a - b);
const usedMoments = (slots) => [...new Set(slots.map((sl) => sl.t))].sort((a, b) => a - b);

/* ---------- Calendrier : la même grille pour l'aperçu, la réponse et les résultats ---------- */
// cols : jours de la semaine affichés ; dayHTML(d) : contenu d'une case ; has(d) : la semaine est affichée si un de ses jours répond vrai.
function calGrid(first, last, cols, dayHTML, { has, headHTML } = {}) {
  let html = cols.map((w) => (headHTML ? headHTML(w) : `<span class="cal-wd">${WD[w]}</span>`)).join('');
  let month = null;
  for (let w0 = first - weekday(first); w0 <= last; w0 += 7) {
    const days = cols.map((w) => w0 + w).filter((d) => d >= first && d <= last);
    if (!days.length || (has && !days.some(has))) continue;
    const mk = monthKey(days[days.length - 1]);
    if (mk !== month) { html += `<div class="cal-month">${cap(fmt(fMonth, days[days.length - 1]))}</div>`; month = mk; }
    html += cols.map((w) => { const d = w0 + w; return d < first || d > last ? '<span class="day void" aria-hidden="true"></span>' : dayHTML(d); }).join('');
  }
  return `<div class="cal" style="--cols:${cols.length}">${html}</div>`;
}
function slotsByDay(slots) {
  const map = new Map();
  slots.forEach((sl, i) => { if (!map.has(sl.d)) map.set(sl.d, []); map.get(sl.d).push(i); });
  return map;
}
// Grille d'un sondage : une case par jour, avec une pastille par créneau (pillHTML(i)).
function slotCal(slots, pillHTML, opts) {
  const byDay = slotsByDay(slots);
  return calGrid(slots[0].d, slots[slots.length - 1].d, usedCols(slots), (d) => {
    const hol = holiday(d);
    const num = `<span class="day-n"${hol ? ` title="${esc(hol)}"` : ''}>${dateOf(d)}</span>`;
    const idx = byDay.get(d);
    if (!idx) return `<span class="day off${hol ? ' hol' : ''}">${num}</span>`;
    return `<div class="day${hol ? ' hol' : ''}${d === todayDay ? ' today' : ''}">${num}${idx.map(pillHTML).join('')}</div>`;
  }, Object.assign({ has: (d) => byDay.has(d) }, opts));
}

/* ---------- État ---------- */
let view = null;      // 'home' | 'create' | 'edit' | 'poll' | 'pin' | 'deleted' | 'loading' | 'error' | 'account' | 'privacy' | 'legal'
let lastRoute = null;
let pinFor = null;    // sondage dont on demande le code
let deletedFor = null; // sondage affiché comme supprimé (corbeille)
let poll = null;      // { st, example, slots }
let ui = freshUi();
let busy = false;
let refreshTimer = null;
let accountReturn = null; // où revenir après la connexion
let account = { mode: 'in', delAsk: false };
let wiz = { step: 1, editing: false };
function freshUi(keep) {
  return {
    open: false, name: '', note: '', vals: [], editing: null, delAsk: false, savedName: '', pollDelAsk: false, claimAsk: false,
    pick: null,    // créneau détaillé dans les résultats
    focus: null,   // personne dont on regarde les dispos dans les résultats
    created: !!(keep && keep.created),
  };
}

function newDraft() {
  return {
    t: '', n: '', l: '', ic: '',
    s: todayDay + 1, e: todayDay + 28,
    m: [SOIR, SOIR, SOIR, SOIR, SOIR, SOIR, SOIR],
    o: new Map(), // jours réglés à part : jour → ses moments (0 = jour exclu) ; les autres suivent les règles
    pin: '',
    dl: null,     // date limite de réponse (numéro de jour) ou null
    q: 0,         // nombre minimum de personnes, 0 = pas de minimum
    g: [],        // invités attendus
    r: new Set(), // invités indispensables (prénoms normalisés)
  };
}
let draft = newDraft();
let createDraft = null; // brouillon de création mis de côté pendant la modification d'un sondage

const slotsKeyOf = (st) => slotsKey(st);
// Sans organisateur (sondage créé sans compte, exemple), tout le monde peut choisir la date.
const canDecide = () => poll.example || !poll.st.owned || poll.st.isOwner;
const isFrozen = () => (poll.st.closed || poll.st.late) && !poll.st.isOwner;
function getMe() {
  if (!poll || poll.example) return null;
  const p = loadStore().polls[poll.st.i];
  return (p && p.me) || null;
}

/* ---------- Barre du haut ---------- */
function renderTopnav() {
  const create = view === 'create' || view === 'edit' ? '' : `<a class="btn sm" href="/nouveau">${icon('plus', 16)}<span class="hide-s">Nouveau sondage</span><span class="show-s">Nouveau</span></a>`;
  const acct = !auth.enabled ? '' : auth.user
    ? `<a href="/compte" class="chip-user" aria-label="Mon compte, ${esc(displayName())}">${avatarHTML(displayName())}<span class="hide-s">${esc(displayName())}</span></a>`
    : `<a href="/compte" class="btn sm quiet" aria-label="Se connecter">${icon('user', 18)}<span class="hide-s">Se connecter</span></a>`;
  topnav.innerHTML = create + acct;
}
// Connexion ou déconnexion : la vue en cours se met à jour (droits d'organisateur, réponses protégées…).
function onAuthChanged() {
  account.feed = undefined; // le lien d'agenda est propre au compte : on le relit
  if (view === 'poll' && poll && !poll.example) refresh(true);
  else if (view === 'pin' && pinFor) loadPoll(pinFor); // l'organisateur passe sans code
  else if (view === 'deleted' && deletedFor) loadPoll(deletedFor); // l'organisateur peut alors le restaurer
  else if (view === 'create') showCreate();
  else if (view === 'home') showHome();
  else if (view === 'account') showAccount();
}

const AVATAR_TONES = 6;
function avatarHTML(name, extra = '') {
  let h = 0;
  for (const ch of norm(name)) h = (h * 31 + ch.codePointAt(0)) % 997;
  const first = [...String(name).trim()][0] || '?';
  return `<span class="avatar tone${h % AVATAR_TONES}${extra}" aria-hidden="true">${esc(first.toUpperCase())}</span>`;
}

/* ---------- Vue : accueil ---------- */
function pollCardHTML(p) {
  const s = parseYmd(p.s), e = parseYmd(p.e);
  const dd = p.dd ? parseYmd(p.dd) : NaN;
  const tag = Number.isFinite(dd)
    ? `<span class="tag ok">${icon('check', 14)}${esc(fmt(fShort, dd))} · ${MOMENTS[p.dt || 0].toLowerCase()}</span>`
    : p.closed ? '<span class="tag">Clôturé</span>'
      : p.todo ? '<span class="tag hot">À répondre</span>'
        : `<span class="tag">${plural(p.n || 0, 'réponse')}</span>`;
  return `<li><a class="pcard" href="/s/${esc(p.id)}">
    <span class="pcard-ic" aria-hidden="true">${esc(p.ic || ICONS[0])}</span>
    <span class="pcard-main"><b>${esc(p.t || DEFAULT_TITLE)}</b><small>${fmt(fDM, s)} → ${fmt(fDM, e)}${p.own ? ' · vous organisez' : ''}</small></span>
    ${tag}${icon('chevron', 18)}
  </a></li>`;
}
const pollListHTML = (items) => (items.length
  ? `<ul class="plist">${items.map(pollCardHTML).join('')}</ul>`
  : '<p class="empty">Aucun sondage pour l’instant. Ceux que vous créez ou ouvrez apparaîtront ici.</p>');

function showHome(msg) {
  view = 'home';
  poll = null;
  document.title = SITE_NAME + ' · Trouvez la date où tout le monde peut venir';
  renderTopnav();
  const mine = localPolls();
  const alert = msg ? `<p class="alert" role="alert">${esc(msg)}</p>` : '';
  // Pas encore organisé de sondage (ni créé sur cet appareil, ni organisé avec le compte) : l'animation reste proposée.
  const showIntro = !mine.some((p) => p.made || p.own) && !loadStore().introOff;
  if (mine.length || auth.user) {
    app.innerHTML = `<div class="page narrow">
      ${alert}
      <header class="dash-head">
        <div><h1>${auth.user ? `Bonjour ${esc(displayName())}` : 'Vos sondages'}</h1>
        <p class="muted">${auth.user ? 'Vos sondages, sur tous vos appareils.' : 'Les sondages ouverts sur cet appareil.'}</p></div>
        <a class="btn primary" href="/nouveau">${icon('plus')}Nouveau sondage</a>
      </header>
      <section id="home-polls" aria-label="Vos sondages">${pollListHTML(mine)}</section>
      ${showIntro ? `<section class="intro-box" id="home-intro" aria-labelledby="intro-h">
        <div class="intro-box-text">
          <h2 id="intro-h">Et si vous organisiez le prochain&nbsp;?</h2>
          <div class="actions"><a class="btn primary" href="/nouveau">${icon('plus')}Créer un sondage</a><button type="button" class="linkbtn" data-act="intro-off">Ne plus afficher</button></div>
        </div>
        ${introHTML()}
      </section>` : ''}
      ${!auth.user && auth.enabled ? `<aside class="nudge">
        ${icon('lock', 22)}
        <p><b>Gardez la main.</b> Avec un compte gratuit, vos sondages vous suivent partout.</p>
        <a class="btn sm" href="/compte">Créer un compte</a>
      </aside>` : ''}
    </div>`;
    if (auth.user) loadHomePolls(mine);
    startIntro();
    return;
  }
  app.innerHTML = `<div class="page landing">
    ${alert}
    <section class="hero">
      <div class="hero-text">
        <p class="kicker">Gratuit · sans inscription</p>
        <h1>Tout le monde est partant. Reste à trouver <em>quand</em>.</h1>
        <p class="lede">Proposez des créneaux, partagez un lien&nbsp;: la bonne date ressort toute seule.</p>
        <div class="hero-cta">
          <a class="btn primary lg" href="/nouveau">Créer un sondage${icon('right')}</a>
          <a class="btn lg" href="/exemple">Voir un exemple</a>
        </div>
      </div>
      ${introHTML()}
    </section>
    <section class="features" aria-labelledby="feat-h">
      <h2 id="feat-h">Pensé pour les groupes indécis</h2>
      <ul class="feat-list">
        <li>${icon('rules', 22)}<h3>Des règles, pas des dates</h3><p>«&nbsp;Le soir en semaine&nbsp;» suffit.</p></li>
        <li>${icon('star', 22)}<h3>Les indispensables</h3><p>Pas de date sans eux.</p></li>
        <li>${icon('clock', 22)}<h3>Une date limite</h3><p>Fini les sondages qui traînent.</p></li>
        <li>${icon('calendar', 22)}<h3>Votre agenda</h3><p>Google Agenda, branché.</p></li>
      </ul>
    </section>
    <section class="plans" aria-labelledby="plans-h">
      <h2 id="plans-h">Avec ou sans compte</h2>
      <div class="plan-grid">
        <div class="plan">
          <h3>Sans compte</h3>
          <p class="muted">Pour aller vite.</p>
          <ul>
            <li>${icon('check', 16)}Créer et répondre</li>
            <li>${icon('check', 16)}Tout le groupe gère le sondage</li>
          </ul>
          <a class="btn" href="/nouveau">Créer un sondage</a>
        </div>
        <div class="plan strong">
          <h3>Avec un compte gratuit</h3>
          <p class="muted">Pour garder la main.</p>
          <ul>
            <li>${icon('check', 16)}Vous seul décidez de la date</li>
            <li>${icon('check', 16)}Un code pour protéger le lien</li>
            <li>${icon('check', 16)}Vos sondages sur tous vos appareils</li>
          </ul>
          <a class="btn primary" href="/compte">Créer un compte</a>
        </div>
      </div>
    </section>
  </div>`;
  startIntro();
}

/* ---------- Animation d'accueil : comment ça marche, en quatre scènes ---------- */
// Montrée à qui n'a encore jamais créé de sondage : sur l'accueil, puis sous la liste « Vos sondages » (masquable).
// Une scène = des étapes [délai en ms, fonction] qui posent des classes sur le décor ; les transitions CSS font le reste.
// Chaque fonction reçoit `now` : vrai pour se placer directement à la fin (saut d'étape, pause, animations réduites).
// Elle se met en pause hors de l'écran, s'arrête après INTRO_LOOPS tours, et reste figée si le système demande moins d'animations.
const INTRO_STEPS = ['Proposez des créneaux', 'Partagez le lien', 'Chacun répond', 'La date ressort'];
const INTRO_DUR = [4800, 4600, 5400, 5200];
const INTRO_LOOPS = 2;
const INTRO_TITLE = 'Raclette chez Léa';
// Réponses aux dix soirs proposés (deux semaines, du lundi au vendredi) : le jeudi de la première semaine fait l'unanimité.
const INTRO_PEOPLE = [['Léa', '1101101101'], ['Karim', '0111010101'], ['Sophie', '1001101010'], ['Hugo', '0101010110']];
const INTRO_BEST = 3;
const introMonday = () => todayDay + 7 - weekday(todayDay); // le lundi qui vient
const BRAND_MARK = '<svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true"><rect width="32" height="32" rx="9" fill="var(--accent)"/><circle cx="16" cy="16" r="8.5" fill="none" stroke="var(--accent-ink)" stroke-width="3"/><circle cx="16" cy="16" r="2.6" fill="var(--accent-ink)"/></svg>';

function introStageHTML() {
  const mon = introMonday();
  const cells = Array.from({ length: 14 }, (_, c) => {
    const w = c % 7, num = `<span class="day-n">${dateOf(mon + c)}</span>`;
    if (w > 4) return `<span class="day off">${num}</span>`;
    const k = c < 7 ? w : w + 5;
    return `<div class="day" style="--k:${k}">${num}<span class="pill heat h0" data-k="${k}"><i class="intro-m"></i><b>0</b></span></div>`;
  }).join('');
  return `<div class="intro-head"><span class="intro-ic">🧀</span><div class="intro-name"><b class="intro-title"></b><small class="intro-sub">Nouveau sondage</small></div></div>
    <div class="intro-tools" data-s="formules">
      <div class="intro-formules"><span class="chip sm">Tous les soirs</span><span class="chip sm intro-pick">En semaine</span><span class="chip sm">Week-end</span></div>
      <div class="intro-people">${INTRO_PEOPLE.map(([n]) => avatarHTML(n, ' intro-av')).join('')}</div>
    </div>
    <div class="cal intro-cal" style="--cols:7">${WD.map((w) => `<span class="cal-wd">${w}</span>`).join('')}${cells}</div>
    <div class="intro-foot" data-s="cta">
      <span class="btn primary intro-cta">Créer le sondage${icon('right', 16)}</span>
      <span class="intro-live"><i></i>En direct</span>
      <span class="intro-best"><span><small class="v-label"><span class="if-off">${INTRO_PEOPLE.length} sur ${INTRO_PEOPLE.length}</span><span class="if-on">C’est calé&nbsp;! 🎉</span></small><b>${esc(slotLong({ d: mon + INTRO_BEST, t: 4 }))}</b></span><span class="intro-choose"><span class="if-off">Choisir</span><span class="if-on">${icon('check', 16)}</span></span></span>
    </div>
    <div class="intro-sheet">
      <div class="intro-link"><span class="intro-url">${esc(location.host)}/s/k7m2pq4xna</span><span class="btn sm primary intro-copy">${icon('copy', 15)}<span class="if-off">Copier</span><span class="if-on">Copié</span></span></div>
      <div class="intro-chat">
        <span class="intro-chat-h">Les copains</span>
        <div class="intro-msg me"><span class="intro-prev">${BRAND_MARK}<span><b>${esc(INTRO_TITLE)}</b><small>${esc(SITE_NAME)}</small></span></span>On se la fait quand&nbsp;? 🧀</div>
        <div class="intro-msg m1"><b>Karim</b>Chaud&nbsp;! 🔥</div>
        <div class="intro-msg m2"><b>Sophie</b>👍</div>
      </div>
    </div>
    <span class="intro-finger"></span>`;
}
function introHTML() {
  return `<div class="intro" role="group" aria-label="Comment ça marche, en animation">
    <div class="intro-bar">
      <div class="intro-segs">${INTRO_STEPS.map((t, k) => `<button type="button" class="intro-seg" data-act="intro-go" data-n="${k}" aria-label="Étape ${k + 1} sur ${INTRO_STEPS.length} : ${t}"><span><span></span></span></button>`).join('')}</div>
      <button type="button" class="iconbtn intro-pp" data-act="intro-pause"></button>
    </div>
    <p class="intro-cap" aria-hidden="true"><span class="intro-cap-n"></span><span class="intro-cap-t"></span></p>
    <div class="intro-stage" aria-hidden="true">${introStageHTML()}</div>
  </div>`;
}

let intro = null; // { root, scene, timers, loop, playing, paused, io }
const iq = (sel) => intro.root.querySelector(sel);
const iset = (sel, c, on = true) => intro.root.querySelectorAll(sel).forEach((n) => n.classList.toggle(c, on));
const ilater = (ms, fn) => { const it = intro; it.timers.push(setTimeout(() => { if (intro === it) fn(); }, ms)); };
// Le doigt se pose sur un élément du décor (positions relatives à la scène, sans tenir compte des transformations).
function iPoint(sel, now) {
  if (now) return;
  const stage = iq('.intro-stage'), f = iq('.intro-finger'), el = iq(sel);
  let x = el.offsetWidth * 0.62, y = el.offsetHeight * 0.62;
  for (let n = el; n && n !== stage; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; }
  if (!f.classList.contains('show')) { f.style.transition = 'none'; f.style.transform = `translate(${x + 26}px, ${y + 38}px)`; void f.offsetWidth; f.style.transition = ''; }
  f.style.transform = `translate(${x}px, ${y}px)`;
  f.classList.add('show');
}
function iTap(now) {
  if (now) return;
  const f = iq('.intro-finger');
  f.classList.remove('tap'); void f.offsetWidth; f.classList.add('tap');
}
const iHide = () => iset('.intro-finger', 'show', false);
function iType(now) {
  const t = iq('.intro-title');
  if (now) { t.textContent = INTRO_TITLE; return; }
  t.classList.add('typing');
  [...INTRO_TITLE].forEach((_, k) => ilater(k * 50, () => { t.textContent = INTRO_TITLE.slice(0, k + 1); }));
  ilater(INTRO_TITLE.length * 50 + 500, () => t.classList.remove('typing'));
}
// Les n premières personnes ont répondu : avatars, nombre de dispos et couleur de chaque soir.
function iAnswers(n, now) {
  const tot = Array(10).fill(0);
  INTRO_PEOPLE.slice(0, n).forEach(([, a]) => [...a].forEach((c, k) => { if (c !== '0') tot[k]++; }));
  intro.root.querySelectorAll('.intro-cal .pill').forEach((p) => {
    const k = +p.dataset.k;
    p.className = `pill heat h${tot[k]}`;
    p.lastElementChild.textContent = tot[k];
    if (!now && n && INTRO_PEOPLE[n - 1][1][k] !== '0') { void p.offsetWidth; p.classList.add('bump'); }
  });
  intro.root.querySelectorAll('.intro-av').forEach((a, k) => a.classList.toggle('in', k < n));
  iq('.intro-sub').textContent = n ? plural(n, 'réponse') : 'En attente des réponses';
}
const INTRO_SCRIPT = [
  [ // 1. Les créneaux
    [300, (now) => iType(now)],
    [1500, (now) => iPoint('.intro-pick', now)],
    [2100, (now) => {
      const mon = introMonday();
      iTap(now); iset('.intro-pick', 'on'); iset('.intro-cal', 'open');
      iq('.intro-sub').textContent = `${fmt(fDM, mon)} → ${fmt(fDM, mon + 11)}`;
    }],
    [3500, (now) => iPoint('.intro-cta', now)],
    [4100, (now) => { iTap(now); iset('.intro-cta', 'on'); }],
  ],
  [ // 2. Le lien
    [0, () => { iHide(); iset('.intro-sheet', 'in'); }],
    [700, (now) => iPoint('.intro-copy', now)],
    [1200, (now) => { iTap(now); iset('.intro-copy', 'on'); }],
    [1600, () => { iHide(); iset('.intro-msg.me', 'in'); }],
    [2500, () => iset('.intro-msg.m1', 'in')],
    [3200, () => iset('.intro-msg.m2', 'in')],
  ],
  [ // 3. Les dispos
    [0, (now) => {
      iset('.intro-sheet', 'in', false); iset('.intro-cal', 'heat');
      iq('.intro-tools').dataset.s = 'people'; iq('.intro-foot').dataset.s = 'live';
      iAnswers(0, now);
    }],
    ...INTRO_PEOPLE.map((_, k) => [1000 + k * 1000, (now) => iAnswers(k + 1, now)]),
  ],
  [ // 4. La date
    [300, () => {
      iset('.intro-cal', 'done'); iset(`.intro-cal .pill[data-k="${INTRO_BEST}"]`, 'best');
      iq('.intro-foot').dataset.s = 'best';
    }],
    [1700, (now) => iPoint('.intro-choose', now)],
    [2300, (now) => {
      iTap(now); iset('.intro-best', 'on'); iset(`.intro-cal .pill[data-k="${INTRO_BEST}"]`, 'final');
    }],
    [3100, () => iHide()],
  ],
];

function introClear() { intro.timers.forEach(clearTimeout); intro.timers = []; }
// Décor tel qu'à la fin de la scène k (k = -1 : décor de départ), sans transition.
function introShow(k) {
  intro.root.classList.add('instant');
  iq('.intro-stage').innerHTML = introStageHTML();
  for (let j = 0; j <= k; j++) INTRO_SCRIPT[j].forEach(([, fn]) => fn(true));
  void intro.root.offsetWidth;
  intro.root.classList.remove('instant');
}
// Barre d'étapes (la scène en cours se remplit pendant qu'elle joue), légende et bouton pause.
function introBar() {
  const { root, scene, playing } = intro;
  root.querySelectorAll('.intro-seg').forEach((b, j) => {
    const fill = b.firstElementChild.firstElementChild;
    fill.style.transition = 'none';
    fill.style.transform = `scaleX(${j < scene || (j === scene && !playing) ? 1 : 0})`;
    if (j === scene && playing) { void fill.offsetWidth; fill.style.transition = `transform ${INTRO_DUR[j]}ms linear`; fill.style.transform = 'scaleX(1)'; }
    if (j === scene) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
  });
  iq('.intro-cap-n').textContent = scene + 1;
  iq('.intro-cap-t').textContent = INTRO_STEPS[scene];
  const pp = iq('.intro-pp');
  pp.hidden = reduceMotion;
  pp.innerHTML = icon(playing ? 'pause' : 'play', 18);
  pp.setAttribute('aria-label', playing ? 'Mettre l’animation en pause' : 'Relancer l’animation');
}
function introPlay(k, fresh) {
  const it = intro;
  introClear();
  if (fresh) introShow(k - 1);
  it.scene = k; it.playing = true; it.paused = false;
  introBar();
  INTRO_SCRIPT[k].forEach(([ms, fn]) => ilater(ms, () => { if (!it.root.isConnected) stopIntro(); else fn(false); }));
  ilater(INTRO_DUR[k], () => {
    if (!it.root.isConnected) stopIntro();
    else if (k < INTRO_SCRIPT.length - 1) introPlay(k + 1, false);
    else if (++it.loop < INTRO_LOOPS) {
      it.root.classList.add('fading');
      ilater(450, () => { it.root.classList.remove('fading'); introPlay(0, true); });
    } else { it.playing = false; it.paused = true; introBar(); } // fin : on reste sur la date choisie
  });
}
function stopIntro() {
  if (!intro) return;
  introClear();
  if (intro.io) intro.io.disconnect();
  intro = null;
}
function startIntro() {
  stopIntro();
  const root = app.querySelector('.intro');
  if (!root) return;
  // Animations réduites : la dernière scène, figée ; sinon le décor de départ, en attendant d'être à l'écran.
  intro = { root, scene: reduceMotion ? INTRO_SCRIPT.length - 1 : 0, timers: [], loop: 0, playing: false, paused: reduceMotion, io: null };
  introShow(reduceMotion ? intro.scene : -1);
  introBar();
  if (reduceMotion) return;
  if (!('IntersectionObserver' in window)) { introPlay(0, true); return; }
  const it = intro;
  it.io = new IntersectionObserver((entries) => {
    if (intro !== it) return;
    if (!it.root.isConnected) { stopIntro(); return; }
    const seen = entries[entries.length - 1].isIntersecting;
    if (seen && !it.playing && !it.paused) introPlay(it.scene, true);
    else if (!seen && it.playing) { introClear(); it.playing = false; it.root.classList.remove('fading'); }
  }, { threshold: 0.4 });
  it.io.observe(root);
}
function introToggle() {
  if (!intro) return;
  if (intro.playing) { introClear(); intro.playing = false; intro.paused = true; intro.root.classList.remove('fading'); introShow(intro.scene); introBar(); return; }
  intro.loop = 0;
  introPlay(intro.scene === INTRO_SCRIPT.length - 1 ? 0 : intro.scene, true);
}
function introGo(k) {
  if (!intro) return;
  if (intro.playing) { intro.loop = 0; intro.root.classList.remove('fading'); introPlay(k, true); return; }
  intro.scene = k;
  introShow(k);
  introBar();
}
function introOff() {
  const s = loadStore();
  s.introOff = true;
  saveStore(s);
  stopIntro();
  const box = document.getElementById('home-intro');
  if (box) box.remove();
  const cta = $('.dash-head .btn');
  if (cta) cta.focus();
}

async function loadHomePolls(mine) {
  try {
    const { polls } = await api('GET', '/me/polls');
    const box = document.getElementById('home-polls');
    if (view !== 'home' || !box) return;
    const local = new Map(mine.map((p) => [p.id, p]));
    const remote = polls.map((p) => ({
      id: p.i, t: p.t, ic: p.ic, s: p.s, e: p.e, n: p.answers, own: p.owner, closed: p.closed,
      dd: p.dd || '', dt: p.dt || 0, todo: !p.answered && !p.owner && !p.closed && !p.dd,
      seen: (local.get(p.i) || {}).seen || 0,
    }));
    const ids = new Set(remote.map((p) => p.id));
    // Ceux du compte d'abord (du plus récemment modifié au plus ancien), puis ceux seulement ouverts sur cet appareil.
    box.innerHTML = pollListHTML(remote.concat(mine.filter((p) => !ids.has(p.id))));
    // Organisateur d'un sondage du compte : l'animation pour débutants n'a plus lieu d'être.
    if (polls.some((p) => p.owner)) { stopIntro(); const ib = document.getElementById('home-intro'); if (ib) ib.remove(); }
  } catch (e) { /* la liste locale reste affichée */ }
}

/* ---------- Vue : création et modification (3 étapes) ---------- */
const STEPS = ['Le programme', 'Les créneaux', 'Les options'];
// « Nombre minimum de personnes » masqué pour simplifier ; un sondage qui a déjà un minimum (q) le garde et l'affiche.
const ASK_MINIMUM = false;
const FORMULES = [
  { label: 'Tous les soirs', sub: '7 jours sur 7', m: [SOIR, SOIR, SOIR, SOIR, SOIR, SOIR, SOIR] },
  { label: 'Soirs de semaine', sub: 'Du lundi au vendredi', m: [SOIR, SOIR, SOIR, SOIR, SOIR, 0, 0] },
  { label: 'Week-end', sub: 'Midi et soir', m: [0, 0, 0, 0, 0, MIDI | SOIR, MIDI | SOIR] },
  { label: 'Vendredi et samedi soir', sub: 'Pour sortir', m: [0, 0, 0, 0, SOIR, SOIR, 0] },
  { label: 'Midis en semaine', sub: 'Pause déjeuner', m: [MIDI, MIDI, MIDI, MIDI, MIDI, 0, 0] },
  { label: 'Brunch du week-end', sub: 'Samedi et dimanche matin', m: [0, 0, 0, 0, 0, 2, 2] },
  { label: 'Aprèm du week-end', sub: 'Jeux, balade, ciné', m: [0, 0, 0, 0, 0, APREM, APREM] },
  { label: 'Journées du week-end', sub: 'Rando, sortie, escapade', m: [0, 0, 0, 0, 0, JOURNEE, JOURNEE] },
];
const SPANS = [['2 semaines', 14], ['1 mois', 28], ['2 mois', 56], ['3 mois', MAX_DAYS]];

function stepHTML() {
  if (wiz.step === 1) {
    return `<h2>C’est pour quoi&nbsp;?</h2>
      <div class="field"><label for="c-title">Nom</label><input type="text" id="c-title" maxlength="80" placeholder="Soirée jeux, raclette, week-end au vert…" autocomplete="off"></div>
      <fieldset class="field"><legend>Pictogramme</legend><div class="icons" id="c-icons"></div></fieldset>
      <div class="field"><label for="c-place">Lieu <span class="opt">(facultatif)</span></label><input type="text" id="c-place" maxlength="80" placeholder="Chez Julie" autocomplete="off"></div>
      <div class="field"><label for="c-note">Précisions <span class="opt">(facultatif)</span></label><input type="text" id="c-note" maxlength="160" placeholder="Chacun apporte un jeu ou un fromage" autocomplete="off"></div>`;
  }
  if (wiz.step === 2) {
    return `<h2>Quand est-ce possible&nbsp;?</h2>
      <fieldset class="field"><legend>Sur quelle période&nbsp;?</legend>
        <div class="chips" id="c-spans"></div>
        <div class="dates">
          <label for="c-start">Du<input type="date" id="c-start"></label>
          <label for="c-end">Au<input type="date" id="c-end"></label>
        </div>
      </fieldset>
      <fieldset class="field"><legend>Quels créneaux&nbsp;?</legend>
        <div class="formules" id="c-formules"></div>
      </fieldset>
      <div class="field">
        <span class="label">Ou composez vos règles, jour par jour</span>
        <div class="matrix" id="c-matrix"></div>
        <ul class="rules" id="c-rules" aria-live="polite"></ul>
      </div>
      <div class="hols" id="c-hols" aria-live="polite" hidden></div>
      <div class="field">
        <div class="row-between"><span class="label">Aperçu</span><span class="count" id="c-count"></span></div>
        <p class="hint">Touchez un jour pour choisir ses moments&nbsp;: l’exclure (anniversaire, week-end déjà pris…), l’ajouter, ou lui donner d’autres créneaux que la règle. Les jours fériés sont cerclés.</p>
        <div id="c-cal"></div>
      </div>`;
  }
  return `<h2>Les règles du jeu</h2>
    <p class="muted">Tout est facultatif&nbsp;: vous pouvez créer le sondage tel quel.</p>
    <div class="field">
      <label for="c-guest">Qui est attendu&nbsp;?</label>
      <div class="inline"><input type="text" id="c-guest" maxlength="120" placeholder="Prénoms, séparés par des virgules" autocomplete="off" enterkeyhint="done"><button type="button" class="btn" data-act="guest-add">Ajouter</button></div>
      <ul class="guests" id="c-guests"></ul>
      <p class="hint">La page indiquera qui n’a pas encore répondu. Touchez l’étoile d’une personne <b>indispensable</b>&nbsp;: les créneaux où elle n’est pas dispo seront écartés.</p>
    </div>
    <div class="field">
      <label for="c-dl">Date limite de réponse</label>
      <div class="inline"><input type="date" id="c-dl"><button type="button" class="btn quiet" data-act="dl-clear" id="c-dl-clear">Aucune</button></div>
      <p class="hint">Passé ce jour, les réponses sont figées et vous pouvez trancher.</p>
    </div>
    ${ASK_MINIMUM ? `<div class="field">
      <span class="label" id="c-q-l">Nombre minimum de personnes</span>
      <div class="stepper" role="group" aria-labelledby="c-q-l">
        <button type="button" class="iconbtn" data-act="q" data-d="-1" aria-label="Moins">${icon('minus')}</button>
        <output id="c-q" aria-live="polite"></output>
        <button type="button" class="iconbtn" data-act="q" data-d="1" aria-label="Plus">${icon('plus')}</button>
      </div>
      <p class="hint">Les créneaux qui n’atteignent pas ce nombre sont signalés.</p>
    </div>` : ''}
    ${auth.user ? `<div class="field">
      <label for="c-pin">Code d’accès</label>
      <input type="text" id="c-pin" class="code-input" inputmode="numeric" maxlength="6" placeholder="4 à 6 chiffres" autocomplete="off" spellcheck="false">
      <p class="hint">${wiz.editing
        ? 'Laissez vide pour retirer le code. Si vous le changez, chacun devra saisir le nouveau.'
        : 'Avec un code, le lien seul ne suffit plus pour ouvrir le sondage. Vous le retrouverez toujours sur la page du sondage.'}</p>
    </div>` : ''}
    ${wiz.editing ? '' : auth.user
      ? `<p class="notice">${icon('star', 18)}<span>Vous serez l’<b>organisateur</b>&nbsp;: vous seul pourrez choisir la date, modifier, clôturer ou supprimer ce sondage, depuis tous vos appareils.</span></p>`
      : `<p class="notice">${icon('lock', 18)}<span>Sans compte, toute personne qui a le lien pourra modifier, clôturer ou supprimer ce sondage, et choisir la date.${auth.enabled
        ? ' <a href="/compte">Connectez-vous</a> pour en être le seul organisateur et le protéger par un code.' : ''}</span></p>`}`;
}

function showCreate() {
  view = wiz.editing ? 'edit' : 'create';
  if (!wiz.editing) poll = null;
  stopRefresh();
  document.title = (wiz.editing ? 'Modifier le sondage' : 'Nouveau sondage') + ' · ' + SITE_NAME;
  renderTopnav();
  const last = wiz.step === STEPS.length;
  app.innerHTML = `<div class="page narrow wizard">
    <header class="wiz-head">
      ${wiz.editing ? `<button type="button" class="back" data-act="edit-cancel">${icon('left', 16)}Retour au sondage</button>` : ''}
      <h1>${wiz.editing ? 'Modifier le sondage' : 'Nouveau sondage'}</h1>
      ${wiz.editing ? '<p class="muted">Les dispos déjà données restent sur les créneaux conservés. Celles des créneaux retirés seront effacées.</p>' : ''}
      <ol class="steps">${STEPS.map((label, i) =>
        `<li><button type="button" class="step${i + 1 < wiz.step ? ' done' : ''}" data-act="step" data-n="${i + 1}"${wiz.step === i + 1 ? ' aria-current="step"' : ''}><span class="step-n">${i + 1 < wiz.step ? icon('check', 14) : i + 1}</span>${label}</button></li>`).join('')}</ol>
    </header>
    <section class="card wiz-body">${stepHTML()}</section>
    <div class="wiz-foot">
      <p class="error" id="c-error" role="alert" hidden></p>
      <div class="wiz-bar">
        <p class="wiz-sum" id="c-sum"></p>
        <div class="wiz-actions">
          ${wiz.step > 1 ? `<button type="button" class="btn" data-act="step" data-n="${wiz.step - 1}">Retour</button>` : ''}
          ${last
            ? `<button type="button" class="btn primary" id="c-go" data-act="${wiz.editing ? 'save-poll' : 'create'}">${wiz.editing ? 'Enregistrer' : 'Créer le sondage'}</button>`
            : `<button type="button" class="btn primary" id="c-go" data-act="step" data-n="${wiz.step + 1}">Continuer${icon('right')}</button>`}
        </div>
      </div>
    </div>
  </div>`;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  set('c-title', draft.t); set('c-place', draft.l); set('c-note', draft.n); set('c-pin', draft.pin);
  set('c-start', Number.isFinite(draft.s) ? ymd(draft.s, '-') : '');
  set('c-end', Number.isFinite(draft.e) ? ymd(draft.e, '-') : '');
  set('c-dl', draft.dl != null && Number.isFinite(draft.dl) ? ymd(draft.dl, '-') : '');
  if (!wiz.editing && $('#c-start')) $('#c-start').min = ymd(todayDay, '-');
  paintCreate();
}

// Vérifie le brouillon. step : l'étape où se corrige l'erreur (on ne bloque pas les étapes d'avant).
function draftCheck() {
  const { s, e } = draft;
  if (!Number.isFinite(s) || !Number.isFinite(e)) return { err: 'Choisissez une date de début et une date de fin.', step: 2 };
  if (e < s) return { err: 'La date de fin doit être après la date de début.', step: 2 };
  if (e - s >= MAX_DAYS) return { err: 'Période trop longue : 3 mois maximum.', step: 2 };
  let slots = 0, days = 0;
  for (let d = s; d <= e; d++) {
    const r = draftRule(d);
    if (!r) continue;
    days++; slots += popcount(r);
  }
  const out = { slots, days };
  if (!slots) return Object.assign(out, { err: 'Aucun créneau : choisissez au moins un jour et un moment.', step: 2 });
  if (slots > MAX_SLOTS) return Object.assign(out, { err: `Trop de créneaux (${slots}). Réduisez la période ou le nombre de moments (${MAX_SLOTS} maximum).`, step: 2 });
  if (draft.dl != null) {
    if (!Number.isFinite(draft.dl)) return Object.assign(out, { err: 'Date limite de réponse invalide.', step: 3 });
    if (draft.dl > e) return Object.assign(out, { err: 'La date limite de réponse doit tomber avant la fin de la période.', step: 3 });
  }
  if (auth.user && draft.pin && !/^\d{4,6}$/.test(draft.pin)) return Object.assign(out, { err: 'Le code d’accès doit faire 4 à 6 chiffres.', step: 3 });
  return out;
}

// « Journée » couvre tout le jour : elle remplace les autres moments, et en choisir un autre la retire.
const toggleBit = (mask, t) => (t === 0 ? (mask & 1 ? 0 : 1) : (mask & ~1) ^ (1 << t));
// Tous les moments des règles (ce que reçoit un jour férié ouvert en entier), et les moments d'un jour.
const draftAll = () => { const u = draft.m.reduce((acc, r) => acc | r, 0); return u & 1 ? 1 : u; };
const draftRule = (d) => (draft.o.has(d) ? draft.o.get(d) : draft.m[weekday(d)]);
// Règle un jour à part ; revenir aux moments de la règle efface le réglage.
function setDay(d, mask) {
  if (mask === draft.m[weekday(d)]) draft.o.delete(d); else draft.o.set(d, mask);
}

// Jours fériés de la période. missing : ceux qui n'ont pas tous les moments du sondage (hors des jours choisis,
// ou un jour où seuls certains moments sont proposés), sauf s'ils ont été réglés à la main.
// opened : ceux qu'on a ouverts en entier.
function draftHolidays() {
  const { s, e } = draft;
  const all = [], full = draftAll();
  if (Number.isFinite(s) && Number.isFinite(e) && e >= s && e - s < MAX_DAYS) {
    for (let d = s; d <= e; d++) { const name = holiday(d); if (name) all.push({ d, name }); }
  }
  return {
    all,
    missing: full ? all.filter((h) => draft.m[weekday(h.d)] !== full && !(draft.o.get(h.d) > 0)) : [],
    opened: all.filter((h) => draft.o.get(h.d) === full && draft.m[weekday(h.d)] !== full),
  };
}
function holidaysHTML() {
  const { all, missing, opened } = draftHolidays();
  if (!all.length) return '';
  const n = missing.length;
  const outside = missing.every((h) => !draft.m[weekday(h.d)]);
  const what = outside
    ? `${n > 1 ? `${n} tombent` : all.length > 1 ? 'Un tombe' : 'Il tombe'} en dehors des jours choisis.`
    : `${n > 1 ? `${n} n’ont` : all.length > 1 ? 'Un n’a' : 'Il n’a'} pas tous les moments du sondage, comme un jour de week-end.`;
  const go = outside
    ? (n > 1 ? `Ajouter ces ${n} jours` : 'L’ajouter au sondage')
    : (n > 1 ? `Proposer tous les moments ces ${n} jours` : 'Proposer tous les moments ce jour-là');
  return `<p>${all.length > 1 ? 'Jours fériés' : 'Jour férié'} sur la période&nbsp;: ${all.map((h) =>
    `<span class="nowrap"><b>${fmt(fShort, h.d)}</b> ${esc(h.name)}</span>`).join(' · ')}</p>
    ${n ? `<p class="hol-act"><span>${what}</span>
      <button type="button" class="btn sm" data-act="add-hols">${go}</button></p>`
    : opened.length ? `<p class="hol-act"><span>${opened.length > 1 ? `${opened.length} sont proposés` : 'Il est proposé'} avec tous les moments du sondage.</span>
      <button type="button" class="btn sm quiet" data-act="del-hols">Revenir aux règles</button></p>` : ''}`;
}
function addHolidays() {
  const days = draftHolidays().missing.map((h) => h.d), full = draftAll();
  for (const d of days) setDay(d, full);
  return days;
}
function removeHolidays() {
  for (const h of draftHolidays().opened) draft.o.delete(h.d);
}

function previewCalHTML() {
  const { s, e } = draft;
  if (!(Number.isFinite(s) && Number.isFinite(e) && e >= s && e - s < MAX_DAYS)) return '';
  return calGrid(s, e, [0, 1, 2, 3, 4, 5, 6], (d) => {
    const hol = holiday(d);
    const rule = draft.m[weekday(d)], r = draftRule(d);
    const own = r !== rule; // réglé à part
    const state = r ? (own ? 'on own' : 'on') : rule ? 'ex' : 'off';
    const said = r ? momentsText(r) + (own ? ', réglé à part' : '') : rule ? 'exclu' : 'non proposé';
    return `<button type="button" class="day pv ${state}${hol ? ' hol' : ''}" data-act="day" data-d="${d}" aria-haspopup="dialog" aria-label="${fmt(fLong, d)}${hol ? ', ' + esc(hol) : ''} : ${said}. Choisir ses moments"${hol ? ` title="${esc(hol)}"` : ''}><span class="day-n">${dateOf(d)}</span>${r ? `<span class="dots">${'<i></i>'.repeat(popcount(r))}</span>` : ''}</button>`;
  });
}

/* ---------- Dialogue : les moments d'un jour de l'aperçu ---------- */
const momentsText = (mask) => MOMENTS.filter((_, t) => mask & (1 << t)).join(', ').toLowerCase();
let dayDlg = null, dayOpen = null;
function openDay(d) {
  if (!dayDlg) {
    dayDlg = document.createElement('dialog');
    dayDlg.className = 'dlg';
    dayDlg.setAttribute('aria-labelledby', 'dlg-title');
    document.body.appendChild(dayDlg);
    // Clic sur le fond : on ferme.
    dayDlg.addEventListener('click', (ev) => { if (ev.target === dayDlg) dayDlg.close(); });
    dayDlg.addEventListener('close', () => {
      const back = dayOpen != null && $(`[data-act="day"][data-d="${dayOpen}"]`);
      dayOpen = null;
      if (back) back.focus({ preventScroll: true });
    });
  }
  dayOpen = d;
  paintDay();
  dayDlg.showModal();
}
function paintDay(focusSel) {
  const d = dayOpen;
  const hol = holiday(d);
  const rule = draft.m[weekday(d)], r = draftRule(d);
  const state = r === rule
    ? (rule ? 'Comme les autres ' + WD_LONG[weekday(d)].toLowerCase() + 's.' : 'Ce jour n’est pas proposé pour l’instant.')
    : r ? 'Réglé à part pour ce jour.' : 'Ce jour est exclu du sondage.';
  dayDlg.innerHTML = `<h2 id="dlg-title">${fmt(fLong, d)}</h2>
    ${hol ? `<p class="dlg-hol">${esc(hol)}</p>` : ''}
    <p class="muted">Quels moments proposer ce jour-là&nbsp;?</p>
    <div class="dlg-moments">${MOMENTS.map((label, t) =>
      `<button type="button" class="chip" data-act="day-t" data-t="${t}" aria-pressed="${!!(r & (1 << t))}">${label}</button>`).join('')}</div>
    <p class="hint" aria-live="polite">${state}</p>
    <div class="dlg-actions">
      ${r ? '<button type="button" class="btn sm quiet" data-act="day-none">Supprimer le jour</button>' : ''}
      ${r !== rule ? '<button type="button" class="btn sm quiet" data-act="day-reset">Revenir à la règle</button>' : ''}
      <button type="button" class="btn sm primary" data-act="day-close">OK</button>
    </div>`;
  const f = dayDlg.querySelector(focusSel || '[data-act="day-close"]') || dayDlg.querySelector('[data-act="day-close"]');
  f.focus();
}
// Change les moments du jour ouvert, et rafraîchit l'aperçu derrière le dialogue.
function changeDay(mask, focusSel) {
  setDay(dayOpen, mask);
  paintCreate();
  paintDay(focusSel);
}

function paintCreate() {
  const chk = draftCheck();
  const put = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; return el; };
  if (wiz.step === 1) {
    put('c-icons', ICONS.map((ic) => `<button type="button" class="icon-opt" data-act="icon" data-ic="${ic}" aria-pressed="${(draft.ic || ICONS[0]) === ic}" aria-label="Pictogramme ${ic}">${ic}</button>`).join(''));
  }
  if (wiz.step === 2) {
    const len = draft.e - draft.s + 1;
    put('c-spans', SPANS.map(([label, n]) => `<button type="button" class="chip" data-act="span" data-n="${n}" aria-pressed="${len === n}">${label}</button>`).join(''));
    const cur = draft.m.join();
    const custom = !FORMULES.some((f) => f.m.join() === cur);
    put('c-formules', FORMULES.map((f, k) =>
      `<button type="button" class="formule" data-act="formule" data-k="${k}" aria-pressed="${f.m.join() === cur}"><b>${f.label}</b><small>${f.sub}</small></button>`).join('')
      + (custom ? '<span class="formule on-mesure" aria-current="true"><b>Sur mesure</b><small>Vos propres règles</small></span>' : ''));
    put('c-matrix',
      `<span></span>${WD.map((d, w) => `<button type="button" class="mx-h" data-act="mx-col" data-w="${w}" aria-label="${WD_LONG[w]} : tout cocher ou décocher">${d}</button>`).join('')}`
      + MOMENTS.map((label, t) =>
        `<button type="button" class="mx-h row" data-act="mx-row" data-t="${t}" aria-label="${label} : tout cocher ou décocher">${label}</button>`
        + WD.map((d, w) => `<button type="button" class="mx-c" data-act="cell" data-w="${w}" data-t="${t}" aria-pressed="${!!(draft.m[w] & (1 << t))}" aria-label="${label}, ${WD_LONG[w]}"></button>`).join('')).join(''));
    put('c-rules', rulesLines(draft.m).map((l) => `<li>${icon('check', 14)}${esc(l)}</li>`).join(''));
    put('c-cal', previewCalHTML());
    const hols = document.getElementById('c-hols');
    const holHtml = holidaysHTML();
    hols.innerHTML = holHtml;
    hols.hidden = !holHtml;
    hols.classList.toggle('todo', !!hols.querySelector('[data-act="add-hols"]'));
    put('c-count', chk.slots ? `${plural(chk.slots, 'créneau', 'créneaux')} sur ${plural(chk.days, 'jour')}` : '');
  }
  if (wiz.step === 3) {
    put('c-guests', draft.g.map((name, k) => {
      const must = draft.r.has(norm(name));
      return `<li class="guest${must ? ' must' : ''}">
        <button type="button" class="guest-star" data-act="guest-star" data-k="${k}" aria-pressed="${must}" aria-label="${esc(name)} : indispensable" title="Indispensable">${icon('star', 16)}</button>
        <span>${esc(name)}</span>
        <button type="button" class="guest-x" data-act="guest-del" data-k="${k}" aria-label="Retirer ${esc(name)}">${icon('x', 14)}</button></li>`;
    }).join(''));
    put('c-q', draft.q ? `${draft.q} personnes` : 'Pas de minimum');
    const clear = document.getElementById('c-dl-clear');
    if (clear) clear.hidden = draft.dl == null;
    const dl = document.getElementById('c-dl');
    if (dl && Number.isFinite(draft.e)) dl.max = ymd(draft.e, '-');
  }
  const blocking = chk.err && chk.step <= wiz.step;
  const err = document.getElementById('c-error');
  err.hidden = !blocking;
  err.textContent = blocking ? chk.err : '';
  const sum = [];
  if (chk.slots && !(chk.err && chk.step === 2)) sum.push(`<b>${plural(chk.slots, 'créneau', 'créneaux')}</b> sur ${plural(chk.days, 'jour')}`);
  if (wiz.step > 1 && Number.isFinite(draft.s) && Number.isFinite(draft.e)) sum.push(`du ${fmt(fDM, draft.s)} au ${fmt(fDM, draft.e)}`);
  put('c-sum', sum.join(' · '));
  const goBtn = document.getElementById('c-go');
  goBtn.disabled = busy || (wiz.step === STEPS.length ? !!chk.err : !!blocking);
}

function toggleMoment(t) {
  const bit = 1 << t;
  const on = draft.m.some((r) => r & bit);
  if (on) { draft.m = draft.m.map((r) => r & ~bit); return; }
  const anyDay = draft.m.some((r) => r);
  // Sur les jours déjà choisis (ou tous, s'il n'y en a aucun) ; « Journée » remplace les autres moments.
  draft.m = draft.m.map((r) => (anyDay && !r ? r : t === 0 ? 1 : (r & ~1) | bit));
}
function toggleDay(w) {
  if (draft.m[w]) { draft.m[w] = 0; return; }
  draft.m[w] = draftAll() || SOIR;
}
function addGuests(text) {
  const have = new Set(draft.g.map(norm));
  for (const raw of String(text).split(/[,;\n]+/)) {
    const name = raw.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!name || have.has(norm(name)) || draft.g.length >= MAX_GUESTS) continue;
    have.add(norm(name));
    draft.g.push(name);
  }
}

function draftPayload() {
  const own = Array.from(draft.o).filter(([d]) => d >= draft.s && d <= draft.e).sort((p, q) => p[0] - q[0]);
  return {
    t: draft.t.trim(),
    n: draft.n.trim(),
    l: draft.l.trim(),
    ic: draft.ic,
    s: ymd(draft.s), e: ymd(draft.e),
    m: draft.m.slice(),
    // Jours réglés à part : sans moment, le jour est exclu (x) ; sinon il porte ses propres moments (o).
    x: own.filter(([d, r]) => !r && draft.m[weekday(d)]).map(([d]) => d - draft.s),
    o: own.filter(([d, r]) => r && r !== draft.m[weekday(d)]).map(([d, r]) => [d - draft.s, r]),
    dl: draft.dl != null ? ymd(draft.dl) : '',
    q: draft.q,
    g: draft.g.slice(),
    r: draft.g.filter((name) => draft.r.has(norm(name))),
    pin: auth.user ? draft.pin : '', // le code est réservé aux organisateurs connectés
  };
}
function draftFromPoll(st) {
  const s = parseYmd(st.s);
  // Les anciens « jours ajoutés » (a) prenaient tous les moments du sondage : on les relit comme des jours réglés à part.
  const all = st.m.reduce((u, r) => u | r, 0);
  const o = new Map((st.a || []).map((k) => [s + k, all]));
  for (const [k, r] of st.o || []) o.set(s + k, r);
  for (const k of st.x || []) o.set(s + k, 0);
  return {
    t: st.t, n: st.n || '', l: st.l || '', ic: st.ic || '', s, e: parseYmd(st.e), m: st.m.slice(),
    o, pin: st.pin || '',
    dl: st.dl ? parseYmd(st.dl) : null, q: st.q || 0, g: (st.g || []).slice(), r: new Set((st.r || []).map(norm)),
  };
}

function startEdit() {
  createDraft = draft;
  draft = draftFromPoll(poll.st);
  wiz = { step: 2, editing: true };
  showCreate();
  window.scrollTo(0, 0);
}
function leaveEdit() {
  draft = createDraft || newDraft();
  createDraft = null;
  wiz = { step: 1, editing: false };
  view = 'poll';
  renderPoll();
  startRefresh();
  window.scrollTo(0, 0);
}
// Nouveau sondage avec les mêmes règles et les mêmes invités, sur une période qui repart de demain.
function duplicatePoll() {
  const d = draftFromPoll(poll.st);
  const len = d.e - d.s;
  draft = Object.assign(d, { t: d.t, s: todayDay + 1, e: todayDay + 1 + len, o: new Map(), dl: null, pin: '' });
  createDraft = null;
  wiz = { step: 2, editing: false };
  go('/nouveau');
  showToast('Réglages repris : ajustez la période, puis créez le sondage.');
}
function savePoll(btn) {
  if (draftCheck().err) return;
  return runAction(btn, 'Enregistrement…', async () => {
    const st = await api('PUT', '/polls/' + poll.st.i, draftPayload());
    poll.st = st;
    remember(st);
    ui = freshUi();
    leaveEdit();
    showToast('Sondage modifié.');
  });
}
async function createPoll(btn) {
  if (draftCheck().err || busy) return;
  busy = true;
  btn.disabled = true;
  btn.textContent = 'Création…';
  try {
    const st = await api('POST', '/polls', draftPayload());
    busy = false;
    storePatch(st.i, { made: true }); // créé ici : gardé dans la liste de l'accueil
    remember(st);
    draft = newDraft();
    wiz = { step: 1, editing: false };
    poll = { st, example: false };
    ui = freshUi({ created: true });
    view = 'poll';
    lastRoute = '/s/' + st.i;
    history.pushState(null, '', lastRoute);
    renderPoll();
    startRefresh();
    window.scrollTo(0, 0);
  } catch (err) {
    busy = false;
    const box = document.getElementById('c-error');
    if (box) { box.hidden = false; box.textContent = err.message; }
    btn.disabled = false;
    btn.textContent = 'Créer le sondage';
  }
}

/* ---------- Vue : sondage ---------- */
async function loadPoll(id) {
  view = 'loading';
  app.innerHTML = '<p class="loading">Ouverture du sondage…</p>';
  const here = lastRoute;
  try {
    const st = await api('GET', '/polls/' + id);
    if (lastRoute !== here) return;
    openPoll(st);
  } catch (err) {
    if (lastRoute !== here) return;
    if (err.pin) { showPin(id); return; }
    if (err.deleted) { showDeleted(id, err.deleted); return; }
    if (err.status === 404) forgetPoll(id);
    view = 'error';
    document.title = SITE_NAME;
    app.innerHTML = `<div class="page narrow"><section class="state">
      <h1>${err.status === 404 ? 'Sondage introuvable' : 'Impossible d’ouvrir ce sondage'}</h1>
      <p class="muted" role="alert">${esc(err.message)}</p>
      <div class="actions">${err.status === 404 ? '' : `<button type="button" class="btn primary" data-act="retry" data-id="${esc(id)}">Réessayer</button>`}<a class="btn${err.status === 404 ? ' primary' : ''}" href="/nouveau">Créer un sondage</a></div>
    </section></div>`;
  }
}

// Affiche un sondage reçu du serveur. Une réponse en cours sur ce même sondage est gardée si ses créneaux n'ont pas changé.
function openPoll(st) {
  remember(st);
  const same = poll && !poll.example && poll.st.i === st.i && slotsKeyOf(poll.st) === slotsKeyOf(st);
  poll = { st, example: false };
  if (!same) ui = freshUi();
  view = 'poll';
  renderPoll();
  startRefresh();
}

/* ---------- Vue : code d'accès ---------- */
// Le sondage en cours et la réponse commencée restent en mémoire : ils reviennent une fois le bon code donné.
// Sondage à la corbeille : récupérable pendant TRASH_DAYS jours par qui le gère, puis effacé pour de bon.
function showDeleted(id, info) {
  view = 'deleted';
  deletedFor = id;
  stopRefresh();
  forgetPoll(id);
  document.title = 'Sondage supprimé · ' + SITE_NAME;
  const until = info.until ? fmt(fLong, Math.floor(info.until / DAY_MS)) : '';
  app.innerHTML = `<div class="page narrow"><section class="state">
    <h1>Sondage supprimé</h1>
    <p class="muted">Il reste dans la corbeille${until ? ` jusqu’au ${until}` : ''}, puis il sera effacé pour de bon, avec toutes ses réponses.</p>
    ${info.canRestore ? '' : '<p class="hint">Seul son organisateur peut le restaurer.</p>'}
    <div class="actions">${info.canRestore ? `<button type="button" class="btn primary" data-act="restore" data-id="${esc(id)}">Restaurer le sondage</button>` : ''}<a class="btn" href="/">Accueil</a></div>
  </section></div>`;
}
function restorePoll(btn) {
  const id = btn.dataset.id;
  return runAction(btn, 'Restauration…', async () => {
    const st = await api('POST', '/polls/' + id + '/restore');
    openPoll(st);
    showToast('Sondage restauré.');
  });
}

function showPin(id, msg) {
  view = 'pin';
  pinFor = id;
  stopRefresh();
  document.title = 'Sondage protégé · ' + SITE_NAME;
  renderTopnav();
  app.innerHTML = `<div class="page tiny">
    <section class="card center" aria-labelledby="pin-h">
      <span class="badge-ic">${icon('lock', 26)}</span>
      <h1 id="pin-h">Sondage protégé</h1>
      <p class="muted">L’organisateur a protégé ce sondage par un code. Entrez-le pour voir les dispos et ajouter les vôtres.</p>
      <form class="form" id="pin-form" novalidate>
        <input type="text" id="pin-input" class="code-input big" inputmode="numeric" maxlength="6" autocomplete="off" spellcheck="false" aria-label="Code d’accès" aria-describedby="pin-error" placeholder="••••">
        <p class="error" id="pin-error" role="alert"${msg ? '' : ' hidden'}>${esc(msg || '')}</p>
        <button type="submit" class="btn primary lg wide" id="pin-submit">Ouvrir le sondage</button>
      </form>
      <p class="hint">Pas de code&nbsp;? Demandez-le à l’organisateur.${auth.enabled && !auth.user
        ? ' C’est vous&nbsp;? <a href="/compte">Connectez-vous</a> pour l’ouvrir sans code.' : ''}</p>
    </section></div>`;
  $('#pin-input').focus();
}
function submitPin() {
  const id = pinFor;
  const input = $('#pin-input');
  const box = $('#pin-error');
  const pin = input.value.trim();
  if (!/^\d{4,6}$/.test(pin)) {
    box.hidden = false;
    box.textContent = 'Le code fait 4 à 6 chiffres.';
    input.focus();
    return;
  }
  box.hidden = true;
  const here = lastRoute;
  return runAction($('#pin-submit'), 'Vérification…', async () => {
    let st;
    try {
      st = await api('POST', '/polls/' + id + '/pin', { pin });
    } catch (e) {
      if (!box.isConnected) throw e;
      box.hidden = false;
      box.textContent = e.message;
      input.select();
      const quiet = new Error(e.message);
      quiet.silent = true; // déjà affiché sous le champ
      throw quiet;
    }
    if (lastRoute !== here) return;
    openPoll(st);
    window.scrollTo(0, 0);
  });
}

const pollLink = () => location.origin + '/s/' + poll.st.i;

function ctx() {
  const st = poll.st;
  const slots = buildSlots(st);
  poll.slots = slots;
  const stats = computeStats(st, slots);
  return { st, slots, people: st.p, stats, ranked: rank(stats) };
}
function finalIndex(slots) {
  const f = poll.st.f;
  return Number.isInteger(f) && f >= 0 && f < slots.length ? f : -1;
}
// Invités attendus qui n'ont pas encore répondu.
function pendingGuests(st) {
  const answered = new Set(st.p.map((p) => norm(p.n)));
  return (st.g || []).filter((name) => !answered.has(norm(name)));
}
const isMust = (st, name) => (st.r || []).some((x) => norm(x) === norm(name));

function factsHTML(c) {
  const st = c.st;
  const s = parseYmd(st.s), e = parseYmd(st.e);
  const added = (st.a || []).length + (st.o || []).length;
  const facts = [];
  if (st.l) facts.push([icon('place', 16), esc(st.l)]);
  facts.push([icon('calendar', 16), `Du ${fmt(fShort, s)} au ${fmt(fShort, e)}`]);
  facts.push([icon('rules', 16), esc(rulesLines(st.m).join(' ; ')) + (added ? ` + ${plural(added, 'jour réglé à part', 'jours réglés à part')}` : '')]);
  if (st.dl) facts.push([icon('clock', 16), st.late ? `Réponses closes depuis le ${fmt(fLong, parseYmd(st.dl))}` : `Réponses jusqu’au ${fmt(fLong, parseYmd(st.dl))}`]);
  if (st.q) facts.push([icon('users', 16), `Au moins ${st.q} personnes`]);
  return facts.map(([ic, text]) => `<li>${ic}<span>${text}</span></li>`).join('');
}

function renderPoll() {
  const c = ctx();
  const st = c.st;
  document.title = (st.t || DEFAULT_TITLE) + ' · ' + SITE_NAME;
  renderTopnav();
  const badges = [];
  if (st.isOwner) badges.push(`<span class="tag accent">${icon('star', 14)}Vous organisez</span>`);
  if (st.hasPin) badges.push(`<span class="tag">${icon('lock', 14)}Protégé par un code</span>`);
  if (st.closed) badges.push('<span class="tag">Clôturé</span>');
  app.innerHTML = `<div class="page poll">
    ${poll.example ? `<div class="banner"><p><b>Ceci est un exemple.</b> Les réponses sont fictives, rien n’est enregistré&nbsp;: essayez tout.</p><a class="btn sm primary" href="/nouveau">Créer mon sondage</a></div>` : ''}
    <header class="p-head">
      <span class="p-icon" aria-hidden="true">${esc(st.ic || ICONS[0])}</span>
      <div class="p-title">
        ${badges.length ? `<p class="tags">${badges.join('')}</p>` : ''}
        <h1>${esc(st.t || DEFAULT_TITLE)}</h1>
        ${st.n ? `<p class="p-note">${esc(st.n)}</p>` : ''}
        <ul class="facts" id="facts">${factsHTML(c)}</ul>
      </div>
    </header>
    ${st.closed || st.late ? `<div class="banner calm"><p>${st.closed ? 'Sondage clôturé' : 'La date limite est passée'}&nbsp;: les réponses ne peuvent plus changer${st.isOwner ? ', sauf par vous' : ''}.${!st.owned && !poll.example
      ? (st.closed ? ' Toute personne qui a le lien peut le rouvrir, plus bas.' : ' Toute personne qui a le lien peut repousser la date limite avec «&nbsp;Modifier&nbsp;», plus bas.')
      : ''}</p></div>` : ''}
    <div class="p-grid">
      <div class="p-main">
        ${!poll.example && ui.created ? shareHTML() : ''}
        <div id="verdict-slot">${verdictHTML(c)}</div>
        <div id="answer-slot">${answerHTML(c)}</div>
        <div id="results-slot">${resultsHTML(c)}</div>
      </div>
      <aside class="p-side">
        <div id="people-slot">${peopleHTML(c)}</div>
        ${!poll.example && !ui.created ? shareHTML() : ''}
        ${orgHTML()}
      </aside>
    </div>
  </div>`;
}

// Mise à jour discrète quand d'autres personnes ont répondu : on ne touche pas au formulaire ouvert.
function renderLive() {
  const c = ctx();
  if (!document.getElementById('verdict-slot')) return renderPoll();
  $('#facts').innerHTML = factsHTML(c);
  $('#verdict-slot').innerHTML = verdictHTML(c);
  $('#results-slot').innerHTML = resultsHTML(c);
  $('#people-slot').innerHTML = peopleHTML(c);
  if (!ui.open) $('#answer-slot').innerHTML = answerHTML(c);
}

function whoHTML(i, people) {
  const y = [], m = [], n = [];
  for (const p of people) { const ch = p.a[i]; (ch === '1' ? y : ch === '2' ? m : n).push(p.n); }
  const item = (cls, mark) => (name) => `<li class="${cls}">${mark}${esc(name)}</li>`;
  return `<ul class="who">${y.map(item('y', icon('check', 13))).join('')}${m.map(item('m', '<i>~</i>')).join('')}${n.map(item('n', '')).join('')}</ul>`;
}
const scoreText = (r, n) =>
  `<b>${r.tot}</b> sur ${n} ${r.tot > 1 ? 'disponibles' : 'disponible'}${r.mb ? ` <span class="soft">(dont ${r.mb} si besoin)</span>` : ''}`;
// Ce qui cloche sur un créneau : indispensable absent, minimum non atteint, réponse d'un indispensable attendue.
function flagsHTML(st, r) {
  const out = [];
  if (r.missing.length) out.push(`Sans ${esc(list(r.missing))}, pourtant indispensable${r.missing.length > 1 ? 's' : ''}`);
  if (st.q && r.tot < st.q) out.push(`Il manque ${plural(st.q - r.tot, 'personne')} pour atteindre le minimum de ${st.q}`);
  const waiting = pendingGuests(st).filter((name) => isMust(st, name));
  if (waiting.length) out.push(`En attente de la réponse de ${esc(list(waiting))} (indispensable${waiting.length > 1 ? 's' : ''})`);
  if (r.past) out.push('Ce créneau est déjà passé');
  return out.length ? `<ul class="flags">${out.map((t) => `<li>${icon('flag', 14)}<span>${t}</span></li>`).join('')}</ul>` : '';
}

function verdictHTML(c) {
  const { st, slots, people, stats, ranked } = c;
  const n = people.length;
  const f = finalIndex(slots);
  if (f >= 0) {
    const sl = slots[f];
    return `<section class="verdict decided" aria-label="Date choisie">
      <p class="v-label">${icon('check', 16)}C’est décidé</p>
      <p class="v-title">${esc(cap(fmt(fLong, sl.d)))}</p>
      <p class="v-moment">${MOMENTS[sl.t]} · ${slotHours(sl)}${MOMENT_HOURS[sl.t] ? ' (indicatif)' : ''}${st.l ? ` · ${esc(st.l)}` : ''}</p>
      ${n ? `<p class="v-score">${scoreText(stats[f], n)}</p>${whoHTML(f, people)}` : ''}
      ${agendaHTML(sl)}
      ${canDecide() ? `<div class="actions"><button type="button" class="btn sm onaccent" data-act="unfinal">Changer de date</button></div>` : ''}
    </section>`;
  }
  if (!n) {
    return `<section class="verdict none">
      <p class="v-label">Meilleur créneau</p>
      <p class="v-title">Personne n’a encore répondu</p>
      <p class="muted">${plural(slots.length, 'créneau proposé', 'créneaux proposés')}. La meilleure date s’affichera ici dès les premières réponses.</p>
    </section>`;
  }
  const best = ranked[0];
  if (best.tot === 0) {
    return `<section class="verdict none"><p class="v-label">Meilleur créneau</p><p class="v-title">Aucun créneau commun pour l’instant</p><p class="muted">Personne n’a encore coché de dispo.</p></section>`;
  }
  const ties = ranked.filter((r) => sameRank(r, best));
  const label = ties.length > 1 ? `Égalité entre ${ties.length} créneaux` : (best.tot === n && !best.mb ? 'Tout le monde est dispo' : 'En tête');
  const sl = slots[best.i];
  const decide = canDecide();
  return `<section class="verdict" aria-label="Meilleur créneau">
    <p class="v-label">${label}</p>
    <p class="v-title">${esc(cap(fmt(fLong, sl.d)))}</p>
    <p class="v-moment">${MOMENTS[sl.t]} · ${slotHours(sl)}</p>
    <p class="v-score">${scoreText(best, n)}</p>
    ${whoHTML(best.i, people)}
    ${flagsHTML(st, best)}
    ${decide
      ? `<div class="actions"><button type="button" class="btn primary" data-act="final" data-i="${best.i}">${icon('check')}Choisir cette date</button></div>`
      : '<p class="hint">L’organisateur choisira la date finale.</p>'}
    ${ties.length > 1 ? `<div class="ties"><span>Aussi à égalité&nbsp;:</span>${ties.slice(1, 6).map((r) =>
      `<button type="button" class="chip sm" data-act="pick" data-i="${r.i}">${esc(slotShort(slots[r.i]))}</button>`).join('')}</div>` : ''}
  </section>`;
}

/* ---------- Réponse ---------- */
function answerCountText() {
  let y = 0, m = 0;
  for (const v of ui.vals) { if (v === 1) y++; else if (v === 2) m++; }
  return `<b>${y}</b> dispo${m ? ` · <b>${m}</b> si besoin` : ''}`;
}
function nameHint(name) {
  const k = norm(name);
  if (!k) return '';
  if (ui.editing && norm(ui.editing) === k) return `Vous modifiez la réponse de ${ui.editing}.`;
  const ex = poll.st.p.find((p) => norm(p.n) === k);
  if (ex && ex.edit === false) return `${ex.n} a déjà répondu et sa réponse est protégée : choisissez un autre prénom (ex. « ${name.trim()} B. »).`;
  if (ex) return `${ex.n} a déjà répondu : cette réponse remplacera la sienne.`;
  if (ui.editing) return `La réponse de ${ui.editing} sera renommée « ${name.trim()} ».`;
  return '';
}
function slotAria(sl, v, i) {
  const c = conflictOf(i);
  return `${fmt(fLong, sl.d)}, ${MOMENTS[sl.t].toLowerCase()} : ${STATE_LABEL[v]}${c ? ` (déjà pris : ${c})` : ''}`;
}
const pillClass = (i, v) => 'pill ans s' + v + (conflictOf(i) ? ' busy' : '');
function answerPill(i, multi) {
  const sl = poll.slots[i], v = ui.vals[i] || 0, c = conflictOf(i);
  return `<button type="button" class="${pillClass(i, v)}" data-act="slot" data-i="${i}" aria-label="${esc(slotAria(sl, v, i))}"${c ? ` title="${esc(c)}"` : ''}>${multi ? `<small>${MOMENT_SHORT[sl.t]}</small>` : ''}<span class="mk" aria-hidden="true"></span></button>`;
}
function paintSlots() {
  if (!ui.open || !poll || !poll.slots) return;
  app.querySelectorAll('.pill.ans').forEach((el) => {
    const i = +el.dataset.i, v = ui.vals[i] || 0, c = conflictOf(i);
    el.className = pillClass(i, v);
    el.setAttribute('aria-label', slotAria(poll.slots[i], v, i));
    if (c) el.title = c; else el.removeAttribute('title');
  });
  const count = document.getElementById('ans-count');
  if (count) count.innerHTML = answerCountText();
}
function setVals(fn) {
  ui.vals = poll.slots.map((_, i) => fn(i, ui.vals[i] || 0));
  paintSlots();
}
// Un groupe de créneaux tourne comme un seul : tous dispo, puis tous si besoin, puis tous effacés.
// Un groupe mélangé repart de « dispo ».
function fillWhere(test) {
  const idx = poll.slots.map((sl, i) => (test(sl) ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return;
  const first = ui.vals[idx[0]] || 0;
  const next = idx.every((i) => (ui.vals[i] || 0) === first) ? NEXT_VALUE[first] : 1;
  const set = new Set(idx);
  setVals((i, v) => (set.has(i) ? next : v));
}

function openAnswer(name) {
  const slots = buildSlots(poll.st);
  ui = freshUi(ui);
  ui.open = true;
  const p = name ? poll.st.p.find((x) => norm(x.n) === norm(name)) : null;
  if (p) {
    ui.editing = p.n; ui.name = p.n; ui.note = p.note || '';
    ui.vals = slots.map((_, i) => +(p.a[i] || 0));
  } else {
    ui.name = name || displayName();
    ui.vals = slots.map(() => 0);
  }
  // Après l'affichage du formulaire : dates déjà choisies du compte, et script Google prêt pour le bouton.
  setTimeout(() => {
    loadPollConflicts();
    if (GOOGLE_CLIENT_ID && !poll.example) loadGis().catch(() => {});
  });
}

function answerHTML(c) {
  const { st, slots, people } = c;
  if (!ui.open) {
    if (isFrozen()) return '';
    const me = getMe();
    const meP = people.find((p) => p.mine) || (me && people.find((p) => norm(p.n) === norm(me) && p.edit !== false));
    return `<section class="cta" id="answer">
      ${ui.savedName ? `<p class="okmsg" role="status">${icon('check', 18)}C’est enregistré, merci ${esc(ui.savedName)}&nbsp;! Tout le monde le voit déjà.</p>` : ''}
      ${meP
        ? `<button type="button" class="btn primary lg wide" data-act="edit" data-name="${esc(meP.n)}">${icon('edit')}Modifier mes dispos</button>
           <button type="button" class="btn wide" data-act="open-answer">Répondre pour quelqu’un d’autre</button>`
        : `<button type="button" class="btn primary lg wide" data-act="open-answer">Indiquer mes dispos</button>
           <p class="hint center">Dix secondes, sans inscription.</p>`}
    </section>`;
  }
  const multi = usedMoments(slots).length > 1;
  const moments = usedMoments(slots);
  const pending = ui.editing ? [] : pendingGuests(st);
  const del = !ui.editing ? '' : ui.delAsk
    ? `<div class="confirm"><span>Supprimer la réponse de ${esc(ui.editing)}&nbsp;?</span><button type="button" class="btn sm danger" data-act="del-confirm">Supprimer</button><button type="button" class="btn sm" data-act="del-cancel">Annuler</button></div>`
    : `<button type="button" class="linkbtn danger" data-act="del-ask">Supprimer la réponse de ${esc(ui.editing)}</button>`;
  const turns = [['1 fois', 'Dispo', 's1'], ['2 fois', 'Si besoin', 's2'], ['3 fois', 'Pas dispo', 's0']];
  return `<section class="card answer" id="answer" aria-labelledby="a-h">
    <div class="row-between"><h2 id="a-h">${ui.editing ? `Dispos de ${esc(ui.editing)}` : 'Vos dispos'}</h2><button type="button" class="iconbtn" data-act="close-answer" aria-label="Fermer">${icon('x')}</button></div>
    <div class="field">
      <label for="ans-name">Prénom</label>
      ${pending.length ? `<div class="chips" id="ans-guests">${pending.map((name) => `<button type="button" class="chip sm" data-act="iam" data-name="${esc(name)}" aria-pressed="${norm(ui.name) === norm(name)}">${esc(name)}</button>`).join('')}</div>` : ''}
      <input type="text" id="ans-name" maxlength="40" autocomplete="given-name" placeholder="${pending.length ? 'Ou un autre prénom' : 'Camille'}" value="${esc(ui.name)}">
      <p class="hint" id="ans-hint" aria-live="polite">${esc(nameHint(ui.name))}</p>
      ${auth.user && !ui.editing && !poll.example ? '<p class="hint">Connecté&nbsp;: cette réponse sera liée à votre compte. Vous seul, ou l’organisateur, pourrez la modifier.</p>' : ''}
    </div>
    <div class="field">
      <span class="label">Touchez vos créneaux</span>
      <ol class="turns">${turns.map(([n, label, cls]) =>
        `<li class="turn ${cls}"><span class="mk" aria-hidden="true"></span><span><small>${n}</small>${label}</span></li>`).join('')}</ol>
      <p class="hint">Chaque appui fait passer un créneau au choix suivant. Touchez un jour de la semaine pour toute la colonne.</p>
    </div>
    <div class="quick">
      <button type="button" class="chip sm" data-act="bulk" data-v="1">Tout cocher</button>
      <button type="button" class="chip sm" data-act="bulk" data-v="0">Tout effacer</button>
      ${multi ? moments.map((t) => `<button type="button" class="chip sm" data-act="fill-t" data-t="${t}">${MOMENTS[t]}</button>`).join('') : ''}
    </div>
    <div class="agenda-tools" id="ans-agenda" aria-live="polite">${agendaToolsHTML()}</div>
    ${!multi ? `<p class="cal-cap">${MOMENTS[moments[0]]}${MOMENT_HOURS[moments[0]] ? ` · ${slotHours({ t: moments[0] })}` : ''}</p>` : ''}
    ${slotCal(slots, (i) => answerPill(i, multi), {
      headHTML: (w) => `<button type="button" class="cal-wd tap" data-act="fill-wd" data-w="${w}" aria-label="Tous les ${WD_LONG[w]}s">${WD[w]}</button>`,
    })}
    <div class="field"><label for="ans-note">Un petit mot <span class="opt">(facultatif)</span></label><input type="text" id="ans-note" maxlength="${MAX_NOTE}" placeholder="Dispo seulement après 20 h" autocomplete="off" value="${esc(ui.note)}"></div>
    ${del}
    <div class="afoot"><span class="count" id="ans-count">${answerCountText()}</span><button type="button" class="btn primary" data-act="save">Enregistrer</button></div>
  </section>`;
}

/* ---------- Créneaux déjà pris : agenda Google et autres sondages du compte ---------- */
// Heure de Paris → instant, sans bibliothèque : on mesure le décalage de Paris à cet instant (heure d'été comprise).
const parisParts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
function parisOffset(ms) {
  const p = {};
  for (const x of parisParts.formatToParts(new Date(ms))) p[x.type] = +x.value;
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(ms / 60000) * 60000;
}
function parisTime(d, hhmm) {
  const local = d * DAY_MS + (+hhmm.slice(0, 2)) * 3600000 + (+hhmm.slice(2)) * 60000;
  return local - parisOffset(local - parisOffset(local)); // deux passes : justes aussi autour des changements d'heure
}
const fParisHm = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const parisHm = (ms) => fParisHm.format(new Date(ms)).replace(/\D/g, '');
// Plage comparée à l'agenda : les horaires indicatifs du moment, ou 8 h – 23 h pour « Journée ».
function slotRange(sl) {
  const h = MOMENT_HOURS[sl.t] || ['0800', '2300'];
  return [parisTime(sl.d, h[0]), parisTime(sl.d, h[1])];
}
// « pris 20 h – 22 h 30 » si une plage occupée chevauche le créneau, sinon ''.
function busyLabel(sl, range, busyRanges) {
  const dayStart = parisTime(sl.d, '0000'), dayEnd = parisTime(sl.d + 1, '0000');
  const hits = busyRanges.filter(([s, e]) => s < range[1] && e > range[0]).map(([s, e]) => {
    const a = Math.max(s, dayStart), b = Math.min(e, dayEnd);
    if (a === dayStart && b === dayEnd) return 'toute la journée';
    return `${hourLabel(parisHm(a))} – ${b === dayEnd ? 'minuit' : hourLabel(parisHm(b))}`;
  });
  if (!hits.length) return '';
  return 'pris ' + (hits.includes('toute la journée') ? 'toute la journée' : hits.slice(0, 2).join(', ') + (hits.length > 2 ? '…' : ''));
}

// Comparaison avec l'agenda Google : client OAuth « Client Web 2 » du projet Google Cloud, réservé à l'agenda
// (celui de Firebase sert à la connexion). Identifiant public, aucun secret n'est utilisé. Vide = bouton masqué.
// Google ne renvoie que les plages occupées de l'agenda principal ; tout reste dans le navigateur.
const GOOGLE_CLIENT_ID = '704019232045-vj6hkifiqugiqj9gs49sn5iihln7iqrl.apps.googleusercontent.com';
const FREEBUSY_SCOPE = 'https://www.googleapis.com/auth/calendar.freebusy';
const GOOGLE_ICON = '<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
let gisLoading = null;
// Le script de Google se charge à l'ouverture du formulaire : la fenêtre d'accord doit s'ouvrir dès le toucher du bouton.
function loadGis() {
  if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
  if (!gisLoading) {
    gisLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { gisLoading = null; s.remove(); reject(new Error('Impossible de joindre Google. Vérifiez votre réseau et réessayez.')); };
      document.head.appendChild(s);
    });
  }
  return gisLoading;
}
function googleToken() {
  return new Promise((resolve, reject) => {
    const fail = (msg, silent) => { const e = new Error(msg); e.silent = !!silent; reject(e); };
    google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: FREEBUSY_SCOPE,
      login_hint: (auth.user && auth.user.email) || undefined,
      callback: (r) => {
        if (r.error) return fail(r.error === 'access_denied' ? 'Accès refusé : rien n’a été lu dans votre agenda.' : 'Google n’a pas donné accès à votre agenda. Réessayez.');
        if (!google.accounts.oauth2.hasGrantedAllScopes(r, FREEBUSY_SCOPE)) return fail('Autorisez l’accès à vos disponibilités pour comparer avec votre agenda.');
        resolve(r.access_token);
      },
      error_callback: (e) => (e && e.type === 'popup_failed_to_open'
        ? fail('La fenêtre Google a été bloquée. Autorisez les fenêtres pop-up pour ce site, puis réessayez.')
        : fail('Fenêtre Google fermée : rien n’a été lu.', true)),
    }).requestAccessToken();
  });
}
async function fetchBusy(token, from, to) {
  const out = [];
  // Par tranches de 30 jours, pour rester dans ce que Google accepte en une requête.
  for (let a = from; a < to; a += 30 * DAY_MS) {
    let res, data = null;
    try {
      res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
        body: JSON.stringify({ timeMin: new Date(a).toISOString(), timeMax: new Date(Math.min(to, a + 30 * DAY_MS)).toISOString(), items: [{ id: 'primary' }] }),
      });
      data = await res.json();
    } catch (e) {
      if (!res) throw new Error('Impossible de joindre Google Agenda. Vérifiez votre réseau et réessayez.');
    }
    const cal = data && data.calendars && data.calendars.primary;
    if (!res.ok || !cal || cal.errors) throw new Error('Google Agenda n’a pas répondu. Réessayez dans un instant.');
    for (const b of cal.busy || []) out.push([Date.parse(b.start), Date.parse(b.end)]);
  }
  return out;
}

// Conflits connus pour la réponse en cours ; on les oublie si on change de sondage ou si ses créneaux changent.
let agenda = { key: '', google: null, polls: null };
const agendaKey = () => (poll ? poll.st.i + '|' + slotsKeyOf(poll.st) : '');
function agendaNow() {
  if (agenda.key !== agendaKey()) agenda = { key: agendaKey(), google: null, polls: null };
  return agenda;
}
function conflictOf(i) {
  if (i == null || !poll) return '';
  const a = agendaNow();
  return [a.google && a.google.get(i), a.polls && a.polls.get(i)].filter(Boolean).join(' · ');
}
function agendaToolsHTML() {
  if (poll.example) return '';
  const a = agendaNow();
  const total = poll.slots.length;
  let n = 0;
  for (let i = 0; i < total; i++) if (conflictOf(i)) n++;
  const out = [];
  if (GOOGLE_CLIENT_ID && !a.google) {
    out.push(`<button type="button" class="btn sm gcal" data-act="agenda-google">${GOOGLE_ICON}Comparer avec mon agenda Google</button>`);
  }
  if (a.google) {
    out.push(`<span>${n ? `${plural(n, 'créneau', 'créneaux')} déjà pris dans votre agenda${a.polls && a.polls.size ? ' ou vos autres sondages' : ''} (hachurés).` : 'Votre agenda est libre sur tous ces créneaux.'}</span>`);
  } else if (n) {
    out.push(`<span>${plural(n, 'créneau', 'créneaux')} en conflit avec vos autres sondages (hachurés).</span>`);
  }
  if ((a.google || n) && n < total) out.push(`<button type="button" class="chip sm" data-act="fill-free">Cocher les ${plural(total - n, 'créneau libre', 'créneaux libres')}</button>`);
  if (GOOGLE_CLIENT_ID && !a.google) out.push('<span class="hint">Google ne transmet que vos plages occupées, rien n’est enregistré.</span>');
  return out.join('');
}
// Met à jour les repères sans reconstruire le formulaire (on ne perd ni le focus ni la saisie).
function paintAgenda() {
  paintSlots();
  const box = document.getElementById('ans-agenda');
  if (box && ui.open) box.innerHTML = agendaToolsHTML();
}
function compareGoogle(btn) {
  const key = agendaKey();
  const slots = poll.slots;
  return runAction(btn, 'Lecture de l’agenda…', async () => {
    // Script déjà prêt : la fenêtre s'ouvre dans le geste même, sinon les navigateurs la bloquent.
    const ready = window.google && google.accounts && google.accounts.oauth2;
    const token = await (ready ? googleToken() : loadGis().then(googleToken));
    const ranges = slots.map(slotRange);
    const found = new Map();
    const busyRanges = await fetchBusy(token, Math.min(...ranges.map((r) => r[0])), Math.max(...ranges.map((r) => r[1])));
    if (agendaKey() !== key || !ui.open) return;
    slots.forEach((sl, i) => { const label = busyLabel(sl, ranges[i], busyRanges); if (label) found.set(i, label); });
    agendaNow().google = found;
    paintAgenda();
    showToast(found.size ? `${plural(found.size, 'créneau', 'créneaux')} déjà pris dans votre agenda.` : 'Rien dans votre agenda sur ces créneaux.');
  });
}
// Dates déjà choisies dans les autres sondages du compte, au même moment : aucun accès à l'agenda nécessaire.
async function loadPollConflicts() {
  if (!auth.user || !poll || poll.example) return;
  const key = agendaKey();
  try {
    const { polls } = await api('GET', '/me/polls');
    if (agendaKey() !== key || !ui.open) return;
    const overlap = (a, b) => { const ha = MOMENT_HOURS[a], hb = MOMENT_HOURS[b]; return !ha || !hb || (ha[0] < hb[1] && hb[0] < ha[1]); };
    const found = new Map();
    for (const p of polls) {
      if (p.i === poll.st.i || !p.dd || !p.going) continue;
      const d = parseYmd(p.dd);
      poll.slots.forEach((sl, i) => {
        if (sl.d === d && overlap(sl.t, p.dt)) found.set(i, (found.has(i) ? found.get(i) + ', ' : '') + `« ${p.t} »`);
      });
    }
    agendaNow().polls = found;
    paintAgenda();
  } catch (e) { /* facultatif : sans cette information, le formulaire marche pareil */ }
}

/* ---------- Résultats ---------- */
// Pastille d'un créneau dans les résultats : plus elle est foncée, plus il y a de monde.
function heatPill(sl, r, n, { multi, inert, best, final, picked } = {}) {
  const level = n && r.tot ? Math.max(1, Math.ceil((r.tot / n) * 4)) : 0;
  const cls = `pill heat h${level}${final ? ' final' : ''}${best ? ' best' : ''}${r.ok ? '' : ' blocked'}${r.past ? ' past' : ''}${picked ? ' picked' : ''}`;
  const inner = `${multi ? `<small>${MOMENT_SHORT[sl.t]}</small>` : ''}<b>${r.tot}</b>`;
  if (inert) return `<span class="${cls}">${inner}</span>`;
  return `<button type="button" class="${cls}" data-act="pick" data-i="${r.i}" aria-pressed="${!!picked}" aria-label="${esc(slotLong(sl))} : ${r.tot} sur ${n}${final ? ', date choisie' : ''}">${inner}</button>`;
}
function detailHTML(c, i) {
  const { st, slots, people, stats } = c;
  const sl = slots[i], r = stats[i], f = finalIndex(slots);
  return `<div class="detail" id="detail">
    <div class="row-between"><div><b class="detail-t">${esc(slotLong(sl))}</b><p class="muted">${slotHours(sl)}</p></div>
      <button type="button" class="iconbtn" data-act="unpick" aria-label="Fermer le détail">${icon('x')}</button></div>
    <p class="v-score">${scoreText(r, people.length)}</p>
    ${whoHTML(i, people)}
    ${flagsHTML(st, r)}
    ${canDecide() && i !== f ? `<div class="actions"><button type="button" class="btn sm primary" data-act="final" data-i="${i}">${icon('check', 16)}Choisir cette date</button></div>` : ''}
  </div>`;
}
function resultsHTML(c) {
  const { st, slots, people, stats, ranked } = c;
  const n = people.length;
  if (!n) return '';
  const f = finalIndex(slots);
  const best = ranked[0];
  const multi = usedMoments(slots).length > 1;
  const top = ranked.filter((r) => r.tot > 0 && !r.past).slice(0, 5);
  const focus = ui.focus && people.find((p) => norm(p.n) === norm(ui.focus));
  const pick = Number.isInteger(ui.pick) && ui.pick < slots.length ? ui.pick : null;
  const podium = top.length ? `<ol class="rank">${top.map((r, k) => {
    const sl = slots[r.i];
    const extra = [r.mb ? `dont ${r.mb} si besoin` : '', r.missing.length ? `sans ${esc(list(r.missing))}` : '', st.q && r.tot < st.q ? `minimum de ${st.q} non atteint` : ''].filter(Boolean).join(' · ');
    return `<li class="${r.i === f ? 'final' : ''}${r.ok ? '' : ' blocked'}">
      <button type="button" class="rank-row" data-act="pick" data-i="${r.i}" aria-label="Voir le détail : ${esc(slotLong(sl))}">
        <span class="rank-n">${k + 1}</span>
        <span class="rank-main"><b>${esc(cap(fmt(fShort, sl.d)))} · ${MOMENTS[sl.t].toLowerCase()}</b>
          <span class="bar"><i style="width:${Math.round((r.tot / n) * 100)}%"></i></span>
          ${extra ? `<small>${extra}</small>` : ''}</span>
        <span class="rank-score"><b>${r.tot}</b>/${n}</span>
      </button></li>`;
  }).join('')}</ol>` : '';
  const cal = focus
    ? slotCal(slots, (i) => { const sl = slots[i], v = +(focus.a[i] || 0); return `<span class="pill ans ro s${v}" title="${esc(slotShort(sl))} : ${STATE_LABEL[v]}">${multi ? `<small>${MOMENT_SHORT[sl.t]}</small>` : ''}<span class="mk" aria-hidden="true"></span></span>`; })
    : slotCal(slots, (i) => heatPill(slots[i], stats[i], n, { multi, final: i === f, picked: i === pick, best: f < 0 && best.tot > 0 && sameRank(stats[i], best) }));
  return `<section class="card results" aria-labelledby="r-h">
    <div class="row-between"><h2 id="r-h">Les réponses</h2>${poll.example ? '' : '<span class="live">En direct</span>'}</div>
    ${podium ? `<h3 class="sub">Les meilleurs créneaux</h3>${podium}` : ''}
    <div class="row-between"><h3 class="sub">${focus ? `Les dispos de ${esc(focus.n)}` : 'Vue d’ensemble'}</h3>
      ${focus ? `<button type="button" class="chip sm" data-act="unfocus">${icon('x', 14)}Revenir à tout le monde</button>` : ''}</div>
    ${!multi ? `<p class="cal-cap">${MOMENTS[usedMoments(slots)[0]]}</p>` : ''}
    ${cal}
    ${focus
      ? `<p class="legend"><span class="sw s1"></span>dispo<span class="sw s2"></span>si besoin<span class="sw s0"></span>pas dispo</p>`
      : `<p class="legend"><span>Personne</span><span class="sw h0"></span><span class="sw h1"></span><span class="sw h2"></span><span class="sw h3"></span><span class="sw h4"></span><span>Tout le monde</span>${(st.r || []).length ? '<span class="sw blocked"></span><span>sans un indispensable</span>' : ''}</p>
         <p class="hint">Touchez un créneau pour voir qui est dispo${canDecide() ? ' et le choisir' : ''}.</p>`}
    ${!focus && pick != null ? detailHTML(c, pick) : ''}
  </section>`;
}

function peopleHTML(c) {
  const { st, people } = c;
  const pending = pendingGuests(st);
  if (!people.length && !pending.length) return '';
  const frozen = isFrozen();
  const rows = people.map((p) => {
    let y = 0, m = 0;
    for (const ch of p.a) { if (ch === '1') y++; else if (ch === '2') m++; }
    const on = ui.focus && norm(ui.focus) === norm(p.n);
    return `<li class="person${on ? ' on' : ''}">
      <button type="button" class="person-main" data-act="focus" data-name="${esc(p.n)}" aria-pressed="${!!on}" title="Voir les dispos de ${esc(p.n)}">
        ${avatarHTML(p.n)}
        <span class="person-txt"><b>${esc(p.n)}${isMust(st, p.n) ? `<span class="must" title="Indispensable">${icon('star', 13)}</span>` : ''}</b>
          <small>${plural(y, 'dispo')}${m ? ` · ${m} si besoin` : ''}</small>
          ${p.note ? `<em>«&nbsp;${esc(p.note)}&nbsp;»</em>` : ''}</span>
      </button>
      ${p.edit !== false
        ? `<button type="button" class="iconbtn" data-act="edit" data-name="${esc(p.n)}" aria-label="Modifier la réponse de ${esc(p.n)}" title="Modifier">${icon('edit', 16)}</button>`
        : `<span class="iconbtn ghost" title="${frozen ? 'Réponses figées' : 'Réponse protégée par un compte'}">${icon('lock', 16)}</span>`}
    </li>`;
  }).join('');
  const waiting = pending.map((name) => `<li class="person pending">
      <span class="person-main">${avatarHTML(name, ' ghost')}
        <span class="person-txt"><b>${esc(name)}${isMust(st, name) ? `<span class="must" title="Indispensable">${icon('star', 13)}</span>` : ''}</b><small>En attente</small></span></span>
      ${frozen ? '' : `<button type="button" class="chip sm" data-act="open-answer" data-name="${esc(name)}">Répondre</button>`}
    </li>`).join('');
  return `<section class="card people" aria-labelledby="pp-h">
    <h2 id="pp-h">Participants <span class="count">${people.length}${(st.g || []).length ? `/${people.length + pending.length}` : ''}</span></h2>
    <ul class="plist-people">${rows}${waiting}</ul>
  </section>`;
}

function shareText() {
  const st = poll.st;
  return `${st.t || DEFAULT_TITLE} : indique tes dispos ici ${pollLink()}${st.pin ? ` (code : ${st.pin})` : ''}`;
}
function shareHTML() {
  const link = pollLink();
  const st = poll.st;
  const wa = 'https://wa.me/?text=' + encodeURIComponent(shareText());
  const mail = `mailto:?subject=${encodeURIComponent(st.t || DEFAULT_TITLE)}&body=${encodeURIComponent(shareText())}`;
  return `<section class="card share${ui.created ? ' fresh' : ''}" id="share" aria-labelledby="s-h">
    <h2 id="s-h">${ui.created ? 'C’est prêt. Envoyez le lien au groupe.' : 'Inviter le groupe'}</h2>
    <p class="muted">${ui.created
      ? 'Un seul lien pour tout le monde. Chacun y ajoute ses dispos, sans compte, et les réponses s’affichent en direct.'
      : 'Un seul lien pour tout le monde, sans compte.'}</p>
    <div class="linkbox"><input type="text" id="share-link" readonly value="${esc(link)}" aria-label="Lien du sondage"><button type="button" class="btn primary" data-act="copy" data-target="share-link">${icon('copy', 16)}<span>Copier</span></button></div>
    <div class="actions">
      ${navigator.share ? `<button type="button" class="btn sm" data-act="share">${icon('share', 16)}Partager</button>` : ''}
      <a class="btn sm" href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a>
      <a class="btn sm" href="${esc(mail)}">E-mail</a>
    </div>
    ${!st.hasPin ? '' : st.pin
      ? `<p class="notice">${icon('lock', 18)}<span>Code d’accès&nbsp;: <b class="code">${esc(st.pin)}</b>. Le lien seul ne suffit pas&nbsp;: donnez aussi ce code au groupe.</span></p>`
      : '<p class="hint">Ce sondage est protégé par un code&nbsp;: donnez-le avec le lien.</p>'}
  </section>`;
}

function orgHTML() {
  const st = poll.st;
  if (poll.example || !st.canManage) return '';
  const intro = st.isOwner
    ? 'Vous seul choisissez la date, modifiez, clôturez ou supprimez ce sondage, depuis tous vos appareils.'
    : 'Créé sans compte&nbsp;: toute personne qui a le lien peut le modifier, le clôturer ou le supprimer, et choisir la date.';
  const secure = st.isOwner ? `<p class="hint">${st.pin
      ? `Protégé par le code <b class="code">${esc(st.pin)}</b>.`
      : 'Pas de code d’accès&nbsp;: le lien suffit pour ouvrir le sondage.'} Pour le changer&nbsp;: «&nbsp;Modifier&nbsp;», étape 3.</p>`
    : !auth.enabled ? ''
      : auth.user
        ? `<div class="secure"><p><b>Gardez la main avec votre compte.</b> Vous serez le seul à le gérer et à choisir la date, vous le retrouverez partout et pourrez le protéger par un code.</p>${ui.claimAsk
            ? '<div class="confirm"><span>Vous deviendrez le seul organisateur&nbsp;: les autres ne pourront plus le modifier, le clôturer, le supprimer ni choisir la date.</span><button type="button" class="btn sm primary" data-act="claim">Rattacher</button><button type="button" class="btn sm" data-act="claim-cancel">Annuler</button></div>'
            : '<button type="button" class="btn sm primary" data-act="claim-ask">Rattacher à mon compte</button>'}</div>`
        : `<div class="secure"><p><b>Envie de garder la main&nbsp;?</b> Connectez-vous pour rattacher ce sondage à votre compte&nbsp;: vous serez le seul à le gérer et à choisir la date, avec un code d’accès si vous voulez.</p><a class="btn sm" href="/compte">Se connecter</a></div>`;
  return `<section class="card org" id="org" aria-labelledby="o-h">
    <h2 id="o-h">Organisation</h2>
    <p class="muted">${intro}</p>
    ${secure}
    <div class="actions">
      <button type="button" class="btn sm" data-act="edit-poll">${icon('edit', 16)}Modifier</button>
      <button type="button" class="btn sm" data-act="toggle-closed">${st.closed ? 'Rouvrir' : 'Clôturer'}</button>
      <button type="button" class="btn sm" data-act="duplicate">${icon('copy', 16)}Dupliquer</button>
    </div>
    ${ui.pollDelAsk
      ? `<div class="confirm"><span>Mettre le sondage à la corbeille&nbsp;? Il restera récupérable ${TRASH_DAYS}&nbsp;jours, puis sera effacé avec toutes ses réponses.</span><button type="button" class="btn sm danger" data-act="poll-del-confirm">Supprimer</button><button type="button" class="btn sm" data-act="poll-del-cancel">Annuler</button></div>`
      : `<button type="button" class="linkbtn danger" data-act="poll-del-ask">${icon('trash', 15)}Supprimer le sondage</button>`}
  </section>`;
}

function agendaHTML(sl) {
  const hours = MOMENT_HOURS[sl.t];
  const day = ymd(sl.d);
  const dates = hours ? `${day}T${hours[0]}00/${day}T${hours[1]}00` : `${day}/${ymd(sl.d + 1)}`;
  const details = (poll.st.n ? poll.st.n + '\n\n' : '') + 'Horaires indicatifs.' + (poll.example ? '' : ' Sondage : ' + pollLink());
  const google = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
    + '&text=' + encodeURIComponent(poll.st.t || DEFAULT_TITLE)
    + '&dates=' + dates + (hours ? '&ctz=Europe/Paris' : '')
    + (poll.st.l ? '&location=' + encodeURIComponent(poll.st.l) : '')
    + '&details=' + encodeURIComponent(details);
  return `<div class="agenda">
    <p class="v-label">${icon('calendar', 15)}Ajouter à mon agenda</p>
    <div class="actions">
      <a class="btn sm onaccent solid" href="${esc(google)}" target="_blank" rel="noopener">Google Agenda</a>
      ${poll.example ? '' : `<a class="btn sm onaccent solid" href="/api/polls/${esc(poll.st.i)}/evenement.ics">Apple, Outlook et autres</a>`}
    </div>
    ${auth.user && !poll.example ? '<p class="v-fine">Pour que les prochaines dates s’ajoutent toutes seules&nbsp;: le lien d’agenda de <a href="/compte">Mon compte</a>.</p>' : ''}
  </div>`;
}

/* ---------- Actions ---------- */
// Applique une modification : sur le serveur, ou en mémoire pour l'exemple.
async function mutate(kind, payload) {
  if (poll.example) { poll.st = applyLocal(poll.st, kind, payload); return; }
  const id = poll.st.i;
  const path = '/polls/' + id + (kind === 'final' ? '/final' : '/answers');
  // Pour une réponse, la page joint la liste des créneaux qu'elle connaît : le serveur refuse si elle est périmée.
  const body = kind === 'save' ? Object.assign({ slotsKey: slotsKeyOf(poll.st) }, payload) : payload;
  const st = await api(kind === 'delete' ? 'DELETE' : 'PUT', path, body);
  if (poll && poll.st.i === id) { poll.st = st; remember(st); }
}
function applyLocal(st, kind, pl) {
  const out = Object.assign({}, st, { p: st.p.slice() });
  if (kind === 'final') { out.f = pl.i; return out; }
  if (kind === 'delete') { out.p = out.p.filter((p) => norm(p.n) !== norm(pl.name)); return out; }
  const key = norm(pl.name);
  if (pl.prev && norm(pl.prev) !== key) out.p = out.p.filter((p) => norm(p.n) !== norm(pl.prev));
  const entry = { n: pl.name, a: pl.ans, u: Date.now(), note: pl.note || '', edit: true, mine: false };
  const idx = out.p.findIndex((p) => norm(p.n) === key);
  if (idx >= 0) out.p[idx] = entry; else out.p.push(entry);
  return out;
}

async function runAction(btn, label, fn) {
  if (busy) return;
  busy = true;
  const old = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.textContent = label; }
  try {
    await fn();
  } catch (err) {
    // Le code a été ajouté ou changé pendant qu'on avait le sondage ouvert : on le demande, la réponse en cours est gardée.
    if (err.pin && view === 'poll' && poll && !poll.example) { showPin(poll.st.i, 'Le code d’accès a changé : entrez le nouveau code pour continuer.'); return; }
    if (!err.silent) showToast(err.message, true);
    if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = old; }
  } finally {
    busy = false;
  }
}

function saveAnswer(btn) {
  const name = ui.name.trim().replace(/\s+/g, ' ');
  const hint = $('#ans-hint');
  if (!name) {
    hint.textContent = 'Indiquez votre prénom pour enregistrer.';
    hint.classList.add('error');
    $('#ans-name').focus();
    return;
  }
  const clash = poll.st.p.find((p) => norm(p.n) === norm(name) && p.edit === false);
  if (clash) {
    hint.textContent = nameHint(name);
    hint.classList.add('error');
    $('#ans-name').focus();
    return;
  }
  return runAction(btn, 'Enregistrement…', async () => {
    const answering = ui.editing;
    await mutate('save', { name, ans: ui.vals.join(''), note: ui.note.trim().replace(/\s+/g, ' '), prev: ui.editing });
    // On retient le prénom utilisé, sauf quand on répond pour quelqu'un d'autre alors qu'on a déjà le sien.
    if (!poll.example && (!getMe() || (answering && norm(answering) === norm(getMe())))) remember(poll.st, name);
    ui = freshUi(ui);
    ui.savedName = name;
    renderPoll();
    scrollToId('verdict-slot');
  });
}
function deleteAnswer(btn) {
  const name = ui.editing;
  return runAction(btn, 'Suppression…', async () => {
    await mutate('delete', { name });
    if (!poll.example && getMe() && norm(getMe()) === norm(name)) remember(poll.st, null);
    ui = freshUi(ui);
    renderPoll();
    showToast(`Réponse de ${name} supprimée.`);
  });
}
function setFinal(btn, i) {
  return runAction(btn, i >= 0 ? 'Enregistrement…' : 'Annulation…', async () => {
    await mutate('final', { i });
    ui.pick = null;
    renderLive();
    if (i >= 0) {
      showToast('Date choisie : tout le monde la voit sur le lien.');
      scrollToId('verdict-slot');
    }
  });
}
function toggleClosed(btn) {
  const closed = !poll.st.closed;
  return runAction(btn, closed ? 'Clôture…' : 'Réouverture…', async () => {
    const st = await api('PUT', '/polls/' + poll.st.i + '/closed', { closed });
    poll.st = st;
    remember(st);
    ui.pollDelAsk = false;
    renderPoll();
    showToast(closed ? 'Sondage clôturé : les réponses ne peuvent plus changer.' : 'Sondage rouvert.');
  });
}
function deletePoll(btn) {
  const id = poll.st.i;
  return runAction(btn, 'Suppression…', async () => {
    const info = await api('DELETE', '/polls/' + id);
    ui.pollDelAsk = false;
    showDeleted(id, info);
    showToast('Sondage mis à la corbeille.');
  });
}
function claimPoll(btn) {
  const id = poll.st.i;
  return runAction(btn, 'Rattachement…', async () => {
    const st = await api('POST', '/polls/' + id + '/claim');
    ui.claimAsk = false;
    poll.st = st;
    remember(st);
    renderPoll();
    showToast('Sondage rattaché à votre compte : vous en êtes l’organisateur.');
  });
}

async function copyLink(btn) {
  const input = document.getElementById(btn.dataset.target);
  const label = btn.querySelector('span') || btn;
  const old = btn.dataset.label || (btn.dataset.label = label.textContent);
  try {
    await navigator.clipboard.writeText(input.value);
    label.textContent = 'Copié';
  } catch (e) {
    input.focus();
    input.select();
    label.textContent = 'Sélectionné';
  }
  setTimeout(() => { if (btn.isConnected) label.textContent = old; }, 2500);
}
async function nativeShare() {
  try {
    await navigator.share({ title: poll.st.t || DEFAULT_TITLE, text: `${poll.st.t || DEFAULT_TITLE} : indique tes dispos${poll.st.pin ? ` (code : ${poll.st.pin})` : ''}`, url: pollLink() });
  } catch (e) { /* partage annulé */ }
}

// Un créneau de la réponse prend la valeur donnée (voir tapValue pour l'ordre des appuis).
function setSlot(i, v) {
  if ((ui.vals[i] || 0) === v) return;
  ui.vals[i] = v;
  const el = app.querySelector(`.pill.ans[data-i="${i}"]`);
  if (el) {
    el.className = pillClass(i, v);
    el.setAttribute('aria-label', slotAria(poll.slots[i], v, i));
  }
  const count = document.getElementById('ans-count');
  if (count) count.innerHTML = answerCountText();
}
// Un appui fait tourner le créneau : pas dispo → dispo → si besoin → pas dispo.
const NEXT_VALUE = [1, 2, 0];
const tapValue = (i) => NEXT_VALUE[ui.vals[i] || 0];
// Rappel quand on se dit dispo sur un créneau déjà pris dans son agenda ou par un autre sondage.
// Avec une souris, le rappel part du créneau touché (bulle) ; au doigt, c'est le message du bas de l'écran.
function warnBusy(i, v, el) {
  const c = v ? conflictOf(i) : '';
  if (!c) { hideTip(); return; }
  const msg = `Vous avez déjà quelque chose à ce moment-là (${c}).`;
  if (el && matchMedia('(hover: hover) and (pointer: fine)').matches) showTip(el, msg); else showToast(msg);
}

/* ---------- Bulle accrochée à un élément : disparaît seule, ou dès qu'on fait défiler la page ---------- */
let tipEl = null, tipTimer = null;
function hideTip() {
  clearTimeout(tipTimer);
  if (tipEl) tipEl.hidden = true;
}
function showTip(anchor, msg) {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'tip';
    tipEl.setAttribute('role', 'status');
    document.body.appendChild(tipEl);
    window.addEventListener('scroll', hideTip, { passive: true });
    window.addEventListener('resize', hideTip);
  }
  tipEl.textContent = msg;
  tipEl.hidden = false;
  // Au-dessus du créneau, centrée sur lui sans sortir de l'écran ; en dessous s'il n'y a pas la place.
  const r = anchor.getBoundingClientRect(), w = tipEl.offsetWidth, h = tipEl.offsetHeight;
  const mid = r.left + r.width / 2;
  const left = Math.max(8, Math.min(mid - w / 2, document.documentElement.clientWidth - w - 8));
  const below = r.top - h - 10 < 8;
  tipEl.classList.toggle('below', below);
  tipEl.style.left = left + 'px';
  tipEl.style.top = (below ? r.bottom + 10 : r.top - h - 10) + 'px';
  tipEl.style.setProperty('--arrow', Math.max(14, Math.min(mid - left, w - 14)) + 'px');
  clearTimeout(tipTimer);
  tipTimer = setTimeout(hideTip, 4000);
}

function scrollToId(id) {
  const el = document.getElementById(id);
  const target = el && (el.firstElementChild || el);
  if (target) target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
}
function repaintResults() {
  const c = ctx();
  $('#results-slot').innerHTML = resultsHTML(c);
  $('#people-slot').innerHTML = peopleHTML(c);
}

/* ---------- Actualisation automatique ---------- */
const signature = (st) => JSON.stringify([st.p, st.f, st.owned, st.isOwner, st.canManage, st.closed, st.late, st.t, st.n, st.l, st.ic, st.dl, st.q, st.g, st.r, slotsKeyOf(st), st.hasPin, st.pin]);
const headSignature = (st) => JSON.stringify([st.t, st.n, st.l, st.ic, st.isOwner, st.canManage, st.owned, st.closed, st.late, st.hasPin, st.pin]);
async function refresh(force) {
  if (view !== 'poll' || !poll || poll.example || busy || (!force && document.visibilityState !== 'visible')) return;
  const id = poll.st.i;
  try {
    const st = await api('GET', '/polls/' + id);
    if (busy || !poll || poll.st.i !== id || view !== 'poll') return;
    if (force || signature(st) !== signature(poll.st)) {
      const before = poll.st;
      poll.st = st;
      remember(st);
      const datesChanged = slotsKeyOf(st) !== slotsKeyOf(before);
      if (datesChanged && ui.open) {
        ui = freshUi(ui);
        renderPoll();
        showToast('L’organisateur a modifié les dates : cochez à nouveau vos dispos.', true);
      } else if (force || (!ui.open && (datesChanged || headSignature(st) !== headSignature(before)))) {
        if (ui.open && isFrozen()) ui = freshUi(ui);
        renderPoll();
      } else {
        renderLive();
      }
    }
  } catch (e) {
    // Le code a changé : on le redemande, sauf si une réponse est en cours (elle le demandera à l'enregistrement).
    if (e.pin && view === 'poll' && poll && poll.st.i === id && !ui.open) showPin(id);
    // Quelqu'un l'a mis à la corbeille entre-temps.
    if (e.deleted && view === 'poll' && poll && poll.st.i === id) showDeleted(id, e.deleted);
    // sinon, on réessaiera au prochain passage
  }
}
function startRefresh() { stopRefresh(); refreshTimer = setInterval(refresh, REFRESH_MS); }
function stopRefresh() { if (refreshTimer) clearInterval(refreshTimer); refreshTimer = null; }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });

/* ---------- Vue : compte ---------- */
const backLink = () => `<a class="back" href="${esc(accountReturn || '/')}">${icon('left', 16)}Retour</a>`;

function showAccount() {
  view = 'account';
  poll = null;
  document.title = 'Mon compte · ' + SITE_NAME;
  renderTopnav();
  if (!auth.enabled) {
    app.innerHTML = `<div class="page tiny">${backLink()}<section class="card"><h1>Mon compte</h1><p class="error" role="alert">La connexion n’est pas disponible pour le moment. Tout le reste fonctionne sans compte.</p></section></div>`;
    return;
  }
  if (!auth.user) {
    const up = account.mode === 'up';
    app.innerHTML = `<div class="page tiny">
      ${backLink()}
      <section class="card" aria-labelledby="au-h">
        <h1 id="au-h">${up ? 'Créer un compte' : 'Se connecter'}</h1>
        <p class="muted">Facultatif et gratuit. Avec un compte, vous seul décidez de la date de vos sondages, vos réponses sont protégées et vous retrouvez tout sur tous vos appareils.</p>
        <button type="button" class="btn lg wide" data-act="google">${GOOGLE_ICON}Continuer avec Google</button>
        <p class="or">ou</p>
        <div class="tabs" role="tablist" aria-label="Avec une adresse e-mail">
          <button type="button" role="tab" aria-selected="${!up}" data-act="auth-mode" data-m="in">Se connecter</button>
          <button type="button" role="tab" aria-selected="${up}" data-act="auth-mode" data-m="up">Créer un compte</button>
        </div>
        <form class="form" id="auth-form" novalidate>
          ${up ? '<div class="field"><label for="au-name">Prénom</label><input type="text" id="au-name" maxlength="40" autocomplete="given-name" placeholder="Camille"></div>' : ''}
          <div class="field"><label for="au-email">E-mail</label><input type="email" id="au-email" autocomplete="email" inputmode="email" value="${esc(account.email || '')}"></div>
          <div class="field"><label for="au-pass">Mot de passe</label><input type="password" id="au-pass" autocomplete="${up ? 'new-password' : 'current-password'}">${up ? '<p class="hint">6 caractères minimum.</p>' : ''}</div>
          <p class="error" id="au-error" role="alert" hidden></p>
          <button type="submit" class="btn primary lg wide" id="au-submit">${up ? 'Créer mon compte' : 'Se connecter'}</button>
          ${up ? '' : '<button type="button" class="linkbtn" data-act="reset">Mot de passe oublié&nbsp;?</button>'}
        </form>
        <p class="hint">En utilisant un compte, vous acceptez la <a href="/confidentialite">politique de confidentialité</a>.</p>
      </section></div>`;
    return;
  }
  const u = auth.user;
  app.innerHTML = `<div class="page narrow">
    ${backLink()}
    <header class="acct-head">${avatarHTML(displayName(), ' big')}
      <div><h1>${esc(displayName())}</h1><p class="muted">${esc(u.email)}${u.provider === 'google' ? ' · connecté avec Google' : ''}</p></div>
    </header>
    ${u.provider === 'password' && !u.verified ? '<div class="banner"><p>Confirmez votre adresse e-mail&nbsp;: un lien vous a été envoyé.</p><button type="button" class="btn sm" data-act="verify-again">Renvoyer l’e-mail</button></div>' : ''}
    <div class="actions"><a class="btn primary" href="/">Mes sondages</a><button type="button" class="btn" data-act="logout">Se déconnecter</button></div>
    <section class="card" aria-labelledby="ag-h">
      <h2 id="ag-h">Mes dates dans mon agenda</h2>
      <p class="muted">Ajoutez ce lien une fois à votre agenda&nbsp;: chaque date choisie s’y ajoute toute seule, et suit les changements. Sont concernés les sondages que vous organisez, et ceux où vous avez répondu dispo à la date retenue.</p>
      <div class="feed" id="me-feed">${feedHTML()}</div>
    </section>
    <section class="card" aria-labelledby="dz-h">
      <h2 id="dz-h">Supprimer mon compte</h2>
      <p class="muted">Vos réponses resteront dans les sondages mais ne seront plus liées à vous. Les sondages que vous organisez resteront accessibles à leurs participants, sans organisateur ni code d’accès.</p>
      ${account.delAsk
        ? `${u.provider === 'password'
            ? '<div class="field"><label for="del-pass">Votre mot de passe, pour confirmer</label><input type="password" id="del-pass" autocomplete="current-password"></div>'
            : '<p class="hint">Google va vous demander de confirmer votre identité.</p>'}
           <div class="confirm"><button type="button" class="btn sm danger" data-act="acct-del-confirm">Supprimer définitivement</button><button type="button" class="btn sm" data-act="acct-del-cancel">Annuler</button></div>`
        : '<button type="button" class="linkbtn danger" data-act="acct-del-ask">Supprimer mon compte</button>'}
    </section>
  </div>`;
  loadFeed();
}

/* ---------- Lien d'agenda personnel (abonnement) ---------- */
// account.feed : undefined pendant le chargement, null sans lien, sinon l'adresse https du lien.
function feedHTML() {
  const url = account.feed;
  if (url === undefined) return '<p class="hint">Chargement…</p>';
  if (url === null) return '<div class="actions"><button type="button" class="btn primary" data-act="feed-create">Créer mon lien d’agenda</button></div>';
  const webcal = url.replace(/^https?:/, 'webcal:');
  const google = 'https://calendar.google.com/calendar/r?cid=' + encodeURIComponent(webcal);
  const outlook = 'https://outlook.live.com/calendar/0/addfromweb?url=' + encodeURIComponent(url) + '&name=' + encodeURIComponent(FEED_NAME);
  return `<div class="actions">
      <a class="btn sm" href="${esc(google)}" target="_blank" rel="noopener">Google Agenda</a>
      <a class="btn sm" href="${esc(webcal)}">Apple Calendrier</a>
      <a class="btn sm" href="${esc(outlook)}" target="_blank" rel="noopener">Outlook</a>
    </div>
    <div class="linkbox"><input type="text" id="feed-link" readonly value="${esc(url)}" aria-label="Lien d’agenda"><button type="button" class="btn" data-act="copy" data-target="feed-link">${icon('copy', 16)}<span>Copier</span></button></div>
    <p class="hint">Google Agenda relit ce lien toutes les quelques heures, Apple et Outlook plus souvent. Il est personnel&nbsp;: toute personne qui l’a voit vos dates choisies.</p>
    ${account.feedAsk
      ? `<div class="confirm"><span>${account.feedAsk === 'off'
          ? 'Désactiver le lien&nbsp;? Les dates disparaîtront des agendas où il a été ajouté.'
          : 'Changer de lien&nbsp;? L’actuel cessera de marcher&nbsp;: il faudra ajouter le nouveau à votre agenda.'}</span>
          <button type="button" class="btn sm danger" data-act="feed-${account.feedAsk === 'off' ? 'off' : 'renew'}">${account.feedAsk === 'off' ? 'Désactiver' : 'Changer de lien'}</button>
          <button type="button" class="btn sm" data-act="feed-cancel">Annuler</button></div>`
      : '<div class="actions"><button type="button" class="linkbtn" data-act="feed-ask" data-p="renew">Changer de lien</button><button type="button" class="linkbtn danger" data-act="feed-ask" data-p="off">Désactiver</button></div>'}`;
}
function paintFeed() {
  const box = document.getElementById('me-feed');
  if (view === 'account' && box) box.innerHTML = feedHTML();
}
async function loadFeed() {
  try {
    const { url } = await api('GET', '/me/agenda');
    account.feed = url;
  } catch (err) {
    account.feed = null;
    showToast(err.message, true);
  }
  paintFeed();
}
function changeFeed(btn, method, label) {
  return runAction(btn, label, async () => {
    const { url } = await api(method, '/me/agenda');
    account.feed = url;
    account.feedAsk = null;
    paintFeed();
    showToast(url ? 'Lien d’agenda prêt : ajoutez-le à votre agenda.' : 'Lien d’agenda désactivé.');
  });
}

function afterLogin() {
  showToast(`Vous êtes connecté, ${displayName()}.`);
  go(accountReturn || '/');
}
// Les erreurs de connexion s'affichent sous le formulaire quand il est là, sinon en bas de l'écran.
function authAction(btn, label, fn) {
  const box = $('#au-error');
  if (box) box.hidden = true;
  return runAction(btn, label, async () => {
    try {
      await fn();
    } catch (e) {
      if (box && box.isConnected && !e.silent) { box.hidden = false; box.textContent = e.message; }
      // Erreur silencieuse pour runAction : pas de message en bas de l'écran, mais le bouton redevient cliquable.
      const quiet = new Error(e.message);
      quiet.silent = e.silent || (box && box.isConnected);
      throw quiet;
    }
  });
}
function signInGoogle(btn) {
  return authAction(btn, 'Connexion…', async () => { await auth.impl.google(); afterLogin(); });
}
function submitAuth() {
  const up = account.mode === 'up';
  const email = $('#au-email').value.trim();
  const pass = $('#au-pass').value;
  const name = up ? $('#au-name').value.trim() : '';
  account.email = email;
  const box = $('#au-error');
  if (!email || !pass) { box.hidden = false; box.textContent = 'Indiquez votre e-mail et votre mot de passe.'; return; }
  return authAction($('#au-submit'), up ? 'Création…' : 'Connexion…', async () => {
    if (up) await auth.impl.signUp(name, email, pass);
    else await auth.impl.signIn(email, pass);
    afterLogin();
  });
}
function resetPassword(btn) {
  const email = ($('#au-email') ? $('#au-email').value : '').trim();
  const box = $('#au-error');
  if (!email) { box.hidden = false; box.textContent = 'Indiquez votre e-mail ci-dessus, puis touchez « Mot de passe oublié ».'; return; }
  return authAction(btn, 'Envoi…', async () => {
    await auth.impl.reset(email);
    showToast('Si un compte existe pour cette adresse, un e-mail pour changer le mot de passe vient de partir.');
  });
}
function logout(btn) {
  return runAction(btn, 'Déconnexion…', async () => { await auth.logout(); showToast('Vous êtes déconnecté.'); });
}
function verifyAgain(btn) {
  return runAction(btn, 'Envoi…', async () => { await auth.impl.verify(); showToast('E-mail de confirmation envoyé.'); });
}
function deleteAccount(btn) {
  const pass = $('#del-pass') ? $('#del-pass').value : '';
  if (auth.user.provider === 'password' && !pass) { showToast('Indiquez votre mot de passe pour confirmer.', true); return; }
  return runAction(btn, 'Suppression…', async () => {
    await auth.impl.reauth(pass); // confirme l'identité avant de toucher à quoi que ce soit
    await api('DELETE', '/me'); // détache le compte de ses sondages et de ses réponses
    await auth.impl.remove(); // supprime le compte chez Firebase
    account = { mode: 'in', delAsk: false };
    showToast('Votre compte est supprimé.');
    go('/');
  });
}

/* ---------- Vue : confidentialité ---------- */
function showPrivacy() {
  view = 'privacy';
  poll = null;
  document.title = 'Confidentialité · ' + SITE_NAME;
  renderTopnav();
  app.innerHTML = `<div class="page narrow">
    <button type="button" class="back" data-act="back">${icon('left', 16)}Retour</button>
    <article class="prose">
      <h1>Confidentialité</h1>
      <p class="muted">Dernière mise à jour&nbsp;: novembre 2026</p>
      <h2>Sans compte</h2>
      <p>Tout fonctionne sans compte. Un sondage enregistre seulement ce que vous y écrivez&nbsp;: nom du sondage, lieu, prénoms attendus, puis prénom, dispos et petit mot de chaque réponse. Ces informations sont visibles par toute personne qui a le lien du sondage.</p>
      <p>Votre navigateur garde aussi, sur votre appareil uniquement, la liste des sondages ouverts, le prénom utilisé et le thème choisi.</p>
      <h2>Avec un compte</h2>
      <ul>
        <li>La connexion est gérée par Firebase Authentication (Google). Firebase conserve votre adresse e-mail, votre nom et, si vous en avez un, votre mot de passe sous forme chiffrée. Nous ne voyons jamais votre mot de passe.</li>
        <li>Avec «&nbsp;Continuer avec Google&nbsp;», Google nous transmet votre nom et votre adresse e-mail.</li>
        <li>Notre base de données garde seulement l’identifiant de votre compte, relié aux sondages que vous organisez et aux réponses données en étant connecté.</li>
      </ul>
      <h2>Ce que nous ne faisons pas</h2>
      <p>Pas de publicité, pas de revente, pas de pistage. Les données servent uniquement à faire fonctionner les sondages. Comme pour tout site, nos hébergeurs gardent des journaux techniques (adresse IP, heure de connexion) pour le bon fonctionnement et la sécurité.</p>
      <h2>Durée de conservation</h2>
      <p>Un sondage est effacé automatiquement, avec toutes ses réponses, ${KEEP_MONTHS}&nbsp;mois après sa dernière date proposée s’il n’a pas été modifié depuis. Un sondage supprimé reste ${TRASH_DAYS}&nbsp;jours dans la corbeille, le temps de pouvoir le restaurer, puis il est effacé. Un compte est gardé tant que vous ne le supprimez pas.</p>
      <h2>Sondages protégés par un code</h2>
      <p>L’organisateur peut protéger un sondage par un code. Le code est enregistré avec le sondage pour qu’il puisse toujours le retrouver. Une fois le bon code saisi, votre navigateur garde un cookie technique, propre à ce sondage, pour ne pas vous le redemander. Pour bloquer les essais en série, les essais de code sont comptés pendant 15&nbsp;minutes avec une empreinte de votre adresse IP, puis effacés.</p>
      <h2>Agenda</h2>
      <ul>
        <li><strong>Comparer avec mon agenda Google</strong>, seulement si vous touchez ce bouton&nbsp;: Google vous demande votre accord, puis donne à votre navigateur les plages où vous êtes occupé sur la période du sondage, sans le titre ni le contenu de vos événements. La comparaison se fait sur votre appareil&nbsp;: rien n’est envoyé à notre serveur ni enregistré. Pour que la fenêtre de Google s’ouvre sans délai, son script est chargé quand vous ouvrez le formulaire de réponse.</li>
        <li><strong>Lien d’agenda</strong> (avec un compte)&nbsp;: si vous le créez, nous gardons un jeton secret relié à votre compte. Toute personne qui a le lien voit les dates choisies de vos sondages (nom, lieu, précisions, date). Vous pouvez le changer ou le désactiver dans Mon compte&nbsp;; il est effacé avec votre compte.</li>
      </ul>
      <h2>Où sont les données</h2>
      <p>Les sondages sont hébergés par Cloudflare (base de données en Europe de l’Ouest). Les comptes sont hébergés par Google (Firebase). Les polices d’écriture sont servies par le site lui-même.</p>
      <h2>Supprimer votre compte</h2>
      <p>Dans <a href="/compte">Mon compte</a>, touchez «&nbsp;Supprimer mon compte&nbsp;». Votre compte est effacé chez Firebase. Vos réponses restent dans les sondages mais ne sont plus liées à vous, et les sondages que vous organisiez restent accessibles à leurs participants, sans organisateur ni code d’accès.</p>
      <h2>Vos droits</h2>
      <p>Vous pouvez demander l’accès à vos données, leur rectification ou leur effacement, ou vous opposer à leur traitement, en écrivant à <a href="mailto:${CONTACT}">${CONTACT}</a>. Le responsable du traitement est l’éditeur du site (voir les <a href="/mentions-legales">mentions légales</a>). Si vous estimez que vos droits ne sont pas respectés, vous pouvez vous adresser à la CNIL (cnil.fr).</p>
    </article></div>`;
}

function showLegal() {
  view = 'legal';
  poll = null;
  document.title = 'Mentions légales · ' + SITE_NAME;
  renderTopnav();
  app.innerHTML = `<div class="page narrow">
    <button type="button" class="back" data-act="back">${icon('left', 16)}Retour</button>
    <article class="prose">
      <h1>Mentions légales</h1>
      <h2>Éditeur</h2>
      <p>${SITE_NAME} est un site personnel et non commercial. Son éditeur, un particulier, a choisi de ne pas publier son identité, comme le permet l’article&nbsp;6, III, 2 de la loi n°&nbsp;2004-575 du 21&nbsp;juin&nbsp;2004 pour la confiance dans l’économie numérique&nbsp;; ses coordonnées ont été communiquées à l’hébergeur.</p>
      <p>Contact&nbsp;: <a href="mailto:${CONTACT}">${CONTACT}</a></p>
      <h2>Hébergeur</h2>
      <p>Cloudflare, Inc., 101 Townsend Street, San Francisco, CA&nbsp;94107, États-Unis. Téléphone&nbsp;: +1&nbsp;650&nbsp;319&nbsp;8930.</p>
      <h2>Signaler un contenu</h2>
      <p>Les noms, lieux, prénoms et petits mots des sondages sont écrits par leurs créateurs et leurs participants. Pour signaler un contenu illicite, écrivez à <a href="mailto:${CONTACT}">${CONTACT}</a> en indiquant l’adresse du sondage et le passage concerné&nbsp;: il sera retiré rapidement s’il est manifestement illicite.</p>
      <h2>Données personnelles</h2>
      <p>Voir la page <a href="/confidentialite">Confidentialité</a>.</p>
      <h2>Crédits</h2>
      <p>Polices Bricolage Grotesque et Instrument Sans, sous licence SIL Open Font License.</p>
    </article></div>`;
}

/* ---------- Exemple ---------- */
function exampleState() {
  const s = todayDay + 5, e = s + 23;
  const st = {
    i: 'exemple', t: 'Raclette chez Léa', ic: '🧀', l: 'Chez Léa, Lyon 7e', n: 'Chacun apporte un fromage',
    s: ymd(s), e: ymd(e), m: [0, 0, 0, 0, SOIR, MIDI | SOIR, MIDI], x: [], a: [],
    g: ['Léa', 'Karim', 'Sophie', 'Hugo', 'Inès', 'Tom'], r: ['Léa'], q: 4,
    p: [], f: -1, owned: false, isOwner: false, canManage: false, closed: false, late: false, hasPin: false,
  };
  const slots = buildSlots(st);
  const names = ['Léa', 'Karim', 'Sophie', 'Hugo', 'Inès'];
  let seed = 11;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const grid = names.map(() => slots.map(() => { const r = rnd(); return r < 0.45 ? '1' : r < 0.6 ? '2' : '0'; }));
  const star = Math.min(slots.length - 1, Math.floor(slots.length * 0.6));
  slots.forEach((_, i) => {
    if (i === star) { names.forEach((_, k) => { grid[k][i] = k === 3 ? '2' : '1'; }); return; }
    if (names.every((_, k) => grid[k][i] !== '0')) grid[i % names.length][i] = '0';
  });
  const notes = ['', 'Je peux apporter l’appareil à raclette', '', 'Dispo seulement après 20 h', ''];
  st.p = names.map((nm, k) => ({ n: nm, a: grid[k].join(''), u: k, note: notes[k], edit: true, mine: false }));
  return st;
}

/* ---------- Thème ---------- */
const THEMES = ['auto', 'light', 'dark'];
const THEME_LABEL = { auto: 'auto', light: 'clair', dark: 'sombre' };
function currentTheme() { const t = document.documentElement.dataset.theme; return t === 'light' || t === 'dark' ? t : 'auto'; }
function paintTheme() { document.getElementById('theme-btn').innerHTML = `Thème&nbsp;: ${THEME_LABEL[currentTheme()]}`; }
function cycleTheme() {
  const next = THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length];
  if (next === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = next;
  try { if (next === 'auto') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignoré */ }
  paintTheme();
}
paintTheme();

/* ---------- Événements ---------- */
function focusSelector(el) {
  let sel = `[data-act="${el.dataset.act}"]`;
  for (const k of ['t', 'w', 'd', 'p', 'i', 'k', 'n', 'v', 'ic']) if (el.dataset[k] != null) sel += `[data-${k}="${el.dataset[k]}"]`;
  return sel;
}
let skipClick = null; // créneau déjà traité au clic de souris (peinture au glisser)

document.addEventListener('click', (ev) => {
  // Liens internes : on change de vue sans recharger la page.
  const a = ev.target.closest('a[href]');
  if (a && !ev.defaultPrevented && ev.button === 0 && !ev.metaKey && !ev.ctrlKey && !ev.shiftKey && !ev.altKey
    && a.origin === location.origin && !a.target && !a.hasAttribute('download') && !a.hash
    && !a.pathname.startsWith('/api/') && !a.pathname.split('/').pop().includes('.')) {
    ev.preventDefault();
    go(a.pathname);
    return;
  }
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const hadFocus = document.activeElement === el;
  const refocus = () => { if (hadFocus) { const n = document.querySelector(focusSelector(el)); if (n) n.focus({ preventScroll: true }); } };
  switch (act) {
    case 'theme': cycleTheme(); break;
    /* accueil */
    case 'intro-go': introGo(+el.dataset.n); break;
    case 'intro-pause': introToggle(); break;
    case 'intro-off': introOff(); break;
    /* création */
    case 'step': {
      const n = +el.dataset.n;
      const chk = draftCheck();
      if (n > wiz.step && chk.err && chk.step < n) { wiz.step = chk.step; } else wiz.step = n;
      showCreate();
      window.scrollTo(0, 0);
      break;
    }
    case 'icon': draft.ic = el.dataset.ic; paintCreate(); refocus(); break;
    case 'span': draft.e = draft.s + (+el.dataset.n) - 1; $('#c-end').value = ymd(draft.e, '-'); paintCreate(); refocus(); break;
    case 'formule': draft.m = FORMULES[+el.dataset.k].m.slice(); paintCreate(); refocus(); break;
    case 'mx-row': toggleMoment(+el.dataset.t); paintCreate(); refocus(); break;
    case 'mx-col': toggleDay(+el.dataset.w); paintCreate(); refocus(); break;
    case 'cell': draft.m[+el.dataset.w] = toggleBit(draft.m[+el.dataset.w], +el.dataset.t); paintCreate(); refocus(); break;
    case 'day': openDay(+el.dataset.d); break;
    case 'day-t': changeDay(toggleBit(draftRule(dayOpen), +el.dataset.t), `[data-act="day-t"][data-t="${el.dataset.t}"]`); break;
    case 'day-none': setDay(dayOpen, 0); paintCreate(); dayDlg.close(); break; // on retire le jour et on referme
    case 'day-reset': changeDay(draft.m[weekday(dayOpen)]); break;
    case 'day-close': dayDlg.close(); break;
    case 'add-hols': {
      const added = addHolidays(); paintCreate();
      // Le bouton disparaît : le focus passe au premier jour ajouté dans l'aperçu.
      const n = added.length && $(`[data-act="day"][data-d="${added[0]}"]`); if (hadFocus && n) n.focus({ preventScroll: true });
      showToast(added.length > 1 ? `${added.length} jours fériés proposés avec tous les moments.` : 'Jour férié proposé avec tous les moments.');
      break;
    }
    case 'del-hols': removeHolidays(); paintCreate(); break;
    case 'guest-add': { const input = $('#c-guest'); addGuests(input.value); input.value = ''; paintCreate(); input.focus(); break; }
    case 'guest-del': { const name = draft.g[+el.dataset.k]; draft.g.splice(+el.dataset.k, 1); draft.r.delete(norm(name)); paintCreate(); break; }
    case 'guest-star': { const key = norm(draft.g[+el.dataset.k]); if (draft.r.has(key)) draft.r.delete(key); else draft.r.add(key); paintCreate(); refocus(); break; }
    case 'dl-clear': draft.dl = null; $('#c-dl').value = ''; paintCreate(); break;
    case 'q': {
      const d = +el.dataset.d;
      draft.q = d > 0 ? Math.min(MAX_PEOPLE, draft.q ? draft.q + 1 : 2) : (draft.q <= 2 ? 0 : draft.q - 1);
      paintCreate();
      break;
    }
    case 'create': createPoll(el); break;
    case 'save-poll': savePoll(el); break;
    case 'edit-poll': startEdit(); break;
    case 'edit-cancel': leaveEdit(); break;
    case 'duplicate': duplicatePoll(); break;
    /* sondage */
    case 'retry': loadPoll(el.dataset.id); break;
    case 'restore': restorePoll(el); break;
    case 'open-answer': {
      openAnswer(el.dataset.name || null); renderPoll(); scrollToId('answer');
      const n = $('#ans-name'); if (n && !el.dataset.name) n.focus({ preventScroll: true });
      break;
    }
    case 'edit': openAnswer(el.dataset.name); renderPoll(); scrollToId('answer'); break;
    case 'close-answer': ui = freshUi(ui); renderPoll(); scrollToId('answer'); break;
    case 'iam': {
      ui.name = el.dataset.name;
      $('#ans-name').value = ui.name;
      $('#ans-hint').textContent = nameHint(ui.name);
      document.querySelectorAll('[data-act="iam"]').forEach((b) => b.setAttribute('aria-pressed', String(b === el)));
      break;
    }
    case 'slot': {
      if (skipClick === el) { skipClick = null; break; }
      const i = +el.dataset.i;
      const v = tapValue(i);
      setSlot(i, v);
      warnBusy(i, v, el);
      break;
    }
    case 'bulk': setVals(() => +el.dataset.v); break;
    case 'fill-wd': fillWhere((sl) => weekday(sl.d) === +el.dataset.w); break;
    case 'fill-t': fillWhere((sl) => sl.t === +el.dataset.t); break;
    case 'fill-free': setVals((i) => (conflictOf(i) ? 0 : 1)); break;
    case 'agenda-google': compareGoogle(el); break;
    case 'save': saveAnswer(el); break;
    case 'del-ask': {
      ui.delAsk = true; renderPoll();
      const n = $('[data-act="del-confirm"]'); if (n) n.focus({ preventScroll: true });
      break;
    }
    case 'del-cancel': ui.delAsk = false; renderPoll(); break;
    case 'del-confirm': deleteAnswer(el); break;
    case 'pick': {
      const i = +el.dataset.i;
      ui.pick = ui.pick === i ? null : i;
      ui.focus = null;
      repaintResults();
      if (ui.pick != null) { const d = document.getElementById('detail'); if (d) d.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' }); }
      break;
    }
    case 'unpick': ui.pick = null; repaintResults(); break;
    case 'focus': ui.focus = ui.focus && norm(ui.focus) === norm(el.dataset.name) ? null : el.dataset.name; ui.pick = null; repaintResults(); break;
    case 'unfocus': ui.focus = null; repaintResults(); break;
    case 'final': setFinal(el, +el.dataset.i); break;
    case 'unfinal': setFinal(el, -1); break;
    case 'copy': copyLink(el); break;
    case 'share': nativeShare(); break;
    case 'claim-ask': {
      ui.claimAsk = true; renderPoll();
      const n = $('[data-act="claim"]'); if (n) n.focus();
      break;
    }
    case 'claim-cancel': ui.claimAsk = false; renderPoll(); break;
    case 'claim': claimPoll(el); break;
    case 'toggle-closed': toggleClosed(el); break;
    case 'poll-del-ask': {
      ui.pollDelAsk = true; renderPoll();
      const n = $('[data-act="poll-del-confirm"]'); if (n) n.focus();
      break;
    }
    case 'poll-del-cancel': ui.pollDelAsk = false; renderPoll(); break;
    case 'poll-del-confirm': deletePoll(el); break;
    /* compte */
    case 'google': signInGoogle(el); break;
    case 'auth-mode': { const em = $('#au-email'); if (em) account.email = em.value; account.mode = el.dataset.m; showAccount(); const n = $('#au-email'); if (n) n.focus(); break; }
    case 'back': if (history.length > 1) history.back(); else go('/'); break;
    case 'reset': resetPassword(el); break;
    case 'logout': logout(el); break;
    case 'verify-again': verifyAgain(el); break;
    case 'acct-del-ask': account.delAsk = true; showAccount(); { const n = $('#del-pass') || $('[data-act="acct-del-confirm"]'); if (n) n.focus(); } break;
    case 'acct-del-cancel': account.delAsk = false; showAccount(); break;
    case 'acct-del-confirm': deleteAccount(el); break;
    case 'feed-create': changeFeed(el, 'POST', 'Création…'); break;
    case 'feed-renew': changeFeed(el, 'POST', 'Changement…'); break;
    case 'feed-off': changeFeed(el, 'DELETE', 'Désactivation…'); break;
    case 'feed-ask': account.feedAsk = el.dataset.p; paintFeed(); { const n = document.querySelector('#me-feed .confirm .btn'); if (n) n.focus(); } break;
    case 'feed-cancel': account.feedAsk = null; paintFeed(); break;
  }
});

// À la souris, on peint en glissant : le créneau de départ fixe la couleur, les suivants la prennent.
let paintValue = null;
app.addEventListener('pointerdown', (ev) => {
  if (ev.pointerType !== 'mouse' || ev.button !== 0) return;
  const el = ev.target.closest('[data-act="slot"]');
  if (!el) return;
  const i = +el.dataset.i;
  paintValue = tapValue(i);
  setSlot(i, paintValue);
  warnBusy(i, paintValue, el);
  skipClick = el;
  ev.preventDefault(); // pas de sélection de texte pendant le glisser
  el.focus({ preventScroll: true });
});
app.addEventListener('pointerover', (ev) => {
  if (paintValue == null) return;
  if (!(ev.buttons & 1)) { paintValue = null; return; }
  const el = ev.target.closest('[data-act="slot"]');
  if (el) setSlot(+el.dataset.i, paintValue);
});
window.addEventListener('pointerup', () => { paintValue = null; setTimeout(() => { skipClick = null; }); });

function onDateChange(t) {
  const v = t.value ? parseYmd(t.value) : NaN;
  if (t.id === 'c-start') {
    const len = Number.isFinite(draft.e) && Number.isFinite(draft.s) ? draft.e - draft.s : 27;
    draft.s = v;
    // La fin suit le début : la durée choisie est conservée.
    if (Number.isFinite(v) && (!Number.isFinite(draft.e) || draft.e < v)) { draft.e = v + Math.max(0, len); $('#c-end').value = ymd(draft.e, '-'); }
  } else if (t.id === 'c-end') {
    draft.e = v;
  } else {
    draft.dl = t.value ? v : null;
  }
  paintCreate();
}
app.addEventListener('input', (ev) => {
  const t = ev.target;
  if (t.id === 'c-title') draft.t = t.value;
  else if (t.id === 'c-note') draft.n = t.value;
  else if (t.id === 'c-place') draft.l = t.value;
  else if (t.id === 'c-pin' || t.id === 'pin-input') {
    const digits = t.value.replace(/\D/g, '').slice(0, 6);
    if (digits !== t.value) t.value = digits;
    if (t.id === 'c-pin') { draft.pin = digits; paintCreate(); }
  }
  else if (t.id === 'c-start' || t.id === 'c-end' || t.id === 'c-dl') onDateChange(t);
  else if (t.id === 'ans-note') ui.note = t.value;
  else if (t.id === 'ans-name') {
    ui.name = t.value;
    const h = $('#ans-hint');
    h.classList.remove('error');
    h.textContent = nameHint(t.value);
    document.querySelectorAll('[data-act="iam"]').forEach((b) => b.setAttribute('aria-pressed', String(norm(b.dataset.name) === norm(t.value))));
  }
});
app.addEventListener('submit', (ev) => {
  if (ev.target.id === 'auth-form') { ev.preventDefault(); submitAuth(); }
  else if (ev.target.id === 'pin-form') { ev.preventDefault(); submitPin(); }
});
app.addEventListener('change', (ev) => {
  const t = ev.target;
  if (t.id === 'c-start' || t.id === 'c-end' || t.id === 'c-dl') onDateChange(t);
});
app.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter') return;
  if (ev.target.id === 'ans-name' || ev.target.id === 'ans-note') {
    ev.preventDefault();
    saveAnswer($('[data-act="save"]'));
  } else if (ev.target.id === 'c-guest') {
    ev.preventDefault();
    addGuests(ev.target.value);
    ev.target.value = '';
    paintCreate();
  } else if (ev.target.id === 'c-title' || ev.target.id === 'c-place' || ev.target.id === 'c-note') {
    ev.preventDefault();
    $('#c-go').click();
  }
});

/* ---------- Navigation ---------- */
function go(path) {
  if (path !== location.pathname) history.pushState(null, '', path);
  route();
}
function route() {
  const path = location.pathname.replace(/\/+$/, '') || '/';
  if (path === lastRoute && view && view !== 'edit') return;
  const previous = lastRoute;
  lastRoute = path;
  stopRefresh();
  stopIntro();
  // On quitte une modification en cours : le brouillon de création revient.
  if (wiz.editing) { draft = createDraft || newDraft(); createDraft = null; wiz = { step: 1, editing: false }; }
  window.scrollTo(0, 0);
  if (path === '/compte') {
    if (previous && previous !== '/compte' && previous !== '/confidentialite' && previous !== '/mentions-legales') accountReturn = previous;
    account = { mode: 'in', delAsk: false, email: account.email };
    return showAccount();
  }
  if (path === '/confidentialite') return showPrivacy();
  if (path === '/mentions-legales') return showLegal();
  if (path === '/') return showHome();
  if (path === '/nouveau') return showCreate();
  if (path === '/exemple') {
    poll = { st: exampleState(), example: true };
    ui = freshUi();
    view = 'poll';
    return renderPoll();
  }
  const match = /^\/s\/([a-z2-7]{10})$/.exec(path);
  if (match) return loadPoll(match[1]);
  showHome('Cette adresse ne correspond à aucune page. Vérifiez que le lien a été copié en entier.');
}
window.addEventListener('popstate', route);

// Anciens liens (« /#identifiant », « /#compte »…) : on les envoie vers les nouvelles adresses.
(function legacyHash() {
  const h = location.hash.replace(/^#/, '');
  if (location.pathname !== '/' || !h) return;
  const old = /^([a-z2-7]{10})(?:-[a-z2-7]{20,64})?$/.exec(h);
  const to = old ? '/s/' + old[1] : { compte: '/compte', confidentialite: '/confidentialite', exemple: '/exemple', nouveau: '/nouveau' }[h];
  if (to) history.replaceState(null, '', to);
})();

authReady.then(route);
