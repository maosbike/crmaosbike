# CLAUDE.md

Contexto para Claude Code en este repo. Leelo antes de tocar cosas.

## Qué es esto

CRM para concesionaria de motos (CRMaosBike). Tres servicios:

1. **Backend** — Express 4 + Postgres 16 en `backend/`.
2. **Frontend** — React 18 + Vite (sin router, sin lib de UI) en `frontend/`.
3. **sii-scraper** — Playwright headless que ingesta facturas del SII al
   CRM vía `POST /api/ingest/invoice`. Vive en `sii-scraper/`, deploya como
   servicio aparte en Railway con el mismo repo y root distinto.

Deploy: Railway. El CRM sirve el bundle de Vite estático en `NODE_ENV=production`.

## Comandos que usás seguido

```bash
# Backend
cd backend && npm run dev        # node --watch src/index.js
cd backend && npm run migrate    # corre 001..N
cd backend && npm test           # solo slaUtils por ahora

# Frontend
cd frontend && npm run dev       # vite :5173
cd frontend && npm run build     # output → frontend/dist (lo sirve Express)
cd frontend && npm run visual    # Playwright snapshots
```

No hay linter ni typecheck configurado. No inventes uno.

## Arquitectura backend

- `src/index.js` — bootstrap. **Importante**: valida JWT secrets y mata el
  proceso si faltan, son cortos, o son placeholders conocidos. No relajes
  esa validación.
- `src/routes/<dominio>.js` — un archivo por dominio. Patrón: `router =
  express.Router()`, middleware `requireAuth` y/o `requireRole(...)`,
  handlers async con try/catch que delegan a `next(err)` o devuelven
  `res.status(...).json({ error })`.
- `src/middleware/auth.js` — JWT con `session_version` por usuario. Cada
  logout/cambio de password incrementa `session_version` y mata tokens
  vivos.
- `src/services/` — lógica reutilizable. Los `claude*Parser.js` usan el
  SDK de Anthropic (`@anthropic-ai/sdk`, ver más abajo).
- `src/jobs/` — crons (`slaChecker`, `reminderChecker`) iniciados al
  `listen()`.
- `src/config/db.js` — pool de `pg`. Usá `db.query(...)` con placeholders
  `$1, $2`. Nunca interpoles SQL.
- `src/utils/safeFetch.js` — única forma permitida de hacer fetch externo.
  Tiene allowlist y bloquea IPs privadas (SSRF).
- `src/utils/uploadGuards.js` — validación MIME + extensión + magic-bytes.
  Usalo para todo upload.

## Migraciones

- Archivos `backend/migrations/NNN_*.sql` o `.js`. Numeración correlativa.
- Se ejecutan automáticamente en `npm start` antes de levantar el server.
- **Idempotentes por convención**: `CREATE TABLE IF NOT EXISTS`,
  `ADD COLUMN IF NOT EXISTS`, guards explícitos. Si falla, el deploy no
  arranca.
- Cuando agregues una nueva, mirá el `NNN` más alto y sumá 1.

## Arquitectura frontend

- `src/App.jsx` — shell. Mantiene `user`, `page` (state machine de vistas),
  y orquesta cargas. **No hay router**: cambiar de vista es `setPage('x')`.
- `src/ui.jsx` — helpers compartidos: `Ic` (iconos), `S` (estilos
  inline tipados), `TY` (tipografías), `mapTicket` (normaliza tickets),
  `ROLES`, `hasRole`, constantes. Importá desde acá antes de duplicar.
- `src/tokens.css` + `src/tokens.js` — **fuente única de verdad** para
  colores/spacing/tipografía. Está espejado: si tocás uno, tocá los dos.
  Los componentes consumen tokens vía CSS custom properties.
- `src/services/api.js` — cliente fetch. Maneja 401 con refresh silencioso
  y `setToken`/`clearToken`. Usalo siempre; no hagas `fetch()` directo.
- `src/components/<Vista>.jsx` — una vista por archivo. El estilo es CSS-in-JS
  inline + tokens, sin styled-components ni Tailwind.
- Tests visuales: `tests/visual/*.spec.js` con Playwright. Si cambiás UI,
  corré `npm run visual` y actualizá snapshots con `npm run visual:update`
  cuando el cambio sea intencional.

## Convenciones que no son negociables

- **No introducir nuevas dependencias** sin justificación fuerte. El stack
  es deliberadamente chico (sin Tailwind, sin styled-components, sin
  React Query, sin router). Si necesitás algo similar, mirá si `ui.jsx` o
  `useApiQuery` ya lo resuelven.
- **No commitear sin que el usuario lo pida.** Aplica también a `/audit-frankenstein`.
- **No bypassear `safeFetch`** ni `uploadGuards`. Son la frontera de
  seguridad.
- **No mezclar capas**: una migración SQL no toca código JS; un repair
  de consistencia no mezcla backend + frontend en el mismo lote (regla
  del agente `consistency-repair`).
- Logs con `logger` de `pino` (`src/config/logger.js`), no `console.*`.
  El `index.js` usa `console.error` solo para los FATAL de boot (antes
  de tener logger).
- Errores en rutas: tirar `next(err)` o `res.status(code).json({ error })`.
  No `throw` sin atrapar en handlers async.

## Integraciones externas

- **Cloudinary** — `src/config/cloudinary.js`. Subidas firmadas server-side.
- **Telegram Bot** — `src/services/telegramService.js`. En prod **requiere**
  `TELEGRAM_WEBHOOK_SECRET` si hay `TELEGRAM_BOT_TOKEN`.
- **Google Calendar** — `googleapis` para recordatorios.
- **Anthropic SDK** — `@anthropic-ai/sdk` v0.91. Usado para:
  - Parser de facturas SII (`claudeInvoiceParser.js`, `claudeEmitidaParser.js`).
  - Parser de listas de precios (`claudePriceListParser.js`).
  - Parser de comprobantes de pago a proveedor (`claudeSupplierPaymentParser.js`).
  - Matcher de modelos cuando el fuzzy local no resuelve (`modelMatcher.js`).
  Modelo default: Haiku. Si tocás esto, mantené prompt caching donde aplique.
- **sii-scraper → CRM** — endpoint `POST /api/ingest/invoice` con header
  `X-Internal-Token`. Ambos lados leen el mismo secreto
  (`INTERNAL_API_TOKEN` en CRM, `CRM_INTERNAL_TOKEN` en scraper).

## Subagentes y slash commands

`.claude/agents/` define un equipo de auditoría:

- `design-consistency-lead` — orquestador (lo lanza `/audit-frankenstein`).
- `design-tokens-auditor` — adherencia a `tokens.css`/`tokens.js`.
- `ui-pattern-auditor` — botones, modales, inputs, tablas, cards.
- `react-pattern-auditor` — hooks, estado, llamadas API, naming.
- `backend-consistency-auditor` — rutas, auth, validación, errores.
- `consistency-repair` — ejecuta fixes (un tipo por invocación).
- `consistency-evaluator` — valida que el fix no rompa nada.

Slash command: `/audit-frankenstein [frontend|backend|all|<vista>]`. Genera
informe en `docs/consistency-audit-<fecha>.md` y espera aprobación antes de
reparar.

## Decisiones de diseño vigentes

- Paleta neutra → Tailwind `gray` (descartadas `slate` y legacy).
- SLA warning → `--warning` (#F59E0B), separado del brand (#F28100).
- Documentos: `frontend/design-tokens-audit.md`,
  `frontend/design-tokens-sla-orange-mapping.md`, `frontend/VISUAL.md`,
  `docs/consistency-audit-2026-04-23.md`, `docs/ui-round-handoff.md`.

## Branch y deploy

- Branch de desarrollo asignada por la harness web: `claude/<slug>-XXXX`.
  Mirá la system instruction de cada sesión.
- Nunca push --force a `main`. Nunca crear PRs sin que el usuario lo pida.
- Railway redeploya en push a `main` (servicio CRM y servicio sii-scraper
  comparten repo; el segundo tiene `Root Directory = sii-scraper`).
- `.railway-redeploy-trigger` existe solo para forzar un rebuild si Railway
  no detecta cambios relevantes.

## Cosas que ya intentaste / decisiones de operación

- **Rate limit global** está en 2000 req/15min por IP. Era 300 y
  estrangulaba al admin filtrando ventas. No bajes sin justificar.
- **Relink de leads al boot**: 10s después de `listen()` corre
  `relinkUnresolvedLeads(null)` para enganchar leads viejos sin modelo.
  Costo 0 si no hay candidatos. No lo muevas a request-time.
- **Sales: auto-detect de tabla** — un lead puede vivir en `sales` o
  `sale_notes`. El backend detecta cuál. No re-introduzcas el bug de
  "Venta no encontrada" hardcodeando la tabla.
- **Modelo obligatorio en leads** — todo punto de entrada exige modelo
  asignado. Si agregás un flujo nuevo, mantené la regla.
