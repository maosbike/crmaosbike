# Visual Regression Testing — crmaosbike

> Setup mínimo con Playwright para detectar diferencias visuales entre cambios.
> Los tests se corren **localmente** con tu stack funcionando. Los resultados
> (screenshots baseline, diffs cuando algo cambia) los podés compartir con
> Claude para que vea el impacto visual de un refactor.

## Qué resuelve

Claude puede correr `npm run build` pero **no puede ver la pantalla**. Para
refactors que tocan spacing, colores o layout (migrar 127 cards inline al
primitivo `<Card>`, por ejemplo) sin verificación visual hay riesgo de
regresión silenciosa. Esta suite establece snapshots baseline por page y
compara automáticamente.

## Setup inicial (una vez)

Desde la carpeta `frontend/`:

```bash
# Instala el engine de Chromium que usa Playwright (~150 MB, primera vez).
npm run visual:install
```

Configurá credenciales en `frontend/.env.local` (archivo no versionado) o
exportá en tu shell antes de correr:

```bash
export E2E_BASE_URL=http://localhost:5173
export E2E_USER_EMAIL=admin@crmaosbike.cl
export E2E_USER_PASSWORD=maosbike2024
```

> Se puede usar cualquier usuario seeded — `super_admin` ve todo, útil para
> un smoke completo; `vendedor` ve solo lo propio, útil para regresiones
> de ownership.

## Flujo habitual

### 1. Levantar stack local (3 terminales)

```bash
# Terminal 1 — DB (si usás pg local) o asegurate que DATABASE_URL apunte a algo vivo.

# Terminal 2 — backend
cd backend && npm run dev

# Terminal 3 — frontend
cd frontend && npm run dev
```

### 2. Capturar baseline (primera vez o tras cambio intencional)

```bash
cd frontend
npm run visual:update
```

Esto corre todos los tests y **guarda** los screenshots actuales como la
referencia. Los PNG se versionan en `tests/visual/**/__snapshots__/`.

Commiteá los snapshots como parte del diseño acordado:

```bash
git add frontend/tests/visual/
git commit -m "chore(visual): actualizar baselines"
```

### 3. Corrida normal (tras cambios de código)

```bash
cd frontend
npm run visual
```

- Si todo matchea baseline → PASS.
- Si algún screenshot difiere → FAIL con detalle del diff.

### 4. Ver el reporte HTML

```bash
npm run visual:report
```

Abre un HTML con cada test, pixel-diff resaltado, baseline vs actual
lado a lado. Esto es lo que podés compartir con Claude (el HTML o los
PNG de `test-results/`) para que decida si el cambio es una regresión
real o si el nuevo estado es el deseado.

### 5. Aprobar un cambio visual intencional

Si mirás el diff y confirmás que el nuevo estado es correcto:

```bash
npm run visual:update
git add frontend/tests/visual/
git commit -m "chore(visual): baseline post-migración de <Card>"
```

## Scripts disponibles

| Script | Qué hace |
|---|---|
| `npm run visual:install` | Descarga Chromium (primera vez o tras update de Playwright). |
| `npm run visual` | Corre todos los tests. Falla si hay diff. |
| `npm run visual:public` | Solo los tests que no requieren backend (login). Útil para sanity check rápido. |
| `npm run visual:update` | Re-captura todos los snapshots baseline. |
| `npm run visual:debug` | Abre el UI mode interactivo de Playwright (seleccionar test, step-by-step). |
| `npm run visual:report` | Abre el HTML report de la última corrida. |

## Qué se testea

- **`tests/visual/public.spec.js`** — Login y estado de error. **No requiere
  backend con datos** — solo el frontend dev server corriendo.
- **`tests/visual/auth.spec.js`** — Dashboard, Leads, Pipeline, Ventas,
  Inventario, Catálogo, Calendario, Reportes. **Requiere backend + DB
  seeded** y credenciales válidas.

Se corre en 2 proyectos:

- `desktop-chromium` (viewport 1440×900)
- `mobile-chromium` (Pixel 7)

Si querés agregar tablet, edita `playwright.config.js` → `projects`.

## Buenas prácticas

### Estabilizá antes de capturar

`helpers.js` exporta `stabilize(page)` que:
- Espera a `document.fonts.ready`.
- Espera `networkidle` (500 ms sin requests).
- Deshabilita animaciones/transiciones CSS.
- Oculta `caret-color` (el cursor de inputs es aleatorio).

Llamalo antes de `expect(page).toHaveScreenshot(...)`.

### Escondé contenido volátil

Si hay un timestamp "hace 3 minutos" o un número que cambia por corrida,
agregá `data-visual-hide` al elemento y `helpers.js` ya lo oculta
automáticamente.

### Navegación entre pages

Los tests de `auth.spec.js` navegan con `getByRole('button', { name: /.../i })`.
Si tu nav cambia (ej: migrás `BottomNav` o renombrás un label), vas a tener
que actualizar los selectors.

### Determinismo

Si un test es flaky (falla a veces), el problema suele ser:
1. Falta `stabilize(page)` antes del screenshot.
2. Hay data real-time (notificaciones, chat) que llega asíncrona.
3. El viewport cambia sutil entre corridas (verificá que `viewport` esté fijo).

Como último recurso, subir `maxDiffPixelRatio` en `playwright.config.js`
(actualmente 0.01 = 1%).

## Extender los tests

Para agregar una page nueva o un estado específico:

```js
// tests/visual/nueva.spec.js
import { test, expect } from '@playwright/test';
import { login, stabilize, requireCreds } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await login(page, requireCreds());
});

test('ticket modal con formulario abierto', async ({ page }) => {
  await page.goto('/'); // o la ruta que sea
  await page.getByRole('button', { name: /nuevo ticket/i }).click();
  await stabilize(page);
  await expect(page).toHaveScreenshot('ticket-form.png', { fullPage: true });
});
```

## Qué compartir con Claude si hay regresión

Cuando un test falla y querés que Claude diagnostique:

1. Abrí el `playwright-report/` y encontrá el test que falló.
2. Descargá o pegá las 3 imágenes que muestra: **expected**, **actual**, **diff**.
3. Compartí el path del archivo de screenshot + las 3 PNG.

Claude puede leer las imágenes y decirte si el cambio es pretendido (ajustar
baseline) o una regresión (revertir).

## Limitaciones conocidas

- **No se ejecuta en CI automáticamente.** Es un setup local. Si querés
  automatizarlo en Railway o GitHub Actions hay que montar backend + DB en
  el runner, lo que no está incluido en este setup.
- **No testea flujos largos** (multi-página con estado preservado). Un
  refactor grande que cambia el flow de checkout, por ejemplo, necesita
  tests explícitos del flow completo, no solo screenshots por page.
- **No reemplaza QA manual.** Es un mecanismo de detección, no de prevención
  — atrapa regresiones, no las evita.
