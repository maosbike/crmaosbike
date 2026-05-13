/**
 * crmClient.js — cliente HTTP del CRM.
 * Auth: header X-Internal-Token contra INTERNAL_API_TOKEN del backend.
 */
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');

const BASE = process.env.CRM_BASE_URL?.replace(/\/+$/, '');
const TOKEN = process.env.CRM_INTERNAL_TOKEN;

if (!BASE) throw new Error('CRM_BASE_URL no configurado');
if (!TOKEN || TOKEN.length < 32) {
  throw new Error('CRM_INTERNAL_TOKEN no configurado o muy corto (min 32 chars)');
}

const client = axios.create({
  baseURL: BASE,
  headers: { 'X-Internal-Token': TOKEN },
  timeout: 60_000,
});

/**
 * Pregunta al CRM qué folios ya tiene para un source dado.
 * @param {'emitida'|'recibida'} source
 * @param {string[]} folios
 * @returns {Promise<Set<string>>}
 */
async function getExistingFolios(source, folios) {
  if (!folios.length) return new Set();
  // Lotes de 200 para no superar el límite de URL.
  const present = new Set();
  for (let i = 0; i < folios.length; i += 200) {
    const chunk = folios.slice(i, i + 200);
    const r = await client.get('/ingest/check', {
      params: { source, folios: chunk.join(',') },
    });
    (r.data?.present || []).forEach(f => present.add(String(f)));
  }
  return present;
}

/**
 * Sube un PDF al CRM. El CRM lo parsea con Claude y hace UPSERT.
 * @param {string} pdfPath  ruta local del PDF
 * @param {'emitida'|'recibida'} source
 * @param {string} folio    folio que pone el scraper (acelera el dedupe)
 * @returns {Promise<{status: 'created'|'updated'|'skipped', invoice_id: string, folio: string}>}
 */
async function uploadInvoice(pdfPath, source, folio) {
  const form = new FormData();
  form.append('file', fs.createReadStream(pdfPath), { filename: `${folio}.pdf`, contentType: 'application/pdf' });
  form.append('source', source);
  if (folio) form.append('folio', folio);

  const r = await client.post('/ingest/invoice', form, {
    headers: form.getHeaders(),
    // PDFs grandes + Claude → permitir hasta 2 min por subida.
    timeout: 120_000,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });
  return r.data;
}

module.exports = { getExistingFolios, uploadInvoice };
