/**
 * sii.js — endpoints para administrar la sincronización con el SII.
 *
 * Auth: rol admin (solo el admin puede disparar sync manual y ver el estado).
 *
 * Endpoints:
 *   POST /api/sii/sync            — corre sync de los últimos N meses (default 1)
 *   POST /api/sii/sync/backfill   — corre sync de un rango (?from=YYYY-MM)
 *   POST /api/sii/test-auth       — prueba seed+token sin tocar invoices, util para diagnóstico
 *   GET  /api/sii/status          — devuelve último sync + config visible
 */
const router = require('express').Router();
const logger = require('../config/logger');
const { auth, roleCheck } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { getToken } = require('../services/sii/auth');
const { syncRecentMonths, syncBackfill, syncPeriodo } = require('../services/sii/sync');

// Estado en memoria del último sync. Se pierde al reiniciar el backend,
// pero alcanza para mostrar en la UI "última corrida hace X minutos".
let _lastRun = null;

/**
 * POST /api/sii/test-auth — solo verifica que el cert + env vars funcionan
 * obteniendo un token del SII. No toca DB.
 */
router.post('/test-auth', auth, roleCheck('super_admin', 'admin_comercial', 'backoffice'), asyncHandler(async (req, res) => {
  try {
    const token = await getToken();
    res.json({ ok: true, tokenLen: token.length, tokenPreview: token.slice(0, 8) + '...' });
  } catch (e) {
    logger.error({ err: e.message, stack: e.stack }, '[sii.test-auth] falló');
    res.status(500).json({ ok: false, error: e.message });
  }
}));

/**
 * POST /api/sii/debug/rcv — llama directamente al RCV y devuelve la respuesta
 * CRUDA del SII (sin parsear). Para debugging cuando `found:0` y queremos ver
 * qué shape devuelve realmente el SII.
 * Body o query: year, month, source (emitida|recibida), tipoDoc (default 33)
 */
router.post('/debug/rcv', auth, roleCheck('super_admin', 'admin_comercial', 'backoffice'), asyncHandler(async (req, res) => {
  const year = parseInt(req.query.year ?? req.body?.year, 10);
  const month = parseInt(req.query.month ?? req.body?.month, 10);
  const source = req.query.source ?? req.body?.source;
  const tipoDoc = parseInt(req.query.tipoDoc ?? req.body?.tipoDoc ?? '33', 10);
  if (!year || !month) return res.status(400).json({ error: 'year/month requeridos' });
  if (!['emitida', 'recibida'].includes(source)) return res.status(400).json({ error: 'source debe ser emitida|recibida' });

  const { callFacade, getEmpresaRut } = require('../services/sii/rcv');
  const { rut, dv } = getEmpresaRut();
  const data = {
    rutEmisor: rut,
    dvEmisor: dv,
    ptributario: `${year}${String(month).padStart(2, '0')}`,
    codTipoDoc: tipoDoc,
    operacion: source === 'emitida' ? 'VENTA' : 'COMPRA',
    estadoContab: 'REGISTRO',
  };
  const method = source === 'emitida' ? 'getDetalleVentaExport' : 'getDetalleCompraExport';
  try {
    const raw = await callFacade(method, data);
    res.json({
      ok: true,
      method,
      sentData: data,
      rawType: Array.isArray(raw) ? 'array' : typeof raw,
      rawTopLevelKeys: raw && typeof raw === 'object' && !Array.isArray(raw) ? Object.keys(raw) : null,
      rawSize: Array.isArray(raw) ? raw.length : (typeof raw === 'string' ? raw.length : null),
      raw,
    });
  } catch (e) {
    res.status(500).json({ ok: false, method, sentData: data, error: e.message });
  }
}));

/**
 * POST /api/sii/sync — sync de últimos N meses (default 1 = actual + previo).
 * Query: ?monthsBack=2 para incluir más historia.
 */
router.post('/sync', auth, roleCheck('super_admin', 'admin_comercial', 'backoffice'), asyncHandler(async (req, res) => {
  const monthsBack = Math.max(0, Math.min(12, parseInt(req.query.monthsBack ?? req.body?.monthsBack ?? '1', 10)));
  const startedAt = Date.now();
  try {
    const summary = await syncRecentMonths(monthsBack);
    _lastRun = { at: new Date().toISOString(), durationMs: Date.now() - startedAt, monthsBack, summary };
    res.json({ ok: true, ..._lastRun });
  } catch (e) {
    logger.error({ err: e.message, stack: e.stack }, '[sii.sync] falló');
    res.status(500).json({ ok: false, error: e.message });
  }
}));

/**
 * POST /api/sii/sync/backfill?from=YYYY-MM
 * Para cargas iniciales. NO usar para sync regular — barre periodo por periodo,
 * pueden ser muchos meses y demora.
 */
router.post('/sync/backfill', auth, roleCheck('super_admin', 'admin_comercial', 'backoffice'), asyncHandler(async (req, res) => {
  const from = req.query.from || req.body?.from;
  if (!/^\d{4}-\d{2}$/.test(from || '')) {
    return res.status(400).json({ error: 'Param `from` requerido en formato YYYY-MM (ej 2025-05)' });
  }
  const [y, m] = from.split('-').map(Number);
  if (m < 1 || m > 12) return res.status(400).json({ error: 'Mes inválido' });
  const startedAt = Date.now();
  try {
    const summary = await syncBackfill(y, m);
    _lastRun = { at: new Date().toISOString(), durationMs: Date.now() - startedAt, backfillFrom: from, summary };
    res.json({ ok: true, ..._lastRun });
  } catch (e) {
    logger.error({ err: e.message, stack: e.stack }, '[sii.sync.backfill] falló');
    res.status(500).json({ ok: false, error: e.message });
  }
}));

/**
 * POST /api/sii/sync/periodo?year=2026&month=5&source=emitida
 * Para troubleshooting de un periodo puntual.
 */
router.post('/sync/periodo', auth, roleCheck('super_admin', 'admin_comercial', 'backoffice'), asyncHandler(async (req, res) => {
  const year = parseInt(req.query.year ?? req.body?.year, 10);
  const month = parseInt(req.query.month ?? req.body?.month, 10);
  const source = req.query.source ?? req.body?.source;
  if (!year || !month || month < 1 || month > 12) return res.status(400).json({ error: 'year/month inválidos' });
  if (!['emitida', 'recibida'].includes(source)) return res.status(400).json({ error: 'source inválido (emitida|recibida)' });
  try {
    const r = await syncPeriodo({ year, month, source });
    res.json({ ok: true, year, month, source, ...r });
  } catch (e) {
    logger.error({ err: e.message, stack: e.stack }, '[sii.sync.periodo] falló');
    res.status(500).json({ ok: false, error: e.message });
  }
}));

/**
 * GET /api/sii/status — config visible + último run.
 */
router.get('/status', auth, roleCheck('super_admin', 'admin_comercial', 'backoffice'), asyncHandler(async (req, res) => {
  res.json({
    configured: Boolean(process.env.SII_CERT_PFX_B64 && process.env.SII_CERT_PASSWORD && process.env.SII_EMPRESA_RUT),
    empresaRut: process.env.SII_EMPRESA_RUT || null,
    apiBase: process.env.SII_API_BASE || 'https://palena.sii.cl',
    cronEnabled: process.env.SII_SYNC_ENABLED !== 'false',
    cronIntervalMs: parseInt(process.env.SII_SYNC_INTERVAL || (3 * 60 * 60 * 1000), 10),
    lastRun: _lastRun,
  });
}));

module.exports = router;
