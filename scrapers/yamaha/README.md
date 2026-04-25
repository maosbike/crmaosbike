# yamaha-scraper

Worker que cada cron tick:

1. Loguea en YamaImport (`backoffice.yamahamotos.cl`) usando Playwright.
2. Navega al listado filtrado a la ventana ayer→hoy.
3. Click en **Exportar**, captura el Excel descargado.
4. Saca las columnas de evaluación Tanner del archivo.
5. Sube el Excel al CRM via `/api/import/preview` + `/api/import/confirm`.
6. Loggea stats: importados, duplicados, errores.

Ventaja del mapping: el CRM ya tiene aliases para todas las columnas de Yamaha
(`distribuidor` → sucursal, `origen` → fuente, evaluación Autofin, etc.).
**No se transforman datos** — el archivo va tal cual al endpoint.

## Probar local (en tu Mac)

Pre-requisito: este repo clonado, Playwright ya instalado a nivel global o
en el monorepo (lo descargaste en la sesión de visual regression).

```bash
cd scrapers/yamaha
npm install
npx playwright install chromium  # si no lo tenés ya

cp .env.example .env
# editá .env con las creds reales (YAMAHA_PASS y CRM_PASS)

npm run dev
```

Salida esperada (caso feliz):

```
▶ start | ventana: 24/04/2026 → 25/04/2026
[yamaha] login → https://backoffice.yamahamotos.cl/login
[yamaha] login OK
[yamaha] listado → https://...?desde=24/04/2026&hasta=25/04/2026&solo_recibidas=1
[yamaha] click Exportar
[yamaha] xlsx guardado en /tmp/yamaha-leads-1730xxxxxx.xlsx
[strip] 3 columnas Tanner removidas → /tmp/yamaha-clean-1730xxxxxx.xlsx
[crm] login → https://crmaosbike.cl/api/auth/login
[crm] login OK como ventas@maos.cl
[crm] preview → 12 filas | valid=8 dup_db=4 errors=0 warnings=0
[crm] confirm
[crm] confirm → imported=8 errors=0 no_seller=0
✓ done en 14.2s | imported=8 duplicates=4 errors=0
```

## Errores comunes

### "Login a Yamaha falló"

Selectores del form no matchean. Pasos para diagnosticar:

1. Mirá el screenshot que quedó en `/tmp/yamaha-login-fail-*.png`.
2. Abrí el HTML del login con devtools: `https://backoffice.yamahamotos.cl/login` →
   inspect element → ver los `<input>`. Verificá `name`, `id`, `placeholder`.
3. Ajustá los selectores en `src/yamahaSession.js` líneas ~58-65.

### "Login al CRM no devolvió token"

Credenciales del CRM mal o el usuario está bloqueado. Probá hacer login manual
en el CRM con esas mismas creds. Si te pide cambiar password, usá la UI primero.

### "Sucursal X no encontrada"

El distribuidor de Yamaha no matchea ninguna sucursal del CRM. Revisar:

- En el CRM: AdminView → Sucursales. Ver código (MPN, MPS).
- En el código del CRM: `backend/src/routes/import.js` → `resolveBranch()`.
  Las reglas actuales: match por código exacto, por nombre exacto, o substring.

### Anti-bot bloquea (403, captcha)

Yamaha activó protección. Opciones:

1. Agregar `playwright-extra` + `puppeteer-extra-plugin-stealth` al package.
2. Bajar la frecuencia del cron (de 30 min a 60 min).
3. Resolver captcha con servicio (2captcha) — implica cambios.

## Deploy a Railway

1. En Railway → mismo proyecto del CRM → **+ New Service** → **GitHub Repo**.
2. Seleccionar `maosbike/crmaosbike`, branch `feat/yamaha-scraper` (o `main` cuando se merge).
3. **Settings → Root Directory**: `scrapers/yamaha`
4. **Settings → Cron Schedule**: `*/30 9-19 * * *`
   - Cada 30 min entre 9:00 y 19:00 hora servidor (configurar TZ a `America/Santiago`).
5. **Variables**: pegar las 5 (ver `.env.example`).
6. Deploy.

## Mantenimiento

- Si Yamaha cambia el HTML del login o del botón Exportar → hay que actualizar
  selectores en `src/yamahaSession.js`.
- Si el CRM cambia el shape del endpoint `/api/import` → actualizar
  `src/crmImport.js`.
- Logs de Railway: pestaña **Deployments → Logs**. Cada corrida queda con su
  output completo. Errores fatales generan exit code != 0 → Railway alerta.

## TODO futuras

- [ ] Reportar a Telegram cuando una corrida falla (reusando `TelegramService`).
- [ ] Dashboard en el CRM con estadísticas de import automático.
- [ ] Preservar el `id` interno de Yamaha como referencia externa para reportes.
- [ ] Modo "dry run" (preview pero no confirm) para debugging.
