/**
 * Utilidades de normalización — CRMaosBike
 *
 * Centralizan el parseo de RUT, teléfono chileno, montos, fechas, modelos,
 * colores, chasis y motor para que cualquier punto del backend (importers,
 * extractor PDF, rutas CRUD) use la misma lógica y no diverja.
 */

// ─── Texto base ───────────────────────────────────────────────────────────────

function stripAccents(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeText(s) {
  return stripAccents(String(s || '')).trim().toLowerCase();
}

// ─── RUT chileno ──────────────────────────────────────────────────────────────

// Sin puntos ni guion, uppercase. "16.345.977-9" → "163459779"
function normalizeRut(raw) {
  if (raw == null) return '';
  return String(raw).replace(/\./g, '').replace(/-/g, '').toUpperCase().trim();
}

// Con guion antes del dígito verificador. "163459779" → "16345977-9"
function formatRut(raw) {
  if (raw == null) return '';
  const s = String(raw).replace(/\./g, '').trim();
  if (s.includes('-')) return s.toUpperCase();
  if (s.length < 2) return s.toUpperCase();
  return (s.slice(0, -1) + '-' + s.slice(-1)).toUpperCase();
}

// Validación módulo 11. Devuelve true si el dígito verificador coincide.
// Uso: warning no bloqueante en importers.
function validateRut(raw) {
  const n = normalizeRut(raw);
  if (!/^\d{6,8}[0-9K]$/.test(n)) return false;
  const body = n.slice(0, -1);
  const dv   = n.slice(-1);
  let sum = 0, mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i], 10) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const res  = 11 - (sum % 11);
  const expected = res === 11 ? '0' : res === 10 ? 'K' : String(res);
  return dv === expected;
}

// ─── Teléfono chileno ─────────────────────────────────────────────────────────

// "+56 9 1234 5678" → "912345678" | "56912345678" → "912345678"
function normalizePhone(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.length === 11 && digits.startsWith('56')) return digits.slice(2);
  return digits;
}

// ─── Montos ───────────────────────────────────────────────────────────────────

// "1.500.000" → 1500000 | "$ 2.205.800" → 2205800
function parseChileanInt(val) {
  if (val == null || val === '') return null;
  const cleaned = String(val).replace(/\./g, '').replace(/,(\d{2})$/, '').replace(/[$,\s]/g, '').trim();
  const n = parseInt(cleaned, 10);
  return isNaN(n) ? null : n;
}

function fmtMoney(n) {
  return n != null && n !== '' ? '$' + Number(n).toLocaleString('es-CL') : '$0';
}

// ─── Fecha ──────────────────────────────────────────────────────────────────

const MESES_ES = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

// Acepta mes como número ("03") o como texto ES ("marzo"/"Marzo").
function toISODate(d, m, y) {
  if (!d || !m || !y) return null;
  const mm = isNaN(parseInt(m)) ? MESES_ES[String(m).toLowerCase()] : parseInt(m);
  if (!mm) return null;
  return `${y}-${String(mm).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// ─── Motocicleta ────────────────────────────────────────────────────────────

// Quita espacios internos y pasa a upper — para inserción canónica.
function normalizeChassis(s) {
  return String(s || '').replace(/\s+/g, '').toUpperCase();
}

// Colapsa espacios internos + upper. Quita artefactos comunes de PDF ("FZN- 155" → "FZN-155").
function normalizeModel(s) {
  if (!s) return '';
  return String(s).replace(/\s+/g, ' ').trim().toUpperCase();
}

// Colapsa espacios + upper (preserva acentos).
function normalizeColor(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().toUpperCase();
}

module.exports = {
  stripAccents,
  normalizeText,
  normalizeRut,
  formatRut,
  validateRut,
  normalizePhone,
  parseChileanInt,
  fmtMoney,
  toISODate,
  normalizeChassis,
  normalizeModel,
  normalizeColor,
};
