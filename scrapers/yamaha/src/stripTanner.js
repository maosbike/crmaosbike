// Saca las columnas de evaluación Tanner del Excel descargado de Yamaha.
// El usuario decidió que solo Autofin se importa al CRM.
//
// Si en el futuro quiere reactivar Tanner, basta con quitar las columnas de
// TANNER_COLS_TO_DROP — el CRM ya tiene aliases para ambos.

import xlsx from 'xlsx';
import path from 'node:path';
import os from 'node:os';

const TANNER_COLS_TO_DROP = [
  'pre_evaluacion_tanner',
  'evaluacion_tanner',
  'observaciones_evaluacion_tanner',
];

function normalize(header) {
  return (header ?? '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, ''); // quita tildes
}

export function stripTannerColumns(inputPath) {
  const wb = xlsx.readFile(inputPath);
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];

  // Convertimos a array of arrays para manipular columnas por índice.
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (rows.length === 0) {
    console.log('[strip] xlsx vacío, nada que limpiar');
    return inputPath;
  }

  const headers = rows[0].map(normalize);
  const dropSet = new Set(TANNER_COLS_TO_DROP.map(normalize));
  const keepIdx = headers.map((h, i) => (dropSet.has(h) ? null : i)).filter((i) => i !== null);

  const dropped = headers.length - keepIdx.length;
  if (dropped === 0) {
    console.log('[strip] no hay columnas Tanner para sacar (header no las contiene)');
    return inputPath;
  }

  const cleanRows = rows.map((row) => keepIdx.map((i) => row[i]));

  const newSheet = xlsx.utils.aoa_to_sheet(cleanRows);
  const newWb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(newWb, newSheet, sheetName);

  const outPath = path.join(os.tmpdir(), `yamaha-clean-${Date.now()}.xlsx`);
  xlsx.writeFile(newWb, outPath);
  console.log(`[strip] ${dropped} columnas Tanner removidas → ${outPath}`);
  return outPath;
}
