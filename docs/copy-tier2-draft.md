# Copy Tier 2 — Borrador para #10

Preparación previa al trabajo bloqueado por #9 (primitivas `Empty` / `Loader` de `components`).
Este doc **no toca código de producción**. Solo inventario + copy canónico listo para aplicar cuando las primitivas estén disponibles.

Glosario aplicado (ver informe #4):
**moto** (producto comercial) · **modelo** (ficha de catálogo) · **unidad** (item con chasis/motor) · **chasis** · **lead** (en pipeline) · **cliente** (tras compra) · **ticket** (registro con N°) · **bono** · **lista** · **sucursal** · **vendedor** · **test ride**.

Regla de tono: **tuteo chileno** (`Selecciona`, `Agrega`, `Revisa`). Nunca voseo. Infinitivo en botones.

---

## 1. Catálogo canónico para primitivas `<Empty />` y `<Loader />`

### 1.1 API propuesta (a validar con `components`)

```jsx
<Empty
  icon={Ic.box}               // opcional — ícono grande decorativo
  title="…"                    // sustantivo, 2–4 palabras
  hint="…"                     // opcional — una línea con guía/CTA textual
  action={<Btn>…</Btn>}         // opcional — CTA real
/>

<Loader label="…" />            // verbo concreto + sustantivo
```

### 1.2 Instancias detectadas — texto canónico

#### Empty states (reemplazan strings actuales)

| Vista / ubicación | Actual | `title` | `hint` | Notas |
|---|---|---|---|---|
| [RemindersTab.jsx:33](frontend/src/components/RemindersTab.jsx#L33) | `Sin recordatorios. Crea uno para hacer seguimiento.` | `Sin recordatorios` | `Crea uno para hacer seguimiento del lead.` | ✅ ya OK, solo portar a primitiva |
| [NotifBell.jsx:38](frontend/src/components/NotifBell.jsx#L38) | `Sin notificaciones pendientes` | `Sin notificaciones` | `Todo al día.` | — |
| [AdminView.jsx:288](frontend/src/components/AdminView.jsx#L288) | `Sin usuarios registrados.` | `Sin usuarios` | `Crea el primer usuario con el botón de arriba.` | con CTA si cabe |
| [AdminView.jsx:433](frontend/src/components/AdminView.jsx#L433) | `Sin aliases configurados.` | `Sin aliases` | `Agrega el primero para mapear nombres equivalentes de modelos.` | — |
| [PipelineView.jsx:73](frontend/src/components/PipelineView.jsx#L73) | `Sin tickets en este estado` | `Sin leads` | `No hay leads en esta etapa del pipeline.` | **glosario: tickets → leads** |
| [PipelineView.jsx:150](frontend/src/components/PipelineView.jsx#L150) | `Sin tickets` | `Sin leads` | — | idem |
| [LeadsList.jsx:255](frontend/src/components/LeadsList.jsx#L255) | `Sin tickets registrados` / `Sin resultados con estos filtros` | `Sin leads` / `Sin resultados` | `Ajusta los filtros o crea un lead nuevo.` | **glosario** |
| [InventoryView.jsx:684-689](frontend/src/components/InventoryView.jsx#L684) | `Sin unidades en el inventario` + `Agrega unidades manualmente o impórtalas desde Excel.` | `Sin unidades en el inventario` | `Agrégalas manualmente o impórtalas desde Excel.` | ✅ ya tuteado |
| [InventoryView.jsx:849,1158](frontend/src/components/InventoryView.jsx#L849) | `Sin registros de historial.` | `Sin historial` | `Aún no hay movimientos registrados para esta unidad.` | — |
| [CatalogView.jsx:442](frontend/src/components/CatalogView.jsx#L442) | `Sin colores. Agrega el primero arriba.` | `Sin colores` | `Agrega el primero arriba.` | ✅ |
| [CatalogView.jsx:603](frontend/src/components/CatalogView.jsx#L603) | `Sin fotos en galería. Máximo {MAX_GALLERY}, 5 MB cada una.` | `Galería vacía` | `Hasta {MAX_GALLERY} fotos, 5 MB cada una.` | separar límite de ayuda |
| [CatalogView.jsx:824](frontend/src/components/CatalogView.jsx#L824) | `Sin categorías aún` | `Sin categorías` | — | — |
| [CatalogView.jsx:920](frontend/src/components/CatalogView.jsx#L920) | `Sin resultados para "{search}"` | `Sin resultados` | `Prueba con otro nombre o marca.` | — |
| [CatalogView.jsx:1022](frontend/src/components/CatalogView.jsx#L1022) | `Sin modelos en esta categoría` | `Sin modelos` | `Aún no se han agregado modelos a esta categoría.` | — |
| [SellFromTicketModal.jsx:170](frontend/src/components/SellFromTicketModal.jsx#L170) | `Sin modelo cotizado registrado en este ticket` | `Sin modelo cotizado` | `Completa el ticket con un modelo antes de registrar la venta.` | — |
| [SellFromTicketModal.jsx:227](frontend/src/components/SellFromTicketModal.jsx#L227) | `No hay unidades disponibles en stock. Registra la unidad primero en Inventario, o usa "Nota sin stock".` | `Sin unidades en stock` | `Registra la unidad en Inventario o marca "Sin unidad en stock".` | variante `tone="warning"` |
| [StagingImportView.jsx:265](frontend/src/components/StagingImportView.jsx#L265) | `Sin importaciones registradas` | `Sin importaciones` | `Sube un PDF de lista de precios para empezar.` | — |
| [ImportView.jsx:106](frontend/src/components/ImportView.jsx#L106) | `Sin importaciones registradas.` | `Sin importaciones` | — | — |
| [ImportView.jsx:284](frontend/src/components/ImportView.jsx#L284) | `Sin filas con este filtro` | `Sin filas` | `Cambia el filtro para ver más.` | — |
| [SupplierPaymentsView.jsx:797](frontend/src/components/SupplierPaymentsView.jsx#L797) | `Sin registros` / `Sin resultados con estos filtros` | `Sin pagos` / `Sin resultados` | `Registra un pago a proveedor con el botón de arriba.` | — |
| [SalesView.jsx:1641-1644](frontend/src/components/SalesView.jsx#L1641) | `Sin ventas` + `No hay ventas registradas aún` / `Prueba otros filtros` | `Sin ventas` | `No hay ventas registradas aún.` / `Prueba con otros filtros.` | ya tuteado ✅ |
| [SalesView.jsx:1036](frontend/src/components/SalesView.jsx#L1036) | `Sin resultados` (en selector de unidades) | inline, no Empty | — | dejar como texto inline |
| [ReportsView.jsx:36](frontend/src/components/ReportsView.jsx#L36) | `Sin datos suficientes` | inline | — | mantener (caben en chart) |
| [TicketView.jsx:650](frontend/src/components/TicketView.jsx#L650) | `Aún no hay comentarios. Usa este espacio para comunicarte con el equipo sobre este lead.` | `Aún no hay comentarios` | `Usa este espacio para comunicarte con el equipo sobre este lead.` | ya tuteado ✅ |
| [TicketView.jsx:775](frontend/src/components/TicketView.jsx#L775) | `Sin actividad registrada aún.` | `Sin actividad` | `Registra un contacto para empezar el historial.` | — |
| [TicketView.jsx:376](frontend/src/components/TicketView.jsx#L376) | `Sin modelo seleccionado` | inline | — | dejar inline (dentro de una card) |
| [CalendarView.jsx](frontend/src/components/CalendarView.jsx) | (sin empty state para lista de eventos) | `Sin eventos` | `No hay próximos eventos. Crea uno con el botón.` | si aplica |

**No tocar** (son etiquetas/categorías, no empty states):
- `Sin foto`, `Sin moto`, `Sin asignar`, `Sin modelo seleccionado`, `Sin sucursal`, `Sin asociar`, `Sin catálogo`, `Sin Tocar` (KPI), `Sin Movimiento`, `Sin Financiamiento`, `Sin atender`, `Sin gestionar` — todos son valores de campo/KPI.

#### Loaders

| Vista / ubicación | Actual | `<Loader label="…" />` |
|---|---|---|
| [RemindersTab.jsx:26](frontend/src/components/RemindersTab.jsx#L26) | `Cargando...` | `Cargando recordatorios…` |
| [AdminView.jsx:286](frontend/src/components/AdminView.jsx#L286) | `Cargando...` | `Cargando usuarios…` |
| [CalendarView.jsx:206](frontend/src/components/CalendarView.jsx#L206) | `Cargando eventos...` | `Cargando eventos…` ✅ |
| [ImportView.jsx:105](frontend/src/components/ImportView.jsx#L105) | `Cargando...` | `Cargando historial…` |
| [InventoryView.jsx:847,1156](frontend/src/components/InventoryView.jsx#L847) | `Cargando...` / `Cargando historial...` | `Cargando historial…` |
| [SupplierPaymentsView.jsx:796,803](frontend/src/components/SupplierPaymentsView.jsx#L796) | `Cargando...` | `Cargando pagos…` |
| [ReportsView.jsx:104](frontend/src/components/ReportsView.jsx#L104) | `Cargando reportes...` | `Cargando reportes…` ✅ |
| [SellFromTicketModal.jsx:224](frontend/src/components/SellFromTicketModal.jsx#L224) | `Cargando unidades disponibles...` | `Cargando unidades…` |
| [TicketView.jsx:810](frontend/src/components/TicketView.jsx#L810) | `Cargando historial...` | `Cargando historial…` ✅ |
| [SalesView.jsx:1036,1637](frontend/src/components/SalesView.jsx#L1036) | `Cargando...` | `Cargando unidades…` / `Cargando ventas…` |
| [CatalogView.jsx:900](frontend/src/components/CatalogView.jsx#L900) | `Cargando...` | `Cargando catálogo…` |

**Convención unificada:**
- Usar **`…`** (un solo carácter) en lugar de `...` (tres puntos).
- Siempre `Verbo + sustantivo concreto` (qué se está cargando). Nunca `Cargando…` pelado.

**Loaders en botones (estado saving/loading):** mantener texto inline, NO portar a `<Loader />`. Regla: `{loading ? 'Guardando…' : 'Guardar cambios'}`. Hay ~15 ocurrencias, ya están correctas salvo unificar `...` → `…`.

---

## 2. Mapeo de `alert()` → toast/error

~35 `alert()` detectados. Todos deben migrar a toasts no bloqueantes (coordinar con `components`). Propuesta de tono y texto:

**Convenciones:**
- `tone="error"` → falló una acción. Formato: `No se pudo {acción}. {Guía}`.
- `tone="warning"` → validación previa falla. Formato: `{Qué falta}.`
- `tone="success"` → acción OK. Formato: `{Sustantivo} {pasado corto}.` (ej: `Venta guardada.`)
- `tone="info"` → feedback neutral.
- **Nunca** exponer `ex.message` crudo al usuario. Loggear en consola, mostrar texto humano.

### 2.1 Inventario completo

| File:Line | Actual | Tono | Texto propuesto |
|---|---|---|---|
| [NotifBell.jsx:20](frontend/src/components/NotifBell.jsx#L20) | `alert('No se pudo marcar todo como leído: '+...)` | error | `No se pudo marcar las notificaciones. Intenta de nuevo.` |
| [NotifBell.jsx:21](frontend/src/components/NotifBell.jsx#L21) | `alert('No se pudo marcar como leído: '+...)` | error | `No se pudo marcar la notificación. Intenta de nuevo.` |
| [RemindersTab.jsx:21](frontend/src/components/RemindersTab.jsx#L21) | `alert(err.message)` | error | `No se pudieron cargar los recordatorios. Revisa tu conexión.` |
| [RemindersTab.jsx:23](frontend/src/components/RemindersTab.jsx#L23) | `alert('No se pudo marcar como completado…')` | error | `No se pudo marcar como completado. Intenta de nuevo.` |
| [RemindersTab.jsx:24](frontend/src/components/RemindersTab.jsx#L24) | `alert('No se pudo eliminar el recordatorio…')` | error | `No se pudo eliminar el recordatorio. Intenta de nuevo.` |
| [CatalogView.jsx:130](frontend/src/components/CatalogView.jsx#L130) | `alert("Error al guardar")` | error | `No se pudo guardar el modelo. Intenta de nuevo.` |
| [CatalogView.jsx:139](frontend/src/components/CatalogView.jsx#L139) | `alert("Error al eliminar")` | error | `No se pudo eliminar el modelo. Intenta de nuevo.` |
| [CatalogView.jsx:154](frontend/src/components/CatalogView.jsx#L154) | `alert("Error al agregar color")` | error | `No se pudo agregar el color. Intenta de nuevo.` |
| [CatalogView.jsx:163](frontend/src/components/CatalogView.jsx#L163) | `alert("Error al guardar hex")` | error | `No se pudo guardar el tono. Intenta de nuevo.` |
| [CatalogView.jsx:169](frontend/src/components/CatalogView.jsx#L169) | `alert("Error al quitar color")` | error | `No se pudo quitar el color. Intenta de nuevo.` |
| [CatalogView.jsx:177](frontend/src/components/CatalogView.jsx#L177) | `alert("Error al subir imagen")` | error | `No se pudo subir la imagen. Verifica el formato y tamaño.` |
| [CatalogView.jsx:181](frontend/src/components/CatalogView.jsx#L181) | `alert("Máximo {MAX_GALLERY} fotos por modelo")` | warning | `Máximo ${MAX_GALLERY} fotos por modelo. Elimina alguna antes de subir otra.` |
| [CatalogView.jsx:187,196](frontend/src/components/CatalogView.jsx#L187) | `alert(e.message \|\| "Error al subir/eliminar foto")` | error | `No se pudo {subir\|eliminar} la foto. Intenta de nuevo.` |
| [CatalogView.jsx:208](frontend/src/components/CatalogView.jsx#L208) | `alert(e.message \|\| "Error al subir PDF")` | error | `No se pudo subir el PDF. Verifica que sea menor a 15 MB.` |
| [CatalogView.jsx:218,227](frontend/src/components/CatalogView.jsx#L218) | `alert(… "Error al subir/quitar foto de color")` | error | `No se pudo {subir\|quitar} la foto del color. Intenta de nuevo.` |
| [CatalogView.jsx:648](frontend/src/components/CatalogView.jsx#L648) | `alert("Marca y modelo son obligatorios")` | warning | `Marca y modelo son obligatorios.` |
| [CatalogView.jsx:654](frontend/src/components/CatalogView.jsx#L654) | `alert(e.message \|\| "Error al crear")` | error | `No se pudo crear el modelo. Intenta de nuevo.` |
| [CatalogView.jsx:806](frontend/src/components/CatalogView.jsx#L806) | `alert("Completá ambos campos")` | warning | `Completa ambos campos.` ⚠️ voseo residual |
| [CatalogView.jsx:807](frontend/src/components/CatalogView.jsx#L807) | `alert("El nombre es igual")` | warning | `El nombre nuevo es igual al actual.` |
| [CatalogView.jsx:813](frontend/src/components/CatalogView.jsx#L813) | `alert(e.message \|\| "Error")` | error | `No se pudo renombrar. Intenta de nuevo.` |
| [CatalogView.jsx:878](frontend/src/components/CatalogView.jsx#L878) | `alert(`Categoría renombrada: "${from}" → "${to}"…`)` | success | `Categoría renombrada: "${from}" → "${to}" (${count} modelo${count!==1?"s":""} actualizados).` |
| [ImportView.jsx:36,55](frontend/src/components/ImportView.jsx#L36) | `alert(e.message)` | error | `No se pudo procesar el archivo. Verifica el formato.` |
| [LeadsList.jsx:78](frontend/src/components/LeadsList.jsx#L78) | `alert(ex.message \|\| 'Error al reasignar')` | error | `No se pudo reasignar el lead. Intenta de nuevo.` |
| [LeadsList.jsx:104](frontend/src/components/LeadsList.jsx#L104) | `alert(ex.message \|\| "Error al crear ticket")` | error | `No se pudo crear el ticket. Intenta de nuevo.` |
| [SupplierPaymentsView.jsx:380,382](frontend/src/components/SupplierPaymentsView.jsx#L380) | `alert(e.message)` | error | `No se pudo {guardar\|eliminar} el pago. Intenta de nuevo.` |
| [SalesView.jsx:204,220,230](frontend/src/components/SalesView.jsx#L204) | `alert(e.message \|\| 'Error')` | error | `No se pudo guardar la venta. Intenta de nuevo.` |
| [SalesView.jsx:773](frontend/src/components/SalesView.jsx#L773) | `alert('Error al generar el PDF: ' + err.message)` | error | `No se pudo generar el PDF. Intenta de nuevo.` |
| [SalesView.jsx:1480](frontend/src/components/SalesView.jsx#L1480) | `alert('Venta eliminada. La unidad volvió a Disponible.\n\nRecordá revisar…')` | success | `Venta eliminada. La unidad volvió a Disponible. Recuerda revisar el ticket vinculado.` ⚠️ voseo residual (`Recordá`) |
| [SalesView.jsx:1489](frontend/src/components/SalesView.jsx#L1489) | `alert(e.message \|\| 'Error al eliminar')` | error | `No se pudo eliminar la venta. Intenta de nuevo.` |
| [TicketView.jsx:179](frontend/src/components/TicketView.jsx#L179) | `alert('No se pudo enviar el comentario: '+...)` | error | `No se pudo enviar el comentario. Revisa tu conexión.` |
| [TicketView.jsx:195](frontend/src/components/TicketView.jsx#L195) | `alert('No se pudo cambiar el estado: '+...)` | error | `No se pudo cambiar el estado. Revisa tu conexión.` |
| [TicketView.jsx:201](frontend/src/components/TicketView.jsx#L201) | `alert('Selecciona un motivo antes de continuar.')` | warning | `Selecciona un motivo antes de continuar.` ✅ |
| [TicketView.jsx:213](frontend/src/components/TicketView.jsx#L213) | `alert('Error al marcar como perdido: '+...)` | error | `No se pudo marcar como perdido. Intenta de nuevo.` |
| [TicketView.jsx:465](frontend/src/components/TicketView.jsx#L465) | `alert('Error al cambiar prioridad')` | error | `No se pudo cambiar la prioridad. Intenta de nuevo.` |
| [TicketView.jsx:479](frontend/src/components/TicketView.jsx#L479) | `alert('No se pudo actualizar Test Ride: '+...)` | error | `No se pudo actualizar el test ride. Intenta de nuevo.` |
| [TicketView.jsx:509](frontend/src/components/TicketView.jsx#L509) | `alert('No se pudo reasignar: '+...)` | error | `No se pudo reasignar el lead. Intenta de nuevo.` |
| [TicketView.jsx:626](frontend/src/components/TicketView.jsx#L626) | `alert('Error al guardar: '+...)` | error | `No se pudo guardar los cambios. Intenta de nuevo.` |
| [StagingImportView.jsx:31](frontend/src/components/StagingImportView.jsx#L31) | `alert(e.message \|\| 'Error al subir el archivo')` | error | `No se pudo subir el archivo. Verifica el formato (PDF).` |
| [StagingImportView.jsx:47](frontend/src/components/StagingImportView.jsx#L47) | `alert('Error')` | error | `No se pudo guardar el borrador. Intenta de nuevo.` 🚨 crítico |
| [StagingImportView.jsx:76](frontend/src/components/StagingImportView.jsx#L76) | `alert('Error al guardar')` | error | `No se pudieron guardar los cambios. Intenta de nuevo.` 🚨 crítico |
| [StagingImportView.jsx:82](frontend/src/components/StagingImportView.jsx#L82) | `alert('No hay filas válidas para publicar')` | warning | `No hay filas válidas para publicar. Corrige los errores antes de continuar.` |
| [StagingImportView.jsx:90](frontend/src/components/StagingImportView.jsx#L90) | `alert(e.message \|\| 'Error al publicar')` | error | `No se pudo publicar al catálogo. Intenta de nuevo.` |
| [PipelineView.jsx:32,50](frontend/src/components/PipelineView.jsx#L32) | `alert('No se pudo cambiar el estado: '+...)` | error | `No se pudo cambiar el estado del lead. Intenta de nuevo.` |
| [SellFromTicketModal.jsx:72](frontend/src/components/SellFromTicketModal.jsx#L72) | `alert('Selecciona una unidad… o activa "Sin unidad en stock"')` | warning | ✅ ya tuteado, mantener |
| [SellFromTicketModal.jsx:73](frontend/src/components/SellFromTicketModal.jsx#L73) | `alert('Indica la marca y modelo')` | warning | ✅ |
| [SellFromTicketModal.jsx:74](frontend/src/components/SellFromTicketModal.jsx#L74) | `alert('Selecciona el vendedor')` | warning | ✅ |
| [SellFromTicketModal.jsx:125](frontend/src/components/SellFromTicketModal.jsx#L125) | `alert(ex.message \|\| 'Error al registrar venta')` | error | `No se pudo registrar la venta. Intenta de nuevo.` |
| [CalendarView.jsx:113,123,132](frontend/src/components/CalendarView.jsx#L113) | `alert(ex.message \|\| 'Error al {guardar\|eliminar} evento')` | error | `No se pudo {guardar\|eliminar} el evento. Intenta de nuevo.` |
| [InventoryView.jsx:217,227,387](frontend/src/components/InventoryView.jsx#L217) | `alert(ex.message \|\| 'Error al subir foto')` | error | `No se pudo subir la foto. Verifica el formato y tamaño.` |
| [InventoryView.jsx:233](frontend/src/components/InventoryView.jsx#L233) | `alert(ex.message \|\| 'Error al leer archivo')` | error | `No se pudo leer el archivo. Verifica que sea un Excel válido.` |
| [InventoryView.jsx:242](frontend/src/components/InventoryView.jsx#L242) | `alert(ex.message \|\| 'Error al importar')` | error | `No se pudo importar el inventario. Intenta de nuevo.` |
| [InventoryView.jsx:247,251](frontend/src/components/InventoryView.jsx#L247) | `alert(ex.message)` | error | `No se pudo actualizar la unidad. Intenta de nuevo.` |
| [InventoryView.jsx:399](frontend/src/components/InventoryView.jsx#L399) | `alert(ex.message \|\| 'Error al eliminar')` | error | `No se pudo eliminar la unidad. Intenta de nuevo.` |
| [InventoryView.jsx:413](frontend/src/components/InventoryView.jsx#L413) | `alert(ex.message \|\| 'Error al exportar')` | error | `No se pudo exportar. Intenta de nuevo.` |
| [AdminView.jsx:177](frontend/src/components/AdminView.jsx#L177) | `alert(ex.message \|\| 'Error al activar usuario')` | error | `No se pudo activar el usuario. Intenta de nuevo.` |
| [AdminView.jsx:211](frontend/src/components/AdminView.jsx#L211) | `alert(ex.message \|\| 'Error al resetear contraseña')` | error | `No se pudo resetear la contraseña. Intenta de nuevo.` |
| [AdminView.jsx:224](frontend/src/components/AdminView.jsx#L224) | `alert(ex.message)` | error | `No se pudo guardar. Intenta de nuevo.` |
| [AdminView.jsx:234](frontend/src/components/AdminView.jsx#L234) | `alert('No se pudo eliminar el alias: '+...)` | error | `No se pudo eliminar el alias. Intenta de nuevo.` |
| [AdminView.jsx:243,252,260](frontend/src/components/AdminView.jsx#L243) | `alert('Error: '+(ex.message\|\|'No se pudo limpiar…'))` | error | `No se pudo limpiar la {data\|catálogo\|importaciones}. Intenta de nuevo.` |

### 2.2 Voseo residual detectado (no cubierto en #5)

| Ubicación | String | Propuesta |
|---|---|---|
| [CatalogView.jsx:806](frontend/src/components/CatalogView.jsx#L806) | `Completá ambos campos` | `Completa ambos campos` |
| [SalesView.jsx:1480](frontend/src/components/SalesView.jsx#L1480) | `Recordá revisar el ticket vinculado` | `Recuerda revisar el ticket vinculado` |

**Acción:** incluir en el sprint de #10 (son strings dentro de `alert()`, entran al mismo diff).

---

## 3. Top 10 reescrituras prioritarias — diffs listos

Listas para aplicar en cuanto #9 esté. Solo strings, sin cambiar lógica.

### 3.1 `StagingImportView.jsx:47` — `alert('Error')` 🚨
```diff
-    } catch (e) { alert('Error'); }
+    } catch (e) { toast.error('No se pudo guardar el borrador. Intenta de nuevo.'); }
```

### 3.2 `StagingImportView.jsx:76` — `alert('Error al guardar')` 🚨
```diff
-    } catch (e) { alert('Error al guardar'); }
+    } catch (e) { toast.error('No se pudieron guardar los cambios. Intenta de nuevo.'); }
```

### 3.3 `ErrorBoundary.jsx:24-27` — mensaje genérico + ex.message crudo
```diff
-          <h2 style={{margin:0,fontSize:18,fontWeight:700}}>Algo salió mal</h2>
+          <h2 style={{margin:0,fontSize:18,fontWeight:700}}>Se produjo un error inesperado</h2>
           <p style={{margin:0,color:'#6B7280',fontSize:13,textAlign:'center',maxWidth:320}}>
-            {this.state.error?.message || 'Error inesperado en la aplicación.'}
+            Intenta recargar la página. Si el problema persiste, contacta a soporte.
           </p>
```
**Nota:** loguear `this.state.error?.message` a consola (ya se hace en `componentDidCatch`). No exponerlo al usuario.

### 3.4 `AdminView.jsx:405` — `🗑 Borrar data importada`
```diff
-: <button onClick={handleCleanImports} disabled={…} style={…}>{cleaningImports?'Limpiando...':'🗑 Borrar data importada'}</button>
+: <button onClick={handleCleanImports} disabled={…} style={…}>{cleaningImports?'Limpiando…':'Borrar datos importados'}</button>
```
**Nota:** quitar emoji (ya hay ícono en la UI adyacente) + `data` → `datos` + `...` → `…`.

### 3.5 `PipelineView.jsx:73,150,86` — unificar tickets → leads
```diff
-          {sl.length===0 && <div style={…}>Sin tickets en este estado</div>}
+          {sl.length===0 && <Empty title="Sin leads" hint="No hay leads en esta etapa del pipeline." />}
@@
-                {sl.length===0&&<div style={…}>Sin tickets</div>}
+                {sl.length===0&&<Empty title="Sin leads" />}
```
`Sin moto` (línea 84) y `Sin asignar` (línea 86) → mantener (son valores de campo).

### 3.6 `AdminView.jsx:240,249` — botón "Aceptar" en confirmación destructiva
**Limitación actual:** se usa `window.confirm()` nativo → no se puede personalizar el botón. Esto es **deuda que cae en #13** (migrar a modal con `Btn variant="danger"`). Copy canónico a usar cuando haya modal:
- Título: `¿Eliminar toda la data importada?`
- Cuerpo: `Usuarios, sucursales y catálogo se conservan.` + `Esta acción no se puede deshacer.`
- Botón primario: `Eliminar todo` (danger)
- Botón secundario: `Cancelar`

### 3.7 `InventoryView.jsx:1349` — texto de ayuda reserva activa
```diff
-                  Guarda los cambios para actualizar el abono, o conviértela en nota de venta cuando el cliente complete el pago.
+                  Guarda los cambios para actualizar el abono. Cuando el cliente complete el pago, conviértela en nota de venta.
```
Separar en dos frases — más legible, mismo contenido.

### 3.8 `Login.jsx:26` — placeholder + error de login
```diff
-<label style={S.lbl}>Usuario o Email</label><input … placeholder="nombre de usuario" autoComplete="username" …/>
+<label style={S.lbl}>Usuario o email</label><input … placeholder="Tu usuario o email" autoComplete="username" …/>
@@
-      setErr(ex.message||"Credenciales inválidas");
+      setErr(ex.message||"Credenciales inválidas. Verifica tu usuario y contraseña.");
```
- Label en sentence case (`Email` → `email`).
- Placeholder con "Tu…" guía qué poner.
- Error con guía accionable.

### 3.9 `TicketView.jsx:650` — empty de chat interno ✅ ya aplicado en #5
Ya quedó: `Aún no hay comentarios. Usa este espacio para comunicarte con el equipo sobre este lead.` — solo portar a `<Empty />` cuando exista.

### 3.10 `SellFromTicketModal.jsx:227` — empty de stock ✅ ya tuteado en #5
Ya quedó: `No hay unidades disponibles en stock. Registra la unidad primero en Inventario, o usa "Nota sin stock".`
Propuesta final con primitiva:
```diff
-<div style={{ padding: '10px 12px', borderRadius: 8, background: '#FEF2F2', border: '1px solid #FECACA', fontSize: 12, color: '#DC2626' }}>
-  No hay unidades disponibles en stock. Registra la unidad primero en Inventario, o usa "Nota sin stock".
-</div>
+<Empty tone="warning" title="Sin unidades en stock" hint='Registra la unidad en Inventario o marca "Sin unidad en stock" arriba.' />
```

---

## 4. Pendientes / preguntas abiertas

1. **API de primitivas:** ¿`components` va a exponer `<Empty />` y `<Loader />` con la firma propuesta en 1.1? Si difiere, ajusto los mapeos arriba.
2. **Sistema de toasts:** `alert()` → `toast.error/warning/success/info` asume que existirá un helper `toast` global. Coordinar con `components` o `design-system` para nombrar la API (p.ej. `notify.error(...)` vs `toast.error(...)`).
3. **Confirmaciones destructivas nativas:** hay 10+ `confirm()` en `AdminView`, `RemindersTab`, etc. Migrar a modal con botón `danger` queda en #13; esta task (#10) solo cubre el copy.
4. **`SalesView.jsx:1480`** usa `alert()` como success (`Venta eliminada…`). Debe migrar a toast `success`, no `error`.
5. **Capitalización inconsistente en títulos**: `Datos del Cliente` vs `Zona de peligro` vs `Lead Ganado`. Fuera de alcance de #10, pero anotar para ronda siguiente.

---

## 5. Recomendaciones futuras — hallazgos secundarios

Inventario priorizado de issues de copy detectados fuera del alcance de #4/#5/#10. Ninguno es crítico. Candidatos para una ronda posterior.

### 5.1 Capitalización inconsistente en títulos (prioridad MEDIA)

Coexisten **Title Case** ("Todas las Palabras Grandes") y **sentence case** ("Solo la primera") en títulos del mismo nivel jerárquico, a veces dentro del mismo archivo.

**Title Case detectado:**
| Ubicación | String |
|---|---|
| [RemindersTab.jsx:59](frontend/src/components/RemindersTab.jsx#L59) | `Nuevo Recordatorio` (modal) |
| [SellFromTicketModal.jsx:132](frontend/src/components/SellFromTicketModal.jsx#L132) | `Registrar Venta` (modal) |
| [InventoryView.jsx:1398](frontend/src/components/InventoryView.jsx#L1398) | `Agregar Unidad al Inventario` (modal) |
| [AdminView.jsx:416](frontend/src/components/AdminView.jsx#L416) | `Aliases de Modelos` (h3) |
| [AdminView.jsx:608](frontend/src/components/AdminView.jsx#L608) | `Contraseña Reseteada` (modal) |
| [TicketView.jsx:527](frontend/src/components/TicketView.jsx#L527) | `Datos del Cliente` |
| [TicketView.jsx:351](frontend/src/components/TicketView.jsx#L351) | `Producto Cotizado` |
| [TicketView.jsx:553,562](frontend/src/components/TicketView.jsx#L553) | `Perfil Financiero`, `Financiamiento` |
| [TicketView.jsx:411](frontend/src/components/TicketView.jsx#L411) | `Estado del Lead` |
| [TicketView.jsx:416,423](frontend/src/components/TicketView.jsx#L416) | `Lead Perdido`, `Lead Ganado` |
| [TicketView.jsx:476](frontend/src/components/TicketView.jsx#L476) | `Test Ride` (aceptado, jerga) |
| [InventoryView.jsx:1425](frontend/src/components/InventoryView.jsx#L1425) | `Datos de la venta` (mixto) |
| [ReportsView.jsx](frontend/src/components/ReportsView.jsx) | `Top Marcas`, `Top Sucursales`, `Ranking Vendedores`, `Evolución Temporal`, `Leads por Estado`, `Estado Financiamiento`, `Rendimiento por Sucursal`, `Ranking por Modelo`, `Ranking por Color`, `Colores más Cotizados`, `Distribución por Estado`, `Detalle Diario`, `Ventas por Día`, `Leads por Día` |
| [SellFromTicketModal.jsx:322](frontend/src/components/SellFromTicketModal.jsx#L322) | `Tipo de Venta` |
| [Dashboard.jsx:56](frontend/src/components/Dashboard.jsx#L56) | `Inventario por Sucursal` |

**Sentence case detectado (en los mismos niveles):**
| Ubicación | String |
|---|---|
| [AdminView.jsx:270](frontend/src/components/AdminView.jsx#L270) | `Administración` |
| [AdminView.jsx:380,396](frontend/src/components/AdminView.jsx#L380) | `Sucursales`, `Zona de peligro` |
| [AdminView.jsx:453](frontend/src/components/AdminView.jsx#L453) | `Nuevo usuario` (modal) |
| [AdminView.jsx:489](frontend/src/components/AdminView.jsx#L489) | `Editar usuario` (modal) |
| [AdminView.jsx:531](frontend/src/components/AdminView.jsx#L531) | `Desactivar usuario` (modal) |
| [CalendarView.jsx:171](frontend/src/components/CalendarView.jsx#L171) | `Calendario` |
| [CalendarView.jsx:344](frontend/src/components/CalendarView.jsx#L344) | `Eliminar evento` (modal) |
| [CalendarView.jsx:274](frontend/src/components/CalendarView.jsx#L274) | `Nuevo evento` / `Editar evento` |
| [ReportsView.jsx:110](frontend/src/components/ReportsView.jsx#L110) | `Reportes` |
| [Dashboard.jsx:29,41](frontend/src/components/Dashboard.jsx#L29) | `Requieren atención`, `Tareas para hoy` |
| [SupplierPaymentsView.jsx:243](frontend/src/components/SupplierPaymentsView.jsx#L243) | `Registro creado` (modal) |

**Recomendación:** adoptar **sentence case como regla global** (estándar en software profesional en español; más legible, menos inglés-centric). Excepciones:
- Nombres propios: `MaosBike`, `WhatsApp`, `Autofin`.
- Estados canónicos con significado de valor: `Lead Ganado`, `Lead Perdido`, `Sin Tocar` (son badges/estados, no títulos).
- Nombres de secciones tipo KPI cuando vienen de una fuente única (`TICKET_STATUS` en `ui.jsx`).

**Esfuerzo:** ~40 strings. Cambio puramente estético. Coordinar con `ui-architect` (#11 ViewHeader).

---

### 5.2 Typos y errores ortográficos (prioridad ALTA — rápidos)

| Ubicación | Actual | Propuesta |
|---|---|---|
| [SupplierPaymentsView.jsx:291](frontend/src/components/SupplierPaymentsView.jsx#L291) | `<Sec title="Vehiculo" …>` | `Vehículo` |
| [SupplierPaymentsView.jsx:424](frontend/src/components/SupplierPaymentsView.jsx#L424) | `<Sec title="Vehiculo" …>` | `Vehículo` |
| [CatalogView.jsx:825](frontend/src/components/CatalogView.jsx#L825) | `title="Click para renombrar"` | `Renombrar` (o `Clic para renombrar` — `Click` es anglicismo) |
| [StagingImportView.jsx:115](frontend/src/components/StagingImportView.jsx#L115) | `los datos no se publican al catálogo hasta que vos los revisés y aprobés explícitamente.` | **voseo residual**: `hasta que los revises y apruebes explícitamente.` ⚠️ |
| [AdminView.jsx:353](frontend/src/components/AdminView.jsx#L353) | `title="Reset contraseña"` | `Restablecer contraseña` |

**Esfuerzo:** 5 minutos. Aplicar junto con #10.

---

### 5.3 Ellipsis inconsistente (`...` vs `…`) (prioridad BAJA)

Coexisten en loaders, placeholders y botones.

**Ocurrencias con `...` (3 caracteres) que deberían ser `…`:**
- `Procesando PDF...`, `Procesando...`, `Guardando...`, `Cargando...`, `Cargando historial...`, `Cargando reportes...`, `Cargando unidades disponibles...`, `Importando...`, `Limpiando...`, `Seleccionar...`, `Detalles adicionales...`, `Volver a llamar...`, `Llamé al cliente...`, `Escribe un comentario...`, `Seleccionar modelo del catálogo...`, `Mínimo 8 caracteres`, `Ej: ...`, etc.

**Ocurrencias con `…` (carácter único) ya correctas:** `Guardando…` (algunos), `Subiendo…`, `Cargando…` (algunos).

**Recomendación:** script de búsqueda/reemplazo global `...` → `…` en strings de UI (no en código). Riesgo bajo si se filtra por strings entre comillas.

**Esfuerzo:** 30 minutos con script + revisión visual.

---

### 5.4 Accesibilidad — `alt=""` vacío (prioridad MEDIA)

Las imágenes decorativas pueden tener `alt=""`, pero varias fotos de motos/modelos lo usan cuando deberían describir el producto (lectores de pantalla no leen nada).

| Ubicación | Uso | Propuesta `alt` |
|---|---|---|
| [SupplierPaymentsView.jsx:481,520,824](frontend/src/components/SupplierPaymentsView.jsx#L481) | Foto de moto del pago | `alt={`${p.brand} ${p.model}`}` |
| [SellFromTicketModal.jsx:150](frontend/src/components/SellFromTicketModal.jsx#L150) | Foto del producto cotizado | `alt={`${quoted.brand} ${quoted.model}`}` |
| [PipelineView.jsx:138](frontend/src/components/PipelineView.jsx#L138) | Foto en card de lead | `alt={`${m.brand} ${m.model}`}` |
| [LeadsList.jsx:322](frontend/src/components/LeadsList.jsx#L322) | Foto en lista | `alt={`${x.model_brand} ${x.model_name||''}`}` |

**Fuera de alcance de copy estricto** — requiere cambio de JSX, no solo string. Para siguiente sprint de accesibilidad.

---

### 5.5 Emojis en UI productiva (prioridad BAJA)

Uso mezclado de emojis en labels de botón + títulos. Funcionan como íconos improvisados en vez de usar el sistema `Ic.*`.

| Ubicación | Actual | Problema |
|---|---|---|
| [AdminView.jsx:401,405,409](frontend/src/components/AdminView.jsx#L401) | `🗑 Borrar catálogo completo`, `🗑 Borrar data importada`, `🗑 Borrar TODO (tickets + inventario)` | Emoji de basurero en botón. Usar `<Ic.trash />` del sistema. |
| [StagingImportView.jsx:134](frontend/src/components/StagingImportView.jsx#L134) | `📄` (32px decorativo) | Aceptable como ilustración de empty state. Mantener o reemplazar por ícono. |
| [ImportView.jsx:303](frontend/src/components/ImportView.jsx#L303) | `Importación completada` (sin emoji, bien) | OK |
| [SellFromTicketModal.jsx:141](frontend/src/components/SellFromTicketModal.jsx#L141) | `📋 Producto Cotizado` | Quitar emoji, usar ícono del sistema. |
| [CatalogView.jsx:466,570,583](frontend/src/components/CatalogView.jsx#L466) | `📎 Subir PDF (máx 15 MB)`, `+ Foto` | Reemplazar `📎` por `<Ic.paperclip />` si existe, o quitar. |
| [CatalogView.jsx:412](frontend/src/components/CatalogView.jsx#L412) | `↺ Cambiar foto` | `↺` es carácter Unicode, no emoji. Sustituir por `<Ic.refresh />`. |
| [InventoryView.jsx:701](frontend/src/components/InventoryView.jsx#L701) | `⠿` Arrastra para reordenar | OK (Braille pattern, estándar para drag handle). |

**Recomendación:** establecer regla "emojis solo en ilustraciones de empty state decorativas, nunca en labels de botón ni títulos". Coordinar con `components` (#12) — si ya van a migrar botones destructivos a `Btn variant="danger"`, aprovechar y quitar los `🗑`.

---

### 5.6 `TODO` y énfasis con mayúsculas (prioridad BAJA)

| Ubicación | Actual | Propuesta |
|---|---|---|
| [AdminView.jsx:409](frontend/src/components/AdminView.jsx#L409) | `🗑 Borrar TODO (tickets + inventario)` | `Borrar todo (tickets + inventario)` — el contraste visual del botón rojo ya comunica peligro. |
| [AdminView.jsx:239,248](frontend/src/components/AdminView.jsx#L239) | `ATENCIÓN:` en confirmación | Aceptable; es una confirmación crítica. Mantener. |
| [ReportsView.jsx:114](frontend/src/components/ReportsView.jsx#L114) | `FILTROS:` como label | `Filtros` (sin dos puntos, sin mayúsculas) |
| [InventoryView.jsx:785,796,808,1006,1026](frontend/src/components/InventoryView.jsx#L785) | Labels de campo en MAYÚSCULAS con `letterSpacing:'0.08em'` (ej: `CHASIS`, `MOTOR`, `VENDIDA`) | Es una convención visual intencional (eyebrow labels). Mantener — comunica bien que son categorías. |
| [InventoryView.jsx:1304,1308,1312](frontend/src/components/InventoryView.jsx#L1304) | `PRECIO`, `ABONADO`, `SALDO` | Idem eyebrow labels, mantener. |
| [InventoryView.jsx:1464](frontend/src/components/InventoryView.jsx#L1464) | `XLS` en un badge de icono | OK (abreviatura estándar). |
| [TicketView.jsx:356](frontend/src/components/TicketView.jsx#L356) | `SIN IMG` | Ya flaggeado en informe #4 → `Sin imagen`. |

---

### 5.7 Glosario — términos adicionales a documentar (prioridad BAJA)

Encontré términos que no estaban en el glosario inicial pero aparecen en la UI:

| Término | Definición | Dónde aparece |
|---|---|---|
| **pie** / **pie inicial** | Dinero que el cliente aporta como cuota inicial de un crédito. Chilenismo 100% aceptado en el rubro. | CLAUDE.md del proyecto, `RECHAZO_MOTIVOS`, TicketView |
| **renta** | Ingreso mensual declarado por el cliente para evaluar crédito. En Chile se dice "renta" no "sueldo/ingreso". | `ui.jsx`, TicketView, RECHAZO_MOTIVOS |
| **Autofin** | Financiera interna del grupo, no un producto genérico. | `FIN_STATUS`, `PAYMENT_TYPES` — ya está |
| **bono todo medio de pago** | Descuento aplicable cualquiera sea el método de pago. Expresión chilena del rubro motor. | StagingImportView, catalogo |
| **preinscrita** | Estado de inventario intermedio (unidad con documentación iniciada pero no vendida). | `INV_ST` |
| **nota de venta** / **nota sin stock** | Venta registrada sin una unidad física asociada (pendiente de llegada). | SellFromTicketModal, InventoryView |
| **ticket importado** vs **ticket manual** | Distinción operativa: importado del sistema legacy vs creado desde la UI. | AdminView limpieza de datos |

**Recomendación:** consolidar en `docs/glosario.md` (archivo nuevo, fuera del alcance de #10) — lo puedo escribir en una ronda posterior si el team-lead lo pide.

---

### 5.8 Labels de navegación (BottomNav / MobileDrawer) — NO revisados

No audité los labels de navegación principal (bottom nav móvil + drawer). Posibles focos:
- `BottomNav.jsx:40` usa `it.label` de un array de items — revisar la fuente.
- `MobileDrawer.jsx` — revisar.

**Acción pendiente:** pasada específica de labels de navegación (≤ 30 min). Ya está consolidado en el menú por lo que afecta directamente la percepción del producto.

---

### 5.9 Textos de confirmación nativa (`window.confirm`) — pendientes de #13

10+ `confirm()` nativos con texto largo que no se puede estilar. Copy actual es funcional pero puede mejorarse cuando se migren a modales custom en #13.

**Ubicaciones clave:**
- [AdminView.jsx:173,207,229,239,240,248,249,257](frontend/src/components/AdminView.jsx#L173) — usuarios, aliases, limpieza de datos.
- [RemindersTab.jsx:24](frontend/src/components/RemindersTab.jsx#L24) — `¿Eliminar recordatorio?`
- [StagingImportView.jsx:83](frontend/src/components/StagingImportView.jsx#L83) — `¿Publicar ${n} modelo(s) al catálogo?`

**Recomendación cuando migren:** estructurar cada uno con `title + description + primaryLabel + secondaryLabel` en vez de una sola string concatenada. Propuesta detallada en §3.6.

---

### 5.10 Formato de fecha/moneda — OK ✅

- **Moneda:** `fmt()` aplica `$` + separador de miles chileno consistente. Verificado en `utils/format.js`.
- **Fecha:** `fD()` / `fDT()` / `ago()` centralizados. Mantener.

No hay acción requerida, solo documento que ya está bien.

---

## Resumen de prioridades

| § | Tema | Prioridad | Esfuerzo |
|---|---|---|---|
| 5.2 | Typos + voseo residual en StagingImportView:115 | 🔴 ALTA | 5 min |
| 5.1 | Capitalización sentence case global | 🟡 MEDIA | 1 h |
| 5.4 | `alt=""` en fotos de productos | 🟡 MEDIA | 30 min |
| 5.3 | Ellipsis `...` → `…` global | 🟢 BAJA | 30 min |
| 5.5 | Emojis en botones → íconos sistema | 🟢 BAJA | coord. con #12 |
| 5.6 | `TODO` y `FILTROS:` en mayúsculas | 🟢 BAJA | 10 min |
| 5.7 | Consolidar glosario en `docs/glosario.md` | 🟢 BAJA | 45 min |
| 5.8 | Audit de labels de navegación | 🟡 MEDIA | 30 min |
| 5.9 | Copy de confirmaciones al migrar #13 | 🟢 BAJA | con #13 |

---

**Estado:** doc listo. En standby hasta que #9 entregue primitivas. Al desbloquearse, aplico los diffs de §3 + porto empty/loaders de §1 + migro alerts de §2. Las recomendaciones de §5 quedan documentadas para una ronda futura.
