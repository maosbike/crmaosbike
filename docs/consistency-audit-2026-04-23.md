# CRMaosBike — Auditoría de Consistencia

> **Fecha:** 2026-04-23
> **Branch:** `claude/crm-code-audit-agent-BagZ2`
> **Modo:** reporte consolidado de 4 auditores paralelos (tokens, UI patterns, React patterns, backend).
> **Estado:** solo propuesta. Ningún cambio aplicado. Requiere aprobación del usuario antes de ejecutar repairs.

---

## 🧨 Resumen ejecutivo

La app es funcional pero la **adopción de abstracciones ya existentes es casi nula**. La base tiene buenos fundamentos — tokens sincronizados CSS↔JS, primitivos en `ui.jsx` (`Btn`, `Modal`, `Field`, `Bdg`, `Loader`, `Empty`), `services/api.js` centralizado, middleware `errorHandler`, `roleCheck`, `logger` pino — pero cada feature nueva tiende a **reinventar** en lugar de **consumir**:

- **Frontend**: 1681 hex hardcodeados fuera de tokens, 68 botones inline compitiendo con `<Btn>`, 41 `alert()`/`confirm()` reemplazando modales, 127 radios inline reinventando `<Card>`, 30+ useState por vista, 0 `useReducer`.
- **Backend**: `errorHandler.js` montado pero 17/19 rutas lo ignoran; 126 `try/catch` locales redundantes; 13 leaks de `e.message`; 107 `console.*` coexisten con pino; 39 `req.user.role` inline ignoran `roleCheck`.
- **Transacción rota** en `admin.js` (`BEGIN` sobre pool, no sobre client) — bug silencioso.
- **SQL seguro**: todas las queries están parametrizadas ✅ (bueno).

Lo bueno: `hasRole` (30 usos), `useIsMobile` (22), `onClose` (79/82), `services/api.js` al 100%, tokens CSS↔JS sincronizados — ya hay un "canon" claro en cada área. **El fix no es rediseñar, es migrar call-sites.**

---

## 📊 Tabla de hallazgos consolidados

| # | Área | Problema | Canon existente | Archivos | Ocurrencias | Severidad | Esfuerzo |
|---|---|---|---|---|---|---|---|
| 1 | backend | Transacciones `admin.js` sobre pool en vez de client | `tickets.js:175` | 1 | 3 handlers | 🔴 bug | S |
| 2 | backend | `errorHandler` montado pero rutas usan try/catch local | `errorHandler.js` + `asyncHandler` | 17 de 19 | 126 bloques | 🔴 | M |
| 3 | backend | `e.message` filtrado al cliente | — | 5 | 13 hits | 🔴 | S |
| 4 | frontend | `alert()` como sistema de error | — | 7 | 30 | 🔴 | M |
| 5 | frontend | `window.confirm()` para acciones destructivas | `<Modal>` custom | 4 | 11 | 🔴 | S |
| 6 | frontend | Botones inline reinventando `<Btn>` | `ui.jsx:396` | 19 | 68 | 🔴 | M |
| 7 | tokens | Brand `#F28100` duplicado | `var(--brand)` | 21 | 110 | 🔴 | S |
| 8 | tokens | Neutros hex duplicados (`#9CA3AF`, `#6B7280`, `#E5E7EB`, ...) | `var(--text-*)` / `--border` | 24 | ~1100 | 🔴 | M |
| 9 | backend | Role checks inline | `roleCheck(...)` | — | 39 (vs 83 ok) | 🔴 | S |
| 10 | backend | `console.*` en paralelo a pino | `config/logger.js` | — | 107 (vs 63 pino) | 🟡 | S |
| 11 | frontend | Modales con overlay/z-index propio | `ui.jsx:319` `<Modal>` | 4 | 5 variantes | 🟡 | M |
| 12 | frontend | `key={i}` en listas con id disponible | — | 6 | 18 | 🟡 | S |
| 13 | frontend | `useEffect` sin AbortController en fetch | — | — | 10+ | 🟡 | M |
| 14 | frontend | 127 `borderRadius:10-16` inline reinventando `<Card>` | `S.card` / extraer `<Card>` | 6 | 127 | 🟡 | M |
| 15 | frontend | Badges ad-hoc vs `<Bdg>/<TBdg>/<PBdg>/<SlaBdg>` | `ui.jsx` | — | 63 vs 11 | 🟡 | M |
| 16 | frontend | `<label>` manuales vs `<Field>` | `ui.jsx` | — | 85 vs 118 | 🟡 | M |
| 17 | tokens | Border-radius off-scale (10,7,14,20,9,5,99,3) | `--radius-*` | — | ~170 | 🟡 | M |
| 18 | tokens | Colores fuera de paleta (`#0F172A`, `#F97316`, `#FCD34D`) | unificar `--text` / `--warning-*` | 7+ | ~60 | 🟡 | S |
| 19 | react | Vistas con 35-54 `useState` sin `useReducer` | — | 5 | 0 useReducer en repo | 🟡 | L |
| 20 | react | Callbacks con 7 nombres distintos (`onSaved/onUpdated/onChanged/onSuccess/onRefresh/onDone/onResolved`) | unificar `onSaved` | — | 53 divergentes | 🟡 | S |
| 21 | backend | 3 shapes de respuesta de éxito | decidir envelope | — | ~100 | 🟡 | M |
| 22 | backend | `process.env` directo, sin config central | — | — | 35 | 🟡 | S |
| 23 | frontend | 1 role check legacy | `hasRole` | SalesView.jsx:1124 | 1 | 🟢 | XS |
| 24 | frontend | `console.error` accidentales | — | 2 | 3 | 🟢 | XS |
| 25 | frontend | Paginación solo implementada en `AccountingView` | extraer `<Pagination>` | — | 1 | 🟢 | M |
| 26 | frontend | `ErrorBoundary` solo a nivel root | envolver por page | `App.jsx` | — | 🟢 | S |
| 27 | frontend | `#FFFFFF` vs `#FFF` vs `#ffffff` mezclados | `var(--surface)` | — | 207 | 🟢 | S |
| 28 | frontend | Loader inconsistente (`Loader` 12 + texto + splash) | `Loader` canon | 3 | — | 🟢 | S |
| 29 | react | `setTimeout` sin cleanup | — | 2 | 2 | 🟢 | XS |
| 30 | backend | Mensajes de error en múltiples formatos/idiomas | normalizar | — | decenas | 🟢 | M |

**Leyenda de esfuerzo:** XS (<30 min), S (1-2 h), M (medio día), L (1+ día).

---

## 🏆 Top 10 fixes recomendados

Priorizado por **impacto / esfuerzo / riesgo**. Los 3 primeros son bugs o seguridad; los siguientes son consistencia pura con alto efecto visible.

### 🥇 1. Bug: transacciones rotas en `admin.js` [🔴 S]
`db.query('BEGIN')` sobre pool no garantiza misma conexión para los `INSERT/COMMIT`. Usar `const client = await db.connect()` + `try/finally client.release()`.
- Archivos: `backend/src/routes/admin.js:13,40,59,74`.
- Referencia correcta: `backend/src/routes/tickets.js:175`.

### 🥈 2. Seguridad: dejar de filtrar `e.message` al cliente [🔴 S]
13 `res.json({ error: e.message })` que exponen mensajes crudos de Postgres. Migrar a `asyncHandler + next(err)` y dejar que `errorHandler.js` responda un shape genérico.
- Archivos: `inventory.js`, `priceimport.js`, `import.js`, `admin.js`, `catalog.js`.

### 🥉 3. Backend: migrar try/catch locales a `asyncHandler` [🔴 M]
17 de 19 rutas tienen 126 bloques `try/catch` idénticos. `asyncHandler` ya existe en `middleware/` y `errorHandler` ya está montado en `index.js:99`. Migración mecánica, archivo por archivo, sin cambiar lógica.
- Efecto colateral: resuelve también el #2 (leaks de `e.message`).

### 4. Erradicar `alert()` / `window.confirm` con primitivos [🔴 M]
Crear `<Toast>` + `useToast()` y `<ConfirmDialog>` (reusar `<Modal>`). Migrar 30 `alert()` + 11 `confirm()`. Enorme salto de UX en mobile.
- Canon base: `<Modal>` en `ui.jsx:319`.
- Puede dividirse en 2 tandas: (a) toasts, (b) confirmaciones.

### 5. Botones: migrar 68 inline a `<Btn variant>` [🔴 M]
`<Btn>` ya existe en `ui.jsx:396`. Endurecer sus variants (`primary|secondary|ghost|danger`) absorbiendo `S.btn`/`S.btn2`/`S.gh`, agregar `loading` y `leftIcon`. Migrar call-sites en 19 archivos (priorizar los 4 hotspots: CatalogView, SupplierPayments, AdminView, SalesView).

### 6. Tokens: reemplazar `#F28100` hardcodeado por `var(--brand)` [🔴 S]
110 ocurrencias en 21 archivos. Reemplazo mecánico `#F28100` → `var(--brand)` en CSS-in-JS (los archivos que mezclen pueden usar `T.brand` si ya importan `T`). Excluir `tokens.css`, `tokens.js`, `ui.jsx`.

### 7. Tokens: reemplazar neutros grises + bordes por tokens [🔴 M]
Reemplazo masivo (con verificación visual por vista):
- `#9CA3AF` (253) → `var(--text-disabled)`
- `#6B7280` (246) → `var(--text-subtle)`
- `#E5E7EB` (207) → `var(--border)`
- `#111827` (116) → `var(--text)`
- `#F9FAFB` (114) → `var(--surface-muted)`
- `#F3F4F6` (110) → `var(--surface-sunken)`
- `#374151` (93) → `var(--text-body)`
- `#D1D5DB` (79) → `var(--border-strong)`

Vamos por tandas (una categoría por repair) para que el evaluador pueda validar.

### 8. Backend: `roleCheck` en lugar de `req.user.role` inline [🔴 S]
39 checks inline (de un total de 122). `roleCheck(...)` ya existe. **Excluir** los checks legítimos por ownership (`if (req.user.role === 'vendedor') { seller_id = $N }` — esos NO son de autorización).

### 9. Extraer `<Card>` primitivo y absorber 127 radios inline [🟡 M]
Base: `S.card` (`ui.jsx:190`). Proponer: `<Card>`, `<Card.Header>`, `<Card.Actions>` normalizando padding/radius/shadow. Migración gradual en los 6 hotspots.

### 10. React: unificar nombres de callbacks [🟡 S]
53 props divergentes (`onSaved` 19, `onUpdated` 17, `onChanged` 8, `onSuccess` 3, `onRefresh` 3, `onDone` 3, `onResolved` 1). Unificar a `onSaved` (mayoría) en toda la base. Rename-only, sin cambio de lógica.

---

## 🧩 Pendientes que no entran al top 10 pero conviene planificar

- **Envelope único de respuesta backend** `{ ok, data, error:{code,message} }` con helpers `ok()/fail()` — toca 100+ call-sites, hacerlo cuando los fixes mecánicos estén asentados.
- **`useReducer` para 5 formularios monstruo** (SalesView `NewSaleModal`, AdminView `UserEditor`, CatalogView, SupplierPayments, InventoryView) — es refactor grande, conviene post-consistencia.
- **`useApiQuery(fn, deps)`** hook único para reemplazar el patrón `useState+useEffect+fetch` — depende de acordar la firma.
- **Envolver pages con `<ErrorBoundary>` individual** para aislar crashes.
- **Paginación `<Pagination>` primitivo** — extraer de `AccountingView.jsx:989-995`.

---

## 🛡️ Riesgos conocidos y cómo los mitigamos

1. **Regresiones visuales** al cambiar hex por tokens (p.ej. `#9CA3AF` y `var(--text-disabled)` coinciden, pero un `#94A3B8` slate-400 se parece pero NO es). Mitigación: el auditor ya documentó equivalencias 1:1. Evaluator corre `npm run build` y compara capturas en hotspots tras cada tanda.
2. **Migración de try/catch a `asyncHandler`** puede cambiar el código de estado devuelto si algún catch tenía lógica especial. Mitigación: repair debe preservar catches que **no** sean `return res.status(5xx).json({error:e.message})`. Los que sí, se borran.
3. **`<Btn>` forzado puede no matchear 1:1 el estilo de un botón específico.** Mitigación: permitir `style` como override + migrar call-site por call-site.
4. **Merge conflicts** si paralelas nuevas tocan los mismos archivos. Mitigación: batches pequeños, commits granulares, evaluator entre cada uno.

---

## 📦 Plan de ejecución propuesto

Si apruebas, el orden sugerido es:

**Ronda 1 — Bugs y seguridad (sin efecto visual)**
1. Fix transacciones admin.js.
2. `asyncHandler` + `errorHandler` (resuelve leaks `e.message`).
3. `roleCheck` inline → middleware.

**Ronda 2 — Tokens (efecto visual mínimo, gran homogeneización)**
4. `#F28100` → `var(--brand)` (110 cambios).
5. Neutros grises + bordes (2-3 sub-tandas).
6. Blancos (`#FFF`/`#FFFFFF` → `var(--surface)`).

**Ronda 3 — Primitivos UI (efecto visual coordinado)**
7. Endurecer `<Btn>` y migrar call-sites.
8. Crear `<Toast>` + `<ConfirmDialog>`, erradicar `alert()`/`confirm()`.
9. Extraer `<Card>` primitivo.

**Ronda 4 — React limpieza (puramente estructural)**
10. Unificar callbacks.
11. Fijar `key={id}`, AbortController, `console.error` sobrantes.

Cada repair pasa por el evaluator antes del commit. No se avanza a la siguiente ronda si la anterior tiene score <90 o tests rojos.

---

## 🗂️ Anexo — Datos crudos por auditor

Los reportes originales se conservan en la memoria de la sesión. Métricas clave:

| Auditor | Severidad 🔴 | Severidad 🟡 | Severidad 🟢 | Destaque |
|---|---|---|---|---|
| design-tokens | 20 hallazgos (1681 hex total) | ~4 categorías | ~3 | 110 brand dups en 21 archivos; 0% adopción `import {T}` |
| ui-pattern | 5 | 6 | 4 | 68 botones inline; 41 alert/confirm; 127 radios inline |
| react-pattern | 5 | 5 | 4 | 54 useState en SalesView; 0 `useReducer` en repo |
| backend | 6 | 6 | 5 | `errorHandler` muerto en 17/19; bug transacción admin.js |

Top 5 archivos con más violaciones de token (hex hardcodeados):
1. `SalesView.jsx` — 228
2. `InventoryView.jsx` — 221
3. `TicketView.jsx` — 208
4. `SupplierPaymentsView.jsx` — 144
5. `CatalogView.jsx` — 143
