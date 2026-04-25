# promobility-scraper

Worker que cada cron tick:

1. Loguea en Promobility Track Manager (`track.promobility.cl`) usando Playwright.
2. Va al listado de oportunidades, aplica filtro de fecha custom (ayer→hoy).
3. Click "Aplicar Filtros" → click botón "Excel" → captura el download.
4. Normaliza datos sucios:
   - Tel "+56 +56XXX" (prefijo duplicado del export) → "+56XXX"
   - Rut "20.418.135-7" o "---" → "20418135-7" o vacío
   - Sucursal "Maos Bike Plaza Sur" → "MPS" (el CRM espera el código)
   - Modelo "GIXXER 150 FI -" + Marca "Suzuki" → "Suzuki GIXXER 150 FI"
   - Origen "Campaña" → "redes_sociales" (válido en CRM)
5. Sube el Excel limpio al CRM via `/api/import/preview` + `/api/import/confirm`.

A diferencia de Yamaha (cuyo Excel iba al CRM tal cual), Promobility requiere
un mapper porque sus columnas tienen formatos distintos a los aliases del CRM.

## Probar local (en tu Mac)

```bash
cd scrapers/promobility
npm install

cp .env.example .env
# editá .env con las creds reales (PROMOBILITY_PASS y CRM_PASS)

npm run dev
```

## Variables de entorno

```
PROMOBILITY_USER=ventas@maos.cl
PROMOBILITY_PASS=
CRM_BASE_URL=https://crmaosbike-production.up.railway.app
CRM_USER=ventas@maos.cl
CRM_PASS=
CRM_INSECURE_TLS=    # opcional, set a 1 si SSL del CRM no está perfecto
```

## Deploy a Railway

Mismo flujo que el Yamaha scraper:

1. Railway dashboard → mismo proyecto del CRM → **+ Add** → **GitHub Repo** → `maosbike/crmaosbike`.
2. Renombrar el servicio nuevo a `promobility-scraper`.
3. **Settings → Source**:
   - Branch: `feat/yamaha-scraper` (o `main` cuando se merge)
   - Root Directory: `scrapers/promobility`
4. **Settings → Cron Schedule**: `*/30 12-23 * * *` (UTC).
5. **Variables**: las 5 de arriba.

## Errores comunes

### "Login a Promobility falló"

Selectores del form no matchean. Revisar screenshot en `/tmp/promobility-login-fail-*.png`.

### Filtro de fecha no aplica

Promobility usa daterangepicker. Si los selectores `daterangepicker_start` /
`daterangepicker_end` no funcionan, mirá el HTML del filtro y ajustá en
`src/promobilitySession.js` función `downloadPromobilityLeads`.

### Sucursal no encontrada en CRM

Si el `mapper.js → normalizeSucursal` no encuentra "norte" / "sur" /
"movicenter" en el string, lo deja crudo y el CRM falla con
"Sucursal X no encontrada". Agregar el alias específico en `mapper.js`.

## Notas técnicas

- **Tabs de filtro de estatus** (Todas/Nuevo/Asignado/etc): el bot deja "Todas"
  por default. La dedup del CRM evita re-importar leads que ya estaban.
- **Tab de fecha**: usa filtro Custom con DESDE/HASTA en formato `DD-MM-YY`
  (Promobility usa años de 2 dígitos en sus inputs). El mapper convierte
  desde el formato `DD/MM/YYYY` que devuelve `dates.js`.
- **Vendedor en el Excel**: la columna `Vendedor` ("Miguel Oliva" o "S/V") se
  pasa al CRM como `vendedor_ref` — solo informativo. El CRM asigna por
  least-loaded + round-robin en `routes/import.js`.
