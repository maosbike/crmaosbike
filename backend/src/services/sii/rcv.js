/**
 * rcv.js — cliente del Registro de Compras y Ventas (RCV) del SII.
 *
 * Endpoint correcto (corregido tras el 404 de la versión anterior):
 *   POST https://www4.sii.cl/consdcvinternetui/services/data/facadeService/{method}
 *
 * Métodos relevantes:
 *   · getResumen              — resumen agregado por tipo de DTE del periodo
 *   · getDetalleCompra        — listado de compras (recibidas) de un tipoDoc
 *   · getDetalleVenta         — listado de ventas (emitidas) de un tipoDoc
 *   · getDetalleCompraExport  — variante "export" (flat, ideal para descargar)
 *   · getDetalleVentaExport   — idem para ventas
 *
 * Body shape (importante: campos cambiaron respecto a la versión anterior):
 *   {
 *     "metaData": {
 *       "conversationId": "<token>",
 *       "namespace": "cl.sii.sdi.lob.diii.consdcv.data.api.interfaces.FacadeService/<method>",
 *       "page": null,
 *       "transactionId": "0"
 *     },
 *     "data": {
 *       "rutEmisor": "76405840",
 *       "dvEmisor": "2",
 *       "ptributario": "202604",      ← YYYYMM como STRING, no objeto anidado
 *       "codTipoDoc": 33,
 *       "operacion": "COMPRA"|"VENTA",
 *       "estadoContab": "REGISTRO"
 *     }
 *   }
 *
 * Tipos de documento DTE (códigos SII):
 *   33 — Factura electrónica afecta
 *   34 — Factura electrónica exenta
 *   39 — Boleta afecta
 *   41 — Boleta exenta
 *   52 — Guía de despacho electrónica
 *   56 — Nota de débito electrónica
 *   61 — Nota de crédito electrónica
 *
 * Auth: cookie `TOKEN=xxx` (lo da auth.getToken()). Además el token se pasa
 * como `conversationId` en el body — algunos servicios lo validan ahí.
 */
const axios = require('axios');
const logger = require('../../config/logger');
const { getToken, invalidateToken } = require('./auth');

const RCV_BASE = 'https://www4.sii.cl/consdcvinternetui/services/data/facadeService';
const NS_PREFIX = 'cl.sii.sdi.lob.diii.consdcv.data.api.interfaces.FacadeService';

const TIPOS_DTE = {
  FACTURA_AFECTA:    33,
  FACTURA_EXENTA:    34,
  GUIA_DESPACHO:     52,
  NOTA_DEBITO:       56,
  NOTA_CREDITO:      61,
};

const ESTADO_REGISTRO = 'REGISTRO';

function splitRut(rutFull) {
  if (!rutFull) throw new Error('RUT vacío');
  const clean = String(rutFull).replace(/\./g, '').replace(/\s/g, '').toUpperCase();
  const [rut, dv] = clean.split('-');
  if (!rut || !dv) throw new Error(`RUT inválido (esperaba XX-DV): ${rutFull}`);
  return { rut: rut.trim(), dv: dv.trim() };
}

function getEmpresaRut() {
  const raw = process.env.SII_EMPRESA_RUT;
  if (!raw) throw new Error('SII_EMPRESA_RUT no configurada');
  return splitRut(raw);
}

function periodoYYYYMM(year, month) {
  return `${year}${String(month).padStart(2, '0')}`;
}

/**
 * POST a un método del facadeService con auth por cookie + conversationId.
 * Maneja 401 → invalida token y reintenta una vez.
 *
 * @param {string} method nombre del método del facadeService (ej "getDetalleCompraExport")
 * @param {object} dataBody el bloque `data` del body
 * @returns {Promise<any>}
 */
async function callFacade(method, dataBody, attempt = 1) {
  const token = await getToken();
  const url = `${RCV_BASE}/${method}`;
  const body = {
    metaData: {
      conversationId: token,
      namespace: `${NS_PREFIX}/${method}`,
      page: null,
      transactionId: '0',
    },
    data: dataBody,
  };
  let res;
  try {
    res = await axios.post(url, body, {
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'Accept': 'application/json, text/plain, */*',
        'Cookie': `TOKEN=${token}`,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 CRMaosBike/1.0',
        'Referer': 'https://www4.sii.cl/consdcvinternetui/',
        'Origin': 'https://www4.sii.cl',
      },
      timeout: 60_000,
      validateStatus: () => true,
    });
  } catch (e) {
    if (attempt === 1 && (e.code === 'ECONNRESET' || e.code === 'ETIMEDOUT')) {
      logger.warn({ method, code: e.code }, '[sii.rcv] error de red, reintento único');
      return callFacade(method, dataBody, 2);
    }
    throw e;
  }
  if (res.status === 401 && attempt === 1) {
    logger.warn({ method }, '[sii.rcv] 401 — refrescando token y reintentando');
    invalidateToken();
    return callFacade(method, dataBody, 2);
  }
  if (res.status >= 400) {
    const snippet = typeof res.data === 'string' ? res.data.slice(0, 400) : JSON.stringify(res.data).slice(0, 400);
    throw new Error(`SII facadeService/${method} → HTTP ${res.status}: ${snippet}`);
  }
  return res.data;
}

/**
 * Lista los DTE recibidos (compras) del periodo dado para un tipo específico.
 *
 * @param {{year:number, month:number, tipoDoc:number}} opts
 * @returns {Promise<Array>}
 */
async function listRecibidas({ year, month, tipoDoc }) {
  const { rut, dv } = getEmpresaRut();
  const data = {
    rutEmisor: rut,
    dvEmisor: dv,
    ptributario: periodoYYYYMM(year, month),
    codTipoDoc: tipoDoc,
    operacion: 'COMPRA',
    estadoContab: ESTADO_REGISTRO,
  };
  const resp = await callFacade('getDetalleCompraExport', data);
  return extractDetalle(resp);
}

/**
 * Lista los DTE emitidos (ventas) del periodo dado para un tipo específico.
 *
 * @param {{year:number, month:number, tipoDoc:number}} opts
 * @returns {Promise<Array>}
 */
async function listEmitidas({ year, month, tipoDoc }) {
  const { rut, dv } = getEmpresaRut();
  const data = {
    rutEmisor: rut,
    dvEmisor: dv,
    ptributario: periodoYYYYMM(year, month),
    codTipoDoc: tipoDoc,
    operacion: 'VENTA',
    estadoContab: ESTADO_REGISTRO,
  };
  const resp = await callFacade('getDetalleVentaExport', data);
  return extractDetalle(resp);
}

/**
 * Las respuestas del facadeService pueden venir en varios shapes:
 *   - { data: [ ... ] }
 *   - { data: { detRows: [...] } }
 *   - { dataResp: [ ... ] }
 *   - directamente Array si es Export
 * Cubrimos los más comunes y logueamos los desconocidos para iterar.
 */
function extractDetalle(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (payload.data && Array.isArray(payload.data.detRows)) return payload.data.detRows;
  if (payload.data && Array.isArray(payload.data.detalleDte)) return payload.data.detalleDte;
  if (Array.isArray(payload.dataResp)) return payload.dataResp;
  if (payload.dataResp && Array.isArray(payload.dataResp.detRows)) return payload.dataResp.detRows;
  if (payload.dataResp && Array.isArray(payload.dataResp.detalleDte)) return payload.dataResp.detalleDte;
  // Algunos endpoints devuelven `{respEstado: {...}, data: null}` cuando no
  // hay filas en ese periodo+tipoDoc; eso NO es un error.
  if (payload.respEstado && payload.data == null) return [];
  if (payload.data == null && payload.dataResp == null) {
    logger.warn({ keys: Object.keys(payload), sample: JSON.stringify(payload).slice(0, 300) }, '[sii.rcv] shape inesperado, asumo vacío');
    return [];
  }
  logger.warn({ keys: Object.keys(payload), sample: JSON.stringify(payload).slice(0, 300) }, '[sii.rcv] shape de respuesta inesperado');
  return [];
}

/**
 * Normaliza una fila del RCV al shape para upsert en `invoices`.
 *
 * Los nombres de campo de la variante Export son distintos a la "normal":
 *   detNroDoc / dhdrNroDoc       → folio
 *   detFchDoc / dhdrFchEmis      → fecha
 *   detRutDoc / dhdrRutDoc       → RUT contraparte (solo número, sin DV)
 *   detDvDoc  / dhdrDvDoc        → DV de la contraparte
 *   detRznSoc / dhdrRsnSocial    → razón social
 *   detMntNeto, detMntIva, detMntExe, detMntTotal
 *   detTipoDoc / dhdrTipoDoc     → tipo DTE
 *
 * @param {object} row fila del SII (un DTE)
 * @param {'emitida'|'recibida'} source
 * @returns {object}
 */
function normalizeDte(row, source) {
  const tipoDte =
    row.detTipoDoc ?? row.dhdrTipoDoc ?? row.tipoDoc ?? row.detDteTipo ?? null;
  const folio = String(
    row.detNroDoc ?? row.dhdrNroDoc ?? row.detFolio ?? row.dhdrFolio ?? row.folio ?? ''
  ).trim();
  const rutContraparte = String(
    row.detRutDoc ?? row.dhdrRutDoc ?? row.detRutContrib ?? row.rutDoc ?? row.rutContraparte ?? ''
  ).trim();
  const dvContraparte = String(
    row.detDvDoc ?? row.dhdrDvDoc ?? row.detDvContrib ?? row.dvDoc ?? ''
  ).trim();
  const rutContraparteFull = rutContraparte
    ? (dvContraparte ? `${rutContraparte}-${dvContraparte}` : rutContraparte)
    : null;
  const razonSocial =
    row.detRznSoc ?? row.dhdrRsnSocial ?? row.razonSocial ?? row.rsnSocial ?? null;
  const fechaRaw =
    row.detFchDoc ?? row.dhdrFchEmis ?? row.fechaEmision ?? row.fchEmis ?? null;

  let fechaIso = null;
  if (fechaRaw) {
    const s = String(fechaRaw);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) fechaIso = s.slice(0, 10);
    else if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
      const [d, m, y] = s.split('/');
      fechaIso = `${y}-${m}-${d}`;
    }
  }

  const neto = toInt(row.detMntNeto ?? row.dhdrMntNeto ?? row.mntNeto ?? row.montoNeto);
  const iva = toInt(row.detMntIva ?? row.dhdrMntIVA ?? row.mntIva ?? row.iva);
  const exento = toInt(row.detMntExe ?? row.dhdrMntExento ?? row.mntExento ?? 0);
  const total = toInt(row.detMntTotal ?? row.dhdrMntTotal ?? row.mntTotal ?? row.total);

  const docType = mapDocType(tipoDte);

  let rut_emisor, emisor_nombre, rut_cliente, cliente_nombre;
  if (source === 'emitida') {
    rut_emisor = process.env.SII_EMPRESA_RUT || null;
    emisor_nombre = 'MAOSBIKE';
    rut_cliente = rutContraparteFull;
    cliente_nombre = razonSocial;
  } else {
    rut_emisor = rutContraparteFull;
    emisor_nombre = razonSocial;
    rut_cliente = process.env.SII_EMPRESA_RUT || null;
    cliente_nombre = 'MAOSBIKE';
  }

  return {
    source,
    doc_type: docType,
    tipo_dte: tipoDte,
    folio,
    rut_emisor,
    emisor_nombre,
    rut_cliente,
    cliente_nombre,
    fecha_emision: fechaIso,
    monto_neto: neto,
    iva,
    monto_exento: exento,
    total,
    _raw: row,
  };
}

function toInt(v) {
  if (v == null || v === '') return 0;
  const n = parseInt(String(v).replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function mapDocType(tipoDte) {
  switch (Number(tipoDte)) {
    case 33:
    case 34: return 'factura';
    case 56: return 'nota_debito';
    case 61: return 'nota_credito';
    case 52: return 'guia_despacho';
    case 39:
    case 41: return 'boleta';
    default: return 'factura';
  }
}

module.exports = {
  TIPOS_DTE,
  listRecibidas,
  listEmitidas,
  normalizeDte,
  splitRut,
  getEmpresaRut,
  callFacade,
};
