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
const { getToken } = require('./auth');

const SII_PAGE_URL = 'https://www4.sii.cl/consdcvinternetui/';
const DEFAULT_ACTION = 'consultarRcv';
const SITEKEY_CACHE_MS = 60 * 60 * 1000; // 1h

let _sitekeyCache = { value: null, expiresAt: 0 };

/**
 * Descubre el reCAPTCHA site key del SII fetcheando su SPA y parseando el HTML.
 * El site key v3 es público (va en el HTML), así que no necesita auth.
 *
 * Estrategia agresiva (porque la SPA del SII tiene la sitekey enterrada):
 *  1. Probamos varias URLs candidatas (root SPA + páginas internas comunes).
 *  2. Para cada una, fetcheamos con UA realista.
 *  3. Buscamos en el HTML patrones directos primero.
 *  4. Si no, extraemos TODAS las URLs de scripts JS y CSS, las fetcheamos
 *     en paralelo, y buscamos el sitekey en cada bundle.
 *  5. Si encontramos múltiples candidatos, devolvemos el primero válido.
 *
 * @returns {Promise<string>}
 */
async function discoverSitekey() {
  if (process.env.SII_CAPTCHA_SITEKEY) return process.env.SII_CAPTCHA_SITEKEY;

  const now = Date.now();
  if (_sitekeyCache.value && _sitekeyCache.expiresAt > now) return _sitekeyCache.value;

  // El sitekey v3 de Google empieza con "6L" y tiene ~40 chars de longitud.
  // El charset es alfanumérico + guion + guion bajo (URL-safe base64).
  const SITEKEY_REGEX = /\b(6L[A-Za-z0-9_-]{38,44})\b/g;

  // Si no nos autenticamos antes, el SII nos redirige a zeusr.sii.cl (login),
  // que NO tiene el sitekey del RCV. Hay que obtener un TOKEN con el cert y
  // pasarlo como cookie en el GET de la SPA para que devuelva el HTML real.
  let siiToken = null;
  try {
    siiToken = await getToken();
  } catch (e) {
    logger.warn({ err: e.message }, '[sii.captcha] no pude obtener TOKEN del SII para autenticar el fetch — seguiré sin cookie');
  }

  // Headers de un browser real para no ser bloqueados.
  const browserHeaders = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'es-CL,es;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
  };
  if (siiToken) browserHeaders.Cookie = `TOKEN=${siiToken}`;

  const candidatePages = [
    'https://www4.sii.cl/consdcvinternetui/',
    'https://www4.sii.cl/consdcvinternetui/index.html',
    'https://www4.sii.cl/consdcvinternetui/#/',
  ];

  const tried = [];

  for (const pageUrl of candidatePages) {
    try {
      const res = await axios.get(pageUrl, {
        headers: browserHeaders,
        timeout: 20_000,
        maxRedirects: 5,
        validateStatus: () => true,
      });
      const html = String(res.data || '');
      tried.push({ pageUrl, status: res.status, htmlLen: html.length });

      // Búsqueda directa en el HTML.
      const directMatches = html.match(SITEKEY_REGEX);
      if (directMatches && directMatches.length > 0) {
        const found = directMatches[0];
        _sitekeyCache = { value: found, expiresAt: now + SITEKEY_CACHE_MS };
        logger.info({ sitekey: found.slice(0, 12) + '...', from: pageUrl, source: 'html-direct' }, '[sii.captcha] site key descubierto');
        return found;
      }

      // Extraer TODOS los URLs de assets (JS y CSS) del HTML.
      const assetUrls = new Set();
      const scriptMatches = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)];
      const linkMatches = [...html.matchAll(/<link[^>]+href=["']([^"']+\.css[^"']*)["']/g)];
      for (const m of [...scriptMatches, ...linkMatches]) {
        const rawUrl = m[1];
        const absUrl = rawUrl.startsWith('http')
          ? rawUrl
          : new URL(rawUrl, pageUrl).toString();
        assetUrls.add(absUrl);
      }

      // Fetcheo paralelo de los assets (con límite razonable).
      const assets = [...assetUrls].slice(0, 30);
      logger.info({ pageUrl, assetCount: assets.length }, '[sii.captcha] buscando sitekey en assets del SII');
      const responses = await Promise.allSettled(assets.map(u =>
        axios.get(u, { headers: browserHeaders, timeout: 15_000, validateStatus: () => true, transformResponse: x => x })
      ));

      for (let i = 0; i < responses.length; i++) {
        const r = responses[i];
        if (r.status !== 'fulfilled') continue;
        const content = String(r.value.data || '');
        const matches = content.match(SITEKEY_REGEX);
        if (matches && matches.length > 0) {
          // Filtrar: el sitekey de Google empieza con 6L y específicamente
          // las primeras letras suelen ser 6Lc, 6Le, 6Ld, 6Lf.
          const valid = matches.find(k => /^6L[cdef]/.test(k)) || matches[0];
          _sitekeyCache = { value: valid, expiresAt: now + SITEKEY_CACHE_MS };
          logger.info({ sitekey: valid.slice(0, 12) + '...', from: assets[i], source: 'asset-scan' }, '[sii.captcha] site key descubierto en asset');
          return valid;
        }
      }
    } catch (e) {
      tried.push({ pageUrl, error: e.message });
    }
  }

  throw new Error(`No pude extraer el sitekey del SII tras escanear ${candidatePages.length} páginas y sus assets. Setear SII_CAPTCHA_SITEKEY manualmente. Diagnóstico: ${JSON.stringify(tried)}`);
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
