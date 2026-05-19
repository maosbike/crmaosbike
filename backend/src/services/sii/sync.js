/**
 * sync.js — orquestador del flujo "SII → tabla invoices".
 *
 * Para cada periodo (YYYY-MM) recorre todos los TIPOS_DTE en EMITIDAS y
 * RECIBIDAS, dedup por (source, folio, doc_type), e inserta lo nuevo.
 *
 * Decisiones de diseño:
 *  · No baja XML/PDF en esta primera pasada. Solo metadatos del RCV (folio,
 *    monto, RUT contraparte). Para `category=motos` el chasis se queda en
 *    null — lo enriquecemos en una segunda fase (job posterior que use el
 *    parser Claude sobre el PDF descargado del SII).
 *  · UPSERT respeta el cliente_direccion/giro/etc si ya existían (no los
 *    sobreescribe con NULL). Esto permite que el sync-drive del scraper viejo
 *    coexista hasta que terminemos de migrar.
 *  · Manejo de errores: si falla un tipoDoc, seguimos con el siguiente.
 *    Si falla todo el periodo, se loguea pero no tira al caller.
 */
const db = require('../../config/db');
const logger = require('../../config/logger');
const { TIPOS_DTE, listEmitidas, listRecibidas, normalizeDte } = require('./rcv');

const ALL_TIPOS = [
  TIPOS_DTE.FACTURA_AFECTA,
  TIPOS_DTE.FACTURA_EXENTA,
  TIPOS_DTE.NOTA_CREDITO,
  TIPOS_DTE.NOTA_DEBITO,
  TIPOS_DTE.GUIA_DESPACHO,
];

/**
 * Sync de un periodo (YYYY-MM) y dirección (emitidas/recibidas).
 *
 * @param {object} opts
 * @param {number} opts.year       ej 2026
 * @param {number} opts.month      1-12
 * @param {'emitida'|'recibida'} opts.source
 * @returns {Promise<{ found: number, inserted: number, skipped: number, errors: Array }>}
 */
async function syncPeriodo({ year, month, source }) {
  const result = { found: 0, inserted: 0, updated: 0, skipped: 0, errors: [] };
  const lister = source === 'emitida' ? listEmitidas : listRecibidas;

  for (const tipoDoc of ALL_TIPOS) {
    let rows;
    try {
      rows = await lister({ year, month, tipoDoc });
    } catch (e) {
      logger.warn({ err: e.message, year, month, source, tipoDoc }, '[sii.sync] listar falló');
      result.errors.push({ tipoDoc, error: e.message });
      continue;
    }
    result.found += rows.length;
    logger.info({ year, month, source, tipoDoc, count: rows.length }, '[sii.sync] DTEs listados');

    for (const row of rows) {
      const dte = normalizeDte(row, source);
      if (!dte.folio) {
        logger.warn({ source, tipoDoc, raw: dte._raw }, '[sii.sync] DTE sin folio, skip');
        continue;
      }
      try {
        const action = await upsertInvoice(dte);
        if (action === 'inserted') result.inserted++;
        else if (action === 'updated') result.updated++;
        else result.skipped++;
      } catch (e) {
        logger.warn({ err: e.message, folio: dte.folio, source }, '[sii.sync] upsert falló');
        result.errors.push({ folio: dte.folio, tipoDoc, error: e.message });
      }
    }
  }
  return result;
}

/**
 * Inserta o actualiza un DTE en la tabla invoices.
 * Dedup por (source, folio, doc_type). Si ya existe, actualiza solo los
 * campos que el SII conoce con autoridad (montos, fechas, RUT contraparte)
 * y respeta los enriquecimientos manuales (chassis, brand, vinculación a lead).
 *
 * @returns {Promise<'inserted'|'updated'|'skipped'>}
 */
async function upsertInvoice(dte) {
  const { rows: existing } = await db.query(
    `SELECT id, total, monto_neto FROM invoices
     WHERE source=$1 AND folio=$2 AND doc_type=$3
     LIMIT 1`,
    [dte.source, dte.folio, dte.doc_type]
  );

  if (existing[0]) {
    // Si los montos no cambiaron, no hacemos UPDATE — ahorra escrituras y
    // mantiene el updated_at estable.
    const same = existing[0].total === dte.total && existing[0].monto_neto === dte.monto_neto;
    if (same) return 'skipped';
    await db.query(
      `UPDATE invoices SET
         rut_emisor=COALESCE($1, rut_emisor),
         emisor_nombre=COALESCE($2, emisor_nombre),
         rut_cliente=COALESCE($3, rut_cliente),
         cliente_nombre=COALESCE($4, cliente_nombre),
         fecha_emision=COALESCE($5, fecha_emision),
         monto_neto=$6, iva=$7, monto_exento=$8, total=$9,
         updated_at=NOW()
       WHERE id=$10`,
      [
        dte.rut_emisor, dte.emisor_nombre,
        dte.rut_cliente, dte.cliente_nombre,
        dte.fecha_emision,
        dte.monto_neto, dte.iva, dte.monto_exento, dte.total,
        existing[0].id,
      ]
    );
    return 'updated';
  }

  // Inferir category mínima: NC/ND/Guía siempre van como 'otros' por default,
  // facturas afectas → 'motos' si emitida (lo más común) o 'otros' si recibida
  // (queda para enrichment posterior con Claude leyendo PDF).
  const category = dte.source === 'emitida' && dte.doc_type === 'factura' ? 'motos' : 'otros';

  await db.query(
    `INSERT INTO invoices (
       source, doc_type, category, folio,
       rut_emisor, emisor_nombre,
       rut_cliente, cliente_nombre,
       fecha_emision,
       monto_neto, iva, monto_exento, total,
       link_status
     ) VALUES (
       $1,$2,$3,$4,
       $5,$6,
       $7,$8,
       $9,
       $10,$11,$12,$13,
       'sin_vincular'
     )`,
    [
      dte.source, dte.doc_type, category, dte.folio,
      dte.rut_emisor, dte.emisor_nombre,
      dte.rut_cliente, dte.cliente_nombre,
      dte.fecha_emision,
      dte.monto_neto, dte.iva, dte.monto_exento, dte.total,
    ]
  );
  return 'inserted';
}

/**
 * Sync de un rango de meses hacia atrás desde el actual. Útil para el cron
 * que corre cada N horas: el mes actual siempre crece, el anterior puede
 * recibir DTEs con delay (los proveedores facturan a fin de mes).
 *
 * @param {number} monthsBack cuántos meses hacia atrás incluir (0 = solo actual, 1 = actual + previo, etc.)
 * @returns {Promise<object>} resumen por periodo
 */
async function syncRecentMonths(monthsBack = 1) {
  const now = new Date();
  const periodos = [];
  for (let i = 0; i <= monthsBack; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    periodos.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  const summary = { runs: [], totals: { found: 0, inserted: 0, updated: 0, skipped: 0, errors: 0 } };
  for (const { year, month } of periodos) {
    for (const source of ['emitida', 'recibida']) {
      const r = await syncPeriodo({ year, month, source });
      summary.runs.push({ year, month, source, ...r });
      summary.totals.found += r.found;
      summary.totals.inserted += r.inserted;
      summary.totals.updated += r.updated;
      summary.totals.skipped += r.skipped;
      summary.totals.errors += r.errors.length;
    }
  }
  return summary;
}

/**
 * Sync de backfill desde un mes/año específico hasta el actual.
 *
 * @param {number} fromYear
 * @param {number} fromMonth 1-12
 * @returns {Promise<object>}
 */
async function syncBackfill(fromYear, fromMonth) {
  const summary = { runs: [], totals: { found: 0, inserted: 0, updated: 0, skipped: 0, errors: 0 } };
  const now = new Date();
  const endY = now.getFullYear();
  const endM = now.getMonth() + 1;
  let y = fromYear, m = fromMonth;
  while (y < endY || (y === endY && m <= endM)) {
    for (const source of ['emitida', 'recibida']) {
      const r = await syncPeriodo({ year: y, month: m, source });
      summary.runs.push({ year: y, month: m, source, ...r });
      summary.totals.found += r.found;
      summary.totals.inserted += r.inserted;
      summary.totals.updated += r.updated;
      summary.totals.skipped += r.skipped;
      summary.totals.errors += r.errors.length;
    }
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return summary;
}

module.exports = { syncPeriodo, syncRecentMonths, syncBackfill, upsertInvoice };
