// Tests des en-têtes de sécurité : les fichiers servis tels quels (public/_headers) et les réponses du serveur
// (SECURITY_HEADERS) doivent porter les mêmes ; la page ne doit contenir aucun script en ligne (CSP).
// Lancer : npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SECURITY_HEADERS } from '../src/worker.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('public/_headers et SECURITY_HEADERS donnent les mêmes en-têtes', () => {
  const lines = read('../public/_headers').split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'));
  assert.equal(lines[0].trim(), '/*');
  const fromFile = Object.fromEntries(lines.slice(1).map((l) => {
    const i = l.indexOf(':');
    return [l.slice(0, i).trim().toLowerCase(), l.slice(i + 1).trim()];
  }));
  const fromWorker = Object.fromEntries(Object.entries(SECURITY_HEADERS).map(([k, v]) => [k.toLowerCase(), v]));
  assert.deepEqual(fromFile, fromWorker);
});

test('index.html a une CSP et aucun script en ligne', () => {
  const html = read('../public/index.html');
  const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html);
  assert.ok(csp, 'balise CSP absente');
  const scriptSrc = csp[1].split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src'));
  assert.ok(scriptSrc && !scriptSrc.includes("'unsafe-inline'") && !scriptSrc.includes("'unsafe-eval'"));
  // La CSP doit précéder tout script ou feuille de style pour s'appliquer.
  assert.ok(html.indexOf('Content-Security-Policy') < html.search(/<script|<link rel="stylesheet"/));
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/g)];
  assert.equal(inline.length, 0, 'script en ligne trouvé dans index.html');
});
