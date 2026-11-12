// Tests des règles partagées par la page et le serveur : liste des créneaux, clé des créneaux, date limite.
// Lancer : npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSlots, slotsKey, slotTimes, slotEnd, slotId, parseYmd, ymd, weekday, isLate, norm } from '../public/shared.js';

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

test('horaires précis : un bit par plage, chaque créneau porte ses horaires', () => {
  // Du lundi 9 au dimanche 15 novembre 2026 : 12 h – 14 h et 19 h – 21 h en semaine ; mercredi 11 à 19 h seulement.
  const cfg = { s: '20261109', e: '20261115', k: 'h', h: [['1200', '1400'], ['1900', '2100']], m: [3, 3, 3, 3, 3, 0, 0], x: [1], o: [[2, 2]] };
  const slots = buildSlots(cfg);
  assert.deepEqual(slots.map((sl) => [ymd(sl.d), sl.h.join('-')]), [
    ['20261109', '1200-1400'], ['20261109', '1900-2100'], ['20261111', '1900-2100'],
    ['20261112', '1200-1400'], ['20261112', '1900-2100'], ['20261113', '1200-1400'], ['20261113', '1900-2100'],
  ]);
  assert.deepEqual(slotTimes(slots[1]), ['1900', '2100']);
  assert.equal(slotsKey(cfg), '20261109|20261115|3.3.3.3.3.0.0|1|o2:2|h1200-1400.1900-2100');
});

test('séjours : des demi-journées depuis le début, sur plusieurs jours', () => {
  // Période du samedi 14 novembre 2026 ; week-end du vendredi 13 soir au dimanche 15 soir, puis samedi 21 – dimanche 22.
  const cfg = { s: '20261113', e: '20261122', k: 'j', m: [0, 0, 0, 0, 0, 0, 0], j: [[1, 5], [16, 19]] };
  const [a, b] = buildSlots(cfg);
  assert.deepEqual([ymd(a.d), a.ah, ymd(a.d2), a.bh], ['20261113', 1, '20261115', 1]);
  assert.deepEqual([ymd(b.d), b.ah, ymd(slotEnd(b)), b.bh], ['20261121', 0, '20261122', 1]);
  assert.equal(slotTimes(a), null);
  assert.equal(slotsKey(cfg), '20261113|20261122|0.0.0.0.0.0.0||j1:5.16:19');
});

test('l’identité d’un créneau survit à une modification qui décale les index', () => {
  const before = buildSlots({ s: '20261109', e: '20261115', k: 'h', h: [['1900', '2100']], m: [1, 0, 0, 0, 0, 0, 0] });
  const after = buildSlots({ s: '20261109', e: '20261115', k: 'h', h: [['1200', '1400'], ['1900', '2100']], m: [3, 0, 0, 0, 0, 0, 0] });
  assert.equal(slotId(before[0]), slotId(after[1]));
  assert.notEqual(slotId(after[0]), slotId(after[1]));
  assert.equal(slotId({ d: 5, t: 4 }), 'm5.4');
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
