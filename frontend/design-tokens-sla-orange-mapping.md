# `#F97316` → `--warning` · Mapping y decisión visual

> **Estado:** borrador consultivo — **NO ejecutar** sin confirmación del usuario.
> Contexto: Fase 0+1 ya aplicó `--warning: #F59E0B` en `tokens.css`, pero el color **naranja SLA `#F97316`** sigue vigente en código (16 usos). Esta propuesta evalúa si unificarlo o conservarlo como token aparte.

---

## 🎨 Delta visual

| | Hex | RGB | HSL | Carácter |
|---|---|---|---|---|
| **Actual SLA** | `#F97316` | 249, 115, 22 | 21°, 95%, 53% | 🔸 naranja "urgente" |
| **Propuesto `--warning`** | `#F59E0B` | 245, 158, 11 | 38°, 94%, 50% | 🟡 ámbar "atención" |

**Shift de tono:** ~17° hacia amarillo. Perceptible en side-by-side; en uso aislado probablemente pase desapercibido.
**Delta de luminancia:** mínimo (ambos ~50% L).
**Impacto UX:** el naranja "urgente" tiende a leerse como más crítico que el ámbar. Cambiar `Atender ya` a ámbar podría **bajarle intensidad visual** al estado más sensible del CRM (SLA vencido inminente).

---

## 📋 Inventario de usos (16 ocurrencias)

### Grupo A · SLA warning semántico (candidatos directos)
| Archivo | Línea | Uso | Scope |
|---|---|---|---|
| `ui.jsx` | 74 | `SLA_STATUS.warning.c` — definición canónica | 🎯 crítico |
| `ui.jsx` | 74 | `SLA_STATUS.warning.bg` `rgba(249,115,22,0.12)` | 🎯 crítico |
| `CalendarView.jsx` | 9 | `SLA_COLORS.warning` — **duplicado local** de SLA_STATUS | 🎯 |
| `CalendarView.jsx` | 190 | Leyenda visual "Atender ya" | 🎯 |
| `Dashboard.jsx` | 22 | `Stat` KPI "Atender ya" (ic + ib `rgba(…,0.1)`) | 🎯 visible en landing |
| `Dashboard.jsx` | 35 | Color del contador según `hours_left` | 🎯 |
| `TicketView.jsx` | 394 | Timer "Xh" cuando slaWarning | 🎯 |
| `TicketView.jsx` | 408 | Banner "Atender ya · Xh restantes" (icon + bg + border) | 🎯 visible |

**Subtotal: 8 usos directos de SLA.**

### Grupo B · "Warning" semántico pero NO-SLA (ambiguo)
| Archivo | Línea | Uso | Observación |
|---|---|---|---|
| `InventoryView.jsx` | 1474 | Stat "Incompletas" en preview import | ⚠️ conviene ámbar |
| `InventoryView.jsx` | 1481 | Texto "naranjas (incompletas)" | ⚠️ hablan de "naranjas" literal — si se cambia el tono, **actualizar el copy también** |
| `InventoryView.jsx` | 1489 | Bg warning row (preview import) | ⚠️ |
| `InventoryView.jsx` | 1490 | Icon color warning row | ⚠️ |

**Subtotal: 4 usos semánticos de "warning" en import preview.** **Coexisten con `#F59E0B` en el mismo componente** — hoy `incompletas` (naranja) y `duplicados` (ámbar) son dos niveles distintos. Unificar haría que se vean iguales → **perder granularidad UX**.

### Grupo C · Color literal (NO tocar)
| Archivo | Línea | Uso |
|---|---|---|
| `ui.jsx` | 207 | `CAT_COLOR.ATV` — naranja representa la categoría ATV |
| `InventoryView.jsx` | 56 | `'naranja fluor': '#F97316'` — color real de una moto |
| `ColorPicker.jsx` | 6 | Paleta del picker — naranja es una opción de color |
| `CatalogView.jsx` | 34 | `'naranja fluor': '#F97316'` |
| `SupplierPaymentsView.jsx` | 50 | `naranja: '#F97316'` en map nombre-moto → hex |

**Subtotal: 5 usos literales.** **EXCLUIR del batch** — representan colores reales del mundo físico (pintura de moto, no estado UI). Conservar `#F97316` como valor literal de "naranja fluor".

---

## 🛠️ Opciones

### Opción 1 · Unificación completa (agresiva)
Reemplazar los **12 usos semánticos** (grupos A + B) por el token `--warning` / `color.warning` = `#F59E0B`.
Conservar los 5 literales (grupo C).

**Pros:**
- Un solo "color de atención" en todo el CRM → coherencia máxima.
- El token ya existe en `tokens.css`.

**Contras:**
- `Atender ya` (SLA crítico) pierde su tono urgente y se confunde con `En gestión` (badge `en_gestion` = `#F59E0B`). Los dos estados **más sensibles en el flujo comercial quedarían cromáticamente idénticos**.
- En `InventoryView` preview: `Incompletas` y `Duplicados` colapsan al mismo color → pierde el bucket visual de 4 niveles (ok / warning / duplicate / error) → 3 niveles.

### Opción 2 · Mantener dos tokens (recomendada)
Introducir `--sla-warning: #F97316` como token separado y conservar `--warning: #F59E0B`.
Reemplazar los 8 usos SLA (grupo A) por `--sla-warning`; los 4 de import preview (grupo B) por `--warning`.

**Pros:**
- Conserva la distinción UX actual entre SLA (naranja urgente) y warning genérico (ámbar).
- Tokeniza los 12 usos semánticos. Hex literal desaparece del código.
- Import preview gana coherencia con el token genérico.

**Contras:**
- Un token más que explicar/documentar.
- El usuario original pidió "unificar" — esta opción no lo hace 100%.

### Opción 3 · Conservar sin tocar
No hacer nada. El código queda con `#F97316` literal.

**Pros:** cero riesgo.
**Contras:** queda un hex "huérfano" del sistema de tokens, dificulta tematización futura.

---

## 📐 Implementación propuesta (Opción 2)

### Paso 1 — Añadir token en `tokens.css`
```css
/* ─── SLA warning: naranja "urgente", distinto del ámbar genérico ─── */
--sla-warning:        #F97316;
--sla-warning-soft:   rgba(249, 115, 22, 0.10);
--sla-warning-muted:  rgba(249, 115, 22, 0.12);
--sla-warning-strong: rgba(249, 115, 22, 0.22);
```

### Paso 2 — Espejo en `tokens.js`
```js
slaWarning:       '#F97316',
slaWarningSoft:   'rgba(249, 115, 22, 0.10)',
slaWarningMuted:  'rgba(249, 115, 22, 0.12)',
slaWarningStrong: 'rgba(249, 115, 22, 0.22)',
```

### Paso 3 — Reemplazos (vía `components`, cuando consuman tokens)

| Archivo | Reemplazo |
|---|---|
| `ui.jsx:74` | `c: T.color.slaWarning, bg: T.color.slaWarningMuted` |
| `CalendarView.jsx:9` | `warning: T.color.slaWarning` |
| `CalendarView.jsx:190` | `c: T.color.slaWarning` |
| `Dashboard.jsx:22` | `ic={T.color.slaWarning} ib={T.color.slaWarningSoft}` |
| `Dashboard.jsx:35` | `T.color.slaWarning` |
| `TicketView.jsx:394` | `T.color.slaWarning` |
| `TicketView.jsx:408` | `T.color.slaWarningSoft`, `T.color.slaWarningStrong`, `T.color.slaWarning` |
| `InventoryView.jsx:1474,1481,1489,1490` | `T.color.warning` + `T.color.warningSoft` (grupo B → `--warning` ámbar) |

**Considerar actualización de copy:** `InventoryView.jsx:1481` dice literal *"naranjas (incompletas)"*. Si el color cambia a ámbar, el copy debería decir *"amarillas"* o simplemente *"marcadas en amarillo"*. → Coordinar con `ux-copy`.

---

## ✅ Recomendación

**Opción 2** (dos tokens distintos). Motivo: el delta UX de colapsar SLA crítico con warning genérico es **mayor** que el costo de mantener un token extra. El proyecto ya tiene vocabulario semántico rico (`SLA_STATUS`, `TICKET_STATUS`, `FIN_STATUS`) — un `--sla-warning` encaja naturalmente.

Si el usuario prefiere simplicidad y acepta el delta visual, proceder con **Opción 1**, pero recordar:
- Actualizar copy en `InventoryView.jsx:1481`.
- Validar que `Atender ya` (ámbar) sigue siendo distinguible de `En gestión` (también ámbar) — probablemente requerirá reforzar con icono y/o borde.

**Pendiente de confirmación** antes de ejecutar cualquier opción.
