# Restaurar un backup de Postgres

Los backups diarios viven en **GitHub Actions → workflow "DB Backup" → run del día → Artifacts**.
Retención: **30 días**.

---

## 1. Descargar el dump

1. Ir a https://github.com/maosbike/crmaosbike/actions/workflows/db-backup.yml
2. Click en el run del día que quieres recuperar.
3. Scrolleá abajo a **Artifacts** y descargá el zip (`crmaosbike-db-YYYYMMDD_HHMMSS`).
4. Descomprimirlo. Adentro hay un archivo `.dump` (formato custom de Postgres).

## 2. Decidir adónde restaurar

**NUNCA** restaurar directamente sobre la DB de producción salvo que sepas exactamente qué estás haciendo y la prod ya esté rota. Lo correcto es:

- **Opción A — DB local de prueba** (recomendado para inspeccionar/recuperar datos puntuales):
  ```bash
  createdb crmaosbike_restore
  pg_restore --no-owner --no-acl --jobs=4 \
    --dbname=crmaosbike_restore \
    /ruta/al/crmaosbike_YYYYMMDD_HHMMSS.dump
  ```

- **Opción B — DB de Railway "staging"** (si tienes una). Usar la `DATABASE_URL` de staging:
  ```bash
  pg_restore --no-owner --no-acl --jobs=4 \
    --dbname="$STAGING_DATABASE_URL" \
    /ruta/al/dump
  ```

- **Opción C — Restore destructivo en producción** (último recurso, todo se borra y se reemplaza):
  ```bash
  # ⚠️  Esto BORRA todo lo que haya actualmente en producción
  pg_restore --no-owner --no-acl --jobs=4 \
    --clean --if-exists \
    --dbname="$PROD_DATABASE_URL" \
    /ruta/al/dump
  ```

## 3. Recuperar datos puntuales sin overwriteаr todo

Si solo quieres recuperar, por ejemplo, una venta que se borró:

1. Restaurá el dump a una DB local (Opción A arriba).
2. Conectate con `psql` y exportá la fila que necesitas:
   ```bash
   pg_dump --data-only --table=inventory \
     --where="id=12345" \
     crmaosbike_restore > venta_12345.sql
   ```
3. Aplicá ese SQL a producción.

---

## Notas

- El dump está en formato `custom` (`-Fc`), no es texto plano. Para abrirlo con tu editor primero conviértelo: `pg_restore --file=dump.sql --no-owner --no-acl tu_archivo.dump`.
- El cliente `pg_restore` tiene que ser de versión **igual o mayor** a la del servidor Postgres. Railway corre 16.x, así que instalá `postgresql-client-16` o superior.
- `--jobs=4` paraleliza la restauración (más rápido). Bajalo a 1 si tenés problemas de memoria.
- Los backups NO incluyen archivos subidos a Cloudinary (fotos de motos, documentos). Esos viven en Cloudinary aparte y tienen su propia retención.

## Disparar un backup manual

Para un backup ad-hoc (antes de una migración riesgosa, por ejemplo):

1. GitHub → Actions → "DB Backup (Postgres → GitHub Artifacts)" → **Run workflow** → branch `main` → Run.
2. Espera ~1-2 min, descargá el artifact.
