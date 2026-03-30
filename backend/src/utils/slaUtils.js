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
 * Retorna true si el instante actual está dentro del horario hábil 09:00–19:00 Santiago.
 * Usado por el checker de SLA para no ejecutar reasignaciones fuera de horario.
 *
 * @returns {boolean}
 */
function isNowBusinessHour() {
  const now = DateTime.now().setZone(TZ);
  const h   = now.hour + now.minute / 60;
  return h >= BIZ_START && h < BIZ_END;
}

module.exports = { calcSlaDeadline, isNowBusinessHour };
