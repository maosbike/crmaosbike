/**
 * Contabilidad — CRMaosBike
 * MVP: Facturas emitidas (motos), sincronización desde Google Drive.
 * Cruza por RUT cliente (→ tickets) y chasis (→ inventory).
 */
const router   = require('express').Router();
const db       = require('../config/db');
const logger   = require('../config/logger');
const cloudinary = require('../config/cloudinary');
const pdfParse   = require('pdf-parse');
const { auth, roleCheck }  = require('../middleware/auth');
const {
  toISODate,
  parseChileanInt,
  normalizeRut,
  normalizeChassis,
} = require('../utils/normalize');

const parseAmt = parseChileanInt;

router.use(auth);

const ADMIN_ROLES = ['super_admin', 'admin_comercial'];

// ─── Parser de factura/nota de crédito emitida Maosbike ──────────────────────
// Formato DTE tipo 33/34/61 — lo que exporta el SII / software de facturación CL.
// pdf-parse desordena el texto cuando el layout tiene dos columnas (header
// emisor a la izquierda, RUT/folio/título a la derecha), así que el regex
// puro falla para la mayoría. Usamos el nombre del archivo como fuente de
// verdad del folio (son "7588.pdf", "809.pdf", etc).
// fileName: opcional; si se pasa, tiene prioridad sobre el texto para el folio.
function extractEmitida(text, fileName = '') {
  // Mantenemos DOS vistas del texto:
  //   · t      → todo en una línea, whitespace colapsado (útil para regex globales)
  //   · lines  → array de líneas originales (útil para receptor block y tablas)
  const t = text.replace(/\r/g, ' ').replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ');
  const lines = text
    .split(/\r?\n/)
    .map(l => l.replace(/\s{2,}/g, ' ').trim())
    .filter(Boolean);

  // ── Emisor conocido: Maosbike/Maosracing ──
  // Usado para (a) identificar cuál RUT es emisor vs cliente,
  //            (b) RECHAZAR candidatos de cliente que contengan el nombre emisor
  //                (pdf-parse a veces derrama "MAOSRACING LIMITADA" al campo cliente).
  const MAOS_RUT = '764058402';
  const EMISOR_TOKEN_RE = /MAOS\s*(?:RACING|BIKE)|MAOSRACING|MAOSBIKE/i;

  // Algunos strings son ruido garantizado: fragmentos sueltos del emisor
  // ("CING LIMITADA" ← truncado de "MAOSRACING LIMITADA"), o palabras legales
  // sueltas ("LIMITADA", "S.A.", etc), o labels que se colaron sin valor.
  const JUNK_CLIENTE_RE = new RegExp([
    EMISOR_TOKEN_RE.source,
    '^(?:LIMITADA|LTDA|S\\.?A\\.?|SPA|EIRL|SOCIEDAD)$',
    '^(?:[A-Z]{1,5})\\s+LIMITADA$',           // "CING LIMITADA", "ING LIMITADA"…
    '^(?:RUT|R\\.U\\.T|GIRO|DIRECCI[OÓ]N|DOMICILIO|COMUNA|CIUDAD|TEL[EÉ]F|FONO|FAX|FECHA|VENCIMIENTO|TOTAL|NETO|IVA|CONTADO|CR[EÉ]DITO|FACTURA|NOTA|ELECTR[OÓ]NICA|EMISI[OÓ]N|SII|S\\.?I\\.?I\\.?|CHILE|SANTIAGO|REGION|METROPOLITANA|RECEPTOR|EMISOR|SE[ÑN]OR(?:ES)?|RAZ[OÓ]N\\s+SOCIAL|FORMA\\s+DE\\s+PAGO|ORDEN\\s+COMPRA|VENDEDOR|DETALLE|DESCRIPCI[OÓ]N|CANTIDAD|PRECIO|UNITARIO|SUBTOTAL|DESCUENTO|MONTO|AFECTO|EXENTO)',
  ].join('|'), 'i');

  const isJunkCliente = (s) => {
    if (!s) return true;
    const v = s.trim();
    if (v.length < 3) return true;
    return JUNK_CLIENTE_RE.test(v);
  };

  // ── Tipo de documento ──
  const isNotaCredito = /NOTA\s+DE\s+CR[EÉ]DITO/i.test(t);
  const doc_type = isNotaCredito ? 'nota_credito' : 'factura';

  // ── Folio ──
  let folio = null;
  const fnMatch = fileName.match(/(\d{3,9})/);
  if (fnMatch) folio = fnMatch[1];
  if (!folio) {
    folio =
      t.match(/FACTURA\s+ELECTR[OÓ]NICA[^\d]*(?:N[°º\.]\s*)?(\d{4,9})/i)?.[1] ||
      t.match(/NOTA\s+DE\s+CR[EÉ]DITO[^\d]*(?:N[°º\.]\s*)?(\d{4,9})/i)?.[1] ||
      t.match(/FOLIO[^\d]*(\d{4,9})/i)?.[1] ||
      t.match(/N[°º]\s*(\d{4,9})/i)?.[1] ||
      null;
  }

  // ── Referencia (nota de crédito anula factura) ──
  let ref_folio = null, ref_fecha = null;
  if (isNotaCredito) {
    const refMatch = t.match(
      /Fact(?:ura)?\.?\s*Electr[oó]nica\s*N[°º\.]?\s*(\d{3,9})(?:\s+del\s+(\d{4}-\d{2}-\d{2}|\d{1,2}[-\/]\d{1,2}[-\/]\d{4}))?/i
    );
    if (refMatch) {
      ref_folio = refMatch[1];
      if (refMatch[2]) {
        const raw = refMatch[2];
        ref_fecha = raw.includes('-') && raw.length === 10 && raw.startsWith('20')
          ? raw
          : (() => {
              const [d, m, y] = raw.split(/[-\/]/);
              return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            })();
      }
    }
  }

  // ── RUTs (por formato, no por label) ──
  const rutRe = /\b(\d{1,2}(?:\.\d{3}){2}-[0-9Kk]|\d{7,8}-[0-9Kk])\b/g;
  const rawRuts   = [...t.matchAll(rutRe)].map(m => m[1]);
  const normedRuts = [...new Set(rawRuts.map(r => r.replace(/\./g, '')))]
    .map(raw => ({ raw, norm: normalizeRut(raw) }));

  const emisorHit  = normedRuts.find(r => r.norm === MAOS_RUT);
  const rut_emisor = (emisorHit || normedRuts[0])?.raw || null;
  const rut_emisorNorm = rut_emisor ? normalizeRut(rut_emisor) : null;

  const clienteHit = normedRuts.find(r => r.norm !== rut_emisorNorm);
  const rut_cliente = clienteHit?.raw || null;

  // ── Nombre emisor (fijo para Maosbike; si no, primer token antes del primer RUT) ──
  let emisor_nombre = null;
  if (rut_emisorNorm === MAOS_RUT) {
    emisor_nombre = 'MAOSRACING LIMITADA';
  } else {
    const m = t.match(/^\s*(.{3,120}?)\s+(?:R\.?U\.?T|\d{1,2}\.\d{3}\.\d{3}-[0-9Kk])/i);
    emisor_nombre = m?.[1]?.trim().replace(/\s+/g, ' ') || null;
  }

  // ── Fecha de emisión ──
  const dateMatch =
    t.match(/FECHA\s+(?:EMISI[OÓ]N|DE\s+EMISI[OÓ]N)\s*:?\s*(\d{1,2})[-\/\s](\d{1,2})[-\/\s](\d{4})/i) ||
    t.match(/(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+(?:del?\s+)?(\d{4})/i) ||
    t.match(/(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
  let fecha_emision = null;
  if (dateMatch) {
    const isTextMonth = isNaN(parseInt(dateMatch[2]));
    fecha_emision = isTextMonth
      ? toISODate(dateMatch[1], dateMatch[2], dateMatch[3])
      : `${dateMatch[3]}-${String(dateMatch[2]).padStart(2,'0')}-${String(dateMatch[1]).padStart(2,'0')}`;
  }

  // ── Cliente — nombre ──
  // Orden de estrategias (de mayor a menor confianza). En cada una rechazamos
  // candidatos que contengan el nombre del emisor u otros labels conocidos.
  let cliente_nombre = null;
  const clean = (s) => s?.trim().replace(/\s+/g, ' ').replace(/[|,;:\-–\.\s]+$/, '');

  const tryPush = (cand) => {
    if (cliente_nombre) return;
    const c = clean(cand);
    if (c && !isJunkCliente(c) && c.length >= 3) cliente_nombre = c;
  };

  // 1) Anclas estándar DTE CL: "SEÑOR(ES):", "RAZON SOCIAL:", "RECEPTOR:", "CLIENTE:", "NOMBRE:"
  const nameStop = '(?=\\s+(?:R\\.?U\\.?T|RUT\\b|GIRO|DIRECCI[OÓ]N|DOMICILIO|COMUNA|CIUDAD|TEL[EÉ]F|FONO|FAX|FECHA|VENCIMIENTO|FORMA\\s+DE\\s+PAGO|ORDEN\\s+COMPRA|VENDEDOR|CONTACTO|\\d{1,2}\\.\\d{3}\\.\\d{3}-[0-9Kk]|\\d{7,8}-[0-9Kk])|\\s*[|\\n\\r]|$)';
  // OJO con SEÑOR(ES): — los paréntesis son literales en el PDF real (DTEclick).
  const anchors = [
    '(?:SE[ÑN]OR(?:\\(ES\\)|ES)?)',
    '(?:RAZ[OÓ]N\\s+SOCIAL)',
    '(?:RECEPTOR)',
    '(?:CLIENTE)',
    '(?:NOMBRE)',
  ];
  for (const a of anchors) {
    if (cliente_nombre) break;
    const re = new RegExp(`${a}\\s*[:\\.]?\\s*([^|\\n\\r]{3,200}?)${nameStop}`, 'i');
    const m = t.match(re);
    if (m) tryPush(m[1].replace(/^\(?ES\)?\s*[:\.]?\s*/i, ''));
  }

  // 2) Línea que contenga el RUT cliente: a menudo el nombre está en la misma
  //    línea (antes o después), o en la línea inmediatamente previa.
  if (!cliente_nombre && rut_cliente) {
    const rutRawFound = rawRuts.find(r => r.replace(/\./g,'') === rut_cliente) || rut_cliente;
    for (let i = 0; i < lines.length && !cliente_nombre; i++) {
      if (!lines[i].includes(rutRawFound)) continue;
      // misma línea: lo que hay antes del RUT y después de un eventual label.
      const before = lines[i].split(rutRawFound)[0]
        .replace(/(?:SE[ÑN]OR(?:ES)?|RAZ[OÓ]N\s+SOCIAL|RECEPTOR|CLIENTE|NOMBRE|R\.?U\.?T)\s*[:\.]?\s*/ig, '')
        .trim();
      tryPush(before);
      // línea previa completa
      if (!cliente_nombre && i > 0) tryPush(lines[i - 1]);
      // después del RUT en la misma línea (por si el layout invierte orden)
      if (!cliente_nombre) {
        const after = lines[i].split(rutRawFound)[1]?.replace(/^[\s:\.\-]+/, '');
        if (after) tryPush(after.split(/\s{2,}|[|\n]/)[0]);
      }
    }
  }

  // 3) Ventana alrededor del RUT cliente (±300 chars) — candidatos MAYÚSCULAS
  //    largos, filtrando ruido.
  if (!cliente_nombre && rut_cliente) {
    const rutRawFound = rawRuts.find(r => r.replace(/\./g,'') === rut_cliente) || rut_cliente;
    const idx = t.indexOf(rutRawFound);
    if (idx >= 0) {
      const win = t.slice(Math.max(0, idx - 300), idx + 300);
      const candidates = [...win.matchAll(/([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s'\.,&\-]{5,80})/g)]
        .map(m => clean(m[1]))
        .filter(s => s && !isJunkCliente(s))
        .sort((a, b) => b.length - a.length);
      if (candidates[0]) cliente_nombre = candidates[0];
    }
  }

  // ── Dirección / Comuna / Giro / Ciudad del RECEPTOR ──
  // Truco: buscamos a partir del RUT cliente (más adelante en el texto),
  // para no confundir con campos del emisor que aparecen antes.
  const afterRut = rut_cliente
    ? t.slice(t.indexOf(rawRuts.find(r => r.replace(/\./g,'') === rut_cliente) || rut_cliente))
    : t;

  const afterLabel = (base, re) => {
    const m = base.match(re);
    return m?.[1] ? clean(m[1]) : null;
  };
  // Siempre intentamos primero en la ventana posterior al RUT cliente;
  // si no encuentra, caemos al texto completo.
  const field = (re) => afterLabel(afterRut, re) || afterLabel(t, re);

  let cliente_direccion = field(/(?:DIRECCI[OÓ]N|DOMICILIO)\s*[:\.]?\s*([^|\n\r]{3,200}?)(?=\s+(?:CIUDAD|COMUNA|GIRO|R\.?U\.?T|TEL[EÉ]F|FONO|FAX|FECHA|VENCIMIENTO|FORMA\s+DE\s+PAGO|ORDEN\s+COMPRA|VENDEDOR|CONTACTO|TIPO\s+DE\s+COMPRA|\d{1,2}\.\d{3}\.\d{3}-[0-9Kk]|\d{7,8}-[0-9Kk])|\s*[|\n\r]|$)/i);
  let cliente_comuna    = field(/\bCOMUNA\s*[:\.]?\s*([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ\s]{2,50}?)(?=\s+(?:GIRO|CIUDAD|R\.?U\.?T|FONO|TEL[EÉ]F|DIRECCI|FECHA|VENCIMIENTO|CONTACTO|TIPO\s+DE\s+COMPRA|[A-Z]{3,}\s*:)|\s*[|\n\r]|$)/i);
  let cliente_ciudad    = field(/\bCIUDAD\s*[:\.]?\s*([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ\s]{2,50}?)(?=\s+(?:GIRO|COMUNA|R\.?U\.?T|FONO|TEL[EÉ]F|DIRECCI|FECHA|VENCIMIENTO|CONTACTO|TIPO\s+DE\s+COMPRA|[A-Z]{3,}\s*:)|\s*[|\n\r]|$)/i);
  let cliente_giro      = field(/\bGIRO\s*[:\.]?\s*([^|\n\r]{3,160}?)(?=\s+(?:DIRECCI[OÓ]N|DOMICILIO|R\.?U\.?T|CIUDAD|COMUNA|FECHA|TEL[EÉ]F|FONO|VENCIMIENTO|CONTACTO|TIPO\s+DE\s+COMPRA|[A-Z]{4,}\s*:)|\s*[|\n\r]|$)/i);

  // ── Montos ──
  const neto  = parseAmt(t.match(/(?:MONTO\s+)?NETO\s*:?\s*\$?\s*([\d\.,]+)/i)?.[1]);
  const iva   = parseAmt(t.match(/I\.?V\.?A\.?\s*(?:19\s*%?)?\s*:?\s*\$?\s*([\d\.,]+)/i)?.[1]);
  const exento = parseAmt(t.match(/(?:MONTO\s+)?EXENTO\s*:?\s*\$?\s*([\d\.,]+)/i)?.[1]);
  const total = parseAmt(
    t.match(/TOTAL\s+A\s+PAGAR\s*:?\s*\$?\s*([\d\.,]+)/i)?.[1] ||
    t.match(/MONTO\s+TOTAL\s*:?\s*\$?\s*([\d\.,]+)/i)?.[1] ||
    t.match(/TOTAL\s*:?\s*\$?\s*([\d\.,]+)/i)?.[1]
  );

  // ── Vehículo (chasis, motor, marca, modelo, color, año) ──
  const chassis =
    t.match(/(?:N[°º\.]?\s*DE\s*CHASIS|CHASIS|VIN)\s*:?\s*([A-Z0-9][A-Z0-9\-]{10,19})/i)?.[1]?.trim() || null;
  const motorRaw =
    t.match(/N[°º\.]?\s*(?:DE\s*)?MOTOR\s*:?\s*([A-Z0-9][A-Z0-9\-\s]{4,20}?)(?=\s+(?:CHASIS|MARCA|MODELO|COLOR|A[ÑN]O))/i)?.[1]?.trim() ||
    t.match(/MOTOR\s*:?\s*([A-Z0-9][A-Z0-9\-\/]{4,20})/i)?.[1]?.trim() || null;
  const motor_num = motorRaw ? motorRaw.replace(/\s+/g, '') : null;

  // Marcas reales son multi-palabra ("ROYAL ENFIELD"), así que capturamos
  // hasta el próximo label del bloque item (MODELO/COLOR/CHASIS/MOTOR/AÑO/PBV…).
  const itemStop = '(?=\\s+(?:MODELO|COLOR|CHASIS|MOTOR|A[ÑN]O|PBV|COMBUSTIBLE|DESCRIPCI|MARCA|CANTIDAD|PRECIO|VALOR|TOTAL|NETO|EXENTO|IVA)|\\s*[|\\n\\r]|$)';
  const brand = t.match(new RegExp(`\\bMARCA\\s*:?\\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ\\s\\-]{1,40}?)${itemStop}`, 'i'))?.[1]?.trim().replace(/\s+/g, ' ') || null;
  const modelCapRaw = (
    t.match(new RegExp(`COD\\.?\\s*MODELO\\s*:?\\s*(.+?)${itemStop}`, 'i')) ||
    t.match(new RegExp(`MODELO\\s*:?\\s*(.+?)${itemStop}`, 'i'))
  )?.[1]?.trim().replace(/\s+/g, ' ') || null;
  const model = modelCapRaw ? (modelCapRaw.replace(/0-?[A-Z]\d+$/i, '').replace(/-$/, '') || modelCapRaw) : null;

  const color = t.match(new RegExp(`\\bCOLOR\\s*:?\\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ\\s\\-]{1,30}?)${itemStop}`, 'i'))?.[1]?.trim().replace(/\s+/g, ' ') || null;
  const year  = parseInt(t.match(/A[ÑN]O\s*(?:COMERCIAL)?\s*:?\s*(\d{4})/i)?.[1]) || null;

  // ── Extras útiles: forma de pago, vendedor, orden de compra, observaciones ──
  const forma_pago =
    t.match(/FORMA\s+(?:DE\s+)?PAGO\s*:?\s*([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ\s]{2,40}?)(?=\s+(?:VENDEDOR|ORDEN|OBSERVAC|CONDICI|FECHA|[A-Z]{4,}\s*:)|\s*[|\n\r]|$)/i)?.[1]?.trim() || null;
  const vendedor =
    t.match(/VENDEDOR\s*:?\s*([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ\s]{2,60}?)(?=\s+(?:ORDEN|FORMA|OBSERVAC|FECHA|[A-Z]{4,}\s*:)|\s*[|\n\r]|$)/i)?.[1]?.trim() || null;
  const orden_compra =
    t.match(/ORDEN\s+(?:DE\s+)?COMPRA\s*:?\s*([A-Z0-9\-\/]{2,40})/i)?.[1]?.trim() || null;

  // ── Descripción del ítem principal ──
  // No usamos la palabra "DESCRIPCION" como ancla porque en el PDF real es
  // solo el header de la tabla (y seguido vienen "Cantidad Precio..."). En
  // vez de eso, armamos la descripción desde los datos del vehículo.
  const descripcion = [
    'MOTOCICLETA',
    brand,
    model,
    color && `COLOR ${color}`,
    year && `AÑO ${year}`,
  ].filter(Boolean).join(' ') || null;

  const isMaos = rut_emisor && normalizeRut(rut_emisor) === MAOS_RUT;
  let category;
  if (!isMaos) category = 'otras';
  else if (chassis || motor_num || brand) category = 'motos';
  else category = 'otros';

  // Truncación defensiva al largo de columna.
  const clip = (s, n) => (s == null ? null : String(s).slice(0, n));

  // Observaciones: concatenamos extras que valga la pena persistir sin migración.
  const notesBits = [
    forma_pago    && `Forma pago: ${forma_pago}`,
    vendedor      && `Vendedor: ${vendedor}`,
    orden_compra  && `OC: ${orden_compra}`,
    cliente_ciudad && `Ciudad: ${cliente_ciudad}`,
  ].filter(Boolean);
  const notes = notesBits.length ? notesBits.join(' · ') : null;

  return {
    source: 'emitida',
    doc_type,
    category,
    folio:             clip(folio, 50),
    rut_emisor:        clip(rut_emisor, 20),
    emisor_nombre:     clip(emisor_nombre, 250),
    rut_cliente:       clip(rut_cliente, 20),
    cliente_nombre:    clip(cliente_nombre, 250),
    cliente_direccion: cliente_direccion,             // TEXT
    cliente_comuna:    clip(cliente_comuna, 100),
    cliente_giro:      clip(cliente_giro, 250),
    fecha_emision,
    monto_neto: neto,
    iva,
    monto_exento: exento,
    total,
    brand:           clip(brand, 100),
    model:           clip(model, 200),
    color:           clip(color, 100),
    commercial_year: year,
    motor_num:       clip(motor_num, 100),
    chassis:         clip(chassis, 100),
    descripcion,                                       // TEXT
    ref_folio:       clip(ref_folio, 50),
    ref_rut_emisor:  clip(ref_folio ? rut_emisor : null, 20),
    ref_fecha,
    notes,                                             // TEXT — extras útiles
  };
}

// ─── Cruce automático ─────────────────────────────────────────────────────────
async function resolveLinks(parsed) {
  let lead_id      = null;
  let inventory_id = null;
  let sale_note_id = null;
  let link_status  = 'sin_vincular';

  const rutNorm    = parsed.rut_cliente ? normalizeRut(parsed.rut_cliente) : null;
  const chassisNorm = parsed.chassis     ? normalizeChassis(parsed.chassis) : null;

  // 1. Buscar lead por RUT
  if (rutNorm) {
    const { rows } = await db.query(
      `SELECT id FROM tickets WHERE REPLACE(REPLACE(rut,'.',''),'-','') = $1 ORDER BY created_at DESC LIMIT 1`,
      [rutNorm]
    );
    if (rows[0]) lead_id = rows[0].id;
  }

  // 2. Buscar inventario por chasis
  if (chassisNorm) {
    const { rows } = await db.query(
      `SELECT id FROM inventory WHERE UPPER(REPLACE(chassis,' ','')) = $1 LIMIT 1`,
      [chassisNorm]
    );
    if (rows[0]) inventory_id = rows[0].id;
  }

  // 3. Buscar nota de venta por chasis
  if (chassisNorm) {
    const { rows } = await db.query(
      `SELECT id FROM sales_notes WHERE UPPER(REPLACE(chassis,' ','')) = $1 ORDER BY created_at DESC LIMIT 1`,
      [chassisNorm]
    );
    if (rows[0]) sale_note_id = rows[0].id;
  }

  // 4. Determinar estado de vinculación
  if (lead_id && (inventory_id || sale_note_id)) {
    link_status = 'vinculada';
  } else if (lead_id || inventory_id || sale_note_id) {
    // Match parcial — revisar si RUT sin chasis o viceversa
    link_status = (rutNorm && chassisNorm) ? 'revisar' : 'vinculada';
  }

  return { lead_id, inventory_id, sale_note_id, link_status };
}

// ─── GET /api/accounting/stats ───────────────────────────────────────────────
// Totales mensuales (facturas emitidas, excluye notas de crédito).
// Devuelve (a) resumen del mes pedido y (b) breakdown de los últimos 12 meses.
router.get('/stats', roleCheck(...ADMIN_ROLES), async (req, res) => {
  try {
    const { month, source = 'emitida' } = req.query;
    // month: 'YYYY-MM' (default: mes actual)
    const ym = /^\d{4}-\d{2}$/.test(month || '')
      ? month
      : new Date().toISOString().slice(0, 7);

    const { rows: mes } = await db.query(
      `SELECT
         COUNT(*)::int           AS count,
         COALESCE(SUM(monto_neto),   0)::bigint AS neto,
         COALESCE(SUM(iva),          0)::bigint AS iva,
         COALESCE(SUM(monto_exento), 0)::bigint AS exento,
         COALESCE(SUM(total),        0)::bigint AS total
       FROM invoices
       WHERE source=$1
         AND doc_type='factura'
         AND anulada_por_id IS NULL
         AND to_char(fecha_emision, 'YYYY-MM') = $2`,
      [source, ym]
    );

    const { rows: serie } = await db.query(
      `SELECT
         to_char(fecha_emision, 'YYYY-MM')     AS ym,
         COUNT(*)::int                          AS count,
         COALESCE(SUM(monto_neto),   0)::bigint AS neto,
         COALESCE(SUM(iva),          0)::bigint AS iva,
         COALESCE(SUM(total),        0)::bigint AS total
       FROM invoices
       WHERE source=$1
         AND doc_type='factura'
         AND anulada_por_id IS NULL
         AND fecha_emision IS NOT NULL
         AND fecha_emision >= (CURRENT_DATE - INTERVAL '12 months')
       GROUP BY ym
       ORDER BY ym ASC`,
      [source]
    );

    res.json({ month: ym, mes: mes[0], serie });
  } catch (e) {
    logger.error({ err: e }, '[Accounting/stats]');
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/accounting ─────────────────────────────────────────────────────
router.get('/', roleCheck(...ADMIN_ROLES), async (req, res) => {
  try {
    const {
      source = 'emitida',
      category,
      doc_type,
      link_status,
      desde,
      hasta,
      q,       // búsqueda por folio / rut / nombre
      page = 1,
      limit = 50,
    } = req.query;

    const conds = [`i.source = $1`];
    const params = [source];
    let idx = 2;

    if (category) { conds.push(`i.category = $${idx++}`); params.push(category); }
    if (doc_type) { conds.push(`i.doc_type = $${idx++}`); params.push(doc_type); }
    if (link_status) { conds.push(`i.link_status = $${idx++}`); params.push(link_status); }
    if (desde) { conds.push(`i.fecha_emision >= $${idx++}`); params.push(desde); }
    if (hasta) { conds.push(`i.fecha_emision <= $${idx++}`); params.push(hasta); }
    if (q) {
      conds.push(`(
        i.folio ILIKE $${idx} OR
        i.rut_cliente ILIKE $${idx} OR
        i.cliente_nombre ILIKE $${idx} OR
        i.chassis ILIKE $${idx}
      )`);
      params.push(`%${q}%`);
      idx++;
    }

    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    const off = (parseInt(page) - 1) * parseInt(limit);

    const { rows } = await db.query(
      `SELECT
         i.*,
         t.ticket_num, t.first_name, t.last_name,
         inv.model AS inv_model, inv.chassis AS inv_chassis, inv.status AS inv_status,
         sn.brand AS sn_brand, sn.model AS sn_model, sn.status AS sn_status
       FROM invoices i
       LEFT JOIN tickets   t   ON t.id   = i.lead_id
       LEFT JOIN inventory inv ON inv.id = i.inventory_id
       LEFT JOIN sales_notes sn ON sn.id = i.sale_note_id
       ${where}
       ORDER BY i.fecha_emision DESC NULLS LAST, i.created_at DESC
       LIMIT $${idx} OFFSET $${idx+1}`,
      [...params, parseInt(limit), off]
    );

    const { rows: cnt } = await db.query(
      `SELECT COUNT(*) FROM invoices i ${where}`,
      params
    );

    res.json({ data: rows, total: parseInt(cnt[0].count) });
  } catch (e) {
    logger.error({ err: e }, '[Accounting/GET]');
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/accounting/:id ─────────────────────────────────────────────────
router.get('/:id', roleCheck(...ADMIN_ROLES), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT i.*,
         t.ticket_num, t.first_name, t.last_name, t.rut, t.phone, t.email, t.status AS lead_status,
         inv.model AS inv_model, inv.chassis AS inv_chassis, inv.status AS inv_status,
         sn.brand AS sn_brand, sn.model AS sn_model, sn.status AS sn_status,
         sn.sold_at, sn.sale_price
       FROM invoices i
       LEFT JOIN tickets   t   ON t.id   = i.lead_id
       LEFT JOIN inventory inv ON inv.id = i.inventory_id
       LEFT JOIN sales_notes sn ON sn.id = i.sale_note_id
       WHERE i.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'No encontrada' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/accounting/:id/debug ───────────────────────────────────────────
// Re-descarga el PDF y devuelve el texto crudo de pdf-parse + el resultado
// actual del parser. Sirve para depurar casos donde cliente_nombre/rut_cliente
// no se extrae: sin ver qué escupe pdf-parse (que desordena layouts de 2
// columnas) estamos adivinando regex a ciegas.
router.get('/:id/debug', roleCheck('super_admin'), async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, folio, source, drive_file_id, pdf_url FROM invoices WHERE id = $1',
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'No encontrada' });
    const inv = rows[0];

    let buf = null;

    // 1) Intentar por Drive (más confiable; devuelve PDF binario real).
    if (inv.drive_file_id && process.env.GCLOUD_CREDS) {
      try {
        const creds = JSON.parse(process.env.GCLOUD_CREDS);
        const { google } = require('googleapis');
        const driveAuth = new google.auth.GoogleAuth({
          credentials: creds,
          scopes: ['https://www.googleapis.com/auth/drive.readonly'],
        });
        const drive = google.drive({ version: 'v3', auth: driveAuth });
        const r = await drive.files.get(
          { fileId: inv.drive_file_id, alt: 'media' },
          { responseType: 'arraybuffer' }
        );
        buf = Buffer.from(r.data);
      } catch (e) {
        logger.warn({ err: e.message }, '[Accounting/debug] Drive falló, probando pdf_url');
      }
    }

    // 2) Fallback: pdf_url (Cloudinary o Drive webViewLink).
    if (!buf && inv.pdf_url) {
      const r = await fetch(inv.pdf_url);
      if (r.ok) buf = Buffer.from(await r.arrayBuffer());
    }

    if (!buf) return res.status(404).json({ error: 'No se pudo descargar el PDF' });

    const parsed    = await pdfParse(buf);
    const rawText   = parsed.text;
    const collapsed = rawText.replace(/\r/g, ' ').replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ');
    const result    = extractEmitida(rawText, `${inv.folio || ''}.pdf`);

    res.json({
      folio: inv.folio,
      drive_file_id: inv.drive_file_id,
      raw_text:       rawText,
      collapsed_text: collapsed,
      raw_lines:      rawText.split('\n').map((l, i) => ({ i, l })),
      parsed: result,
    });
  } catch (e) {
    logger.error({ err: e }, '[Accounting/debug]');
    res.status(500).json({ error: e.message });
  }
});

// ─── PATCH /api/accounting/:id ────────────────────────────────────────────────
router.patch('/:id', roleCheck(...ADMIN_ROLES), async (req, res) => {
  try {
    const allowed = ['lead_id','inventory_id','sale_note_id','link_status','notes','category','doc_type'];
    const sets = [], params = [];
    let idx = 1;
    for (const [k, v] of Object.entries(req.body)) {
      if (allowed.includes(k)) {
        sets.push(`${k} = $${idx++}`);
        params.push(v === '' ? null : v);
      }
    }
    if (!sets.length) return res.status(400).json({ error: 'Nada que actualizar' });
    params.push(req.params.id);
    const { rows } = await db.query(
      `UPDATE invoices SET ${sets.join(', ')}, updated_at=NOW() WHERE id=$${idx} RETURNING *`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: 'No encontrada' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── DELETE /api/accounting/:id ───────────────────────────────────────────────
router.delete('/:id', roleCheck('super_admin'), async (req, res) => {
  try {
    const { rows } = await db.query('DELETE FROM invoices WHERE id=$1 RETURNING id', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'No encontrada' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/accounting/sync-drive ─────────────────────────────────────────
router.post('/sync-drive', roleCheck(...ADMIN_ROLES), async (req, res) => {
  const FOLDER_ID = process.env.ACCOUNTING_EMITIDAS_FOLDER_ID;
  if (!FOLDER_ID) {
    return res.status(503).json({
      error: 'Carpeta de Drive no configurada. Agregá ACCOUNTING_EMITIDAS_FOLDER_ID en Railway.',
    });
  }

  const credsJson = process.env.GCLOUD_CREDS;
  if (!credsJson) {
    return res.status(503).json({ error: 'Credenciales de Google no configuradas. Agregá GCLOUD_CREDS en Railway.' });
  }

  let creds;
  try { creds = JSON.parse(credsJson); }
  catch { return res.status(503).json({ error: 'GCLOUD_CREDS no es JSON válido.' }); }

  const { google } = require('googleapis');
  const driveAuth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  const drive = google.drive({ version: 'v3', auth: driveAuth });

  async function listPDFs(folderId) {
    const files = [];
    let pageToken = null;
    do {
      const resp = await drive.files.list({
        q: `'${folderId}' in parents and mimeType='application/pdf' and trashed=false`,
        fields: 'nextPageToken, files(id, name, webViewLink)',
        pageSize: 100,
        pageToken: pageToken || undefined,
      });
      files.push(...(resp.data.files || []));
      pageToken = resp.data.nextPageToken;
    } while (pageToken);
    return files;
  }

  async function downloadPDF(fileId) {
    const resp = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'arraybuffer' }
    );
    return Buffer.from(resp.data);
  }

  try {
    const files = await listPDFs(FOLDER_ID);
    const results = { created: 0, updated: 0, skipped: 0, errors: [] };

    for (const file of files) {
      try {
        const buf  = await downloadPDF(file.id);
        const text = (await pdfParse(buf)).text;
        const parsed = extractEmitida(text, file.name);

        if (!parsed.folio) {
          results.errors.push(`${file.name}: no se pudo extraer folio`);
          continue;
        }

        // Subir PDF a Cloudinary (resource_type=raw para PDFs)
        let pdf_url = file.webViewLink;
        try {
          const uploadResult = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
              { folder: 'accounting/emitidas', resource_type: 'raw', public_id: `factura_${parsed.folio}` },
              (err, result) => { if (err) reject(err); else resolve(result); }
            );
            stream.end(buf);
          });
          pdf_url = uploadResult.secure_url;
        } catch (_) { /* si Cloudinary falla usamos Drive link */ }

        const { rows: existing } = await db.query(
          `SELECT id FROM invoices WHERE source='emitida' AND folio=$1 AND rut_emisor=$2 LIMIT 1`,
          [parsed.folio, parsed.rut_emisor || '']
        );

        const links = await resolveLinks(parsed);

        let invoiceId;
        if (existing[0]) {
          invoiceId = existing[0].id;
          await db.query(
            `UPDATE invoices SET
               doc_type=$1, category=$2,
               fecha_emision=$3, rut_cliente=$4, cliente_nombre=$5,
               cliente_direccion=$6, cliente_comuna=$7, cliente_giro=$8,
               monto_neto=$9, iva=$10, monto_exento=$11, total=$12,
               brand=$13, model=$14, color=$15, commercial_year=$16,
               motor_num=$17, chassis=$18, descripcion=$19,
               pdf_url=$20, drive_file_id=$21,
               lead_id=COALESCE(lead_id,$22),
               inventory_id=COALESCE(inventory_id,$23),
               sale_note_id=COALESCE(sale_note_id,$24),
               link_status=$25,
               ref_folio=$26, ref_rut_emisor=$27, ref_fecha=$28,
               updated_at=NOW()
             WHERE id=$29`,
            [
              parsed.doc_type, parsed.category,
              parsed.fecha_emision, parsed.rut_cliente, parsed.cliente_nombre,
              parsed.cliente_direccion, parsed.cliente_comuna, parsed.cliente_giro,
              parsed.monto_neto, parsed.iva, parsed.monto_exento, parsed.total,
              parsed.brand, parsed.model, parsed.color, parsed.commercial_year,
              parsed.motor_num, parsed.chassis, parsed.descripcion,
              pdf_url, file.id,
              links.lead_id, links.inventory_id, links.sale_note_id,
              links.link_status,
              parsed.ref_folio, parsed.ref_rut_emisor, parsed.ref_fecha,
              invoiceId,
            ]
          );
          results.updated++;
        } else {
          const ins = await db.query(
            `INSERT INTO invoices (
               source, doc_type, category, folio, rut_emisor, emisor_nombre,
               fecha_emision, rut_cliente, cliente_nombre, cliente_direccion,
               cliente_comuna, cliente_giro,
               monto_neto, iva, monto_exento, total,
               brand, model, color, commercial_year, motor_num, chassis, descripcion,
               pdf_url, drive_file_id,
               lead_id, inventory_id, sale_note_id, link_status,
               ref_folio, ref_rut_emisor, ref_fecha,
               notes,
               created_by
             ) VALUES (
               $1,$2,$3,$4,$5,$6,
               $7,$8,$9,$10,
               $11,$12,
               $13,$14,$15,$16,
               $17,$18,$19,$20,$21,$22,$23,
               $24,$25,
               $26,$27,$28,$29,
               $30,$31,$32,
               $33,
               $34
             ) RETURNING id`,
            [
              parsed.source, parsed.doc_type, parsed.category,
              parsed.folio, parsed.rut_emisor, parsed.emisor_nombre,
              parsed.fecha_emision, parsed.rut_cliente, parsed.cliente_nombre,
              parsed.cliente_direccion, parsed.cliente_comuna, parsed.cliente_giro,
              parsed.monto_neto, parsed.iva, parsed.monto_exento, parsed.total,
              parsed.brand, parsed.model, parsed.color, parsed.commercial_year,
              parsed.motor_num, parsed.chassis, parsed.descripcion,
              pdf_url, file.id,
              links.lead_id, links.inventory_id, links.sale_note_id, links.link_status,
              parsed.ref_folio, parsed.ref_rut_emisor, parsed.ref_fecha,
              parsed.notes,
              req.user.id,
            ]
          );
          invoiceId = ins.rows[0].id;
          results.created++;
        }

        // Si es una nota de crédito con referencia, vinculamos la factura
        // original marcándola como anulada. No borramos nada — queda el rastro.
        if (parsed.doc_type === 'nota_credito' && parsed.ref_folio) {
          await db.query(
            `UPDATE invoices SET anulada_por_id=$1, updated_at=NOW()
             WHERE source='emitida' AND doc_type='factura'
               AND folio=$2 AND ($3::text IS NULL OR rut_emisor=$3)`,
            [invoiceId, parsed.ref_folio, parsed.ref_rut_emisor || parsed.rut_emisor || null]
          );
        }
      } catch (e) {
        results.errors.push(`${file.name}: ${e.message}`);
      }
    }

    res.json({
      ok: true,
      archivos_leidos: files.length,
      ...results,
    });
  } catch (e) {
    logger.error({ err: e }, '[Accounting/sync-drive]');
    if (e.code === 403 || (e.message || '').includes('permission')) {
      return res.status(403).json({
        error: `Sin acceso a la carpeta de Drive. Compartila con: ${creds.client_email}`,
        service_account_email: creds.client_email,
      });
    }
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
