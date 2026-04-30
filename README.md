# CRMaosBike 🏍️

Sistema de gestión comercial para concesionaria de motos.

## Deploy en Railway (paso a paso)

### 1. Subir código a GitHub

1. Ve a [github.com/new](https://github.com/new)
2. Nombre del repo: `crmaosbike`
3. Déjalo **Private**
4. Click **Create repository**
5. Sube los archivos (arrastra la carpeta o usa git)

### 2. Crear proyecto en Railway

1. Ve a [railway.app/dashboard](https://railway.app/dashboard)
2. Click **New Project** → **Deploy from GitHub repo**
3. Selecciona `crmaosbike`
4. Espera que se despliegue

### 3. Agregar PostgreSQL

1. En el proyecto de Railway, click **+ New** → **Database** → **PostgreSQL**
2. Railway conecta automáticamente la variable `DATABASE_URL`

### 4. Configurar variables de entorno

En Railway → tu servicio → **Variables**, agrega:

```
# Generá secrets fuertes (≥32 chars) con: openssl rand -hex 64
JWT_SECRET=<64+ chars random — NUNCA uses placeholders>
JWT_REFRESH_SECRET=<distinto del anterior, también ≥32 chars>

NODE_ENV=production

CLOUDINARY_CLOUD_NAME=(de tu cuenta Cloudinary)
CLOUDINARY_API_KEY=(de tu cuenta Cloudinary)
CLOUDINARY_API_SECRET=(de tu cuenta Cloudinary)

FRONTEND_URL=https://crmaosbike.cl

# Telegram (si usás el bot)
TELEGRAM_BOT_TOKEN=<tu token>
TELEGRAM_WEBHOOK_SECRET=<obligatorio en producción si configurás el bot>
```

> El backend valida estos valores al arrancar y rechaza secrets cortos o
> conocidos (`changeme`, `secret`, etc). Si algún valor falta o es débil,
> el proceso muere antes de aceptar tráfico.

### 5. Ejecutar migraciones

En Railway → tu servicio → **Settings** → Custom Start Command:
Temporalmente cambiar a: `cd backend && node src/scripts/migrate.js && node src/index.js`
Después del primer deploy, cambiar de vuelta a: `cd backend && npm start`

### 6. Conectar dominio

1. En Railway → tu servicio → **Settings** → **Domains**
2. Click **Custom Domain** → escribe `crmaosbike.cl`
3. Te dará un registro CNAME
4. Ve a NIC Chile → DNS → agrega el CNAME que te dio Railway
5. Espera 5-30 minutos

### Usuarios iniciales

El seed (`backend/migrations/002_seed.js`) genera una contraseña aleatoria
distinta para cada usuario y la imprime **una sola vez** en los logs del primer
deploy. Cada usuario inicia con `force_password_change=true` y debe rotar su
contraseña en su primer login.

- Las contraseñas no se documentan ni se commitean.
- El seed jamás reutiliza un valor "default": cada ejecución regenera secrets.
- Si necesitás un valor común para entornos de prueba, exportá `INITIAL_PASSWORD`
  antes de correr el seed (no usar en producción).

### Notas de seguridad

- HTTPS se fuerza por server-side; HSTS preload activo (2 años, incluye subdominios).
- JWT corto (15 min) + refresh httpOnly+SameSite=strict.
- Rate-limit global y de login; lockout exponencial por usuario.
- Cualquier `logout` invalida los tokens del usuario (bump `session_version`).
- Carga de archivos: tipo MIME + extensión + magic-bytes (XLSX/PDF) validados.
- SSRF: fetch externo usa allowlist + bloqueo de IPs privadas.
- CSP estricta, `frame-ancestors 'none'`, `object-src 'none'`.
