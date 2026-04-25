# Imagen oficial de Playwright con Chromium pre-instalado.
# Versión debe coincidir con la de package.json.
FROM mcr.microsoft.com/playwright:v1.59.1-jammy

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY src ./src

CMD ["node", "src/index.js"]
