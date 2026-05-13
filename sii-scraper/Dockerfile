# Imagen oficial de Playwright con Chromium ya instalado.
# La versión del image DEBE coincidir con la del paquete npm "playwright"
# del package.json — si no, npm pone los binaries en una ruta y la imagen
# trae otros. Actualizar ambos juntos.
FROM mcr.microsoft.com/playwright:v1.60.0-jammy

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
