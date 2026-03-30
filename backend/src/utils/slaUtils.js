/**
 * Utilidad central de SLA horario hábil — CRMaosBike
 *
 * Horario operativo: 09:00 – 19:00 America/Santiago (fijo, sin depender del TZ del server).
 * SLA objetivo: 3 horas hábiles.
 *
 * Reglas:
 *  - Lead antes de 09:00  → SLA empieza ese día a las 09:00
 *  - Lead entre 09:00–18:59 → SLA empieza en ese instante
 *  - Lead a las 19:00 o después → SLA empieza al día siguiente a las 09:00
 *
 * Ejemplo: lead a las 18:00 → 1h disponible ese día → 2h restantes al día siguiente → vence 11:00.
 */

const { DateTime } = require('luxon');

const TZ         = 'America/Santiago';
const BIZ_START  = 9;   // 09:00
const BIZ_END    = 19;  // 19:00
const SLA_HOURS  = 3;   // horas hábiles objetivo

/**
 * Calcula el instante de inicio efectivo del SLA para un ticket creado en `createdAt`.
 * Retorna un DateTime en zona America/Santiago.
 *
 * @param {Date} createdAt - Momento de creación del ticket (Date UTC)
 * @returns {DateTime}
 */
function effectiveSlaStart(createdAt) {
  const dt       = DateTime.fromJSDate(createdAt).setZone(TZ);
  const bizStart = dt.set({ hour: BIZ_START, minute: 0, second: 0, millisecond: 0 });
  const bizEnd   = dt.set({ hour: BIZ_END,   minute: 0, second: 0, millisecond: 0 });

  if (dt < bizStart) return bizStart;           // antes de apertura → hoy 09:00
  if (dt >= bizEnd)  return bizStart.plus({ days: 1 }); // cierre o después → mañana 09:00
  return dt;                                    // dentro del horario → ahora mismo
}

/**
 * Suma `hours` horas hábiles a `startDt` respetando la ventana 09:00–19:00.
 * `startDt` debe estar dentro del horario hábil (garantizado por effectiveSlaStart).
 *
 * @param {DateTime} startDt - Inicio en horario hábil
 * @param {number}   hours   - Horas hábiles a sumar
 * @returns {DateTime}
 */
function addBusinessHours(startDt, hours) {
  let remaining = hours;
  let current   = startDt;

  while (remaining > 0) {
    const dayEnd      = current.set({ hour: BIZ_END, minute: 0, second: 0, millisecond: 0 });
    const availableH  = dayEnd.diff(current, 'hours').hours;

    if (availableH <= 0) {
      // current está en o después del cierre — avanzar al día siguiente
      current = current.plus({ days: 1 }).set({ hour: BIZ_START, minute: 0, second: 0, millisecond: 0 });
      continue;
    }

    if (remaining <= availableH) {
      current   = current.plus({ hours: remaining });
      remaining = 0;
    } else {
      remaining -= availableH;
      current = current.plus({ days: 1 }).set({ hour: BIZ_START, minute: 0, second: 0, millisecond: 0 });
    }
  }

  return current;
}

/**
 * Calcula el deadline SLA (Date UTC) para un ticket creado en `createdAt`.
 * Es la función principal que deben llamar todos los puntos del sistema.
 *
 * @param {Date} [createdAt=new Date()] - Momento de creación (o reasignación)
 * @returns {Date} - Deadline en UTC
 */
function calcSlaDeadline(createdAt = new Date()) {
  const start = effectiveSlaStart(createdAt);
  return addBusinessHours(start, SLA_HOURS).toJSDate();
}

/**
 * Retorna true si `date` (UTC) cae dentro del horario hábil 09:00–19:00 Santiago.
 * Exportada para poder testearla con fechas arbitrarias.
 *
 * Nota sobre el SQL de warning/breach en slaService.js:
 *   Las comparaciones `sla_deadline - INTERVAL '1 hour' < NOW()` y `sla_deadline < NOW()`
 *   son pura aritmética UTC — correctas e independientes del timezone del server.
 *   Funcionan porque:
 *     a) sla_deadline ya es un timestamp UTC absoluto calculado por calcSlaDeadline(),
 *        que encapsula toda la lógica de horario hábil.
 *     b) INTERVAL '1 hour' en PostgreSQL es siempre exactamente 3600 s (immune a DST).
 *     c) isNowBusinessHour() bloquea checkAll() antes de llegar al SQL, garantizando
 *        que warnings y breaches solo se procesan dentro del horario hábil.
 *   Edge case conocido: si el deadline queda muy cerca de las 09:00 del día siguiente
 *   (lead creado cerca del cierre), la ventana de warning de "1 hora antes" puede caer
 *   antes de las 09:00. El guard lo frena y el warning se emite al abrir, cerca del breach.
 *   Es un comportamiento aceptable — no es un bug.
 *
 * @param {Date} date - Momento a evaluar (Date UTC)
 * @returns {boolean}
 */
function isBusinessHour(date) {
  const dt = DateTime.fromJSDate(date).setZone(TZ);
  const h  = dt.hour + dt.minute / 60;
  return h >= BIZ_START && h < BIZ_END;
}

/**
 * Retorna true si el instante actual está dentro del horario hábil 09:00–19:00 Santiago.
 * Usado por el checker de SLA para no ejecutar reasignaciones fuera de horario.
 *
 * @returns {boolean}
 */
function isNowBusinessHour() {
  return isBusinessHour(new Date());
}

module.exports = { calcSlaDeadline, isBusinessHour, isNowBusinessHour };
