# Imagen oficial de Playwright con Chromium pre-instalado.
# Versión debe coincidir con la de package.json para evitar mismatch.
FROM mcr.microsoft.com/playwright:v1.59.1-jammy

WORKDIR /app

# Instalar deps con cache de capa.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# Copiar código.
COPY src ./src

# Railway pasa env vars en runtime — el contenedor las lee con process.env.
CMD ["node", "src/index.js"]
