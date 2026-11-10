// Vérifie les jetons de connexion Firebase (« ID tokens ») côté serveur, sans dépendance.
// Règles : https://firebase.google.com/docs/auth/admin/verify-id-tokens

const KEYS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const SKEW = 300; // tolérance d'horloge, en secondes

let cache = null; // { keys: Map(kid → CryptoKey), expires: ms }

function b64urlToBytes(s) {
  let b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const decodePart = (s) => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

// Clés publiques de Google, gardées en mémoire le temps indiqué par Google.
export async function googleKeys(force = false) {
  if (!force && cache && cache.expires > Date.now()) return cache.keys;
  const res = await fetch(KEYS_URL);
  if (!res.ok) throw new Error('Clés de vérification Google indisponibles');
  const { keys } = await res.json();
  const map = new Map();
  for (const jwk of keys) {
    map.set(jwk.kid, await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']));
  }
  const maxAge = Number((/max-age=(\d+)/.exec(res.headers.get('cache-control') || '') || [])[1]) || 3600;
  cache = { keys: map, expires: Date.now() + maxAge * 1000 };
  return map;
}

const toUser = (p) => ({
  uid: p.sub,
  email: typeof p.email === 'string' ? p.email : '',
  name: typeof p.name === 'string' ? p.name : '',
});

// Renvoie { uid, email, name } si le jeton est valide pour ce projet Firebase, sinon null.
// allowUnsigned n'est permis que pour l'émulateur local, qui produit des jetons non signés.
export async function verifyIdToken(token, projectId, { keys = googleKeys, now = Date.now(), allowUnsigned = false } = {}) {
  if (!projectId) return null;
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  let header, payload;
  try {
    header = decodePart(parts[0]);
    payload = decodePart(parts[1]);
  } catch {
    return null;
  }
  const t = Math.floor(now / 1000);
  if (payload.aud !== projectId) return null;
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
  if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 128) return null;
  if (typeof payload.exp !== 'number' || payload.exp <= t) return null;
  if (typeof payload.iat !== 'number' || payload.iat > t + SKEW) return null;
  if (typeof payload.auth_time === 'number' && payload.auth_time > t + SKEW) return null;

  if (header.alg === 'none') return allowUnsigned ? toUser(payload) : null;
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') return null;

  let key = (await keys()).get(header.kid);
  if (!key) key = (await keys(true)).get(header.kid); // Google a peut-être changé de clés
  if (!key) return null;
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlToBytes(parts[2]),
    new TextEncoder().encode(parts[0] + '.' + parts[1])
  );
  return valid ? toUser(payload) : null;
}
