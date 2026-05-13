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

  /**
   * Inicia sesión navegando DIRECTAMENTE al form de auth con la URL de
   * destino (mipeSelEmpresa) ya incrustada. Esto evita el click en
   * "Ingresar a Mi Sii" que a veces redirige a homer.sii.cl en vez del
   * form, y también nos ahorra la cadena de clicks Historial DTE → Ver
   * Documentos Emitidos → re-auth, porque después del login el SII nos
   * lleva directo a la pantalla de selección de empresa.
   */
  async login() {
    // URL destino post-login: empresa select del Sistema Gratuito.
    // OPCION=2 + TIPO=4 son los códigos internos del SII para "Historial DTE".
    const destInner = 'OPCION=2&TIPO=4';
    const dest = 'https://www1.sii.cl/cgi-bin/Portal001/mipeSelEmpresa.cgi?DESDE_DONDE_URL=' + encodeURIComponent(destInner);
    const LOGIN_URL = 'https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html?' + dest;

    this.logger.info('[sii] navegando directo al form de login con destino mipeSelEmpresa');
    await this.page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });

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
    const submit = this.page.getByRole('button', { name: /ingresar/i })
      .or(this.page.locator('input[type="submit"][value*="Ingresar" i], button:has-text("Ingresar")'));
    await submit.first().click();

    // Paso 1: esperar que el form desaparezca (signal inmediata de submit OK).
    try {
      await this.page.waitForFunction(() => {
        const inp = document.querySelector('input[name="rutcntr"]');
        if (!inp) return true;
        const r = inp.getBoundingClientRect();
        const cs = getComputedStyle(inp);
        const visible = r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
        return !visible;
      }, null, { timeout: 30_000 });
    } catch (e) {
      const bodyText = await this.page.evaluate(() => document.body?.innerText || '').catch(() => '');
      await this._dumpForDebug('login_form_persiste');
      this.logger.warn(`[sii] body al fallar (500 chars): ${bodyText.slice(0, 500).replace(/\s+/g, ' ')}`);
      throw new Error('Post-login: el form de login sigue visible — RUT/clave inválido o captcha.');
    }

    // Paso 2: esperar a que el SII complete su cadena de redirects para que
    // las cookies se seteen en todos los subdominios (.sii.cl, www1, palena,
    // homer, etc). Sin esto, navegar manualmente a mipeSelEmpresa.cgi rebota
    // al login por sesión inexistente en el subdominio destino.
    this.logger.info(`[sii] form enviado, esperando redirect chain. URL inmediata: ${this.page.url()}`);
    try {
      await this.page.waitForURL(url => {
        const s = url.toString();
        return !/IngresoRutClave|CAutInicio\.cgi/i.test(s);
      }, { timeout: 30_000, waitUntil: 'domcontentloaded' });
    } catch (_) {
      // No salió de la zona de auth/transición. Damos 5s más por meta-refresh.
      await new Promise(r => setTimeout(r, 5000));
    }
    // Pequeño settle para que la página destino termine de cargar.
    await this.page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {});
    await this.page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    const postUrl = this.page.url();
    const bodyHead = await this.page.evaluate(() => (document.body?.innerText || '').slice(0, 300)).catch(() => '');
    this.logger.info(`[sii] login OK — url final: ${postUrl} — body head: ${bodyHead.replace(/\s+/g, ' ')}`);
  }

  /**
   * Después del login con destino encoded, el SII redirige solo a
   * mipeSelEmpresa.cgi (selección de empresa). Si por algún motivo no
   * estamos ahí (transición lenta, redirect roto), forzamos la navegación.
   * El flujo de "Sistema Gratuito → Historial → Ver Emitidos" del menú
   * público www.sii.cl se saltea entero — vamos directo al destino.
   */
  async openHistorialDte() {
    const url = this.page.url();
    const TARGET = 'https://www1.sii.cl/cgi-bin/Portal001/mipeSelEmpresa.cgi?DESDE_DONDE_URL=' + encodeURIComponent('OPCION=2&TIPO=4');
    if (/mipeSelEmpresa|mipeMenu/i.test(url)) {
      this.logger.info(`[sii] ya estamos en empresa-select: ${url}`);
    } else {
      this.logger.info(`[sii] no estamos en empresa-select (url=${url}). Goto explícito: ${TARGET}`);
      await this.page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    }
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
