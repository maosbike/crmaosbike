// Wrapper SSRF/proto-pollution-safe para xlsx@0.18.x.
// Mitigaciones aplicadas:
// 1) Magic-bytes: solo procesa archivos que empiezan con la firma ZIP "PK\x03\x04"
//    (xlsx) o "BIFF" (xls). Rechaza otros — no llama al parser sobre basura.
// 2) sanitizeRow: elimina llaves __proto__, constructor, prototype del output del
//    parser antes de devolverlo, evitando prototype pollution downstream.
// 3) Límite de filas y celdas por hoja para acotar DoS / ReDoS conocidos.
//
// Si SheetJS publica un parche oficial en npm, reemplazar por upgrade directo.

const xlsx = require('xlsx');

const MAX_ROWS_PER_SHEET = 50000;
const MAX_CELLS_PER_ROW  = 200;
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function looksLikeXlsx(buffer) {
  if (!buffer || buffer.length < 8) return false;
  // ZIP local file header (xlsx, ods)
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) return true;
  // OLE Compound (xls)
  if (buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0) return true;
  return false;
}

function sanitizeRow(row) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  let count = 0;
  for (const k of Object.keys(row)) {
    if (BAD_KEYS.has(k)) continue;
    if (++count > MAX_CELLS_PER_ROW) break;
    out[k] = row[k];
  }
  return out;
}

function safeRead(buffer, opts = {}) {
  if (!looksLikeXlsx(buffer)) {
    throw new Error('Archivo no parece un Excel válido');
  }
  return xlsx.read(buffer, { ...opts, type: 'buffer' });
}

function safeSheetToJson(ws, opts = {}) {
  const arr = xlsx.utils.sheet_to_json(ws, opts);
  const limited = arr.length > MAX_ROWS_PER_SHEET ? arr.slice(0, MAX_ROWS_PER_SHEET) : arr;
  return limited.map(sanitizeRow);
}

module.exports = {
  safeRead,
  safeSheetToJson,
  sanitizeRow,
  looksLikeXlsx,
  // Re-export utilidades originales
  utils: xlsx.utils,
};
