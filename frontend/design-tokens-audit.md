# CRMaosBike — Auditoría Design System (Tokens)

> Fecha: 2026-04-15 · Modo: **propose-only** (marcha blanca, sin cambios destructivos)
> Scope: `frontend/src/**/*.{jsx,css}` — monolito `App.jsx` + componentes + `ui.jsx` + `responsive.css`

---

## 🎨 Snapshot del sistema actual

| Dimensión | Valores únicos detectados | Estado |
|---|---|---|
| Colores hex | **~140** distintos (sin contar rgba) | 🔴 disperso, duplicados evidentes |
| rgba() | **~60** combinaciones | 🟡 aceptable, algunas casi iguales |
| Font sizes (JS inline) | **19** tamaños (7px → 44px) | 🔴 demasiado granular |
| Font weights | 400, 500, 600, 700, 800, 900 | 🟡 ok, pero 500 infrautilizado |
| Font families | `'inherit'`, `'monospace'`, `Inter,system-ui,sans-serif` (1 vez) | 🟢 consistente (hereda del body) |
| Border radius | **15** valores (2px → 22px) + `50%` | 🔴 escala no definida |
| Padding (literales) | ~40 combinaciones distintas | 🔴 sin escala |
| Gap | 15 valores (1 → 28) | 🔴 sin escala |
| Box shadow | **11** variantes | 🟡 agrupables en 4 niveles |
| Breakpoints | `767` / `768` / `1024` (vía `BP.MOBILE = 768`) | 🟢 coherente |

**Tokens semánticos que SÍ existen** (fuente única de verdad):
- Estados de lead → [ui.jsx:22-30](frontend/src/ui.jsx#L22) `TICKET_STATUS` (c + bg por estado)
- Prioridad → [ui.jsx:62](frontend/src/ui.jsx#L62) `PRIORITY`
- Estado financiero → [ui.jsx:68](frontend/src/ui.jsx#L68) `FIN_STATUS`
- Inventario → [ui.jsx:70](frontend/src/ui.jsx#L70) `INV_ST`
- SLA → [ui.jsx:71-76](frontend/src/ui.jsx#L71) `SLA_STATUS`
- Categoría moto → [ui.jsx:202](frontend/src/ui.jsx#L202) `CAT_COLOR`
- Breakpoints → [ui.jsx:5](frontend/src/ui.jsx#L5) `BP.MOBILE = 768`
- Estilos base → [ui.jsx:165-173](frontend/src/ui.jsx#L165) `S.card`, `S.inp`, `S.btn`, `S.btn2`, `S.lbl`

**Lo que falta** (y es lo que esta auditoría propone):
- Tokens de texto/grises/superficies/bordes.
- Escala tipográfica explícita.
- Escala de espaciado.
- Escala de radios y elevación.
- Colores de feedback (success/warning/danger/info) unificados con los semánticos existentes.

---

## 🔍 Hallazgos por categoría

### 1. Colores — Duplicados y casi-duplicados

#### 1.1 Blancos / superficies claras
| Valor actual | Usos | Notas |
|---|---|---|
| `#FFFFFF` | 74 | canonical |
| `#FFF` | 71 | **duplicado exacto** de `#FFFFFF` — notación corta |
| `#F9FAFB` | 66 | Tailwind gray-50 |
| `#F8FAFC` | 24 | Tailwind slate-50 |
| `#FAFAFA` | 3 | Material neutral-50 |
| `#FAFBFC` | 3 | GitHub-ish |
| `#F5F5F7` | 9 | Apple-ish |

**Problema:** 4 "off-whites" ligeramente distintos para el mismo propósito (fondos suaves).
**Propuesta:** colapsar a **2 tokens**: `--surface` (#FFFFFF) y `--surface-muted` (#F9FAFB).

#### 1.2 Grises de texto — caos entre Tailwind, shorthands y paleta custom
| Valor | Usos | Fuente | Comentario |
|---|---|---|---|
| `#6B7280` | **235** | Tailwind gray-500 | texto secundario canónico |
| `#9CA3AF` | 149 | Tailwind gray-400 | placeholder/hint |
| `#374151` | 85 | Tailwind gray-700 | texto fuerte |
| `#0F172A` | 70 | Tailwind slate-900 | título |
| `#94A3B8` | 44 | Tailwind slate-400 | **casi igual a `#9CA3AF`** |
| `#64748B` | 12 | Tailwind slate-500 | **casi igual a `#6B7280`** |
| `#4B5563` | 9 | Tailwind gray-600 | |
| `#475569` | 11 | Tailwind slate-600 | **casi igual a `#4B5563`** |
| `#1F2937` | 9 | Tailwind gray-800 | |
| `#1E293B` | 10 | Tailwind slate-800 | **casi igual a `#1F2937`** |
| `#111827` | 7 | Tailwind gray-900 | |
| `#1A1A1A` | 7 | custom (usado en `S.inp`) | **casi igual a gray-900** |
| `#6B6B6B` | 15 | custom | **casi igual a `#6B7280`** (usado en `Stat`) |
| `#888` | 13 | legacy | |
| `#555` | 11 | legacy | |
| `#111111` | 6 | legacy | |
| `#333`, `#222`, `#444`, `#777`, `#8A8A8A`, `#CCC`, `#DDD` | varios 1-2 | legacy | **eliminar** |

**Problema:** coexisten dos paletas (Tailwind **gray** y **slate**) + grises cortos + grises custom. Visualmente indistinguibles pero genera ruido en el CSS.
**Propuesta:** estandarizar en la familia **slate** (azulada, más fría, más "business") O **gray** (neutra). Recomendación: **slate** porque el brand orange (`#F28100`) contrasta mejor contra slate.

Mapeo sugerido (→ token):
- `#0F172A`, `#111827`, `#111111`, `#1A1A1A`, `#1E293B`, `#1F2937`, `#222`, `#18181B`, `#1C1917` → `--text` (#0F172A)
- `#374151`, `#333`, `#444`, `#1F2937` (uso texto) → `--text-strong` (#334155)
- `#4B5563`, `#475569`, `#555` → `--text-body` (#475569)
- `#6B7280`, `#6B6B6B`, `#64748B`, `#888`, `#777` → `--text-muted` (#64748B)
- `#9CA3AF`, `#94A3B8`, `#8A8A8A` → `--text-subtle` (#94A3B8)
- `#CBD5E1` → `--text-disabled` (#CBD5E1)

#### 1.3 Bordes
| Valor | Usos | Propuesta |
|---|---|---|
| `#E5E7EB` | 144 | `--border` (default) |
| `#D1D5DB` | 69 | `--border-strong` (inputs) |
| `#E2E8F0` | 38 | **duplicado funcional** de E5E7EB → consolidar |
| `#F3F4F6` | 36 | `--border-subtle` |
| `#F1F3F5` | 26 | **duplicado** de F1F5F9 |
| `#F1F5F9` | 18 | `--border-subtle` alt |
| `#CBD5E1` | 21 | `--border-strong` alt |
| `#E9EAEC`, `#EEEF​EF`, `#ECEEF1`, `#E2E5EA` | 1-2 c/u | legacy, eliminar |

**Decisión crítica:** `#F1F3F5` (26 usos en [responsive.css:118-212](frontend/src/responsive.css)) vs `#F1F5F9` (Tailwind slate-100). Son visualmente indistinguibles. El primero es custom, el segundo es estándar → **migrar a `#F1F5F9`**.

#### 1.4 Marca y feedback (ya semánticos, ver alineación)

| Rol | Color base (propuesta) | Bg suave | Usado en |
|---|---|---|---|
| **Primary (brand)** | `#F28100` | `rgba(242,129,0,0.1)` | btn principal, focus, acento |
| **Primary dark** (hover) | `#C2410C` | — | pocos usos, formalizar |
| **Danger** | `#EF4444` | `#FEF2F2` | `perdido`, `rechazado`, errores |
| **Danger dark** | `#DC2626` → `#B91C1C` | — | hover / heavy states |
| **Warning** | `#F59E0B` | `#FFFBEB` | `en_gestion`, `media priority`, `en_evaluacion` |
| **Warning dark** | `#B45309` / `#92400E` | — | texto sobre bg amber |
| **Success** | `#10B981` | `#F0FDF4` | `ganado`, `aprobado`, `disponible` |
| **Success dark** | `#059669` / `#15803D` | — | texto sobre bg green |
| **Info** | `#3B82F6` | `#EFF6FF` | `abierto` |
| **Cyan** | `#06B6D4` | `#ECFEFF` | `nuevo`, `preinscrita` |
| **Purple** | `#8B5CF6` | `#F5F3FF` | `cotizado`, `vendida`, `reasignado` |
| **Orange-alt** | `#F97316` | `rgba(249,115,22,0.12)` | SLA `warning` (no confundir con brand) |

**Problema crítico:** `#F28100` (brand) y `#F97316` (SLA warning) son **visualmente muy parecidos**. Hoy conviven sin conflicto porque `#F97316` solo aparece en badges SLA, pero al usuario final le puede costar distinguir "urgencia" de "marca". → **Flaggear para revisión**: ¿mantener `#F97316` o migrar SLA warning a amber (`#F59E0B`)?

#### 1.5 rgba() — consolidable

Hay **~60 variantes** de rgba, la mayoría construibles desde el mismo hex base con alpha distinto. Ejemplos:

- `rgba(0,0,0,0.04)` (13) · `0.06` (7) · `0.1` (2) · `0.12` (2) · `0.15` (5) · `0.18` (3) · `0.45` (3) · `0.55` (4) · `0.75` (2) → **6 niveles de overlay**
- `rgba(242,129,0, ...)` con alphas `0.04`, `0.08`, `0.1`, `0.12`, `0.15`, `0.3`, `0.35` → **4 niveles**
- `rgba(239,68,68, ...)` con alphas `0.05`–`0.3` → **4 niveles**
- `rgba(16,185,129, ...)` con alphas `0.07`–`0.3` → **4 niveles**

**Propuesta:** definir alphas estándar en 4 niveles: `/soft` (0.08), `/muted` (0.15), `/medium` (0.25), `/strong` (0.4) — y derivar todos los rgba del token base correspondiente.

---

### 2. Tipografía

#### 2.1 Font sizes (inline, `px`)
| Uso observado | Tamaño | Frecuencia | → Token propuesto |
|---|---|---|---|
| Micro (label, eyebrow) | 7, 8, 9, 10 | 199 | `--fs-xxs` (10px) |
| Small (meta, hint, badge) | 11, 12 | 396 | `--fs-xs` (11px) · `--fs-sm` (12px) |
| Body / input | 13 | 100 | `--fs-base` (13px) |
| Body-large | 14, 15 | 29 | `--fs-md` (14px) |
| Subtitle / h3 | 16, 17, 18 | 45 | `--fs-lg` (16px) · `--fs-xl` (18px) |
| Heading / kpi | 20, 22, 24 | 14 | `--fs-2xl` (22px) |
| Display | 26, 28, 36, 44 | 7 | `--fs-3xl` (28px) · `--fs-display` (36px) |

**Problema:** conviven 7px, 8px y 9px que son prácticamente ilegibles en laptop. Revisar dónde se usan y subirlos a 10-11px mínimo.
**iOS-safe:** inputs ya tienen override a 16px en mobile ([responsive.css:45](frontend/src/responsive.css#L45)) — conservar.

#### 2.2 Font weights
Distribución sana: `700` (194) como peso default de títulos, `600` (143) para acentos, `800` (39) para KPIs. Consolidar así, eliminar `900` salvo display (solo 20 usos, revisar).

---

### 3. Espaciado — proponer escala 4/8

Valores actuales de `gap` y `padding` agrupables a una escala base-4:
- 1, 2 → `--space-0.5` (2px) — usar con cuidado
- 3, 4 → `--space-1` (4px)
- 5, 6, 7 → `--space-1.5` (6px)
- 8, 9 → `--space-2` (8px)
- 10, 11, 12 → `--space-3` (12px)
- 14, 16 → `--space-4` (16px)
- 20 → `--space-5` (20px)
- 24 → `--space-6` (24px)
- 28, 32 → `--space-8` (32px)
- 40, 48 → `--space-10` (40px) / `--space-12` (48px)

**Outliers a normalizar:**
- `gap: 5`, `gap: 7`, `gap: 9`, `gap: 11` → redondear a `4 / 8 / 8 / 12`
- `padding: "7px 12px"` ([ui.jsx:167](frontend/src/ui.jsx#L167) `S.inp`… espera, es `8px 12px`) — ok
- `marginBottom: 3` (37 usos) y `marginBottom: 7` (11 usos) → usar 4 u 8

---

### 4. Border radius — proponer escala

| Actual | Usos | → Token |
|---|---|---|
| 2, 3, 4 | 18 | `--radius-xs` (4px) |
| 5, 6, 7 | 114 | `--radius-sm` (6px) |
| 8, 9 | 94 | `--radius-md` (8px) — **default de inputs/botones** |
| 10 | 47 | unificar con `--radius-md` (8) o subir a 12 |
| 12 | 17 | `--radius-lg` (12px) — cards |
| 14, 16, 18 | 21 | `--radius-xl` (16px) — modales |
| 20, 22 | 22 | `--radius-pill` (999px) — badges |
| `50%` | 11 | `--radius-full` — avatars, dots |

**Inconsistencia menor:** radios `6` y `7` conviven en botones chicos; `10` conviven con `8` y `12` sin razón aparente. Unificar.

---

### 5. Sombras — consolidar a 4 niveles

| Actual | Uso | → Token |
|---|---|---|
| `0 1px 3px rgba(0,0,0,0.04)` / `0 1px 4px rgba(0,0,0,0.04)` | cards planas | `--shadow-sm` |
| `0 1px 6px rgba(0,0,0,0.06)` / `0 2px 8px rgba(0,0,0,0.06)` | cards elevadas, notif | `--shadow-md` |
| `0 8px 32px rgba(0,0,0,0.7)` / `0 20px 60px rgba(0,0,0,0.15-0.22)` | modales | `--shadow-lg` |
| `0 32px 80px rgba(0,0,0,0.35)` | dialog crítico | `--shadow-xl` |
| `0 2px 8px rgba(242,129,0,0.35)` / `0 4px 12px rgba(242,129,0,.35)` | botón primary con glow | `--shadow-brand` |

**Problema:** `rgba(0,0,0,0.7)` en [¿ColorPicker?] es una sombra muy opaca, atípica. Revisar contexto — probablemente un error.

---

### 6. Breakpoints — ya está bien

`BP.MOBILE = 768` ([ui.jsx:5](frontend/src/ui.jsx#L5)) + 3 media queries consistentes en `responsive.css`. No requiere cambios, sólo exponer como tokens CSS:

```css
--bp-mobile: 768px;
--bp-tablet: 1024px;
```

---

## 📐 Tokens propuestos (CSS custom properties)

> Archivo sugerido: `frontend/src/tokens.css`, importado **antes** de `responsive.css` en `main.jsx`.

```css
:root {
  /* ─── Color: Surface ─── */
  --surface:         #FFFFFF;
  --surface-muted:   #F9FAFB;
  --surface-sunken:  #F1F5F9;

  /* ─── Color: Text (slate family) ─── */
  --text:          #0F172A;
  --text-strong:   #334155;
  --text-body:     #475569;
  --text-muted:    #64748B;
  --text-subtle:   #94A3B8;
  --text-disabled: #CBD5E1;
  --text-on-brand: #FFFFFF;

  /* ─── Color: Border ─── */
  --border:         #E5E7EB;
  --border-strong:  #D1D5DB;
  --border-subtle:  #F1F5F9;

  /* ─── Color: Brand ─── */
  --brand:          #F28100;
  --brand-hover:    #C2410C;
  --brand-soft:     rgba(242,129,0,0.10);
  --brand-muted:    rgba(242,129,0,0.15);

  /* ─── Color: Feedback ─── */
  --success:        #10B981;
  --success-strong: #059669;
  --success-soft:   #F0FDF4;

  --warning:        #F59E0B;
  --warning-strong: #B45309;
  --warning-soft:   #FFFBEB;

  --danger:         #EF4444;
  --danger-strong:  #DC2626;
  --danger-soft:    #FEF2F2;

  --info:           #3B82F6;
  --info-soft:      #EFF6FF;

  --cyan:           #06B6D4;
  --cyan-soft:      #ECFEFF;

  --purple:         #8B5CF6;
  --purple-soft:    #F5F3FF;

  /* SLA warning: reservar naranja-rojizo distinto del brand */
  --sla-warning:      #F97316;
  --sla-warning-soft: rgba(249,115,22,0.12);

  /* ─── Spacing (base-4) ─── */
  --space-0:    0;
  --space-0_5: 2px;
  --space-1:   4px;
  --space-1_5: 6px;
  --space-2:   8px;
  --space-3:  12px;
  --space-4:  16px;
  --space-5:  20px;
  --space-6:  24px;
  --space-8:  32px;
  --space-10: 40px;
  --space-12: 48px;

  /* ─── Radius ─── */
  --radius-xs:   4px;
  --radius-sm:   6px;
  --radius-md:   8px;   /* default: inputs, botones */
  --radius-lg:  12px;   /* cards */
  --radius-xl:  16px;   /* modales */
  --radius-pill: 999px;
  --radius-full: 50%;

  /* ─── Typography ─── */
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, monospace;

  --fs-xxs:  10px;
  --fs-xs:   11px;
  --fs-sm:   12px;
  --fs-base: 13px;   /* body default (coherente con S.inp) */
  --fs-md:   14px;
  --fs-lg:   16px;
  --fs-xl:   18px;
  --fs-2xl:  22px;
  --fs-3xl:  28px;
  --fs-display: 36px;

  --fw-regular: 400;
  --fw-medium:  500;
  --fw-semi:    600;
  --fw-bold:    700;
  --fw-xbold:   800;

  --lh-tight:  1.2;
  --lh-normal: 1.45;
  --lh-relaxed: 1.6;

  /* ─── Shadow / elevation ─── */
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.04);
  --shadow-md: 0 2px 8px rgba(0,0,0,0.06);
  --shadow-lg: 0 20px 60px rgba(0,0,0,0.18);
  --shadow-xl: 0 32px 80px rgba(0,0,0,0.35);
  --shadow-brand: 0 2px 8px rgba(242,129,0,0.35);
  --ring-focus: 0 0 0 3px rgba(242,129,0,0.25);

  /* ─── Breakpoints (solo lectura / doc) ─── */
  --bp-mobile: 768px;
  --bp-tablet: 1024px;

  /* ─── Z-index ─── */
  --z-base:       1;
  --z-sticky:    10;
  --z-bottom-nav: 70;
  --z-drawer:    89;
  --z-header:    90;
  --z-modal:     60;   /* revisar: hoy modal < drawer, puede generar bugs */
}
```

### Espejo en JS (para `ui.jsx`)

```js
// frontend/src/tokens.js
export const T = {
  color: {
    surface: '#FFFFFF', surfaceMuted: '#F9FAFB', surfaceSunken: '#F1F5F9',
    text: '#0F172A', textStrong: '#334155', textBody: '#475569',
    textMuted: '#64748B', textSubtle: '#94A3B8', textDisabled: '#CBD5E1',
    border: '#E5E7EB', borderStrong: '#D1D5DB', borderSubtle: '#F1F5F9',
    brand: '#F28100', brandHover: '#C2410C',
    success: '#10B981', warning: '#F59E0B', danger: '#EF4444',
    info: '#3B82F6', cyan: '#06B6D4', purple: '#8B5CF6',
    slaWarning: '#F97316',
  },
  space: { 0:0, 0.5:2, 1:4, 1.5:6, 2:8, 3:12, 4:16, 5:20, 6:24, 8:32, 10:40, 12:48 },
  radius: { xs:4, sm:6, md:8, lg:12, xl:16, pill:999 },
  fs: { xxs:10, xs:11, sm:12, base:13, md:14, lg:16, xl:18, '2xl':22, '3xl':28 },
  fw: { regular:400, medium:500, semi:600, bold:700, xbold:800 },
  shadow: {
    sm: '0 1px 3px rgba(0,0,0,0.04)',
    md: '0 2px 8px rgba(0,0,0,0.06)',
    lg: '0 20px 60px rgba(0,0,0,0.18)',
    xl: '0 32px 80px rgba(0,0,0,0.35)',
    brand: '0 2px 8px rgba(242,129,0,0.35)',
    ringFocus: '0 0 0 3px rgba(242,129,0,0.25)',
  },
};
```

---

## 🛠️ Plan de migración (priorizado, sin riesgo)

Todos los pasos son **aditivos** (no rompen nada). Pueden aplicarse uno a uno y mergearse independientemente.

### Fase 0 — Fundación (Esfuerzo: S, Riesgo: 0)
1. **Crear `frontend/src/tokens.css`** con el bloque `:root` completo.
2. **Importarlo en `main.jsx`** antes de `responsive.css`.
3. **Crear `frontend/src/tokens.js`** con el mirror JS.
4. Re-exportar `T` desde `ui.jsx` para uso en inline styles.

> Después de Fase 0, los tokens existen pero **nada los usa todavía**. Riesgo 0.

### Fase 1 — Consolidar los peores duplicados (Esfuerzo: S, Riesgo: bajo)
Buscar/reemplazar literal en todo `frontend/src`:

| Buscar | Reemplazar | Motivo |
|---|---|---|
| `"#FFF"` (forma corta con comillas) | `"#FFFFFF"` | misma cosa, eliminar ruido |
| `#F1F3F5` | `#F1F5F9` | visualmente igual, 26 usos en responsive.css |
| `#6B6B6B` | `#6B7280` | 15 usos, diferencia imperceptible |
| `#1A1A1A` | `#0F172A` | 7 usos (solo en `S.inp` de ui.jsx) |
| `#888`, `#777`, `#8A8A8A` | `#94A3B8` | legacy grays |
| `#555`, `#444` | `#475569` | legacy grays |
| `#333`, `#222`, `#111`, `#111111` | `#0F172A` | legacy grays |
| `#CCC`, `#DDD` | `#CBD5E1` | legacy grays |

**Cobertura estimada:** ~100 sustituciones automáticas, 0 regresiones visuales esperadas.

### Fase 2 — Migrar `S` (ui.jsx) a tokens (Esfuerzo: S, Riesgo: bajo)
[ui.jsx:165-173](frontend/src/ui.jsx#L165) — cambiar los 5 estilos base (`card`, `inp`, `btn`, `btn2`, `lbl`) para usar `var(--...)` (si se migra a CSS-in-JS con custom properties) o `T.*` (mirror JS).

Impacto: unifica los estilos que **más se reutilizan** (S.btn → 100+ botones del CRM).

### Fase 3 — Reemplazar literales en componentes top-5 más visibles (Esfuerzo: M, Riesgo: medio)
Orden por impacto al usuario:

1. [Login.jsx](frontend/src/components/Login.jsx) — primera pantalla.
2. [Dashboard.jsx](frontend/src/components/Dashboard.jsx) — landing post-login.
3. [PipelineView.jsx](frontend/src/components/PipelineView.jsx) — vista core vendedor.
4. [SalesView.jsx](frontend/src/components/SalesView.jsx) — vista core backoffice.
5. [InventoryView.jsx](frontend/src/components/InventoryView.jsx) — vista core admin.

En cada una: reemplazar font-sizes, radios, gaps y colores por tokens. **Testear visualmente** vista por vista antes de mergear.

### Fase 4 — Armonizar escala tipográfica (Esfuerzo: M, Riesgo: bajo)
Redondear outliers:
- `fontSize: 7/8/9` → revisar, subir a 10 mínimo (acc. legibilidad).
- `fontSize: 15/17` (huérfanos, 16 usos) → decidir 14 o 16.
- `fontSize: 26` → subir a 28 (--fs-3xl).

### Fase 5 — Normalizar espaciado (Esfuerzo: L, Riesgo: bajo)
Busca/reemplazar gaps y paddings outliers:
- `gap: 5 | 7 | 9 | 11` → `4 | 8 | 8 | 12`
- `marginBottom: 3 | 7` (48 + 11 usos) → `4 | 8`

Esfuerzo alto por volumen, riesgo bajo porque el delta visual es ≤2px.

### Fase 6 — Revisar decisiones de marca (Esfuerzo: S, Requiere alineación de producto)
Decisiones abiertas — **no automatizar, consultar al dueño**:

- [ ] ¿`#F97316` (SLA warning) se queda o se unifica con `#F59E0B` (amber) para no confundir con brand `#F28100`?
- [ ] ¿Se adopta paleta `slate` o `gray` como canónica para grises?
- [ ] ¿Se introduce Tailwind CSS (reemplazando `responsive.css`) o se mantiene CSS-in-JS? El set de tokens propuesto funciona en **ambos escenarios**.
- [ ] Z-index: `modal: 60` < `drawer: 89` → hoy el drawer mobile tapa el modal. ¿Es intencional?

---

## ✅ Resumen ejecutivo para el team-lead

1. **Hay un sistema semántico sólido** (estados de lead, prioridades, SLA) pero los **tokens "de chasis"** (texto, superficie, borde, espaciado, radios) están **implícitos y duplicados**.
2. **Ninguna propuesta requiere tocar backend, lógica de negocio, ni vistas críticas en esta fase**. Fase 0–2 son fundacionales, puramente aditivas.
3. **Duplicados detectados:** `#FFF` vs `#FFFFFF`, `#F1F3F5` vs `#F1F5F9`, `#6B6B6B` vs `#6B7280`, más de 8 grises legacy cortos. **Limpiar esto es el quick win de mayor retorno.**
4. **Riesgo de confusión visual:** brand orange `#F28100` vs SLA warning `#F97316` — requiere decisión de producto.
5. **Próximo paso recomendado:** aprobar Fase 0 (crear `tokens.css` + `tokens.js`) — no altera nada visible, solo prepara el terreno.
