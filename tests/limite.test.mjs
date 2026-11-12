// Tests de la limite de débit maison : quelle adresse est comptée (IPv4 telle quelle, bloc /64 en IPv6).
// Lancer : npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ipKey, RATE_LIMITS } from '../src/worker.js';

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
