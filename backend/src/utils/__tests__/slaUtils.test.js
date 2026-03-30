/**
 * Tests unitarios para slaUtils.js
 *
 * Sin dependencias externas — usa solo assert de Node.js y luxon (ya instalado).
 * Ejecutar con: node src/utils/__tests__/slaUtils.test.js
 *
 * Cubre los 5 casos del spec de negocio más límites de isBusinessHour().
 */

'use strict';

const assert  = require('assert');
const { DateTime } = require('luxon');
const { calcSlaDeadline, isBusinessHour } = require('../slaUtils');

const TZ     = 'America/Santiago';
let passed   = 0;
let failed   = 0;

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Construye una fecha UTC correspondiente a HH:MM de HOY en Santiago. */
function hoy(hour, minute = 0) {
  return DateTime.now().setZone(TZ)
    .startOf('day')
    .set({ hour, minute, second: 0, millisecond: 0 })
    .toJSDate();
}

/** Construye una fecha UTC correspondiente a HH:MM de MAÑANA en Santiago. */
function manana(hour, minute = 0) {
  return DateTime.now().setZone(TZ)
    .startOf('day')
    .plus({ days: 1 })
    .set({ hour, minute, second: 0, millisecond: 0 })
    .toJSDate();
}

/** Formatea una fecha UTC como HH:MM en Santiago (para mensajes de error). */
function fmt(date) {
  return DateTime.fromJSDate(date).setZone(TZ).toFormat('HH:mm dd/MM/yyyy');
}

/** Compara dos fechas con tolerancia de ±2 segundos (evita ms de reloj). */
function nearlyEqual(a, b) {
  return Math.abs(a.getTime() - b.getTime()) < 2000;
}

// ─── runner mínimo ─────────────────────────────────────────────────────────────

function test(label, fn) {
  try {
    fn();
    console.log(`  ✓  ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${label}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

// ─── calcSlaDeadline ──────────────────────────────────────────────────────────

console.log('\ncalcSlaDeadline()');

test('Lead 08:30 → vence 12:00 mismo día', () => {
  const deadline  = calcSlaDeadline(hoy(8, 30));
  const esperado  = hoy(12, 0);
  assert.ok(
    nearlyEqual(deadline, esperado),
    `Esperado ${fmt(esperado)}, obtenido ${fmt(deadline)}`
  );
});

test('Lead 10:00 → vence 13:00 mismo día', () => {
  const deadline  = calcSlaDeadline(hoy(10, 0));
  const esperado  = hoy(13, 0);
  assert.ok(
    nearlyEqual(deadline, esperado),
    `Esperado ${fmt(esperado)}, obtenido ${fmt(deadline)}`
  );
});

test('Lead 18:00 → vence 11:00 día siguiente (1h hoy + 2h mañana)', () => {
  const deadline  = calcSlaDeadline(hoy(18, 0));
  const esperado  = manana(11, 0);
  assert.ok(
    nearlyEqual(deadline, esperado),
    `Esperado ${fmt(esperado)}, obtenido ${fmt(deadline)}`
  );
});

test('Lead 19:30 → vence 12:00 día siguiente (empieza mañana 09:00)', () => {
  const deadline  = calcSlaDeadline(hoy(19, 30));
  const esperado  = manana(12, 0);
  assert.ok(
    nearlyEqual(deadline, esperado),
    `Esperado ${fmt(esperado)}, obtenido ${fmt(deadline)}`
  );
});

test('Lead 00:00 (madrugada) → vence 12:00 mismo día (empieza 09:00)', () => {
  const deadline  = calcSlaDeadline(hoy(0, 0));
  const esperado  = hoy(12, 0);
  assert.ok(
    nearlyEqual(deadline, esperado),
    `Esperado ${fmt(esperado)}, obtenido ${fmt(deadline)}`
  );
});

test('Lead exactamente a las 09:00 → vence 12:00 (inicio en borde de apertura)', () => {
  const deadline  = calcSlaDeadline(hoy(9, 0));
  const esperado  = hoy(12, 0);
  assert.ok(
    nearlyEqual(deadline, esperado),
    `Esperado ${fmt(esperado)}, obtenido ${fmt(deadline)}`
  );
});

test('Lead exactamente a las 19:00 → vence 12:00 día siguiente (borde de cierre = fuera)', () => {
  const deadline  = calcSlaDeadline(hoy(19, 0));
  const esperado  = manana(12, 0);
  assert.ok(
    nearlyEqual(deadline, esperado),
    `Esperado ${fmt(esperado)}, obtenido ${fmt(deadline)}`
  );
});

// ─── isBusinessHour ────────────────────────────────────────────────────────────

console.log('\nisBusinessHour()');

test('08:59 → fuera de horario', () => {
  assert.strictEqual(isBusinessHour(hoy(8, 59)), false);
});

test('09:00 → dentro de horario (borde apertura)', () => {
  assert.strictEqual(isBusinessHour(hoy(9, 0)), true);
});

test('14:00 → dentro de horario', () => {
  assert.strictEqual(isBusinessHour(hoy(14, 0)), true);
});

test('18:59 → dentro de horario', () => {
  assert.strictEqual(isBusinessHour(hoy(18, 59)), true);
});

test('19:00 → fuera de horario (borde cierre)', () => {
  assert.strictEqual(isBusinessHour(hoy(19, 0)), false);
});

test('19:01 → fuera de horario', () => {
  assert.strictEqual(isBusinessHour(hoy(19, 1)), false);
});

test('23:00 → fuera de horario', () => {
  assert.strictEqual(isBusinessHour(hoy(23, 0)), false);
});

// ─── resultado ────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
if (failed === 0) {
  console.log(`✅ ${passed}/${passed + failed} tests pasaron\n`);
} else {
  console.error(`❌ ${failed} test(s) fallaron, ${passed} pasaron\n`);
  process.exit(1);
}
