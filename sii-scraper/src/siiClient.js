/**
 * siiClient.js — wrapper de Playwright para automatizar el portal del SII.
 *
 * Flujo (según indicaciones del usuario):
 *   1. Ir a https://www.sii.cl
 *   2. Click "Ingresar a Mi Sii"
 *   3. Tipear RUT + clave → click "Ingresar"
 *   4. Click directo en "Factura electrónica" (sin pasar por "Servicios online")
 *   5. Click "Sistema de facturación gratuito del SII"
 *   6. Click "Historial de DTE y respuesta a documentos recibidos"
 *   7. Click "Ver documentos emitidos" (o el equivalente de recibidos)
 *   8. Aparecen las filas. Cada fila tiene un lápiz/nota a la izquierda en la
 *      columna "Ver" → click abre la factura → descargar PDF.
 *
 * Importante: el portal del SII es viejo, frame-based, con popups y nombres
 * de botones inconsistentes. Las selectores usan texto visible cuando es
 * posible y caen a XPath cuando no hay opción.
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SII_HOME = 'https://www.sii.cl';
const HEADLESS = String(process.env.HEADLESS || 'true').toLowerCase() !== 'false';

class SiiClient {
  constructor({ rut, password, empresaRut, downloadDir, logger }) {
    if (!rut || !password) throw new Error('SII_RUT y SII_PASSWORD requeridos');
    this.rut = rut;
    this.password = password;
    this.empresaRut = empresaRut || rut;
    this.downloadDir = downloadDir || '/tmp/sii-pdfs';
    this.logger = logger || console;
    fs.mkdirSync(this.downloadDir, { recursive: true });
  }

  async start() {
    this.browser = await chromium.launch({
      headless: HEADLESS,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    this.context = await this.browser.newContext({
      acceptDownloads: true,
      viewport: { width: 1400, height: 900 },
      locale: 'es-CL',
    });
    this.page = await this.context.newPage();
  }

  async stop() {
    try { await this.context?.close(); } catch (_) {}
    try { await this.browser?.close(); } catch (_) {}
  }

  /** Helper: vuelca un fragmento del HTML actual para diagnosticar selectores. */
  async _dumpForDebug(tag) {
    try {
      const url = this.page.url();
      const title = await this.page.title().catch(() => '');
      const html = await this.page.content().catch(() => '');
      const snippet = html.replace(/\s+/g, ' ').slice(0, 1500);
      this.logger.warn(`[sii][debug:${tag}] url=${url} title=${JSON.stringify(title)} html_head=${snippet}`);
    } catch (_) {}
  }

  /** Inicia sesión. Idempotente: si ya está logueado, no hace nada. */
  async login() {
    this.logger.info('[sii] navegando a home');
    await this.page.goto(SII_HOME, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    // El SII expone "Ingresar a Mi Sii" desde la home — texto exacto puede
    // variar. Probamos varias formas.
    const ingresar = this.page.getByRole('link', { name: /ingresar.*mi\s*sii/i }).first();
    await ingresar.waitFor({ state: 'visible', timeout: 15_000 });
    await ingresar.click();

    // Formulario de login del SII.
    // El SII tiene un <input name="rut" type="hidden"> que no es el visible.
    // Filtramos por :visible + por type=text para descartarlo.
    await this.page.waitForLoadState('domcontentloaded');

    // Probamos múltiples candidatos en orden de probabilidad. Cada uno tiene
    // el filtro :visible para descartar inputs ocultos del formulario.
    const rutCandidates = [
      'input[name="rutcntr"]:visible',
      'input#rutcntr:visible',
      'input[id="bru_rut_o"]:visible',          // versión nueva del SII (zeusr)
      'input[name="bru_rut_o"]:visible',
      'input[name="rut"][type="text"]:visible',
      'input[type="text"]:visible',             // último recurso: primer text visible
    ];
    let rutInput = null;
    for (const sel of rutCandidates) {
      const loc = this.page.locator(sel).first();
      if (await loc.isVisible().catch(() => false)) {
        rutInput = loc;
        this.logger.info(`[sii] selector RUT que matcheó: ${sel}`);
        break;
      }
    }
    if (!rutInput) {
      await this._dumpForDebug('login_rut_no_encontrado');
      throw new Error('No se encontró ningún input visible para RUT en la página de login');
    }
    await rutInput.fill(this.rut);

    const passCandidates = [
      'input[name="clave"]:visible',
      'input#clave:visible',
      'input[name="bru_clave_o"]:visible',
      'input[id="bru_clave_o"]:visible',
      'input[type="password"]:visible',
    ];
    let passInput = null;
    for (const sel of passCandidates) {
      const loc = this.page.locator(sel).first();
      if (await loc.isVisible().catch(() => false)) {
        passInput = loc;
        break;
      }
    }
    if (!passInput) {
      await this._dumpForDebug('login_pass_no_encontrado');
      throw new Error('No se encontró ningún input visible para clave');
    }
    await passInput.fill(this.password);

    // Botón "Ingresar"
    const loginUrlAtSubmit = this.page.url();
    const submit = this.page.getByRole('button', { name: /ingresar/i })
      .or(this.page.locator('input[type="submit"][value*="Ingresar" i], button:has-text("Ingresar")'));
    await submit.first().click();

    // Esperar a que el SII termine de redirigir post-login. El flujo típico:
    //   1) POST a la URL del form
    //   2) redirige a CAutInicio.cgi (página de transición)
    //   3) eventualmente termina en mii.sii.cl o homer.sii.cl
    // No esperamos "Cerrar Sesión" porque puede estar en frames internos o
    // requerir hover de menú; en vez de eso, validamos por:
    //   - URL distinta de la del form de login (Y)
    //   - texto de "login fallido" NO presente.
    try {
      await this.page.waitForLoadState('networkidle', { timeout: 20_000 });
    } catch (_) { /* networkidle puede no llegar nunca con scripts de tracking */ }

    const postUrl = this.page.url();
    const bodyText = await this.page.evaluate(() => document.body?.innerText || '').catch(() => '');
    const loweredBody = bodyText.toLowerCase();

    // Mensajes típicos de error de login en SII
    const loginErrors = [
      'clave incorrecta', 'rut o clave', 'rut o contraseña', 'datos ingresados son',
      'inválido', 'no es correcto', 'verifique', 'intente nuevamente',
    ];
    const hasError = loginErrors.some(t => loweredBody.includes(t));

    // URL todavía en el form de login? Sospechoso.
    const stillOnLogin = postUrl === loginUrlAtSubmit
      || /CAutInicio\.cgi$/i.test(postUrl) && loweredBody.includes('rut') && loweredBody.includes('clave') && loweredBody.length < 800;

    if (hasError) {
      await this._dumpForDebug('login_falló_credenciales');
      throw new Error('Login del SII rechazado: mensaje de error en la página (probable RUT/clave inválido o captcha).');
    }
    if (stillOnLogin) {
      await this._dumpForDebug('login_no_avanzó');
      throw new Error(`Post-login: URL no cambió (${postUrl}). Verificá creds o captcha.`);
    }

    this.logger.info(`[sii] login OK — url actual: ${postUrl}`);
  }

  /** Navega al Historial de DTE — pantalla común para emitidos y recibidos. */
  async openHistorialDte() {
    this.logger.info('[sii] navegando a Factura electrónica');
    // El menú "Servicios online" suele tener un link directo a "Factura
    // electrónica" en la home. El usuario indicó: click directo (sin
    // hover en Servicios online).
    const fact = this.page.getByRole('link', { name: /factura\s+electr(ó|o)nica/i }).first();
    await fact.waitFor({ state: 'visible', timeout: 20_000 });
    await fact.click();
    await this.page.waitForLoadState('domcontentloaded');

    // "Sistema de facturación gratuito del SII"
    const sistGrat = this.page.getByRole('link', { name: /sistema\s+de\s+facturaci(ó|o)n\s+gratuito/i }).first();
    await sistGrat.waitFor({ state: 'visible', timeout: 20_000 });
    await sistGrat.click();
    await this.page.waitForLoadState('domcontentloaded');

    // "Historial de DTE y respuesta a documentos recibidos"
    const hist = this.page.getByRole('link', { name: /historial\s+de\s+DTE/i }).first();
    await hist.waitFor({ state: 'visible', timeout: 20_000 });
    await hist.click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * Lista todas las filas de documentos visibles en la tabla actual.
   * El SII muestra hasta ~100 por página; iteramos paginación.
   *
   * @returns {Promise<Array<{folio, fechaIso, monto, estado, viewLink}>>}
   */
  async listAllRows() {
    const rows = [];
    let pageNum = 1;
    while (true) {
      // Esperar a que la tabla cargue. La tabla del SII suele tener id
      // específico; caemos a tabla con headers conocidos.
      await this.page.waitForSelector('table', { timeout: 30_000 });
      const pageRows = await this.page.$$eval('table tr', (trs) => {
        return trs.map((tr) => {
          const tds = Array.from(tr.querySelectorAll('td'));
          if (tds.length < 5) return null;
          // Heurística: buscamos un <td> con folio numérico y otro con fecha.
          const cells = tds.map(td => td.innerText.trim());
          const folioCell = cells.find(c => /^\d{3,8}$/.test(c));
          const fechaCell = cells.find(c => /^\d{4}-\d{2}-\d{2}$/.test(c));
          if (!folioCell) return null;
          // La columna "Ver" tiene un link con un icono (lápiz). Capturamos su href.
          const verLink = tr.querySelector('a[href*="ver"], a[onclick*="ver"], a:has(img)')?.getAttribute('href') || null;
          const verOnclick = tr.querySelector('a[onclick]')?.getAttribute('onclick') || null;
          return {
            folio: folioCell,
            fechaIso: fechaCell || null,
            cells,
            verLink,
            verOnclick,
          };
        }).filter(Boolean);
      });
      rows.push(...pageRows);

      // ¿Hay siguiente página? El SII usa botones "Siguiente" o ">".
      const next = this.page.getByRole('link', { name: /^siguiente$|^>$/i }).first();
      if (await next.isVisible().catch(() => false)) {
        pageNum++;
        await next.click();
        await this.page.waitForLoadState('networkidle', { timeout: 30_000 });
      } else {
        break;
      }
    }
    this.logger.info(`[sii] listAllRows: ${rows.length} filas detectadas en ${pageNum} página(s)`);
    return rows;
  }

  /**
   * Descarga el PDF de UNA fila clickeando el ícono "Ver" / lápiz.
   * El usuario indicó: hay que clickear en el lápiz de la columna "Ver", que
   * abre la factura para visualizar; ahí se la descarga.
   *
   * @param {string} folio
   * @returns {Promise<string|null>} ruta local del PDF, o null si falló.
   */
  async downloadByFolio(folio) {
    // Encuentra la fila por folio y clickea el icono "Ver" (lápiz).
    const rowSelector = `table tr:has(td:text-is("${folio}"))`;
    const row = this.page.locator(rowSelector).first();
    if (!(await row.isVisible().catch(() => false))) {
      this.logger.warn(`[sii] folio ${folio}: no se encontró la fila`);
      return null;
    }
    // El icono está en la primera columna usualmente; lo identificamos por
    // ser un <a> con <img> o texto "Ver".
    const verIcon = row.locator('a:has(img), a[title*="Ver" i], a[onclick*="ver" i]').first();
    if (!(await verIcon.isVisible().catch(() => false))) {
      this.logger.warn(`[sii] folio ${folio}: sin icono Ver`);
      return null;
    }

    // El click abre un popup o nueva pestaña con el PDF. Escuchamos ambos.
    const [popup] = await Promise.all([
      this.context.waitForEvent('page', { timeout: 30_000 }).catch(() => null),
      verIcon.click(),
    ]);

    const targetPage = popup || this.page;
    await targetPage.waitForLoadState('domcontentloaded', { timeout: 30_000 });

    // Dentro de la factura puede haber un botón "Descargar PDF" o similar.
    // Probamos varios selectores. Si no, hacemos page.pdf() del viewer.
    const downloadBtn = targetPage.getByRole('link', { name: /descargar.*pdf|^pdf$/i })
      .or(targetPage.getByRole('button', { name: /descargar.*pdf|^pdf$/i }))
      .first();

    let savedPath = null;
    if (await downloadBtn.isVisible().catch(() => false)) {
      const [dl] = await Promise.all([
        targetPage.waitForEvent('download', { timeout: 30_000 }),
        downloadBtn.click(),
      ]);
      savedPath = path.join(this.downloadDir, `${folio}.pdf`);
      await dl.saveAs(savedPath);
    } else {
      // Fallback: imprimir la página actual a PDF (sólo Chromium headless).
      savedPath = path.join(this.downloadDir, `${folio}.pdf`);
      try {
        await targetPage.pdf({ path: savedPath, format: 'A4' });
      } catch (e) {
        this.logger.warn(`[sii] folio ${folio}: page.pdf falló (${e.message})`);
        savedPath = null;
      }
    }

    if (popup) await popup.close().catch(() => {});
    return savedPath;
  }
}

module.exports = { SiiClient };
