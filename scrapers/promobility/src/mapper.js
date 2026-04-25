// Mapper Promobility → formato compatible con /api/import del CRM.
//
// Promobility exporta columnas ligeramente distintas y con formatos sucios:
//   - Tel: "+56 +56938413403" (prefijo +56 duplicado, bug del export)
//   - Rut: mezcla "20.418.135-7" con puntos, "22026627-3" sin puntos, "---" vacío
//   - Modelo: "GIXXER 150 FI -" con trailing " -"
//   - Sucursal: "Maos Bike Plaza Sur" — el resolveBranch del CRM no la matchea
//
// Este mapper escribe un xlsx limpio con headers que el CRM SÍ entiende:
//   nombre, rut, email, telefono, modelo, fuente, sucursal, vendedor

import xlsx from 'xlsx';
import path from 'node:path';
import os from 'node:os';

// "Maos Bike Plaza Sur" / "Maos Racing Mall Plaza Sur" / variantes → MPS
// "Maos Bike Plaza Norte" / "Maos Racing Mall Plaza Norte" / variantes → MPN
// "Maos Bike Movicenter" → MPN (decisión ya tomada por el CRM)
function normalizeSucursal(raw) {
  if (!raw) return '';
  const s = raw.toString().toLowerCase();
  if (s.includes('movicenter')) return 'MPN';
  if (s.includes('norte')) return 'MPN';
  if (s.includes('sur')) return 'MPS';
  // Fallback: dejar el string original — el CRM intentará resolveBranch.
  return raw;
}

// "+56 +56938413403" → "+56938413403"
// "+56938413403" → "+56938413403"
// "938413403" → "+56938413403"
function normalizeTel(raw) {
  if (!raw) return '';
  let s = raw.toString().replace(/\s+/g, '').trim();
  // Quita prefijo duplicado "+56+56" o "+56 +56"
  s = s.replace(/^\+56\+56/, '+56');
  // Si no empieza con +, asume que es un local chileno y agrega +56.
  if (!s.startsWith('+')) {
    // Limpia caracteres no numéricos.
    const digits = s.replace(/\D/g, '');
    s = `+56${digits}`;
  }
  return s;
}

// "20.418.135-7" → "20418135-7"
// "---" → ""
// "22026627-3" → "22026627-3"
function normalizeRut(raw) {
  if (!raw) return '';
  const s = raw.toString().trim();
  if (s === '---' || s === '-' || s === '') return '';
  return s.replace(/\./g, '');
}

// "Suzuki" + "GIXXER 150 FI -" → "Suzuki GIXXER 150 FI"
function joinModelo(marca, modelo) {
  const m = (modelo || '').toString().replace(/\s*-\s*$/, '').trim();
  const b = (marca || '').toString().trim();
  if (b && m) return `${b} ${m}`;
  return m || b;
}

// "Web" → "web", "Campaña" → "campania"
// El CRM acepta web/redes_sociales/whatsapp/presencial/referido/evento/llamada/importacion.
// "Campaña" no matchea → la mapeamos a "redes_sociales" (campañas digitales suelen ser FB Ads).
function normalizeOrigen(raw) {
  if (!raw) return '';
  const s = raw.toString().toLowerCase().trim();
  if (s === 'web') return 'web';
  if (s.startsWith('campa')) return 'redes_sociales';
  return s;
}

export function mapPromobilityXlsx(inputPath) {
  const wb = xlsx.readFile(inputPath);
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];

  // Leemos como array of objects con la primera fila como headers.
  const rawRows = xlsx.utils.sheet_to_json(sheet, { defval: '' });

  if (rawRows.length === 0) {
    console.log('[mapper] xlsx vacío');
    return inputPath;
  }

  // Mapeamos cada fila al shape del CRM. El CRM ya entiende estos headers
  // vía COL_ALIASES en backend/src/routes/import.js.
  const cleanRows = rawRows.map((row) => ({
    nombre: (row['Nombre'] || '').toString().trim(),
    rut: normalizeRut(row['Rut']),
    email: (row['Email'] || '').toString().trim(),
    telefono: normalizeTel(row['Tel']),
    modelo: joinModelo(row['Marca'], row['Modelo']),
    fuente: normalizeOrigen(row['Origen']),
    sucursal: normalizeSucursal(row['Sucursal']),
    vendedor: (row['Vendedor'] || '').toString().trim(), // referencia, CRM no lo usa para asignar
  }));

  // Filtramos filas vacías (sin nombre o sin contacto).
  const filtered = cleanRows.filter((r) => r.nombre && (r.email || r.telefono));
  console.log(`[mapper] ${rawRows.length} filas → ${filtered.length} válidas tras normalizar`);

  // Escribimos un nuevo xlsx con headers compatibles.
  const newSheet = xlsx.utils.json_to_sheet(filtered);
  const newWb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(newWb, newSheet, 'Leads');

  const outPath = path.join(os.tmpdir(), `promobility-clean-${Date.now()}.xlsx`);
  xlsx.writeFile(newWb, outPath);
  console.log(`[mapper] xlsx normalizado → ${outPath}`);
  return outPath;
}
