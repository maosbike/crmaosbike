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
JWT_SECRET=tu_clave_secreta_aqui_cambiar
NODE_ENV=production
CLOUDINARY_CLOUD_NAME=(de tu cuenta Cloudinary)
CLOUDINARY_API_KEY=(de tu cuenta Cloudinary)
CLOUDINARY_API_SECRET=(de tu cuenta Cloudinary)
FRONTEND_URL=https://crmaosbike.cl
```

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

Todos con contraseña: `maosbike2024`

| Email | Rol |
|-------|-----|
| admin@crmaosbike.cl | Super Admin |
| jefe@crmaosbike.cl | Admin Comercial |
| fran@crmaosbike.cl | Backoffice |
| diego@crmaosbike.cl | Vendedor |
| javiera@crmaosbike.cl | Vendedor |
| roberto@crmaosbike.cl | Vendedor |
| catalina@crmaosbike.cl | Vendedor |
| andres@crmaosbike.cl | Vendedor |
