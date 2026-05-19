# CRMaosBike 🏍️

CRM comercial para concesionaria de motos: leads, pipeline, inventario,
ventas, pagos a proveedor, contabilidad (facturas SII) y reportes.

## Stack

- **Backend** — Node 20 + Express 4, PostgreSQL 16 (`pg`), JWT en cookies
  httpOnly, `helmet`, `express-rate-limit`, `pino`. Logs estructurados.
- **Frontend** — React 18 + Vite 5, sin router (state machine en
  `App.jsx`), sin framework de UI: design tokens en `frontend/src/tokens.css`
  + helpers en `frontend/src/ui.jsx`. PDFs con `jspdf`/`jspdf-autotable`.
  Snapshots visuales con Playwright.
- **sii-scraper** — Servicio aparte (Playwright headless) que baja DTEs
  del SII y los ingesta vía `POST /api/ingest/invoice` con
  `X-Internal-Token`. Parser con Claude Haiku (`@anthropic-ai/sdk`).
- **Integraciones** — Cloudinary (uploads), Telegram Bot (notificaciones
  a vendedores), Google Calendar (recordatorios), Claude (parseo de
  facturas, listas de precios y matcheo de modelos).
- **Deploy** — Railway (servicio CRM + servicio sii-scraper + Postgres).

## Estructura

```
backend/
  migrations/        SQL versionado (001..065). Se aplica en `npm start`.
  src/
    index.js         bootstrap Express, validación de secrets, CSP, CORS.
    routes/          una ruta por dominio (auth, tickets, sales, ...).
    services/        lógica reutilizable (Claude, SLA, Telegram, PDF).
    jobs/            crons: slaChecker, reminderChecker.
    middleware/      auth (JWT + session_version), errorHandler.
    config/          db, logger, cloudinary, branchRouting, leadStatus.
    utils/           normalize, safeFetch (SSRF), safeXlsx, uploadGuards.
    scripts/         migrate.js, seed.js.
frontend/
  src/
    App.jsx          shell + state machine de vistas.
    ui.jsx           helpers compartidos (Ic icons, S styles, TY, mapTicket).
    tokens.css       design tokens (fuente única de verdad).
    tokens.js        espejo JS de tokens.css.
    components/      una vista por archivo (Dashboard, LeadsList, ...).
    services/api.js  cliente fetch con manejo de 401 y refresh.
    hooks/           useApiQuery.
    utils/format.js  formateo CLP, fechas, etc.
  tests/visual/      Playwright snapshots.
sii-scraper/
  src/
    index.js         loop / cron / RUN_ONCE.
    siiClient.js     login + scraping del historial DTE.
    crmClient.js     subida al CRM con dedupe por folio.
docs/                auditorías de consistencia y handoffs de diseño.
.claude/             subagentes y slash commands (`/audit-frankenstein`).
```

## Desarrollo local

```bash
# Backend
cd backend
cp .env.example .env   # completar JWT_SECRET, JWT_REFRESH_SECRET, etc.
npm install
npm run migrate        # corre 001..N contra DATABASE_URL
npm run dev            # node --watch src/index.js → :4000

# Frontend (otra terminal)
cd frontend
npm install
npm run dev            # vite → :5173 (proxy a backend en :4000)

# Tests visuales (opcional)
cd frontend
npm run visual:install
npm run visual
```

Tests del backend:

```bash
cd backend && npm test     # src/utils/__tests__/slaUtils.test.js
```

## Variables de entorno mínimas (backend)

| Variable                  | Notas                                             |
| ------------------------- | ------------------------------------------------- |
| `DATABASE_URL`            | Postgres. Railway la inyecta sola.                |
| `JWT_SECRET`              | ≥32 chars, generar con `openssl rand -hex 64`.   |
| `JWT_REFRESH_SECRET`      | Distinto del anterior. ≥32 chars.                 |
| `NODE_ENV`                | `production` en Railway.                          |
| `FRONTEND_URL`            | CSV de orígenes permitidos por CORS.              |
| `CLOUDINARY_*`            | `CLOUD_NAME`, `API_KEY`, `API_SECRET`.            |
| `TELEGRAM_BOT_TOKEN`      | Opcional. Si está, en prod exige WEBHOOK_SECRET. |
| `TELEGRAM_WEBHOOK_SECRET` | Obligatorio en prod si hay bot.                   |
| `INTERNAL_API_TOKEN`      | 32+ chars. Mismo valor que `CRM_INTERNAL_TOKEN`   |
|                           | del sii-scraper. Habilita `/api/ingest/*`.        |
| `ANTHROPIC_API_KEY`       | Para parsers de Claude (facturas, precios).       |

El backend **valida y mata el proceso** si falta un secret, es corto o usa
un placeholder conocido (`changeme`, `secret`, `default`, ...). Ver
`backend/src/index.js:13`.

## Deploy en Railway

### 1. Servicio CRM (root del repo)

1. **New Project → Deploy from GitHub repo** → `maosbike/crmaosbike`.
2. **+ New → Database → PostgreSQL** (engancha `DATABASE_URL` solo).
3. **Variables** → cargar las de la tabla de arriba.
4. **Settings → Start Command**: ya está en `package.json`
   (`cd backend && node src/scripts/migrate.js && node src/index.js`).
5. **Settings → Domains** → custom domain `crmaosbike.cl` (CNAME a Railway).

### 2. Servicio sii-scraper (mismo repo, root distinto)

1. **+ New Service → Deploy from GitHub repo** → mismo repo.
2. **Settings → Root Directory** = `sii-scraper`.
3. Railway detecta el `Dockerfile` y buildea Playwright.
4. **Variables** → ver `sii-scraper/.env.example`. Clave: `CRM_INTERNAL_TOKEN`
   debe ser **idéntico** al `INTERNAL_API_TOKEN` del CRM.

### Usuarios iniciales

El seed (`backend/migrations/002_seed.js`) genera una contraseña aleatoria
por usuario y la imprime **una sola vez** en los logs del primer deploy.
Cada usuario arranca con `force_password_change=true`. Para entornos de
prueba podés exportar `INITIAL_PASSWORD` antes del seed (no en prod).

## Seguridad

- HTTPS forzado server-side; HSTS preload 2 años, incluye subdominios.
- Access token JWT de 15 min + refresh httpOnly `SameSite=strict`.
- Logout invalida todos los tokens del usuario (bump `session_version`).
- Lockout exponencial por usuario (login).
- Rate-limit global (`/api/`) + específicos en rutas sensibles.
- CSP estricta, `frame-ancestors 'none'`, `object-src 'none'`.
- Anti prototype-pollution sobre `req.body|query|params`.
- Uploads: MIME + extensión + magic-bytes (XLSX/PDF).
- SSRF: `safeFetch` con allowlist y bloqueo de IPs privadas.
- `/api/ingest/*` exige `X-Internal-Token` de 32+ chars.

## Auditoría de consistencia

El proyecto tiene un equipo de subagentes (`.claude/agents/`) para mantener
consistencia de tokens, UI, patrones React y backend. Se invocan con:

```
/audit-frankenstein            # audita todo
/audit-frankenstein frontend   # alcance acotado
```

Decisiones de diseño vigentes en:
- `frontend/design-tokens-audit.md`
- `frontend/design-tokens-sla-orange-mapping.md`
- `frontend/VISUAL.md`
- `docs/consistency-audit-2026-04-23.md`

## Notas operativas

- Las migraciones corren en cada `npm start`. Son idempotentes por
  convención (`IF NOT EXISTS`, guards). Si una falla, el proceso no
  arranca.
- Hay un job al boot (10s después de listen) que re-vincula leads viejos
  sin modelo usando el matcher + fallback de Claude. Costo 0 si no hay
  candidatos.
- Backups de DB → workflow `.github/workflows/db-backup.yml`.
- Restore documentado en `backend/scripts/RESTORE.md`.
