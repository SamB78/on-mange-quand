// Tests de la limite de débit maison : quelle adresse est comptée (IPv4 telle quelle, bloc /64 en IPv6), et le compteur
// lui-même (tooFast) sur une vraie base SQLite en mémoire, avec la table de la migration 0008.
// Lancer : npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { ipKey, tooFast, RATE_LIMITS, RATE_LIMITS_HOUR } from '../src/worker.js';

test('une adresse IPv4 est comptée telle quelle', () => {
  assert.equal(ipKey('203.0.113.7'), '203.0.113.7');
});

test('une adresse IPv6 est comptée par bloc /64, écriture abrégée ou non', () => {
  assert.equal(ipKey('2001:db8:85a3:0000:0000:8a2e:0370:7334'), '2001:db8:85a3:0::/64');
  assert.equal(ipKey('2001:db8:85a3:0:abcd::1'), '2001:db8:85a3:0::/64');
  assert.equal(ipKey('2001:db8::1'), '2001:db8:0:0::/64');
  assert.equal(ipKey('2001:DB8:85A3:1234::abcd'), '2001:db8:85a3:1234::/64');
  assert.equal(ipKey('::1'), '0:0:0:0::/64');
});

test('deux appareils du même bloc /64 partagent le compteur, pas ceux d’un autre bloc', () => {
  assert.equal(ipKey('2a01:e0a:1:2:aaaa::1'), ipKey('2a01:e0a:1:2:bbbb:cccc:dddd:eeee'));
  assert.notEqual(ipKey('2a01:e0a:1:2::1'), ipKey('2a01:e0a:1:3::1'));
});

test('sans adresse, un compteur commun ; limites raisonnables', () => {
  assert.equal(ipKey(null), 'inconnue');
  assert.ok(RATE_LIMITS.write >= 30 && RATE_LIMITS.create >= 5);
});

// Une base D1 réduite à ce dont tooFast a besoin : prepare(...).bind(...).first().
function fakeDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0008_limite_debit.sql', import.meta.url), 'utf8'));
  return {
    rows: () => db.prepare('SELECT bucket, minute, hits FROM rate_hits ORDER BY minute').all(),
    prepare: (sql) => ({ bind: (...args) => ({ first: async () => db.prepare(sql).get(...args) ?? null }) }),
  };
}
const from = (ip) => ({ headers: new Headers({ 'cf-connecting-ip': ip }) });
const HOUR = Math.floor(Date.now() / 3600000) * 3600000; // début d'une heure : les minutes ci-dessous restent dans la même heure

test('par minute : la limite passe, la suivante est refusée sans rien écrire', async () => {
  const DB = fakeDb();
  for (let i = 0; i < RATE_LIMITS.write; i++) assert.equal(await tooFast({ DB }, 'write', from('203.0.113.7'), HOUR), null);
  assert.match(await tooFast({ DB }, 'write', from('203.0.113.7'), HOUR), /patientez une minute/);
  assert.match(await tooFast({ DB }, 'write', from('203.0.113.7'), HOUR + 30000), /patientez une minute/);
  assert.deepEqual(DB.rows().map((r) => r.hits), [RATE_LIMITS.write]);
  assert.equal(await tooFast({ DB }, 'write', from('203.0.113.7'), HOUR + 60000), null, 'la minute suivante repart à zéro');
});

test('par heure : un script qui reste sous la limite par minute est arrêté, sans rien écrire', async () => {
  const DB = fakeDb();
  const perMinute = RATE_LIMITS.write - 1;
  let sent = 0;
  for (let m = 0; sent < RATE_LIMITS_HOUR.write; m++) {
    for (let i = 0; i < perMinute && sent < RATE_LIMITS_HOUR.write; i++, sent++) {
      assert.equal(await tooFast({ DB }, 'write', from('203.0.113.7'), HOUR + m * 60000), null);
    }
  }
  const rowsBefore = DB.rows().length;
  assert.match(await tooFast({ DB }, 'write', from('203.0.113.7'), HOUR + 50 * 60000), /cette heure-ci/);
  assert.equal(DB.rows().length, rowsBefore, 'aucune ligne ajoutée pour une demande refusée');
  assert.equal(await tooFast({ DB }, 'write', from('203.0.113.7'), HOUR + 60 * 60000), null, 'l’heure suivante repart à zéro');
});

test('les compteurs sont séparés par adresse et par genre (écriture, création)', async () => {
  const DB = fakeDb();
  for (let i = 0; i < RATE_LIMITS.create; i++) await tooFast({ DB }, 'create', from('203.0.113.7'), HOUR);
  assert.ok(await tooFast({ DB }, 'create', from('203.0.113.7'), HOUR));
  assert.equal(await tooFast({ DB }, 'create', from('198.51.100.4'), HOUR), null);
  assert.equal(await tooFast({ DB }, 'write', from('203.0.113.7'), HOUR), null);
  assert.ok(RATE_LIMITS_HOUR.write > RATE_LIMITS.write && RATE_LIMITS_HOUR.create > RATE_LIMITS.create);
});

test('si la base répond mal, on laisse passer', async () => {
  const DB = { prepare() { throw new Error('base indisponible'); } };
  const errors = console.error;
  console.error = () => {};
  try {
    assert.equal(await tooFast({ DB }, 'write', from('203.0.113.7')), null);
  } finally {
    console.error = errors;
  }
});
