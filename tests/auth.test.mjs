// Tests de la vérification des jetons Firebase, avec une clé RSA générée pour l'occasion.
// Lancer : npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyIdToken } from '../src/auth.js';

const PROJECT = 'projet-test';
const NOW = Date.UTC(2026, 10, 10, 12, 0, 0);
const t = Math.floor(NOW / 1000);

const b64url = (bytes) => Buffer.from(bytes).toString('base64url');
const enc = (obj) => b64url(new TextEncoder().encode(JSON.stringify(obj)));

const pair = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true,
  ['sign', 'verify']
);
const other = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true,
  ['sign', 'verify']
);
const keys = async () => new Map([['cle-1', pair.publicKey]]);

const goodPayload = {
  aud: PROJECT,
  iss: `https://securetoken.google.com/${PROJECT}`,
  sub: 'uid-julie',
  email: 'julie@example.com',
  name: 'Julie',
  iat: t - 60,
  exp: t + 3000,
  auth_time: t - 60,
};

async function sign(payload, { kid = 'cle-1', alg = 'RS256', key = pair.privateKey } = {}) {
  const head = enc({ alg, kid, typ: 'JWT' });
  const body = enc(payload);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(head + '.' + body));
  return `${head}.${body}.${b64url(new Uint8Array(sig))}`;
}
const verify = (token, opts = {}) => verifyIdToken(token, PROJECT, { keys, now: NOW, ...opts });

test('un jeton valide donne le compte', async () => {
  assert.deepEqual(await verify(await sign(goodPayload)), { uid: 'uid-julie', email: 'julie@example.com', name: 'Julie' });
});

test('un jeton expiré est refusé', async () => {
  assert.equal(await verify(await sign({ ...goodPayload, exp: t - 1 })), null);
});

test('un jeton d’un autre projet est refusé', async () => {
  assert.equal(await verify(await sign({ ...goodPayload, aud: 'autre-projet' })), null);
  assert.equal(await verify(await sign({ ...goodPayload, iss: 'https://securetoken.google.com/autre-projet' })), null);
});

test('un jeton signé par une autre clé est refusé', async () => {
  assert.equal(await verify(await sign(goodPayload, { key: other.privateKey })), null);
});

test('un jeton modifié après signature est refusé', async () => {
  const [h, , s] = (await sign(goodPayload)).split('.');
  assert.equal(await verify(`${h}.${enc({ ...goodPayload, sub: 'uid-pirate' })}.${s}`), null);
});

test('une clé inconnue est refusée', async () => {
  assert.equal(await verify(await sign(goodPayload, { kid: 'cle-inconnue' })), null);
});

test('un jeton non signé est refusé, sauf pour l’émulateur local', async () => {
  const unsigned = `${enc({ alg: 'none', typ: 'JWT' })}.${enc(goodPayload)}.`;
  assert.equal(await verify(unsigned), null);
  assert.equal((await verify(unsigned, { allowUnsigned: true })).uid, 'uid-julie');
});

test('sans projet configuré, personne n’est connecté', async () => {
  assert.equal(await verifyIdToken(await sign(goodPayload), '', { keys, now: NOW }), null);
});

test('un jeton illisible est refusé', async () => {
  assert.equal(await verify('pas-un-jeton'), null);
  assert.equal(await verify('a.b.c'), null);
});
