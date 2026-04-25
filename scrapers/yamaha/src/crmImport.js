// Cliente HTTP del CRM para el scraper.
//   1. Login → JWT en body (15 min de validez, suficiente para una corrida).
//   2. POST /api/import/preview con multipart → {rows, summary, filename}.
//   3. POST /api/import/confirm con {rows, filename, skip_dups: true} → stats.

import axios from 'axios';
import FormData from 'form-data';
import fs from 'node:fs';
import path from 'node:path';

const TIMEOUT = 60_000;

export async function importToCrm({ crmUrl, user, pass, filePath }) {
  const base = crmUrl.replace(/\/+$/, ''); // sin trailing slash

  // ── 1. Login ────────────────────────────────────────────
  console.log('[crm] login →', `${base}/api/auth/login`);
  const loginResp = await axios.post(
    `${base}/api/auth/login`,
    { email: user, password: pass },
    { timeout: TIMEOUT },
  );

  const token = loginResp.data?.token;
  if (!token) {
    throw new Error('Login al CRM no devolvió token. Revisar credenciales.');
  }
  const auth = { Authorization: `Bearer ${token}` };
  console.log('[crm] login OK como', loginResp.data?.user?.email || user);

  // ── 2. Preview ──────────────────────────────────────────
  console.log('[crm] preview →', path.basename(filePath));
  const previewForm = new FormData();
  previewForm.append('file', fs.createReadStream(filePath), {
    filename: path.basename(filePath),
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const previewResp = await axios.post(
    `${base}/api/import/preview`,
    previewForm,
    {
      headers: { ...previewForm.getHeaders(), ...auth },
      timeout: TIMEOUT,
      maxBodyLength: 10 * 1024 * 1024,
      maxContentLength: 10 * 1024 * 1024,
    },
  );
  const { rows, summary, filename } = previewResp.data;
  console.log(
    `[crm] preview → ${rows?.length ?? 0} filas | ` +
      `valid=${summary?.valid ?? 0} dup_db=${summary?.dup_db ?? 0} ` +
      `errors=${summary?.errors ?? 0} warnings=${summary?.warnings ?? 0}`,
  );

  // Si todo es duplicado o error, no hace falta confirmar.
  const validCount = summary?.valid ?? 0;
  if (validCount === 0) {
    console.log('[crm] sin filas nuevas para importar — omitiendo confirm');
    return { imported: 0, duplicates: summary?.dup_db ?? 0, errors: summary?.errors ?? 0, skipped: true };
  }

  // ── 3. Confirm ──────────────────────────────────────────
  console.log('[crm] confirm');
  const confirmResp = await axios.post(
    `${base}/api/import/confirm`,
    { rows, filename, skip_dups: true },
    { headers: { ...auth, 'Content-Type': 'application/json' }, timeout: TIMEOUT },
  );
  const stats = confirmResp.data;
  console.log(
    `[crm] confirm → imported=${stats.imported ?? 0} ` +
      `errors=${stats.errors ?? 0} no_seller=${stats.no_seller ?? 0}`,
  );

  return {
    imported: stats.imported ?? 0,
    duplicates: summary?.dup_db ?? 0,
    errors: stats.errors ?? 0,
    no_seller: stats.no_seller ?? 0,
    tickets: stats.tickets ?? [],
  };
}
