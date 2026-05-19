/**
 * rcv.js — cliente del Registro de Compras y Ventas (RCV) del SII.
 *
 * El RCV es la "contabilidad oficial" del contribuyente que ve el SII:
 *   · Facturas RECIBIDAS de proveedores (compras)
 *   · Facturas EMITIDAS por el contribuyente (ventas)
 *   · Notas de crédito/débito asociadas
 *   · Guías de despacho
 *
 * Endpoints internos (no oficialmente documentados pero estables):
 *   POST https://www4.sii.cl/rcvinternetui/services/data/facturasRecibidas/getDetalleContribuyente
 *   POST https://www4.sii.cl/rcvinternetui/services/data/facturasEmitidas/getDetalleContribuyente
 *
 * Tipos de documento DTE (códigos SII):
 *   33  — Factura electrónica afecta
 *   34  — Factura electrónica exenta
 *   39  — Boleta electrónica afecta
 *   41  — Boleta electrónica exenta
 *   52  — Guía de despacho electrónica
 *   56  — Nota de débito electrónica
 *   61  — Nota de crédito electrónica
 *
 * Auth: requieren cookie `TOKEN=xxx` (lo da auth.getToken()).
 */
const axios = require('axios');
const logger = require('../../config/logger');
const { getToken, invalidateToken } = require('./auth');

const RCV_BASE = 'https://www4.sii.cl/rcvinternetui/services/data';

const TIPOS_DTE = {
  FACTURA_AFECTA:    33,
  FACTURA_EXENTA:    34,
  GUIA_DESPACHO:     52,
  NOTA_DEBITO:       56,
  NOTA_CREDITO:      61,
};

// Estado de contabilización en el RCV. REGISTRO = todos los DTE recepcionados.
// PENDIENTE / NO_INCLUIR / RECLAMADO existen pero no nos interesan para sync.
const ESTADO_REGISTRO = 'REGISTRO';

/**
 * Normaliza un RUT chileno a { rut, dv } separados.
 * Acepta "76.405.840-2", "76405840-2", "76405840" (sin DV).
 *
 * @param {string} rutFull
 * @returns {{ rut: string, dv: string }}
 */
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

/**
 * POST a un endpoint del RCV con auth por cookie. Maneja 401/expirado token
 * con un solo retry refrescando el token.
 *
 * @param {string} pathUrl ruta relativa a RCV_BASE
 * @param {object} body payload JSON
 * @returns {Promise<any>} response.data del axios
 */
async function postRcv(pathUrl, body, attempt = 1) {
  const token = await getToken();
  const url = `${RCV_BASE}${pathUrl}`;
  try {
    const res = await axios.post(url, body, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        // El RCV exige cookie. Algunos endpoints también miran otros campos
        // (rutCompania, dvCompania) pero la prueba indica que con TOKEN basta
        // cuando el body manda rutEmpresa/dvEmpresa.
        'Cookie': `TOKEN=${token}`,
        'User-Agent': 'CRMaosBike/1.0',
        'Referer': 'https://www4.sii.cl/rcvinternetui/',
      },
      timeout: 60_000,
      // No tirar en 4xx para poder diagnosticar.
      validateStatus: () => true,
    });
    if (res.status === 401 && attempt === 1) {
      logger.warn('[sii.rcv] 401 — refrescando token y reintentando');
      invalidateToken();
      return postRcv(pathUrl, body, 2);
    }
    if (res.status >= 400) {
      const snippet = typeof res.data === 'string' ? res.data.slice(0, 400) : JSON.stringify(res.data).slice(0, 400);
      throw new Error(`SII RCV ${pathUrl} → HTTP ${res.status}: ${snippet}`);
    }
    return res.data;
  } catch (e) {
    if (attempt === 1 && e.code === 'ECONNRESET') {
      logger.warn('[sii.rcv] ECONNRESET — reintento único');
      return postRcv(pathUrl, body, 2);
    }
    throw e;
  }
}

/**
 * Lista los DTE recibidos (compras) del periodo dado para un tipo específico.
 * Hay que llamar una vez por cada tipo (33, 34, 56, 61, 52).
 *
 * @param {object} opts
 * @param {number} opts.year
 * @param {number} opts.month   1-12
 * @param {number} opts.tipoDoc código DTE (ver TIPOS_DTE)
 * @returns {Promise<Array>} lista de DTEs (shape SII, ver normalizeDte)
 */
async function listRecibidas({ year, month, tipoDoc }) {
  const { rut, dv } = getEmpresaRut();
  const body = {
    metaData: { namespace: 'cl.sii.sdi.lob.diii.consdcv.data.api.interfaces.FacadeService/getDetalleContribuyenteReq' },
    data: {
      rutEmisor: '',
      dvEmisor: '',
      ptributario: { rut, dv },
      pPeriodoMes: month,
      pPeriodoAnno: year,
      ptipoDoc: tipoDoc,
      pestadoContab: ESTADO_REGISTRO,
      operacion: 'COMPRA',
    },
  };
  const data = await postRcv('/facturasRecibidas/getDetalleContribuyente', body);
  return extractDetalle(data);
}

/**
 * Lista los DTE emitidos (ventas) del periodo dado para un tipo específico.
 *
 * @param {object} opts
 * @param {number} opts.year
 * @param {number} opts.month   1-12
 * @param {number} opts.tipoDoc código DTE
 * @returns {Promise<Array>}
 */
async function listEmitidas({ year, month, tipoDoc }) {
  const { rut, dv } = getEmpresaRut();
  const body = {
    metaData: { namespace: 'cl.sii.sdi.lob.diii.consdcv.data.api.interfaces.FacadeService/getDetalleContribuyenteReq' },
    data: {
      ptributario: { rut, dv },
      pPeriodoMes: month,
      pPeriodoAnno: year,
      ptipoDoc: tipoDoc,
      pestadoContab: ESTADO_REGISTRO,
      operacion: 'VENTA',
    },
  };
  const data = await postRcv('/facturasEmitidas/getDetalleContribuyente', body);
  return extractDetalle(data);
}

/**
 * El RCV devuelve un shape tipo:
 *   { data: { detalleDte: [...] }, respEstado: { codRespuesta: 0 } }
 * o
 *   { dataResp: [{ ... }] }
 * según el endpoint y versión. Centralizamos la extracción.
 */
function extractDetalle(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (payload.data && Array.isArray(payload.data.detalleDte)) return payload.data.detalleDte;
  if (Array.isArray(payload.dataResp)) return payload.dataResp;
  if (payload.dataResp && Array.isArray(payload.dataResp.detalleDte)) return payload.dataResp.detalleDte;
  logger.warn({ keys: Object.keys(payload), sample: JSON.stringify(payload).slice(0, 300) }, '[sii.rcv] shape de respuesta inesperado');
  return [];
}

/**
 * Normaliza una fila del RCV al shape de la tabla invoices.
 * Los nombres de campos del SII varían según versión del endpoint; cubrimos
 * los más comunes con fallbacks.
 *
 * @param {object} row fila del SII (un DTE)
 * @param {'emitida'|'recibida'} source
 * @returns {object} fila lista para insertar en invoices
 */
function normalizeDte(row, source) {
  // Campos típicos del RCV:
  //   detDteTipo / dhdrTipoDoc       → tipo DTE (33, 34, 56, 61, 52)
  //   detFolio  / dhdrFolio          → folio
  //   detRutDoc / dhdrRutContribuyente → RUT de la contraparte
  //   detRznSoc / dhdrRsnSocial      → razón social contraparte
  //   detFchDoc / dhdrFchEmis        → fecha emisión "YYYY-MM-DD" o "DD/MM/YYYY"
  //   detMntNeto, detMntIva, detMntTotal, detMntExe → montos
  const tipoDte =
    row.detTipoDoc ?? row.dhdrTipoDoc ?? row.tipoDoc ?? row.detDteTipo ?? null;
  const folio = String(row.detFolio ?? row.dhdrFolio ?? row.folio ?? '').trim();
  const rutContraparte = String(
    row.detRutDoc ?? row.dhdrRutContribuyente ?? row.rutDoc ?? row.rutContraparte ?? ''
  ).trim();
  const dvContraparte = String(row.detDvDoc ?? row.dhdrDvDoc ?? row.dvDoc ?? '').trim();
  const rutContraparteFull = rutContraparte
    ? (dvContraparte ? `${rutContraparte}-${dvContraparte}` : rutContraparte)
    : null;
  const razonSocial =
    row.detRznSoc ?? row.dhdrRsnSocial ?? row.razonSocial ?? row.rsnSocial ?? null;
  const fechaRaw =
    row.detFchDoc ?? row.dhdrFchEmis ?? row.fechaEmision ?? row.fchEmis ?? null;

  // Fecha → YYYY-MM-DD. El RCV a veces devuelve "DD/MM/YYYY".
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

  // Quién es el emisor y quién el receptor cambia según source:
  //  · source=emitida → emisor es nosotros (MAOSBike), receptor es la contraparte.
  //  · source=recibida → emisor es la contraparte (proveedor), receptor es nosotros.
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
    // _raw para debugging si algo no cuadra
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
  postRcv,
};
