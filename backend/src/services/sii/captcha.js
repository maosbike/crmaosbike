/**
 * captcha.js — resuelve el reCAPTCHA v3 que el SII implementó en el RCV.
 *
 * Flujo:
 *   1. Descubrir el site key del SII (lo buscamos en el HTML de su SPA).
 *      Lo cacheamos por 1h porque casi no cambia.
 *   2. Pedir un token solved a 2Captcha (provider más usado en Chile).
 *   3. Devolver el token + accion para que rcv.js lo meta en el body.
 *
 * Costo: ~$2.99 USD por 1000 solves de recaptcha v3 enterprise.
 *   Sync incremental (4x/día × 2 sources × 5 tipos × 1 mes) = 40 solves/día
 *   ≈ 1200/mes × $0.003 = ~$3.60/mes. Negligible.
 *
 * Env vars:
 *   SII_CAPTCHA_API_KEY    — required. La sacás en https://2captcha.com/enterpage
 *   SII_CAPTCHA_SITEKEY    — opcional. Override del autodescubrimiento.
 *   SII_CAPTCHA_ACTION     — opcional. Default 'consultarRcv'. Ver fallback si falla.
 *   SII_CAPTCHA_PROVIDER   — opcional. Default '2captcha'. Otros: 'anticaptcha', 'capsolver'.
 */
const axios = require('axios');
const logger = require('../../config/logger');

const SII_PAGE_URL = 'https://www4.sii.cl/consdcvinternetui/';
const DEFAULT_ACTION = 'consultarRcv';
const SITEKEY_CACHE_MS = 60 * 60 * 1000; // 1h

let _sitekeyCache = { value: null, expiresAt: 0 };

/**
 * Descubre el reCAPTCHA site key del SII fetcheando su SPA y parseando el HTML.
 * El site key v3 es público (va en el HTML), así que no necesita auth.
 *
 * @returns {Promise<string>}
 */
async function discoverSitekey() {
  if (process.env.SII_CAPTCHA_SITEKEY) return process.env.SII_CAPTCHA_SITEKEY;

  const now = Date.now();
  if (_sitekeyCache.value && _sitekeyCache.expiresAt > now) return _sitekeyCache.value;

  try {
    const res = await axios.get(SII_PAGE_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      timeout: 15_000,
    });
    const html = String(res.data || '');
    // Buscamos patrones comunes de incrustación del sitekey:
    //   render=6Le...  (script src)
    //   data-sitekey="6Le..."
    //   grecaptcha.execute('6Le...', ...)
    //   "sitekey":"6Le..."
    const patterns = [
      /render=([6L][^"&'\s]+)/,
      /data-sitekey=["']([^"']+)["']/,
      /grecaptcha\.execute\(['"]([^'"]+)['"]/,
      /["']sitekey["']\s*:\s*["']([^"']+)["']/,
      /siteKey\s*=\s*["']([^"']+)["']/,
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m && m[1] && m[1].length > 20) {
        _sitekeyCache = { value: m[1], expiresAt: now + SITEKEY_CACHE_MS };
        logger.info({ sitekey: m[1].slice(0, 12) + '...' }, '[sii.captcha] site key descubierto del SII');
        return m[1];
      }
    }
    // Si el HTML es la SPA mínima, el sitekey vive en el JS bundle. Buscamos
    // el primer .js linkeado y lo recorremos también.
    const jsFile = html.match(/src=["']([^"']+\.js[^"']*)["']/);
    if (jsFile) {
      const jsUrl = jsFile[1].startsWith('http')
        ? jsFile[1]
        : `${new URL(SII_PAGE_URL).origin}${jsFile[1].startsWith('/') ? '' : '/'}${jsFile[1]}`;
      const jsRes = await axios.get(jsUrl, { timeout: 15_000 });
      for (const re of patterns) {
        const m = String(jsRes.data || '').match(re);
        if (m && m[1] && m[1].length > 20) {
          _sitekeyCache = { value: m[1], expiresAt: now + SITEKEY_CACHE_MS };
          logger.info({ sitekey: m[1].slice(0, 12) + '...', from: jsUrl }, '[sii.captcha] site key descubierto en el JS bundle');
          return m[1];
        }
      }
    }
    throw new Error('No pude extraer el sitekey del HTML/JS del SII. Setear SII_CAPTCHA_SITEKEY manualmente.');
  } catch (e) {
    if (e.message.includes('sitekey')) throw e;
    throw new Error(`Falló descubrir sitekey: ${e.message}`);
  }
}

/**
 * Resuelve un reCAPTCHA v3 vía 2Captcha y devuelve el token.
 *
 * @param {string} sitekey
 * @param {string} action
 * @returns {Promise<string>} token solucionado
 */
async function solveWith2Captcha(sitekey, action) {
  const apiKey = process.env.SII_CAPTCHA_API_KEY;
  if (!apiKey) throw new Error('SII_CAPTCHA_API_KEY no configurada');

  // Paso 1: enviar la tarea
  const submitUrl = new URL('https://2captcha.com/in.php');
  submitUrl.searchParams.set('key', apiKey);
  submitUrl.searchParams.set('method', 'userrecaptcha');
  submitUrl.searchParams.set('version', 'v3');
  submitUrl.searchParams.set('googlekey', sitekey);
  submitUrl.searchParams.set('pageurl', SII_PAGE_URL);
  submitUrl.searchParams.set('action', action);
  submitUrl.searchParams.set('min_score', '0.3');
  submitUrl.searchParams.set('enterprise', '1');
  submitUrl.searchParams.set('json', '1');

  const submit = await axios.get(submitUrl.toString(), { timeout: 30_000 });
  if (submit.data.status !== 1) {
    throw new Error(`2Captcha submit falló: ${submit.data.request || JSON.stringify(submit.data)}`);
  }
  const taskId = submit.data.request;
  logger.info({ taskId, action }, '[sii.captcha] task enviada a 2Captcha, polling...');

  // Paso 2: polling hasta resolver (típicamente 15-45 segundos para v3)
  const pollUrl = `https://2captcha.com/res.php?key=${apiKey}&action=get&id=${taskId}&json=1`;
  const startedAt = Date.now();
  const MAX_WAIT_MS = 120_000; // 2 min máximo
  while (Date.now() - startedAt < MAX_WAIT_MS) {
    await new Promise(r => setTimeout(r, 5000));
    const poll = await axios.get(pollUrl, { timeout: 15_000 });
    if (poll.data.status === 1) {
      logger.info({ taskId, ms: Date.now() - startedAt }, '[sii.captcha] solved');
      return poll.data.request;
    }
    if (poll.data.request !== 'CAPCHA_NOT_READY') {
      throw new Error(`2Captcha error: ${poll.data.request}`);
    }
  }
  throw new Error('2Captcha timeout: tardó más de 2 min en resolver');
}

/**
 * Devuelve un par { tokenRecaptcha, accionRecaptcha } listos para meter en
 * el body de las llamadas al RCV del SII.
 *
 * @param {string} [actionOverride] acción específica (default usa SII_CAPTCHA_ACTION o 'consultarRcv')
 * @returns {Promise<{ tokenRecaptcha: string, accionRecaptcha: string }>}
 */
async function solveCaptcha(actionOverride) {
  const action = actionOverride || process.env.SII_CAPTCHA_ACTION || DEFAULT_ACTION;
  const sitekey = await discoverSitekey();
  const provider = (process.env.SII_CAPTCHA_PROVIDER || '2captcha').toLowerCase();
  let token;
  if (provider === '2captcha') {
    token = await solveWith2Captcha(sitekey, action);
  } else {
    throw new Error(`Provider de captcha no soportado: ${provider}. Usar '2captcha'.`);
  }
  return { tokenRecaptcha: token, accionRecaptcha: action };
}

module.exports = { solveCaptcha, discoverSitekey };
