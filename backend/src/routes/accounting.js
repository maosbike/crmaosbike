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
const { asyncHandler } = require('../middleware/errorHandler');
const {
  toISODate,
  parseChileanInt,
  normalizeRut,
  normalizeChassis,
} = require('../utils/normalize');

const parseAmt = parseChileanInt;

router.use(auth);

const ADMIN_ROLES = ['super_admin', 'admin_comercial'];

// ─── Auto-match model_id al catálogo ─────────────────────────────────────────
// Mismo patrón que supplier-payments.js: exact match → model_aliases → fuzzy
// con guard de ambigüedad. Sin este match, invoices.model_id queda NULL y la
// factura aparece sin foto aunque el modelo exista en el catálogo.
async function resolveModelId(brand, model) {
  if (!model) return null;
  const m = String(model).trim();
  const b = String(brand || '').trim();
  const FUZZY_MIN = 4;

  let q = await db.query(
    `SELECT id FROM moto_models
     WHERE active=true AND LOWER(brand)=LOWER($1)
       AND (LOWER(model)=LOWER($2) OR LOWER(code)=LOWER($2) OR LOWER(normalized_model)=LOWER($2))
     LIMIT 1`,
    [b, m]
  );
  if (q.rows[0]) return q.rows[0].id;

  q = await db.query(
    `SELECT ma.model_id FROM model_aliases ma
     JOIN moto_models mm ON mm.id=ma.model_id
     WHERE mm.active=true AND LOWER(ma.alias)=LOWER($1)
     LIMIT 1`,
    [m]
  );
  if (q.rows[0]) return q.rows[0].model_id;

  if (b && m.length >= FUZZY_MIN) {
    const fz = await db.query(
      `SELECT id FROM moto_models
       WHERE active=true AND LOWER(brand)=LOWER($1)
         AND (LOWER(model) LIKE LOWER($2)||'%' OR LOWER($2) LIKE LOWER(model)||'%')
       LIMIT 2`,
      [b, m]
    );
    if (fz.rows.length === 1) return fz.rows[0].id;
  }

  // Normalización canónica (sin espacios/guiones/puntos) como último recurso —
  // match inequívoco ("YZF-R3" == "YZFR3" == "yzf r3").
  if (b && m.length >= FUZZY_MIN) {
    const canon = await db.query(
      `SELECT id FROM moto_models
       WHERE active=true
         AND UPPER(REGEXP_REPLACE(brand, '[\\s\\-\\.]', '', 'g'))
           = UPPER(REGEXP_REPLACE($1,    '[\\s\\-\\.]', '', 'g'))
         AND UPPER(REGEXP_REPLACE(model, '[\\s\\-\\.]', '', 'g'))
           = UPPER(REGEXP_REPLACE($2,    '[\\s\\-\\.]', '', 'g'))
       LIMIT 2`,
      [b, m]
    );
    if (canon.rows.length === 1) return canon.rows[0].id;
  }

  return null;
}

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

  // ── Referencia (nota de crédito) ──
  // Las NC chilenas pueden tener 3 motivos: anula la factura, corrige datos
  // del receptor o corrige montos. El sistema antes trataba TODAS como
  // anulación, dejando la factura original como anulada aunque la venta
  // siguiera vigente (ej. NC Nº 807 "Corrige Dato Receptor" no anula la
  // factura 7590, sólo arregla una dirección mal escrita).
  let ref_folio = null, ref_fecha = null, ref_tipo = null;
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
    // Detectar el tipo de NC por texto literal del DTE (primero) y monto (fallback).
    // Los DTE chilenos imprimen frases como "Corrige Dato Receptor", "Anula
    // Documento de la Referencia", "Corrige Monto".
    if (/\banula\w*\b/i.test(t)) {
      ref_tipo = 'anulacion';
    } else if (/corrig\w*\s+(?:monto|valor|importe)/i.test(t)) {
      ref_tipo = 'ajuste';
    } else if (/corrig\w*|correcci[oó]n/i.test(t)) {
      ref_tipo = 'correccion';
    }
    // Fallback por monto: si el total es 0 es casi seguro una corrección de
    // datos (no se puede anular con monto 0 ni ajustar a cero contable).
    // Parseamos el total como string del raw para evitar asumir variables.
    const totalMatchRaw = t.match(/TOTAL\s*\$?\s*([\d\.,\-]+)/i);
    const totalNum = totalMatchRaw
      ? parseInt(String(totalMatchRaw[1]).replace(/[^\d\-]/g, ''), 10) || 0
      : 0;
    if (!ref_tipo) {
      ref_tipo = totalNum === 0 ? 'correccion' : 'anulacion';
    }
  }

  // ── RUTs (por formato, no por label) ──
  // pdf-parse inserta un espacio antes del dígito verificador en el layout
  // real ("76.405.840- 2", "25.579.582- 1") — toleramos espacios en el dash.
  const rutRe = /\b(\d{1,2}(?:\.\d{3}){2}\s*-\s*[0-9Kk]|\d{7,8}\s*-\s*[0-9Kk])\b/g;
  const rawRuts    = [...t.matchAll(rutRe)].map(m => m[1]);
  const cleanRuts  = rawRuts.map(r => r.replace(/\s+/g, ''));
  const normedRuts = [...new Set(cleanRuts.map(r => r.replace(/\./g, '')))]
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
    const rutRawFound = rawRuts.find(r => r.replace(/[\.\s]/g,'') === rut_cliente) || rut_cliente;
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
    const rutRawFound = rawRuts.find(r => r.replace(/[\.\s]/g,'') === rut_cliente) || rut_cliente;
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
    ? t.slice(t.indexOf(rawRuts.find(r => r.replace(/[\.\s]/g,'') === rut_cliente) || rut_cliente))
    : t;

  const afterLabel = (base, re) => {
    const m = base.match(re);
    return m?.[1] ? clean(m[1]) : null;
  };
  // Siempre intentamos primero en la ventana posterior al RUT cliente;
  // si no encuentra, caemos al texto completo.
  const field = (re) => afterLabel(afterRut, re) || afterLabel(t, re);

  // Estrategia por-línea: pdf-parse desordena columnas pero suele preservar
  // las líneas individuales. "Comuna: San Bernardo" en el PDF queda en una
  // línea sola cuando está en una celda, así que extraer todo después del
  // label en esa línea es más fiable que el regex sobre texto colapsado
  // (que se corta en "SAN" porque "CIUDAD:" de la columna derecha aparece
  // justo después tras el colapso).
  // stopWordsRe: corta el valor si aparece otro label en la misma línea
  // (caso columna doble aplanada en una sola línea).
  const findInLine = (labelRe, stopWordsRe) => {
    for (const line of lines) {
      const m = line.match(labelRe);
      if (!m) continue;
      let val = m[1] || '';
      if (stopWordsRe) {
        const s = val.search(stopWordsRe);
        if (s > 0) val = val.slice(0, s);
      }
      val = val.trim().replace(/\s+/g, ' ').replace(/[|,;:\-–\.]+$/, '');
      if (val.length >= 3 && !isJunkCliente(val)) return val;
    }
    return null;
  };

  const stopLabels = /\s+(?:CIUDAD|COMUNA|GIRO|DIRECCI[OÓ]N|DOMICILIO|R\.?U\.?T\.?|RUT|FONO|TEL[EÉ]F|FAX|FECHA|VENCIMIENTO|CONTACTO|TIPO\s+DE\s+COMPRA|FORMA\s+DE\s+PAGO|ORDEN\s+(?:DE\s+)?COMPRA|VENDEDOR|OBSERVAC|CONDICI)\s*[:\.]/i;

  // Labels del DTE que pdf-parse a veces pega DIRECTO al final del valor
  // anterior, sin espacio ("BERNARDOCIUDAD:SANTIAGO"). Si detectamos uno,
  // cortamos el valor justo antes.
  const embeddedLabel = /(CIUDAD|COMUNA|GIRO|DIRECCI[OÓ]N|DOMICILIO|FONO|TEL[EÉ]FONO|TEL[EÉ]F|FAX|FECHA|VENCIMIENTO|CONTACTO|VENDEDOR|OBSERVAC|CONDICI|NETO|IVA|TOTAL|EXENTO|RECEPTOR|EMISOR|TIPO\s*DE\s*COMPRA|FORMA\s*DE\s*PAGO|ORDEN\s*(?:DE\s*)?COMPRA)\s*[:\.]/i;
  const cutEmbedded = (v) => {
    if (!v) return v;
    const m = v.match(embeddedLabel);
    if (m && m.index > 0) {
      return v.slice(0, m.index).replace(/[\s,;:.\-]+$/, '').trim();
    }
    return v;
  };

  let cliente_direccion = cutEmbedded(
    findInLine(/(?:DIRECCI[OÓ]N|DOMICILIO)\s*[:\.]?\s*(.+)$/i, stopLabels)
    || field(/(?:DIRECCI[OÓ]N|DOMICILIO)\s*[:\.]?\s*([^|\n\r]{3,200}?)(?=\s+(?:CIUDAD|COMUNA|GIRO|R\.?U\.?T|TEL[EÉ]F|FONO|FAX|FECHA|VENCIMIENTO|FORMA\s+DE\s+PAGO|ORDEN\s+COMPRA|VENDEDOR|CONTACTO|TIPO\s+DE\s+COMPRA|\d{1,2}\.\d{3}\.\d{3}-[0-9Kk]|\d{7,8}-[0-9Kk])|\s*[|\n\r]|$)/i)
  );

  let cliente_comuna = cutEmbedded(
    findInLine(/\bCOMUNA\s*[:\.]?\s*(.+)$/i, stopLabels)
    || field(/\bCOMUNA\s*[:\.]?\s*([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ\s]{2,50}?)(?=\s+(?:GIRO|CIUDAD|R\.?U\.?T|FONO|TEL[EÉ]F|DIRECCI|FECHA|VENCIMIENTO|CONTACTO|TIPO\s+DE\s+COMPRA|[A-Z]{3,}\s*:)|\s*[|\n\r]|$)/i)
  );

  let cliente_ciudad = cutEmbedded(
    findInLine(/\bCIUDAD\s*[:\.]?\s*(.+)$/i, stopLabels)
    || field(/\bCIUDAD\s*[:\.]?\s*([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ\s]{2,50}?)(?=\s+(?:GIRO|COMUNA|R\.?U\.?T|FONO|TEL[EÉ]F|DIRECCI|FECHA|VENCIMIENTO|CONTACTO|TIPO\s+DE\s+COMPRA|[A-Z]{3,}\s*:)|\s*[|\n\r]|$)/i)
  );

  let cliente_giro = cutEmbedded(
    findInLine(/\bGIRO\s*[:\.]?\s*(.+)$/i, stopLabels)
    || field(/\bGIRO\s*[:\.]?\s*([^|\n\r]{3,160}?)(?=\s+(?:DIRECCI[OÓ]N|DOMICILIO|R\.?U\.?T|CIUDAD|COMUNA|FECHA|TEL[EÉ]F|FONO|VENCIMIENTO|CONTACTO|TIPO\s+DE\s+COMPRA|[A-Z]{4,}\s*:)|\s*[|\n\r]|$)/i)
  );

  // Si la comuna quedó suspechosamente corta (prefijo común chileno sin
  // sufijo: "SAN", "LAS", "PUENTE"…), intentamos extenderla. pdf-parse a
  // veces mete el sufijo ("BERNARDO") en la siguiente línea porque la otra
  // columna del DTE lo empujó.
  if (cliente_comuna) {
    const words = cliente_comuna.trim().split(/\s+/);
    const PREFIX_RE = /^(SAN|SANTA|SANTO|LAS|LOS|EL|LA|VILLA|PUENTE|PUERTO|ALTO|BAJO|CERRO|ISLA|NUEVA|NUEVO|PADRE|GENERAL|ESTACI[OÓ]N|LO|MAR[IÍ]A|JUAN)$/i;
    // Palabras que NO son parte de un nombre de comuna real — son labels
    // del DTE que pdf-parse intercaló al colapsar columnas.
    const LABEL_WORDS_RE = /^(?:CIUDAD|COMUNA|GIRO|DIRECCI[OÓ]N|DOMICILIO|RUT|FONO|TEL[EÉ]F|FAX|FECHA|VENCIMIENTO|CONTACTO|TIPO|FORMA|ORDEN|VENDEDOR|OBSERVAC|CONDICI|NETO|IVA|TOTAL|EXENTO|MONTO|CLIENTE|NOMBRE|RECEPTOR|EMISOR|SE[ÑN]OR(?:ES)?|FACTURA|NOTA|ELECTR[OÓ]NICA)$/i;

    if (words.length === 1 && PREFIX_RE.test(words[0])) {
      const prefix = words[0];
      let fixed = null;

      // (1) Buscá la línea que contenía "COMUNA" — puede que el sufijo esté
      //     en la siguiente línea si pdf-parse partió el cell.
      for (let i = 0; i < lines.length; i++) {
        if (!/COMUNA/i.test(lines[i])) continue;
        const next = (lines[i + 1] || '').trim();
        if (!next) continue;
        const mNext = next.match(/^([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ]{2,30})/);
        if (!mNext) continue;
        // pdf-parse a veces pega el siguiente label acá también:
        // "BERNARDOCIUDAD" → cortá en "CIUDAD".
        const word = cutEmbedded(mNext[1]);
        if (word && word.length >= 3 && !LABEL_WORDS_RE.test(word)) {
          fixed = `${prefix} ${word}`;
          break;
        }
      }

      // (2) Fallback al colapsado: en "COMUNA: SAN X Y Z…" tomá el primer X
      //     que no sea un label conocido.
      if (!fixed) {
        const mCol = t.match(new RegExp(`COMUNA\\s*[:\\.]?\\s*${prefix}\\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ]{2,30})`, 'i'));
        if (mCol) {
          const word = cutEmbedded(mCol[1]);
          if (word && word.length >= 3 && !LABEL_WORDS_RE.test(word)) {
            fixed = `${prefix} ${word}`;
          }
        }
      }

      if (fixed) cliente_comuna = fixed;
    }
  }


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
    ref_tipo:        ref_tipo,                         // anulacion | correccion | ajuste
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

  // 2. Buscar inventario por chasis. Match canónico: ignora espacios,
  //    guiones, puntos y barras. Las facturas a veces traen "ME3-DJERT5"
  //    y la unidad cargada como "ME3DJERT5" o viceversa.
  if (chassisNorm) {
    const { rows } = await db.query(
      `SELECT id FROM inventory
        WHERE chassis IS NOT NULL
          AND UPPER(REGEXP_REPLACE(chassis, '[\\s\\-\\._/]', '', 'g')) = $1
        ORDER BY created_at DESC LIMIT 1`,
      [chassisNorm]
    );
    if (rows[0]) inventory_id = rows[0].id;
  }

  // 3. Buscar nota de venta por chasis (mismo match canónico)
  if (chassisNorm) {
    const { rows } = await db.query(
      `SELECT id FROM sales_notes
        WHERE chassis IS NOT NULL
          AND UPPER(REGEXP_REPLACE(chassis, '[\\s\\-\\._/]', '', 'g')) = $1
        ORDER BY created_at DESC LIMIT 1`,
      [chassisNorm]
    );
    if (rows[0]) sale_note_id = rows[0].id;
  }

  // 4. Si no matcheó por chasis, intentar por RUT del cliente — captura
  //    casos donde la factura trae chasis distinto/ausente pero el cliente
  //    sí está cargado en una venta del mismo RUT y misma marca/modelo.
  if (!inventory_id && !sale_note_id && rutNorm && parsed.brand && parsed.model) {
    const brandModelNorm = `[\\s\\-\\.]`;
    const { rows } = await db.query(
      `SELECT id FROM inventory
        WHERE status IN ('vendida','reservada')
          AND REPLACE(REPLACE(client_rut,'.',''),'-','') = $1
          AND UPPER(REGEXP_REPLACE(brand, $2, '', 'g')) = UPPER(REGEXP_REPLACE($3, $2, '', 'g'))
          AND UPPER(REGEXP_REPLACE(model, $2, '', 'g')) = UPPER(REGEXP_REPLACE($4, $2, '', 'g'))
        ORDER BY sold_at DESC NULLS LAST, created_at DESC LIMIT 1`,
      [rutNorm, brandModelNorm, parsed.brand, parsed.model]
    );
    if (rows[0]) inventory_id = rows[0].id;
    if (!inventory_id) {
      const r2 = await db.query(
        `SELECT id FROM sales_notes
          WHERE REPLACE(REPLACE(client_rut,'.',''),'-','') = $1
            AND UPPER(REGEXP_REPLACE(brand, $2, '', 'g')) = UPPER(REGEXP_REPLACE($3, $2, '', 'g'))
            AND UPPER(REGEXP_REPLACE(model, $2, '', 'g')) = UPPER(REGEXP_REPLACE($4, $2, '', 'g'))
          ORDER BY sold_at DESC NULLS LAST, created_at DESC LIMIT 1`,
        [rutNorm, brandModelNorm, parsed.brand, parsed.model]
      );
      if (r2.rows[0]) sale_note_id = r2.rows[0].id;
    }
  }

  // 5. Determinar estado de vinculación
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
router.get('/stats', roleCheck(...ADMIN_ROLES), asyncHandler(async (req, res) => {
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
}));

// ─── GET /api/accounting ─────────────────────────────────────────────────────
// Tabs:
//   · facturas — facturas (tipo 33) con moto asociada y no anuladas. Vista
//     principal: acá entran las ventas reales de motos.
//   · notas    — notas de crédito (tipo 61). Traen `anula_folio` del DTE.
//   · otras    — facturas sin moto (accesorios, servicios, refacturaciones)
//     y facturas anuladas por NC. Siguen siendo contables pero no son ventas
//     de unidad.
// Se mantienen category/doc_type como overrides legacy por si algún link
// externo los usa; si viene `tab`, tiene prioridad.
router.get('/', roleCheck(...ADMIN_ROLES), asyncHandler(async (req, res) => {
    const {
      source = 'emitida',
      tab,
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

    // Heurística "tiene moto": marca/modelo parseados, chasis, o vínculo a
    // inventory. Si el parser falló pero el humano vinculó a mano, respetamos
    // el vínculo.
    const hasMotoExpr = `(i.brand IS NOT NULL OR i.chassis IS NOT NULL OR i.inventory_id IS NOT NULL OR i.sale_note_id IS NOT NULL)`;

    if (tab === 'facturas') {
      conds.push(`i.doc_type = 'factura'`);
      conds.push(`i.anulada_por_id IS NULL`);
      conds.push(hasMotoExpr);
    } else if (tab === 'notas') {
      conds.push(`i.doc_type = 'nota_credito'`);
    } else if (tab === 'otras') {
      conds.push(`i.doc_type = 'factura'`);
      conds.push(`(i.anulada_por_id IS NOT NULL OR NOT ${hasMotoExpr})`);
    } else {
      if (category) { conds.push(`i.category = $${idx++}`); params.push(category); }
      if (doc_type) { conds.push(`i.doc_type = $${idx++}`); params.push(doc_type); }
    }

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

    // Foto de catálogo: prioridad (1) invoices.model_id → moto_models,
    // (2) inventario linkeado → moto_models, (3) nota de venta linkeada →
    // moto_models, (4) LATERAL que matchea por brand+model+year del texto
    // del DTE (para facturas 'sin vincular' que nunca pasaron por el
    // resolver de modelos). El LATERAL limita a 1 resultado.
    const { rows } = await db.query(
      `SELECT
         i.*,
         t.ticket_num, t.first_name, t.last_name,
         inv.model AS inv_model, inv.chassis AS inv_chassis, inv.status AS inv_status,
         sn.brand AS sn_brand, sn.model AS sn_model, sn.status AS sn_status,
         COALESCE(mm_own.image_url, mm_inv.image_url, mm_sn.image_url, mm_txt.image_url) AS model_image_url,
         COALESCE(mm_own.gallery,   mm_inv.gallery,   mm_sn.gallery,   mm_txt.gallery)   AS model_gallery,
         COALESCE(mm_own.color_photos, mm_inv.color_photos, mm_sn.color_photos, mm_txt.color_photos) AS model_color_photos,
         COALESCE(mm_own.id,        mm_inv.id,        mm_sn.id,        mm_txt.id)        AS model_id_resolved
       FROM invoices i
       LEFT JOIN tickets     t   ON t.id   = i.lead_id
       LEFT JOIN inventory   inv ON inv.id = i.inventory_id
       LEFT JOIN sales_notes sn  ON sn.id  = i.sale_note_id
       LEFT JOIN moto_models mm_own ON mm_own.id = i.model_id
       LEFT JOIN moto_models mm_inv ON mm_inv.id = inv.model_id
       LEFT JOIN moto_models mm_sn  ON mm_sn.id  = sn.model_id
       LEFT JOIN LATERAL (
         SELECT id, image_url, gallery, color_photos
           FROM moto_models
          WHERE active = true
            AND i.brand IS NOT NULL AND i.model IS NOT NULL
            AND UPPER(REGEXP_REPLACE(brand, '[\\s\\-\\.]', '', 'g'))
              = UPPER(REGEXP_REPLACE(i.brand, '[\\s\\-\\.]', '', 'g'))
            AND UPPER(REGEXP_REPLACE(model, '[\\s\\-\\.]', '', 'g'))
              = UPPER(REGEXP_REPLACE(i.model, '[\\s\\-\\.]', '', 'g'))
            AND (i.commercial_year IS NULL OR year = i.commercial_year OR year IS NULL)
          ORDER BY CASE WHEN year = i.commercial_year THEN 0 ELSE 1 END
          LIMIT 1
       ) mm_txt ON mm_own.id IS NULL AND mm_inv.id IS NULL AND mm_sn.id IS NULL
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
}));

// ─── GET /api/accounting/:id ─────────────────────────────────────────────────
router.get('/:id', roleCheck(...ADMIN_ROLES), asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      `SELECT i.*,
         t.ticket_num, t.first_name, t.last_name, t.rut, t.phone, t.email, t.status AS lead_status,
         inv.model AS inv_model, inv.chassis AS inv_chassis, inv.status AS inv_status,
         sn.brand AS sn_brand, sn.model AS sn_model, sn.status AS sn_status,
         sn.sold_at, sn.sale_price,
         COALESCE(mm_own.image_url, mm_inv.image_url, mm_sn.image_url, mm_txt.image_url) AS model_image_url,
         COALESCE(mm_own.gallery,   mm_inv.gallery,   mm_sn.gallery,   mm_txt.gallery)   AS model_gallery,
         COALESCE(mm_own.color_photos, mm_inv.color_photos, mm_sn.color_photos, mm_txt.color_photos) AS model_color_photos,
         COALESCE(mm_own.id,        mm_inv.id,        mm_sn.id,        mm_txt.id)        AS model_id_resolved
       FROM invoices i
       LEFT JOIN tickets     t   ON t.id   = i.lead_id
       LEFT JOIN inventory   inv ON inv.id = i.inventory_id
       LEFT JOIN sales_notes sn  ON sn.id  = i.sale_note_id
       LEFT JOIN moto_models mm_own ON mm_own.id = i.model_id
       LEFT JOIN moto_models mm_inv ON mm_inv.id = inv.model_id
       LEFT JOIN moto_models mm_sn  ON mm_sn.id  = sn.model_id
       LEFT JOIN LATERAL (
         SELECT id, image_url, gallery, color_photos
           FROM moto_models
          WHERE active = true
            AND i.brand IS NOT NULL AND i.model IS NOT NULL
            AND UPPER(REGEXP_REPLACE(brand, '[\\s\\-\\.]', '', 'g'))
              = UPPER(REGEXP_REPLACE(i.brand, '[\\s\\-\\.]', '', 'g'))
            AND UPPER(REGEXP_REPLACE(model, '[\\s\\-\\.]', '', 'g'))
              = UPPER(REGEXP_REPLACE(i.model, '[\\s\\-\\.]', '', 'g'))
            AND (i.commercial_year IS NULL OR year = i.commercial_year OR year IS NULL)
          ORDER BY CASE WHEN year = i.commercial_year THEN 0 ELSE 1 END
          LIMIT 1
       ) mm_txt ON mm_own.id IS NULL AND mm_inv.id IS NULL AND mm_sn.id IS NULL
       WHERE i.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'No encontrada' });
    res.json(rows[0]);
}));

// ─── GET /api/accounting/:id/debug ───────────────────────────────────────────
// Re-descarga el PDF y devuelve el texto crudo de pdf-parse + el resultado
// actual del parser. Sirve para depurar casos donde cliente_nombre/rut_cliente
// no se extrae: sin ver qué escupe pdf-parse (que desordena layouts de 2
// columnas) estamos adivinando regex a ciegas.
router.get('/:id/debug', roleCheck('super_admin'), asyncHandler(async (req, res) => {
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
}));

// ─── PATCH /api/accounting/:id ────────────────────────────────────────────────
// Permite editar manualmente: vinculaciones (lead/inv/sale_note/link_status),
// metadata del vehiculo (brand/model/color/year/chassis) y FK al catalogo
// (model_id). Si el usuario cambia brand/model sin pasar model_id explicito,
// intentamos auto-resolver con resolveModelId() — mismo patron que supplier-
// payments.js. Devolvemos la fila con JOINs a moto_models para que el
// frontend reciba image_url + color_photos al toque.
router.patch('/:id', roleCheck(...ADMIN_ROLES), asyncHandler(async (req, res) => {
    const allowed = [
      'lead_id','inventory_id','sale_note_id','link_status','notes','category','doc_type',
      'brand','model','color','commercial_year','chassis','model_id',
    ];
    const body = { ...req.body };

    // Auto-resolver model_id si cambian brand/model sin FK explicito.
    if ((body.brand !== undefined || body.model !== undefined) && body.model_id === undefined) {
      const cur = await db.query(`SELECT brand, model FROM invoices WHERE id=$1`, [req.params.id]);
      const nb = body.brand  !== undefined ? body.brand  : cur.rows[0]?.brand;
      const nm = body.model  !== undefined ? body.model  : cur.rows[0]?.model;
      body.model_id = await resolveModelId(nb, nm);
    }

    const sets = [], params = [];
    let idx = 1;
    for (const [k, v] of Object.entries(body)) {
      if (allowed.includes(k)) {
        sets.push(`${k} = $${idx++}`);
        params.push(v === '' ? null : v);
      }
    }
    if (!sets.length) return res.status(400).json({ error: 'Nada que actualizar' });
    params.push(req.params.id);
    await db.query(
      `UPDATE invoices SET ${sets.join(', ')}, updated_at=NOW() WHERE id=$${idx}`,
      params
    );

    // Devolver fila enriquecida (mismo SELECT que GET /:id).
    const { rows } = await db.query(
      `SELECT i.*,
         t.ticket_num, t.first_name, t.last_name, t.rut, t.phone, t.email, t.status AS lead_status,
         inv.model AS inv_model, inv.chassis AS inv_chassis, inv.status AS inv_status,
         sn.brand AS sn_brand, sn.model AS sn_model, sn.status AS sn_status,
         sn.sold_at, sn.sale_price,
         COALESCE(mm_own.image_url, mm_inv.image_url, mm_sn.image_url)     AS model_image_url,
         COALESCE(mm_own.gallery,   mm_inv.gallery,   mm_sn.gallery)       AS model_gallery,
         COALESCE(mm_own.color_photos, mm_inv.color_photos, mm_sn.color_photos) AS model_color_photos,
         COALESCE(mm_own.id,        mm_inv.id,        mm_sn.id)            AS model_id_resolved
       FROM invoices i
       LEFT JOIN tickets     t   ON t.id   = i.lead_id
       LEFT JOIN inventory   inv ON inv.id = i.inventory_id
       LEFT JOIN sales_notes sn  ON sn.id  = i.sale_note_id
       LEFT JOIN moto_models mm_own ON mm_own.id = i.model_id
       LEFT JOIN moto_models mm_inv ON mm_inv.id = inv.model_id
       LEFT JOIN moto_models mm_sn  ON mm_sn.id  = sn.model_id
       WHERE i.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'No encontrada' });
    res.json(rows[0]);
}));

// ─── POST /api/accounting/:id/create-sale ─────────────────────────────────────
// Crea una nota de venta en `sales_notes` a partir de una factura y la vincula.
// Caso de uso: backfill de ventas previas al CRM que sólo existen como factura
// subida desde Drive. Sólo admins — el admin elige vendedor y sucursal.
router.post('/:id/create-sale', roleCheck(...ADMIN_ROLES), asyncHandler(async (req, res) => {
  const { sold_by, branch_id, sold_at, payment_method, charge_type, sale_price } = req.body;

  if (!sold_by)   return res.status(400).json({ error: 'Vendedor requerido' });
  if (!branch_id) return res.status(400).json({ error: 'Sucursal requerida' });

  // Cargar la factura con su contexto
  const { rows: invRows } = await db.query(
    'SELECT * FROM invoices WHERE id = $1',
    [req.params.id]
  );
  const inv = invRows[0];
  if (!inv) return res.status(404).json({ error: 'Factura no encontrada' });
  if (inv.sale_note_id || inv.inventory_id) {
    return res.status(409).json({ error: 'Esta factura ya tiene una venta vinculada' });
  }

  // Validar vendedor y sucursal
  const { rows: userRows } = await db.query(
    `SELECT id FROM users WHERE id = $1 AND active = true`, [sold_by]
  );
  if (!userRows[0]) return res.status(400).json({ error: 'Vendedor inválido' });

  const { rows: branchRows } = await db.query(
    `SELECT id FROM branches WHERE id = $1`, [branch_id]
  );
  if (!branchRows[0]) return res.status(400).json({ error: 'Sucursal inválida' });

  // Tipo de cobro — default inscripción (es lo más común)
  const VALID_CHARGES = ['inscripcion', 'completa', 'transferencia', 'sin_detalle'];
  const chType = VALID_CHARGES.includes(charge_type) ? charge_type : 'inscripcion';

  // Precio de la moto: si no viene, usar total de la factura como mejor aproximación
  const price = sale_price != null && sale_price !== ''
    ? parseInt(sale_price)
    : (parseInt(inv.total) || null);

  // Fecha de venta: si no viene, usar fecha de emisión de la factura
  const finalSoldAt = sold_at || inv.fecha_emision || new Date().toISOString().slice(0, 10);

  // ── Match con inventario por chasis ───────────────────────────────────────
  // Match por chasis: prioridad inventory (es la unidad real); si no hay match
  // ahí, buscamos en sales_notes (las reservas comerciales viven en esa tabla).
  // Lo importante es no duplicar: si ya existe una reserva con ese chasis, la
  // convertimos en venta — no creamos una segunda fila.
  let matchedInvUnit  = null;
  let matchedSaleNote = null;
  if (inv.chassis) {
    const chassisCanon = String(inv.chassis).replace(/\s+/g, '').toUpperCase();
    const { rows: invUnit } = await db.query(
      `SELECT * FROM inventory
        WHERE UPPER(REPLACE(chassis,' ','')) = $1
          AND status != 'vendida'
        LIMIT 1`,
      [chassisCanon]
    );
    if (invUnit[0]) {
      matchedInvUnit = invUnit[0];
    } else {
      // Buscar reserva existente como nota comercial (sin unidad de inventario)
      const { rows: noteRow } = await db.query(
        `SELECT * FROM sales_notes
          WHERE UPPER(REPLACE(chassis,' ','')) = $1
            AND status != 'vendida'
          ORDER BY created_at DESC
          LIMIT 1`,
        [chassisCanon]
      );
      if (noteRow[0]) matchedSaleNote = noteRow[0];
    }
  }

  // URL del PDF para guardar en doc_factura_cli — preferir Drive viewer
  // por sobre Cloudinary raw (que no tiene extensión .pdf y el browser
  // muestra texto basura).
  const facturaPdfUrl = inv.drive_file_id
    ? `https://drive.google.com/file/d/${inv.drive_file_id}/view`
    : (inv.pdf_url || null);

  // Resolver model_id del catálogo a partir de brand/model del invoice (best effort).
  // Si no matchea, queda null — no es bloqueante.
  let resolvedModelId = inv.model_id || null;
  if (!resolvedModelId && matchedInvUnit?.model_id) {
    resolvedModelId = matchedInvUnit.model_id;
  }
  if (!resolvedModelId && inv.brand && inv.model) {
    const { rows: modelRows } = await db.query(
      `SELECT id FROM moto_models
       WHERE LOWER(brand) = LOWER($1) AND LOWER(model) = LOWER($2)
       LIMIT 1`,
      [inv.brand, inv.model]
    );
    resolvedModelId = modelRows[0]?.id || null;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    let sale = null;
    let linkField = null;   // 'inventory_id' | 'sale_note_id'
    let linkId    = null;

    if (matchedInvUnit) {
      // ── Camino A: venta sobre unidad real del inventario ──────────────────
      const prevStatus = matchedInvUnit.status;
      const { rows: updatedInv } = await client.query(
        `UPDATE inventory SET
           status='vendida', sold_at=$1, sold_by=$2, ticket_id=$3,
           payment_method=$4, sale_type=$5, sale_notes=$6,
           sale_price=$7, client_name=$8, client_rut=$9,
           charge_type=$10, delivered=true,
           doc_factura_cli=COALESCE(doc_factura_cli, $11),
           branch_id=$12, updated_at=NOW()
         WHERE id=$13 RETURNING *`,
        [
          finalSoldAt, sold_by, inv.lead_id || null,
          payment_method || null, chType,
          `Creada desde Contabilidad — factura Nº ${inv.folio || inv.id}`,
          price,
          inv.cliente_nombre || null,
          inv.rut_cliente    || null,
          chType,
          facturaPdfUrl,
          branch_id,
          matchedInvUnit.id,
        ]
      );
      sale = updatedInv[0];

      // Log en inventory_history para trazabilidad
      await client.query(
        `INSERT INTO inventory_history
           (inventory_id, event_type, from_status, to_status, user_id, note, metadata)
         VALUES ($1,'sold',$2,'vendida',$3,$4,$5)`,
        [matchedInvUnit.id, prevStatus, req.user.id,
         `Venta creada desde Contabilidad (factura Nº ${inv.folio || inv.id})`,
         JSON.stringify({ invoice_id: inv.id, sold_by, sale_price: price })]
      );

      linkField = 'inventory_id';
      linkId    = matchedInvUnit.id;
    } else if (matchedSaleNote) {
      // ── Camino B: existe una reserva en sales_notes → convertir a venta ───
      // Mantiene el id original (no duplica), preserva el seller si el admin
      // no eligió otro distinto.
      const { rows: updatedNote } = await client.query(
        `UPDATE sales_notes SET
           status='vendida', sold_at=$1, sold_by=$2, branch_id=$3, ticket_id=COALESCE(ticket_id,$4),
           payment_method=$5, sale_type=$6, charge_type=$7,
           sale_notes=COALESCE(NULLIF(sale_notes,''), $8),
           sale_price=COALESCE($9, sale_price),
           client_name=COALESCE(NULLIF(client_name,''), $10),
           client_rut=COALESCE(NULLIF(client_rut,''),  $11),
           model_id=COALESCE(model_id, $12),
           delivered=true,
           doc_factura_cli=COALESCE(doc_factura_cli, $13),
           updated_at=NOW()
         WHERE id=$14 RETURNING *`,
        [
          finalSoldAt, sold_by, branch_id, inv.lead_id || null,
          payment_method || null, chType, chType,
          `Convertida en venta desde Contabilidad — factura Nº ${inv.folio || inv.id}`,
          price,
          inv.cliente_nombre || null,
          inv.rut_cliente    || null,
          resolvedModelId,
          facturaPdfUrl,
          matchedSaleNote.id,
        ]
      );
      sale = updatedNote[0];
      linkField = 'sale_note_id';
      linkId    = matchedSaleNote.id;
    } else {
      // ── Camino C: no hay match en ningún lado → nota de venta nueva ───────
      const { rows: saleRows } = await client.query(
        `INSERT INTO sales_notes (
           status, branch_id, year, brand, model, color, chassis, motor_num, price,
           sold_at, sold_by, ticket_id,
           payment_method, sale_type, sale_notes,
           sale_price, client_name, client_rut, created_by, model_id,
           charge_type, delivered, doc_factura_cli
         ) VALUES (
           'vendida', $1, $2, $3, $4, $5, $6, $7, $8,
           $9, $10, $11,
           $12, $13, $14,
           $15, $16, $17, $18, $19,
           $20, true, $21
         ) RETURNING *`,
        [
          branch_id,
          inv.commercial_year || null,
          (inv.brand || '').trim().toUpperCase() || null,
          (inv.model || '').trim().toUpperCase() || null,
          inv.color  || null,
          inv.chassis ? inv.chassis.trim().toUpperCase() : null,
          inv.motor_num || null,
          price,
          finalSoldAt,
          sold_by,
          inv.lead_id || null,
          payment_method || null,
          chType,
          `Creada desde Contabilidad — factura Nº ${inv.folio || inv.id}`,
          price,
          inv.cliente_nombre || null,
          inv.rut_cliente    || null,
          req.user.id,
          resolvedModelId,
          chType,
          facturaPdfUrl,
        ]
      );
      sale = saleRows[0];

      linkField = 'sale_note_id';
      linkId    = sale.id;
    }

    // Vincular la factura a la venta (inventory o sales_notes)
    await client.query(
      `UPDATE invoices
         SET ${linkField} = $1,
             link_status  = 'vinculada',
             updated_at   = NOW()
       WHERE id = $2`,
      [linkId, inv.id]
    );

    await client.query('COMMIT');

    // Respuesta enriquecida con el invoice actualizado
    const { rows: updatedInv } = await db.query(
      `SELECT i.*,
              sn.brand  AS sn_brand,  sn.model  AS sn_model,  sn.sold_at,
              invu.brand AS inv_brand, invu.model AS inv_model, invu.chassis AS inv_chassis, invu.status AS inv_status
         FROM invoices i
         LEFT JOIN sales_notes sn   ON sn.id  = i.sale_note_id
         LEFT JOIN inventory   invu ON invu.id = i.inventory_id
        WHERE i.id = $1`,
      [inv.id]
    );
    res.status(201).json({
      sale,
      invoice: updatedInv[0],
      linked_to: matchedInvUnit ? 'inventory' : (matchedSaleNote ? 'sales_notes_existing' : 'sales_notes_new'),
    });
  } catch (e) {
    await client.query('ROLLBACK');
    logger.error({ err: e }, '[Accounting/create-sale]');
    res.status(500).json({ error: 'Error al crear venta desde factura: ' + e.message });
  } finally {
    client.release();
  }
}));

// ─── DELETE /api/accounting/:id ───────────────────────────────────────────────
router.delete('/:id', roleCheck('super_admin'), asyncHandler(async (req, res) => {
    const { rows } = await db.query('DELETE FROM invoices WHERE id=$1 RETURNING id', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'No encontrada' });
    res.json({ ok: true });
}));

// ─── POST /api/accounting/relink ────────────────────────────────────────────
// Re-corre el cruce automático para todas las facturas sin_vincular o
// revisar SIN re-bajar nada del Drive. Útil cuando:
// — la unidad se cargó al inventario después de subida la factura,
// — el chasis tenía un guion/punto que ahora el matcher tolerante captura,
// — se ajustó manualmente el RUT del cliente.
router.post('/relink', roleCheck(...ADMIN_ROLES), asyncHandler(async (req, res) => {
  const { rows: pending } = await db.query(
    `SELECT id, rut_cliente, chassis, brand, model
       FROM invoices
      WHERE source = 'emitida'
        AND link_status IN ('sin_vincular','revisar')
        AND (inventory_id IS NULL OR sale_note_id IS NULL OR lead_id IS NULL)`
  );

  let linked = 0;
  let updated = 0;
  for (const inv of pending) {
    const links = await resolveLinks({
      rut_cliente: inv.rut_cliente,
      chassis:     inv.chassis,
      brand:       inv.brand,
      model:       inv.model,
    });
    // Sólo escribimos si hay algo nuevo que aportar — COALESCE en SQL para
    // preservar vínculos manuales que un admin haya seteado.
    const { rowCount } = await db.query(
      `UPDATE invoices SET
         lead_id      = COALESCE(lead_id,      $1),
         inventory_id = COALESCE(inventory_id, $2),
         sale_note_id = COALESCE(sale_note_id, $3),
         link_status  = $4,
         updated_at   = NOW()
       WHERE id = $5`,
      [links.lead_id, links.inventory_id, links.sale_note_id, links.link_status, inv.id]
    );
    if (rowCount) updated++;
    if (links.inventory_id || links.sale_note_id || links.lead_id) linked++;
  }

  res.json({ scanned: pending.length, linked, updated });
}));

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
    const results = { created: 0, updated: 0, skipped: 0, deduped: 0, errors: [] };

    // ── Limpieza de duplicados previos ───────────────────────────────────────
    // Syncs anteriores crearon filas duplicadas por (source, folio, doc_type)
    // porque el match previo incluía rut_emisor (que el parser viejo a veces
    // dejaba NULL). Conservamos la fila "ganadora" por cada par — la que tiene
    // más campos rellenos (cliente, RUT, marca) y la más reciente como
    // desempate — y borramos el resto. Preserva los vínculos manuales (por eso
    // priorizamos tener lead_id/inventory_id).
    const dedupe = await db.query(`
      DELETE FROM invoices
      WHERE source = 'emitida'
        AND id IN (
          SELECT id FROM (
            SELECT id,
              ROW_NUMBER() OVER (
                PARTITION BY source, doc_type, folio
                ORDER BY
                  (cliente_nombre IS NOT NULL)::int DESC,
                  (rut_cliente    IS NOT NULL)::int DESC,
                  (brand          IS NOT NULL)::int DESC,
                  (lead_id        IS NOT NULL)::int DESC,
                  (inventory_id   IS NOT NULL)::int DESC,
                  updated_at DESC, created_at DESC
              ) AS rn
            FROM invoices
            WHERE source = 'emitida'
              AND folio IS NOT NULL
          ) x
          WHERE rn > 1
        )
    `);
    results.deduped = dedupe.rowCount || 0;

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

        // Match por (source, folio, doc_type) — el emisor en esta carpeta es
        // siempre Maosbike, así que folio+doc_type identifican el documento
        // inequívocamente. Incluir rut_emisor rompía el match cuando el
        // parser viejo lo dejaba NULL.
        const { rows: existing } = await db.query(
          `SELECT id FROM invoices
           WHERE source='emitida' AND folio=$1 AND doc_type=$2
           ORDER BY updated_at DESC LIMIT 1`,
          [parsed.folio, parsed.doc_type]
        );

        const links = await resolveLinks(parsed);

        // Resolver model_id: prioridad (1) inventory vinculado, (2) sale_note
        // vinculada, (3) resolución por brand+model sobre moto_models. Si nada
        // coincide queda NULL — la factura sale sin foto pero no bloquea.
        let modelId = null;
        if (links.inventory_id) {
          const r = await db.query(`SELECT model_id FROM inventory WHERE id=$1`, [links.inventory_id]);
          modelId = r.rows[0]?.model_id || null;
        }
        if (!modelId && links.sale_note_id) {
          const r = await db.query(`SELECT model_id FROM sales_notes WHERE id=$1`, [links.sale_note_id]);
          modelId = r.rows[0]?.model_id || null;
        }
        if (!modelId) {
          modelId = await resolveModelId(parsed.brand, parsed.model);
        }

        let invoiceId;
        if (existing[0]) {
          invoiceId = existing[0].id;
          await db.query(
            `UPDATE invoices SET
               doc_type=$1, category=$2,
               rut_emisor=COALESCE($3, rut_emisor),
               emisor_nombre=COALESCE($4, emisor_nombre),
               fecha_emision=$5, rut_cliente=$6, cliente_nombre=$7,
               cliente_direccion=$8, cliente_comuna=$9, cliente_giro=$10,
               monto_neto=$11, iva=$12, monto_exento=$13, total=$14,
               brand=$15, model=$16, color=$17, commercial_year=$18,
               motor_num=$19, chassis=$20, descripcion=$21,
               pdf_url=$22, drive_file_id=$23,
               lead_id=COALESCE(lead_id,$24),
               inventory_id=COALESCE(inventory_id,$25),
               sale_note_id=COALESCE(sale_note_id,$26),
               link_status=$27,
               ref_folio=$28, ref_rut_emisor=$29, ref_fecha=$30,
               ref_tipo=$31,
               notes=COALESCE(notes, $32),
               model_id=COALESCE($34, model_id),
               updated_at=NOW()
             WHERE id=$33`,
            [
              parsed.doc_type, parsed.category,
              parsed.rut_emisor, parsed.emisor_nombre,
              parsed.fecha_emision, parsed.rut_cliente, parsed.cliente_nombre,
              parsed.cliente_direccion, parsed.cliente_comuna, parsed.cliente_giro,
              parsed.monto_neto, parsed.iva, parsed.monto_exento, parsed.total,
              parsed.brand, parsed.model, parsed.color, parsed.commercial_year,
              parsed.motor_num, parsed.chassis, parsed.descripcion,
              pdf_url, file.id,
              links.lead_id, links.inventory_id, links.sale_note_id,
              links.link_status,
              parsed.ref_folio, parsed.ref_rut_emisor, parsed.ref_fecha,
              parsed.ref_tipo,
              parsed.notes,
              invoiceId,
              modelId,
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
               ref_folio, ref_rut_emisor, ref_fecha, ref_tipo,
               notes, model_id,
               created_by
             ) VALUES (
               $1,$2,$3,$4,$5,$6,
               $7,$8,$9,$10,
               $11,$12,
               $13,$14,$15,$16,
               $17,$18,$19,$20,$21,$22,$23,
               $24,$25,
               $26,$27,$28,$29,
               $30,$31,$32,$33,
               $34,$35,
               $36
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
              parsed.ref_folio, parsed.ref_rut_emisor, parsed.ref_fecha, parsed.ref_tipo,
              parsed.notes, modelId,
              req.user.id,
            ]
          );
          invoiceId = ins.rows[0].id;
          results.created++;
        }

        // NC con referencia → marcar la factura original como anulada SÓLO si
        // el tipo es 'anulacion'. Correcciones de datos / ajustes NO anulan.
        if (parsed.doc_type === 'nota_credito' && parsed.ref_folio) {
          if (parsed.ref_tipo === 'anulacion') {
            await db.query(
              `UPDATE invoices SET anulada_por_id=$1, updated_at=NOW()
               WHERE source='emitida' AND doc_type='factura'
                 AND folio=$2 AND ($3::text IS NULL OR rut_emisor=$3)`,
              [invoiceId, parsed.ref_folio, parsed.ref_rut_emisor || parsed.rut_emisor || null]
            );
          } else {
            // Limpieza retroactiva: si esta NC anteriormente había marcado la
            // factura como anulada (bug previo que trataba toda NC como
            // anulación), reviértelo ahora que sabemos que es corrección/ajuste.
            await db.query(
              `UPDATE invoices SET anulada_por_id=NULL, updated_at=NOW()
               WHERE anulada_por_id=$1`,
              [invoiceId]
            );
          }
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
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
