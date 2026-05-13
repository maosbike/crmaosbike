/**
 * ingest.js — endpoints internos para ingestión automática de PDFs
 * desde servicios externos (sii-scraper, etc).
 *
 * Auth: por header `X-Internal-Token` contra `process.env.INTERNAL_API_TOKEN`.
 * NO usa el JWT de usuario porque corre desde un bot sin sesión.
 *
 * Endpoints:
 *   POST /api/ingest/invoice — recibe un PDF + source (emitida/recibida),
 *     lo parsea con Claude, lo sube a Cloudinary, hace UPSERT en invoices.
 *     Idempotente por (source, folio, doc_type).
 */
const router = require('express').Router();
const multer = require('multer');
const db = require('../config/db');
const logger = require('../config/logger');
const cloudinary = require('../config/cloudinary');
const { parseInvoiceWithClaude } = require('../services/claudeInvoiceParser');
const { parseEmitidaWithClaude } = require('../services/claudeEmitidaParser');
const { asyncHandler } = require('../middleware/errorHandler');

// ─── Auth por token de servicio ──────────────────────────────────────────────
// Header obligatorio: X-Internal-Token = INTERNAL_API_TOKEN (env var).
// Si la env var no está seteada, el endpoint queda inutilizable (503).
function internalAuth(req, res, next) {
  const expected = process.env.INTERNAL_API_TOKEN;
  if (!expected || expected.length < 32) {
    return res.status(503).json({ error: 'INTERNAL_API_TOKEN no configurado o muy corto (min 32 chars)' });
  }
  const got = req.get('x-internal-token') || '';
  if (got !== expected) {
    return res.status(401).json({ error: 'Token interno inválido' });
  }
  next();
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 }, // 20 MB por PDF
  fileFilter: (_req, file, cb) => {
    const okMime = file.mimetype === 'application/pdf';
    const okExt = /\.pdf$/i.test(file.originalname || '');
    if (okMime && okExt) cb(null, true);
    else cb(new Error('Solo se aceptan PDFs'));
  },
});

// ─── POST /api/ingest/invoice ────────────────────────────────────────────────
// FormData: file (PDF), source ('emitida' | 'recibida'), folio (opcional para
// pre-dedupe rápido sin parsear).
router.post('/invoice',
  internalAuth,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'PDF requerido (campo file)' });
    const source = req.body.source;
    if (!['emitida', 'recibida'].includes(source)) {
      return res.status(400).json({ error: `source inválido: ${source}. Usá emitida o recibida.` });
    }

    const fileName = req.file.originalname || `${source}.pdf`;
    const folioHint = req.body.folio ? String(req.body.folio).trim() : null;

    // Pre-check rápido: si vino folio en el body y ya existe en DB con ese
    // (source, folio), evitamos parsear de nuevo. El cron va a llamar miles
    // de veces para los mismos folios; ahorro de Claude + Cloudinary.
    if (folioHint) {
      const { rows: dup } = await db.query(
        `SELECT id FROM invoices WHERE source=$1 AND folio=$2 LIMIT 1`,
        [source, folioHint]
      );
      if (dup[0]) {
        return res.json({
          ok: true, status: 'skipped', reason: 'already_ingested',
          invoice_id: dup[0].id, folio: folioHint,
        });
      }
    }

    // Parsear con Claude según el lado del documento.
    let parsed;
    try {
      parsed = source === 'emitida'
        ? await parseEmitidaWithClaude(req.file.buffer, fileName)
        : await parseInvoiceWithClaude(req.file.buffer, fileName);
    } catch (e) {
      logger.warn({ err: e.message, fileName, source }, '[ingest/invoice] Claude falló');
      return res.status(422).json({ ok: false, error: `Parser Claude falló: ${e.message}` });
    }

    if (!parsed || !parsed.folio) {
      return res.status(422).json({ ok: false, error: 'Claude no pudo extraer el folio del PDF' });
    }

    // Dedupe POST-parser por (source, folio, doc_type). Si ya existía,
    // actualizamos el row con la nueva data; si no, insertamos.
    const { rows: existing } = await db.query(
      `SELECT id FROM invoices
       WHERE source=$1 AND folio=$2 AND doc_type=$3
       ORDER BY updated_at DESC LIMIT 1`,
      [source, parsed.folio, parsed.doc_type || 'factura']
    );

    // Subir PDF a Cloudinary una sola vez. resource_type 'raw' para PDF.
    let pdfUrl = null;
    try {
      const b64 = req.file.buffer.toString('base64');
      const dataUri = `data:application/pdf;base64,${b64}`;
      const folder = source === 'emitida' ? 'crmaosbike/sii/emitidas' : 'crmaosbike/sii/recibidas';
      const result = await cloudinary.uploader.upload(dataUri, {
        folder,
        resource_type: 'raw',
        public_id: `${parsed.folio}_${parsed.doc_type || 'factura'}`.replace(/[^a-z0-9_-]/gi, '_'),
        overwrite: true,
      });
      pdfUrl = result.secure_url;
    } catch (e) {
      logger.warn({ err: e.message, fileName }, '[ingest/invoice] Cloudinary falló — guardo sin pdf_url');
    }

    const baseFields = [
      source,
      parsed.doc_type || 'factura',
      parsed.category || null,
      parsed.folio,
      parsed.rut_emisor || null,
      parsed.emisor_nombre || null,
      parsed.fecha_emision || null,
      parsed.rut_cliente || null,
      parsed.cliente_nombre || null,
      parsed.cliente_direccion || null,
      parsed.cliente_comuna || null,
      parsed.cliente_giro || null,
      parsed.monto_neto || 0,
      parsed.iva || 0,
      parsed.monto_exento || 0,
      parsed.total || 0,
      parsed.brand || null,
      parsed.model || null,
      parsed.color || null,
      parsed.commercial_year || null,
      parsed.motor_num || null,
      parsed.chassis || null,
      parsed.descripcion || null,
      pdfUrl,
      parsed.ref_folio || null,
      parsed.ref_rut_emisor || null,
      parsed.ref_fecha || null,
      parsed.ref_tipo || null,
    ];

    let invoiceId, action;
    if (existing[0]) {
      invoiceId = existing[0].id;
      action = 'updated';
      await db.query(
        `UPDATE invoices SET
           source=$1, doc_type=$2, category=$3, folio=$4,
           rut_emisor=COALESCE($5, rut_emisor),
           emisor_nombre=COALESCE($6, emisor_nombre),
           fecha_emision=COALESCE($7, fecha_emision),
           rut_cliente=COALESCE($8, rut_cliente),
           cliente_nombre=COALESCE($9, cliente_nombre),
           cliente_direccion=COALESCE($10, cliente_direccion),
           cliente_comuna=COALESCE($11, cliente_comuna),
           cliente_giro=COALESCE($12, cliente_giro),
           monto_neto=$13, iva=$14, monto_exento=$15, total=$16,
           brand=COALESCE($17, brand),
           model=COALESCE($18, model),
           color=COALESCE($19, color),
           commercial_year=COALESCE($20, commercial_year),
           motor_num=COALESCE($21, motor_num),
           chassis=COALESCE($22, chassis),
           descripcion=COALESCE($23, descripcion),
           pdf_url=COALESCE($24, pdf_url),
           ref_folio=COALESCE($25, ref_folio),
           ref_rut_emisor=COALESCE($26, ref_rut_emisor),
           ref_fecha=COALESCE($27, ref_fecha),
           ref_tipo=COALESCE($28, ref_tipo),
           updated_at=NOW()
         WHERE id=$29`,
        [...baseFields, invoiceId]
      );
    } else {
      const ins = await db.query(
        `INSERT INTO invoices (
           source, doc_type, category, folio, rut_emisor, emisor_nombre,
           fecha_emision, rut_cliente, cliente_nombre, cliente_direccion,
           cliente_comuna, cliente_giro,
           monto_neto, iva, monto_exento, total,
           brand, model, color, commercial_year, motor_num, chassis, descripcion,
           pdf_url,
           ref_folio, ref_rut_emisor, ref_fecha, ref_tipo,
           link_status
         ) VALUES (
           $1,$2,$3,$4,$5,$6,
           $7,$8,$9,$10,
           $11,$12,
           $13,$14,$15,$16,
           $17,$18,$19,$20,$21,$22,$23,
           $24,
           $25,$26,$27,$28,
           'sin_vincular'
         ) RETURNING id`,
        baseFields
      );
      invoiceId = ins.rows[0].id;
      action = 'created';
    }

    // NC con anulación → marcar la factura referenciada como anulada (igual
    // que hace sync-drive). Solo cuando ref_tipo='anulacion'; las correcciones
    // y ajustes no anulan.
    if (parsed.doc_type === 'nota_credito' && parsed.ref_folio && parsed.ref_tipo === 'anulacion') {
      await db.query(
        `UPDATE invoices SET anulada_por_id=$1, updated_at=NOW()
         WHERE source=$2 AND doc_type='factura' AND folio=$3`,
        [invoiceId, source, parsed.ref_folio]
      );
    }

    logger.info({
      source, folio: parsed.folio, doc_type: parsed.doc_type,
      action, invoice_id: invoiceId, total: parsed.total,
    }, '[ingest/invoice] OK');

    res.json({ ok: true, status: action, invoice_id: invoiceId, folio: parsed.folio, parsed });
  })
);

// ─── GET /api/ingest/check?source=emitida&folios=7647,7646,7645 ──────────────
// El scraper usa esto al inicio de cada corrida para saber qué folios ya
// tiene la DB y saltar la descarga. Devuelve la lista de folios YA presentes.
router.get('/check', internalAuth, asyncHandler(async (req, res) => {
  const source = req.query.source;
  const foliosCsv = req.query.folios || '';
  if (!['emitida', 'recibida'].includes(source)) {
    return res.status(400).json({ error: 'source inválido' });
  }
  const folios = foliosCsv.split(',').map(s => s.trim()).filter(Boolean);
  if (folios.length === 0) return res.json({ present: [] });
  const { rows } = await db.query(
    `SELECT DISTINCT folio FROM invoices WHERE source=$1 AND folio = ANY($2::text[])`,
    [source, folios]
  );
  res.json({ present: rows.map(r => r.folio) });
}));

module.exports = router;
