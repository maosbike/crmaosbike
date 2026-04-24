// Helpers compartidos por las specs de visual regression.
//
// `stabilize(page)` espera a que el layout se asiente: fonts cargadas, imágenes
// listas, y los efectos de entrada hayan terminado. Sin esto los screenshots
// varían entre corridas por font-swap o loading.

export async function stabilize(page) {
  await page.evaluate(() => document.fonts ? document.fonts.ready : Promise.resolve());
  // Espera a que no queden requests de red pendientes (da 500ms de margen).
  await page.waitForLoadState('networkidle').catch(() => {});
  // Deshabilita transiciones y animaciones CSS para snapshots determinísticos.
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        caret-color: transparent !important;
      }
    `,
  });
  // Oculta elementos inherentemente no-determinísticos (timestamps relativos, etc).
  // Agrega aquí selectores si detectas flakiness por contenido dinámico.
  await page.addStyleTag({
    content: `[data-visual-hide] { visibility: hidden !important; }`,
  });
}

export async function login(page, { email, password, baseURL }) {
  await page.goto(baseURL || '/');
  await page.fill('input[type="email"], input[name="email"]', email);
  await page.fill('input[type="password"], input[name="password"]', password);
  await page.click('button[type="submit"]');
  // Espera a que la app termine de cargar la vista autenticada.
  await page.waitForLoadState('networkidle').catch(() => {});
}

export function requireCreds() {
  const email = process.env.E2E_USER_EMAIL;
  const password = process.env.E2E_USER_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'E2E_USER_EMAIL / E2E_USER_PASSWORD no configurados. Defínelos antes de correr los tests autenticados.',
    );
  }
  return { email, password };
}
