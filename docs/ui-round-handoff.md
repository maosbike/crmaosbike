# UI Round · Handoff (2026-04-15)

Entregable de la ronda de diseño/UX ejecutada por el team `crmaos-ui` (4 agentes: design-system, components, ui-architect, copy-cl).

## Artefactos

- **Patch:** `docs/ui-round.patch` (736K, 12 586 líneas)
- **Manifiesto:** este archivo (`docs/ui-round-handoff.md`)

### ⚠ Sobre el patch

El proyecto no tenía `.git` antes de la sesión ni una baseline pre-cambios. El patch fue generado con un `git init` temporal (removido al final) y lista **cada archivo tocado como "new file"** — NO es un diff incremental contra tu repo real.

**Cómo usarlo:**
1. Ir al repo git real del proyecto.
2. Copiar encima los archivos listados más abajo (mismas rutas relativas).
3. Correr `git diff` en tu repo — ese sí es el diff incremental real.
4. Como alternativa: `git apply --3way docs/ui-round.patch` sobre un árbol limpio, seguido de merge manual.

## Archivos nuevos (5)

| Ruta | Propósito |
|---|---|
| `frontend/src/tokens.css` | Design tokens como CSS custom properties en `:root` (colores, tipografía, spacing base-4, radios, sombras, breakpoints, z-index). |
| `frontend/src/tokens.js` | Mirror JS (`export T`) para consumir desde CSS-in-JS. |
| `docs/copy-tier2-draft.md` | Plan completo de copy Tier 2: catálogo Empty/Loader, mapeo de 35 `alert()` → toasts, diffs textuales Top 10, recomendaciones futuras. |
| `frontend/design-tokens-audit.md` | Auditoría inicial del design system (140 colores únicos, 19 tamaños de fuente, etc.) + propuesta. |
| `frontend/design-tokens-sla-orange-mapping.md` | Borrador consultivo para decisión de unificar `#F97316` SLA naranja al token `--warning`. Pendiente de decisión del usuario. |

## Archivos modificados (27)

### Core UI / tokens
| Ruta | Cambios |
|---|---|
| `frontend/src/main.jsx` | `import './tokens.css'` agregado antes de `responsive.css`. |
| `frontend/src/ui.jsx` | `S.btnSec` alias de `S.btn2`, `S.secCard` exportado, `Bdg` extendido con `size`, nuevas primitivas: `Btn` (variant/size/loading), `Empty` (icon/title/hint/action), `Loader` (label), `ChoiceChip` (selected/tone), `ViewHeader` (preheader/title/subtitle/count/itemLabel/actions/size). Total: ~350 líneas. |
| `frontend/src/responsive.css` | `@keyframes crm-spin` para `Loader`; `.crm-vh-actions` para colapso de acciones en mobile del `ViewHeader`. |
| `frontend/src/App.jsx` | Reemplazos hex → tokens (Fase 1 design-system). |
| `frontend/src/utils/format.js` | Reemplazos hex → tokens. |

### Vistas migradas a `<ViewHeader/>` (7)
| Ruta | Preheader · size |
|---|---|
| `frontend/src/components/LeadsList.jsx` | Comercial · Leads · md |
| `frontend/src/components/InventoryView.jsx` | Operaciones · Stock · md |
| `frontend/src/components/SalesView.jsx` | Operaciones · Comercial · md |
| `frontend/src/components/SupplierPaymentsView.jsx` | Operaciones · Tesorería · md |
| `frontend/src/components/CatalogView.jsx` | Referencia · Catálogo · md |
| `frontend/src/components/ReportsView.jsx` | — · sm |
| `frontend/src/components/AdminView.jsx` | — · sm (con acción "Nuevo usuario") |

### Voseo → tuteo CL (8 archivos, 24 strings)
- `frontend/src/components/ColorPicker.jsx` (1)
- `frontend/src/components/StagingImportView.jsx` (2 + 1 residual §5.2)
- `frontend/src/components/SupplierPaymentsView.jsx` (1 + 3 typos `Vehiculo`→`Vehículo`)
- `frontend/src/components/TicketView.jsx` (8 + dedup secCard + `Bdg size="sm"` en ACTUAL)
- `frontend/src/components/SellFromTicketModal.jsx` (4)
- `frontend/src/components/CatalogView.jsx` (1 + `Click para renombrar`→`Renombrar`)
- `frontend/src/components/InventoryView.jsx` (4)
- `frontend/src/components/SalesView.jsx` (3)

### Otros cambios puntuales
| Ruta | Cambio |
|---|---|
| `frontend/src/components/ErrorBoundary.jsx` | Migrado a `S.btn` (antes hex inline). |
| `frontend/src/components/AdminView.jsx` | `Reset contraseña` → `Restablecer contraseña`. |
| `frontend/src/components/BottomNav.jsx` | Reemplazos hex → tokens. |
| `frontend/src/components/CalendarView.jsx` | Reemplazos hex → tokens. |
| `frontend/src/components/ChangePasswordModal.jsx` | Reemplazos hex → tokens. |
| `frontend/src/components/Dashboard.jsx` | Reemplazos hex → tokens. |
| `frontend/src/components/ForceChangeView.jsx` | Reemplazos hex → tokens. |
| `frontend/src/components/ImportView.jsx` | Reemplazos hex → tokens. |
| `frontend/src/components/Login.jsx` | Reemplazos hex → tokens. |
| `frontend/src/components/MobileDrawer.jsx` | Reemplazos hex → tokens. |
| `frontend/src/components/NotifBell.jsx` | Reemplazos hex → tokens. |
| `frontend/src/components/PipelineView.jsx` | Reemplazos hex → tokens. |
| `frontend/src/components/RemindersTab.jsx` | Reemplazos hex → tokens. |

## Métricas globales

- **+5 archivos nuevos** (2 de código, 3 de docs)
- **27 archivos modificados**
- **~430 reemplazos hex → tokens** (slate→gray unificado, duplicados eliminados; 140→109 colores únicos, −22%)
- **30 strings voseo→tuteo** + 6 typos corregidos
- **4 primitivas UI nuevas** + 1 de layout (`Btn`, `Empty`, `Loader`, `ChoiceChip`, `ViewHeader`)

## Estado buildable

- ✅ **Inspección estática:** `components` verificó con esbuild los archivos de #9 (ui.jsx + 3 archivos). `ui-architect` no pudo correr `vite build` porque no hay `node_modules`.
- ⚠ **No ejecutado `vite build`** en esta sesión. Recomendado antes de mergear: `cd frontend && npm install && npm run build`.
- ✅ Todas las primitivas nuevas son **aditivas** — nadie las consume aún (excepto `ViewHeader` en las 7 vistas migradas). Riesgo de regresión: bajo.
- ✅ `S.btn`, `S.btn2`, `S.gh` preservadas intactas — retrocompatibles.

## Decisiones aplicadas en esta ronda

1. SLA warning token = `#F59E0B` (ámbar). Código SLA (`#F97316`) aún NO migrado — decisión pendiente.
2. Paleta neutra unificada en Tailwind `gray`, descartando `slate` y legacy (`#333/#555/#888`).
3. Tokens como CSS variables + mirror JS. No migramos a Tailwind.
4. z-index: mantenido (drawer 9999, modal 60).
5. SalesView mobile responsive: prioritario pero NO ejecutado (pendiente #14).
6. `Dashboard.jsx`, `PipelineView.jsx`, `CalendarView.jsx`, `StagingImportView.jsx`, `ForceChangeView.jsx`, `TicketView.jsx` NO migraron a `ViewHeader` (fuera de alcance por prudencia).

## Tareas pendientes para próxima ronda

| # | Tarea | Notas |
|---|---|---|
| #10 | Migrar 35 `alert()` → `<Empty/>` + toasts | Texto ya escrito en `docs/copy-tier2-draft.md` §2–§3. |
| #12 | 8 danger buttons → `<Btn variant="danger"/>` | Sitios listados en informe de `components`. |
| #13 | Modales inline → `Modal tone="danger"` + crear `PhotoLightbox` | TicketView followup/perdido + 2 lightbox. |
| #14 | `SalesView` responsive (card mobile < 1024px) | Wireframe y mapping en reporte de `ui-architect`. |
| — | Decidir unificación SLA `#F97316` | Ver `frontend/design-tokens-sla-orange-mapping.md`. |
| — | Capitalización inconsistente de títulos (~40 strings) | `copy-tier2-draft.md` §5.1. |
| — | `alt=""` en fotos de motos | `copy-tier2-draft.md` §5.4. |
