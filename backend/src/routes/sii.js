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
 * GET /api/sii/debug/sii-html — dumpea el HTML crudo del SII para encontrar
 * sitekey/config manualmente. Solo devuelve los primeros 50KB.
 */
router.get('/debug/sii-html', auth, roleCheck('super_admin', 'admin_comercial', 'backoffice'), asyncHandler(async (req, res) => {
  const axios = require('axios');
  const target = req.query.url || 'https://www4.sii.cl/consdcvinternetui/';
  try {
    const r = await axios.get(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-CL,es;q=0.9,en;q=0.8',
      },
      timeout: 20_000,
      maxRedirects: 5,
      transformResponse: x => x,
      validateStatus: () => true,
    });
    const html = String(r.data || '');
    // Buscar TODOS los URLs de assets para que el caller los descargue uno por uno si quiere.
    const scriptUrls = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map(m => m[1]);
    const linkUrls = [...html.matchAll(/<link[^>]+href=["']([^"']+)["']/g)].map(m => m[1]);
    res.json({
      ok: true,
      url: target,
      status: r.status,
      htmlLen: html.length,
      scripts: scriptUrls,
      links: linkUrls,
      htmlHead: html.slice(0, 50_000),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}));

/**
 * POST /api/sii/test-captcha — verifica que el captcha solver (2Captcha) está
 * configurado: descubre el sitekey, pide un solve, devuelve el token.
 * No toca el SII propiamente (esto es solo el solver).
 */
router.post('/test-captcha', auth, roleCheck('super_admin', 'admin_comercial', 'backoffice'), asyncHandler(async (req, res) => {
  const { solveCaptcha, discoverSitekey } = require('../services/sii/captcha');
  const startedAt = Date.now();
  try {
    const sitekey = await discoverSitekey();
    const solved = await solveCaptcha();
    res.json({
      ok: true,
      sitekeyPreview: sitekey.slice(0, 12) + '...',
      tokenPreview: solved.tokenRecaptcha.slice(0, 24) + '...',
      action: solved.accionRecaptcha,
      durationMs: Date.now() - startedAt,
    });
  } catch (e) {
    logger.error({ err: e.message }, '[sii.test-captcha] falló');
    res.status(500).json({ ok: false, error: e.message, durationMs: Date.now() - startedAt });
  }
}));

/**
 * POST /api/sii/debug/full — diagnóstico mega-completo en UNA sola llamada.
 *
 * Para cada combinación (últimos 3 meses) × (emitida | recibida) × (33,34,56,61,52):
 *   1. Llama al RCV con todos los métodos disponibles hasta que uno funcione
 *      (getDetalleVentaExport, getDetalleVenta, getResumen) para saber qué
 *      shape devuelve el SII en ESTE contribuyente específico.
 *   2. Reporta: count, keys del top-level, keys de la primera fila (sample),
 *      y un sample row con los primeros 3 campos.
 *
 * Output: un objeto plano con todo lo que necesito para diagnosticar sin más
 * iteraciones. El response es grande pero cabe en una respuesta JSON normal.
 */
router.post('/debug/full', auth, roleCheck('super_admin', 'admin_comercial', 'backoffice'), asyncHandler(async (req, res) => {
  const { callFacade, getEmpresaRut } = require('../services/sii/rcv');
  const TIPOS = [33, 34, 56, 61, 52];

  let rutInfo;
  try { rutInfo = getEmpresaRut(); }
  catch (e) { return res.status(500).json({ ok: false, error: 'getEmpresaRut: ' + e.message }); }

  // Construir últimos 3 meses (incluye actual).
  const now = new Date();
  const periodos = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    periodos.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }

  const results = [];
  // Métodos candidatos a probar en orden — si el primero devuelve datos paramos.
  // Si todos devuelven vacío, registramos el shape de cada uno.
  const METHODS_VENTA = ['getDetalleVentaExport', 'getDetalleVenta'];
  const METHODS_COMPRA = ['getDetalleCompraExport', 'getDetalleCompra'];

  function describeResp(raw) {
    if (raw == null) return { type: 'null', size: 0 };
    if (Array.isArray(raw)) {
      return {
        type: 'array',
        size: raw.length,
        firstRowKeys: raw[0] && typeof raw[0] === 'object' ? Object.keys(raw[0]).slice(0, 30) : null,
        firstRowSample: raw[0] ?? null,
      };
    }
    if (typeof raw === 'object') {
      const keys = Object.keys(raw);
      const detRows = raw.data?.detRows || raw.dataResp?.detRows || raw.data?.detalleDte || raw.dataResp?.detalleDte
        || (Array.isArray(raw.data) ? raw.data : null)
        || (Array.isArray(raw.dataResp) ? raw.dataResp : null);
      return {
        type: 'object',
        topKeys: keys,
        dataKeys: raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data) ? Object.keys(raw.data) : null,
        dataRespKeys: raw.dataResp && typeof raw.dataResp === 'object' && !Array.isArray(raw.dataResp) ? Object.keys(raw.dataResp) : null,
        detRowsLen: Array.isArray(detRows) ? detRows.length : null,
        firstRowKeys: detRows && detRows[0] && typeof detRows[0] === 'object' ? Object.keys(detRows[0]).slice(0, 30) : null,
        firstRowSample: detRows && detRows[0] ? detRows[0] : null,
      };
    }
    return { type: typeof raw, value: String(raw).slice(0, 200) };
  }

  for (const { year, month } of periodos) {
    for (const source of ['emitida', 'recibida']) {
      const methods = source === 'emitida' ? METHODS_VENTA : METHODS_COMPRA;
      for (const tipoDoc of TIPOS) {
        const data = {
          rutEmisor: rutInfo.rut,
          dvEmisor: rutInfo.dv,
          ptributario: `${year}${String(month).padStart(2, '0')}`,
          codTipoDoc: tipoDoc,
          operacion: source === 'emitida' ? 'VENTA' : 'COMPRA',
          estadoContab: 'REGISTRO',
        };
        for (const method of methods) {
          try {
            const raw = await callFacade(method, data);
            const desc = describeResp(raw);
            results.push({ year, month, source, tipoDoc, method, ok: true, ...desc });
            // Si encontramos filas, no probamos el siguiente método para ese tipoDoc.
            if (desc.size > 0 || desc.detRowsLen > 0) break;
          } catch (e) {
            results.push({ year, month, source, tipoDoc, method, ok: false, error: e.message });
          }
        }
      }
    }
  }

  // Resumen agregado para skim rápido.
  const aggregate = results.reduce((acc, r) => {
    const key = `${r.year}-${String(r.month).padStart(2, '0')} ${r.source} tipo${r.tipoDoc}`;
    const count = r.size ?? r.detRowsLen ?? 0;
    if (!acc[key] || count > (acc[key].count || 0)) {
      acc[key] = { method: r.method, count, ok: r.ok, error: r.error || null };
    }
    return acc;
  }, {});

  res.json({
    ok: true,
    rutEmpresa: `${rutInfo.rut}-${rutInfo.dv}`,
    periodosProbados: periodos,
    aggregate,
    detail: results,
  });
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
