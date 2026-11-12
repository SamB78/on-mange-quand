// Tests des règles partagées par la page et le serveur : liste des créneaux, clé des créneaux, date limite.
// Lancer : npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSlots, slotsKey, parseYmd, ymd, weekday, isLate, norm } from '../public/shared.js';

const SOIR = 16, MIDI = 4;

test('parseYmd refuse les dates qui n’existent pas et accepte les tirets', () => {
  assert.equal(ymd(parseYmd('2026-11-14')), '20261114');
  assert.equal(ymd(parseYmd('20261114'), '-'), '2026-11-14');
  assert.ok(Number.isNaN(parseYmd('20260230')));
  assert.ok(Number.isNaN(parseYmd('demain')));
});

test('weekday compte à partir du lundi', () => {
  assert.equal(weekday(parseYmd('20261109')), 0); // lundi
  assert.equal(weekday(parseYmd('20261115')), 6); // dimanche
});

test('les créneaux suivent les moments de chaque jour de la semaine, dans l’ordre', () => {
  // Du lundi 9 au dimanche 15 novembre 2026 : soir le vendredi, midi et soir le samedi.
  const slots = buildSlots({ s: '20261109', e: '20261115', m: [0, 0, 0, 0, SOIR, MIDI | SOIR, 0], x: [] });
  assert.deepEqual(slots.map((sl) => [ymd(sl.d), sl.t]), [['20261113', 4], ['20261114', 2], ['20261114', 4]]);
});

test('un jour exclu disparaît, un jour ajouté prend tous les moments du sondage', () => {
  const cfg = { s: '20261109', e: '20261115', m: [0, 0, 0, 0, SOIR, MIDI | SOIR, 0], x: [4], a: [2] };
  // Vendredi 13 exclu ; mercredi 11 (férié) ajouté avec midi et soir.
  assert.deepEqual(buildSlots(cfg).map((sl) => [ymd(sl.d), sl.t]), [['20261111', 2], ['20261111', 4], ['20261114', 2], ['20261114', 4]]);
});

test('un jour ajouté dont le jour de la semaine est déjà choisi prend aussi tous les moments', () => {
  // Soir le vendredi, midi et soir le samedi ; vendredi 13 ouvert en entier.
  const cfg = { s: '20261109', e: '20261115', m: [0, 0, 0, 0, SOIR, MIDI | SOIR, 0], x: [], a: [4] };
  assert.deepEqual(buildSlots(cfg).map((sl) => [ymd(sl.d), sl.t]), [['20261113', 2], ['20261113', 4], ['20261114', 2], ['20261114', 4]]);
});

test('un jour réglé à part prend ses propres moments, quelle que soit la règle', () => {
  // Soir le vendredi, midi et soir le samedi ; mardi 10 le matin, samedi 14 le soir seulement.
  const cfg = { s: '20261109', e: '20261115', m: [0, 0, 0, 0, SOIR, MIDI | SOIR, 0], x: [], o: [[1, 2], [5, SOIR]] };
  assert.deepEqual(buildSlots(cfg).map((sl) => [ymd(sl.d), sl.t]), [['20261110', 1], ['20261113', 4], ['20261114', 4]]);
  assert.equal(slotsKey(cfg), '20261109|20261115|0.0.0.0.16.20.0||o1:2.5:16');
});

test('la clé des créneaux ne mentionne les jours ajoutés que s’il y en a', () => {
  const base = { s: '20261109', e: '20261115', m: [0, 0, 0, 0, SOIR, 0, 0], x: [1] };
  assert.equal(slotsKey(base), '20261109|20261115|0.0.0.0.16.0.0|1');
  assert.equal(slotsKey({ ...base, a: [] }), slotsKey(base));
  assert.equal(slotsKey({ ...base, a: [2] }), '20261109|20261115|0.0.0.0.16.0.0|1|2');
});

test('la date limite se juge à l’heure de Paris, jour limite compris', () => {
  const cfg = { dl: '20261114' };
  assert.equal(isLate(cfg, Date.UTC(2026, 10, 14, 22, 30)), false); // 23 h 30 à Paris, le 14
  assert.equal(isLate(cfg, Date.UTC(2026, 10, 14, 23, 30)), true);  // 0 h 30 à Paris, le 15
  assert.equal(isLate({}, Date.UTC(2030, 0, 1)), false);
});

test('norm ignore accents, majuscules et espaces en trop', () => {
  assert.equal(norm('  Léa   Dupont '), 'lea dupont');
});
