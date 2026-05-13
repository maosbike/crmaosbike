# sii-scraper

Bot Playwright que descarga facturas emitidas y recibidas del SII de Chile y las ingesta al CRM (CRMaosBike).

## Cómo funciona

1. Inicia sesión en https://www.sii.cl con un RUT + clave que tengas como env vars.
2. Navega a **Factura electrónica → Sistema de facturación gratuito → Historial de DTE**.
3. Lista todas las facturas/notas de crédito/guías visibles, pregunta al CRM cuáles ya tiene (dedupe por folio) y descarga solo las que faltan.
4. Sube cada PDF al endpoint interno `POST /api/ingest/invoice` del CRM. El CRM lo parsea con Claude Haiku y lo inserta en la tabla `invoices`.
5. Hace el mismo flujo para emitidas y recibidas.
6. Por default queda corriendo en loop con un cron interno cada `CRON_HOURS` (3 por default).

## Deploy en Railway

1. En tu proyecto de Railway: **+ New Service → Deploy from GitHub repo → maosbike/crmaosbike**.
2. **Settings → Service → Root Directory** = `sii-scraper`.
3. Railway detecta el `Dockerfile` y empieza a buildear.
4. Configurá las **Variables** (copiá `.env.example`). Críticas:
   - `SII_RUT`, `SII_PASSWORD`, `SII_EMPRESA_RUT`
   - `CRM_BASE_URL` = `https://www.crmaosbike.cl/api`
   - `CRM_INTERNAL_TOKEN` (mismo valor que `INTERNAL_API_TOKEN` del backend del CRM)
5. La primera corrida arranca apenas el container queda listo.

## Backfill inicial (todo 2026)

Por default el bot procesa **todo lo visible en la tabla del SII** (que muestra del último mes hacia atrás con paginación). Si querés forzar una corrida fresca sin dedupe, seteá `FORCE_FULL=1` por una sola vez y volvé a poner vacío después.

## Correr local

```bash
cp .env.example .env
# Editar .env con creds reales

npm install
npx playwright install chromium

# Headful (ver lo que hace) — solo dev:
HEADLESS=false RUN_ONCE=1 npm start

# Headless una vez:
RUN_ONCE=1 npm start
```

## Generar el INTERNAL_API_TOKEN

Tiene que ser largo y aleatorio. En cualquier terminal:

```bash
openssl rand -hex 32
```

Pegá el resultado como `INTERNAL_API_TOKEN` en el servicio del CRM y como `CRM_INTERNAL_TOKEN` en el servicio del sii-scraper. **Tienen que ser idénticos.**

## Seguridad

- Las creds del SII nunca van al código. Solo en `Settings → Variables` de Railway.
- El endpoint `/api/ingest/invoice` del CRM exige el header `X-Internal-Token` con un valor de 32+ chars. Sin eso devuelve 401.
- Si la clave del SII se filtra (ej. la pegaste en chat), cambiala en sii.cl y volvé a pegarla en Railway. El bot la lee solo al arrancar.

## Limitaciones conocidas

- Los selectores del SII son por texto visible y XPath aproximado. Si el SII cambia algo, hay que ajustar `siiClient.js`.
- El bot itera las páginas visibles. Si tu historial tiene >10000 filas, conviene filtrar por año/mes desde la UI antes de que el bot empiece (no implementado todavía).
- Captchas: el SII no usa captcha normalmente, pero si alguna vez aparece, el bot se cuelga. Habría que migrar a login con certificado digital.
