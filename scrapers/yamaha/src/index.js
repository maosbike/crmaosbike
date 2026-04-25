// Entry point del scraper. Una corrida ejecuta:
//   1. Descargar Excel de Yamaha (ventana ayer→hoy).
//   2. Quitar columnas Tanner.
//   3. Subir al CRM via /api/import/preview + /confirm.
//   4. Loggear stats y exit con código apropiado.
//
// Variables de entorno requeridas:
//   YAMAHA_USER, YAMAHA_PASS, CRM_BASE_URL, CRM_USER, CRM_PASS

import { downloadYamahaLeads } from './yamahaSession.js';
import { stripTannerColumns } from './stripTanner.js';
import { importToCrm } from './crmImport.js';
import { chileToday, chileYesterday } from './dates.js';

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`✗ Falta env var: ${name}`);
    process.exit(2);
  }
  return v;
}

async function main() {
  const start = Date.now();

  const yamahaUser = required('YAMAHA_USER');
  const yamahaPass = required('YAMAHA_PASS');
  const crmUrl = required('CRM_BASE_URL');
  const crmUser = required('CRM_USER');
  const crmPass = required('CRM_PASS');

  // Ventana de 2 días. La dedup del CRM filtra repetidos automáticamente, así
  // que repetir leads de ayer en cada corrida no genera ruido.
  const desde = chileYesterday();
  const hasta = chileToday();
  console.log(`▶ start | ventana: ${desde} → ${hasta}`);

  // 1. Descargar
  const rawPath = await downloadYamahaLeads({ user: yamahaUser, pass: yamahaPass, desde, hasta });

  // 2. Limpiar Tanner
  const cleanPath = stripTannerColumns(rawPath);

  // 3. Subir al CRM
  const result = await importToCrm({ crmUrl, user: crmUser, pass: crmPass, filePath: cleanPath });

  const dur = ((Date.now() - start) / 1000).toFixed(1);
  console.log(
    `✓ done en ${dur}s | imported=${result.imported} ` +
      `duplicates=${result.duplicates} errors=${result.errors}`,
  );
}

main().catch((err) => {
  console.error('✗ fatal:', err?.message || err);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});
