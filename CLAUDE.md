# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CRMaosBike is a sales management system for a motorcycle dealership. It handles leads/tickets, inventory, catalog, sales, supplier payments, reporting, and user roles.

## Commands

### Development
```bash
# Backend (port 4000, runs migrations on start)
cd backend && npm run dev       # watch mode
cd backend && npm run migrate   # migrations only
cd backend && npm run seed      # seed initial data
cd backend && npm test          # runs slaUtils.test.js

# Frontend (port 5173, proxies /api to localhost:4000)
cd frontend && npm run dev

# Production build
npm run build                   # installs deps + builds frontend dist/
```

### Deployment (Railway)
Push to GitHub → Railway auto-deploys. Start command: `cd backend && npm start` (runs migrations then server).

Required env vars: `JWT_SECRET`, `JWT_REFRESH_SECRET`, `NODE_ENV=production`, `DATABASE_URL` (auto-set by Railway), `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET`, `FRONTEND_URL`.

## Architecture

### Backend (`/backend/src`)
- **Entry:** `index.js` — Express on `process.env.PORT` (default 4000), Helmet, rate limiting (300 req/15min on `/api/*`)
- **Routes:** `routes/` — one file per domain: `auth`, `tickets`, `inventory`, `catalog`, `users`, `sales`, `reports`, `dashboard`, `import`, `priceimport`, `notifications`, `reminders`, `calendar`, `supplier-payments`, `telegram`, `admin`
- **Auth middleware:** `middleware/auth.js` — validates JWT bearer token, attaches `req.user`, exports `roleCheck(...roles)`
- **DB:** `config/db.js` — pg pool from `DATABASE_URL`, SSL in production
- **Migrations:** `scripts/migrate.js` — idempotent, runs at startup, tracks applied in `schema_migrations`. Migration files in `/migrations/` (numbered 001–047+)
- **Jobs:** `jobs/slaChecker.js` and `jobs/reminderChecker.js` — cron jobs started at boot
- **Error handling:** wrap routes in `asyncHandler(fn)` from `middleware/errorHandler.js`
- **Logging:** Pino (`config/logger.js`), pretty in dev, JSON in prod. Only 5xx errors logged with stack trace.

### Frontend (`/frontend/src`)
- **No router library** — page switching via `page` state in `App.jsx` (monolithic component)
- **API layer:** `services/api.js` — all fetch calls, access token in memory (`_token`), refresh token in httpOnly cookie `crt`, auto-retries 401 once after refresh
- **Shared constants/utils:** `ui.jsx` — exports `TICKET_STATUS`, `FOLLOWUP_OPTS`, `ROLES`, `hasRole()`, `Ic` (SVG icons), `S` (inline style presets), `mapTicket()`
- **Format utilities:** `utils/format.js` — `fD()`, `fDT()`, `ago()`, `fmt()`, `formatRut()`, `normalizeModel()`, etc.
- **Design tokens:** `tokens.css` (CSS vars) + `tokens.js` (JS exports), `responsive.css` (768px breakpoint)
- **Vite proxy:** `/api` → `http://localhost:4000` in dev; same-origin in prod (backend serves `frontend/dist/`)

### Key Patterns

**Role system:** Roles are `super_admin`, `admin_comercial`, `backoffice`, `vendedor`. Vendedores only see their own tickets. `cost_price` is stripped from responses to vendedores.

**Auth flow:** Login returns short-lived JWT (15 min, memory-only) + long-lived refresh cookie (7 days, httpOnly). `session_version` on the user record invalidates old tokens on password change.

**Synced constants:** Ticket statuses and follow-up options are defined in both `backend/src/config/leadStatus.js` and `frontend/src/ui.jsx` — keep them in sync when changing either.

**Bulk import pattern:** Preview → Confirm (CSV/Excel imports for inventory, leads, price batches).

**FormData uploads:** `api.js` detects `body instanceof FormData` and removes `Content-Type` header so browser sets the multipart boundary. All images stored on Cloudinary; only URL saved in DB.

**SQL:** All queries use `$1, $2, ...` parameterized placeholders. Soft deletes via `deleted_at IS NULL`.

**Pagination:** Backend accepts `limit`/`offset`. Frontend fetches leads in batches of 200 (cap 10,000).
