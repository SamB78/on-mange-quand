// Tests du renvoi vers l'adresse publique (SITE_HOST) : workers.dev et www renvoient les pages, jamais l'API ;
// sur workers.dev, l'API ne fait plus que lire (retiredWrite).
// Lancer : npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalUrl, retiredWrite } from '../src/worker.js';

const PROD = { SITE_HOST: 'dispos.day' };
const TEST = { SITE_HOST: 'test.dispos.day' };
const get = (url, method = 'GET') => new Request(url, { method });

test('une page demandée sur workers.dev est renvoyée vers le domaine, chemin et paramètres compris', () => {
  assert.equal(canonicalUrl(get('https://on-mange-quand.on-mange-quand.workers.dev/'), PROD), 'https://dispos.day/');
  assert.equal(canonicalUrl(get('https://on-mange-quand.on-mange-quand.workers.dev/s/abcdefghij?x=1'), PROD), 'https://dispos.day/s/abcdefghij?x=1');
  assert.equal(canonicalUrl(get('https://on-mange-quand-test.on-mange-quand.workers.dev/compte'), TEST), 'https://test.dispos.day/compte');
});

test('www renvoie vers le domaine sans www', () => {
  assert.equal(canonicalUrl(get('https://www.dispos.day/nouveau'), PROD), 'https://dispos.day/nouveau');
});

test('rien n’est renvoyé sur le domaine lui-même, en local, pour l’API ou hors lecture', () => {
  assert.equal(canonicalUrl(get('https://dispos.day/s/abcdefghij'), PROD), null);
  assert.equal(canonicalUrl(get('https://test.dispos.day/'), TEST), null);
  assert.equal(canonicalUrl(get('http://localhost:8787/'), {}), null);
  assert.equal(canonicalUrl(get('https://on-mange-quand.on-mange-quand.workers.dev/api/polls/abcdefghij'), PROD), null);
  assert.equal(canonicalUrl(get('https://on-mange-quand.on-mange-quand.workers.dev/api/agenda/xyz.ics'), PROD), null);
  assert.equal(canonicalUrl(get('https://on-mange-quand.on-mange-quand.workers.dev/', 'POST'), PROD), null);
});

test('un autre domaine n’est pas renvoyé (la version de test ne renvoie pas vers la prod)', () => {
  assert.equal(canonicalUrl(get('https://test.dispos.day/'), PROD), null);
  assert.equal(canonicalUrl(get('https://exemple.fr/'), PROD), null);
});

test('sur workers.dev, les écritures sont refusées, les lectures (lien d’agenda) passent', () => {
  const old = 'https://on-mange-quand.on-mange-quand.workers.dev';
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal(retiredWrite(get(old + '/api/polls/abcdefghij', method), PROD), true);
  assert.equal(retiredWrite(get('https://on-mange-quand-test.on-mange-quand.workers.dev/api/polls', 'POST'), TEST), true);
  assert.equal(retiredWrite(get(old + '/api/agenda/xyz.ics'), PROD), false);
  assert.equal(retiredWrite(get(old + '/api/polls/abcdefghij', 'HEAD'), PROD), false);
});

test('les écritures passent sur le domaine, sur www et en local', () => {
  assert.equal(retiredWrite(get('https://dispos.day/api/polls', 'POST'), PROD), false);
  assert.equal(retiredWrite(get('https://test.dispos.day/api/polls', 'POST'), TEST), false);
  assert.equal(retiredWrite(get('https://www.dispos.day/api/polls', 'POST'), PROD), false);
  assert.equal(retiredWrite(get('http://localhost:8787/api/polls', 'POST'), {}), false);
});
