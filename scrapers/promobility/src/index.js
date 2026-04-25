// Entry point del Promobility scraper.
//   1. Descargar Excel de Promobility (ventana ayer→hoy).
//   2. Normalizar columnas (Tel +56 dup, Rut con/sin puntos, Sucursal, etc).
//   3. Subir al CRM via /api/import/preview + /confirm.
//
// Variables de entorno requeridas:
//   PROMOBILITY_USER, PROMOBILITY_PASS, CRM_BASE_URL, CRM_USER, CRM_PASS

import { downloadPromobilityLeads } from './promobilitySession.js';
import { mapPromobilityXlsx } from './mapper.js';
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

  const promoUser = required('PROMOBILITY_USER');
  const promoPass = required('PROMOBILITY_PASS');
  const crmUrl = required('CRM_BASE_URL');
  const crmUser = required('CRM_USER');
  const crmPass = required('CRM_PASS');

  // Ventana de 2 días — la dedup del CRM filtra repetidos automáticamente.
  const desde = chileYesterday();
  const hasta = chileToday();
  console.log(`▶ start | ventana: ${desde} → ${hasta}`);

  // 1. Descargar
  const rawPath = await downloadPromobilityLeads({
    user: promoUser,
    pass: promoPass,
    desde,
    hasta,
  });

  // 2. Normalizar
  const cleanPath = mapPromobilityXlsx(rawPath);

  // 3. Subir al CRM
  const result = await importToCrm({
    crmUrl,
    user: crmUser,
    pass: crmPass,
    filePath: cleanPath,
  });

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
