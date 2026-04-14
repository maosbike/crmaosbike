// ─── Utilidades de formato y normalización — CRMaosBike (frontend) ────────────
//
// Centraliza el formateo de RUT, teléfono, montos, fechas y la normalización
// de texto libre (modelo, color, chasis). Evita que cada componente defina
// su propio helper y diverja.

export function stripAccents(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Texto normalizado para comparaciones: sin acentos, lowercase, trim.
export function normalizeText(s) {
  return stripAccents(String(s || '')).trim().toLowerCase();
}

// Modelo / marca: colapsa espacios, upper. Para inserción/display canónico.
export function normalizeModel(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().toUpperCase();
}

// Color: colapsa espacios, upper. Para inserción canónica.
export function normalizeColor(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().toUpperCase();
}

// Chasis: sin espacios, upper.
export function normalizeChassis(s) {
  return String(s || '').replace(/\s+/g, '').toUpperCase();
}

// RUT canónico para matching: sin puntos ni guion, uppercase.
export function normalizeRut(raw) {
  return String(raw || '').replace(/\./g, '').replace(/-/g, '').toUpperCase().trim();
}

// RUT con guion antes del dígito verificador. "163459779" → "16345977-9"
export function formatRut(raw) {
  if (!raw) return '';
  const s = String(raw).replace(/\./g, '').trim();
  if (s.includes('-')) return s.toUpperCase();
  if (s.length < 2) return s.toUpperCase();
  return (s.slice(0, -1) + '-' + s.slice(-1)).toUpperCase();
}

// Teléfono chileno: dígitos + strip prefijo 56.
export function formatPhone(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.length === 11 && digits.startsWith('56')) return digits.slice(2);
  return digits;
}

// "1.500.000" → 1500000 | "$ 2.205.800" → 2205800
export function parseMoney(val) {
  if (val == null || val === '') return null;
  const cleaned = String(val).replace(/\./g, '').replace(/,(\d{2})$/, '').replace(/[$,\s]/g, '').trim();
  const n = parseInt(cleaned, 10);
  return isNaN(n) ? null : n;
}

// Formateo canónico de montos chilenos
export const fmt = (n) => n ? '$' + Number(n).toLocaleString('es-CL') : '$0';

export const fD = (d) => d
  ? new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
  : '-';

export const fDT = (d) => d
  ? new Date(d).toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  : '-';

// Humaniza un delta de tiempo: "3min", "2h", "5d".
export const ago = (d) => {
  if (!d) return '';
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 6e4);
  if (m < 60) return m + 'min';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h';
  return Math.floor(h / 24) + 'd';
};
