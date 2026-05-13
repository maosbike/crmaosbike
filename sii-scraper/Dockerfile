# Imagen oficial de Playwright con Chromium ya instalado.
# Versión pineada para que actualizaciones de Playwright no rompan el build.
FROM mcr.microsoft.com/playwright:v1.48.0-jammy

WORKDIR /app

# Copiar manifests primero para cachear el npm install.
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Copiar el código.
COPY src ./src

# Variable de entorno para evitar prompts interactivos.
ENV NODE_ENV=production

# Por default arranca el cron. Para correr una vez: RUN_ONCE=1 npm start.
CMD ["node", "src/index.js"]
