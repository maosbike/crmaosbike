/**
 * auth.js — autenticación contra el SII vía Web Services.
 *
 * Flujo oficial (https://www.sii.cl/factura_electronica/ws.htm):
 *   1. getSeed       — el SII genera un "seed" (string aleatorio).
 *   2. firmar seed   — envolvemos el seed en XML y lo firmamos con la clave
 *                      privada del .pfx (XML-DSig enveloped).
 *   3. getToken      — mandamos el XML firmado y el SII devuelve un token.
 *   4. usar token    — el token vive ~9 min y se manda como Cookie en cada
 *                      request al RCV / consulta de DTEs.
 *
 * Cacheamos el token a nivel módulo con una expiración conservadora (8 min)
 * para no pedirlo de nuevo cada request.
 *
 * Importante: endpoint cambió de "palena" a "palena/maullin" con los años.
 * Hoy el endpoint productivo es `palena.sii.cl`. Si en el futuro migra a
 * `maullin.sii.cl` (entorno de cert) o cambia, basta con tocar SII_API_BASE.
 */
const axios = require('axios');
const { SignedXml } = require('xml-crypto');
const { DOMParser } = require('@xmldom/xmldom');
const logger = require('../../config/logger');
const { loadCert } = require('./cert');

const SII_API_BASE = process.env.SII_API_BASE || 'https://palena.sii.cl';

// Token cache: invalida cuando faltan 60s para expirar. El SII no devuelve el
// TTL real — la doc dice "varios minutos". Conservador: 8 min de uso máximo.
const TOKEN_TTL_MS = 8 * 60 * 1000;
let _tokenCache = { token: null, expiresAt: 0 };

/**
 * Pide un seed al SII. Es un endpoint SOAP que no necesita auth.
 * @returns {Promise<string>} el seed (numérico, ej "987654321")
 */
async function getSeed() {
  const url = `${SII_API_BASE}/DTEWS/CrSeed.jws`;
  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:def="http://DefaultNamespace">
  <soap:Body><def:getSeed/></soap:Body>
</soap:Envelope>`;
  const res = await axios.post(url, soapBody, {
    headers: { 'Content-Type': 'text/xml; charset=utf-8', 'SOAPAction': '' },
    timeout: 30_000,
  });
  // La respuesta envuelve un <SII:RESP_HDR><ESTADO>00</ESTADO>...<SEMILLA>X</SEMILLA>
  // dentro de un <getSeedReturn>...</getSeedReturn> con CDATA.
  const m = res.data.match(/<SEMILLA>(\d+)<\/SEMILLA>/);
  if (!m) {
    logger.warn({ body: String(res.data).slice(0, 500) }, '[sii.auth] getSeed: no encontré <SEMILLA>');
    throw new Error('SII getSeed: respuesta inesperada (sin SEMILLA)');
  }
  return m[1];
}

/**
 * Firma el seed con la clave privada del cert y devuelve el XML firmado
 * en el shape que espera getToken.
 *
 * El SII exige XML-DSig "enveloped" (la firma va DENTRO del documento)
 * con canonicalización C14N y algoritmo RSA-SHA1 (sí, SHA1 — el SII no
 * migró a SHA256 todavía para este flujo).
 *
 * @param {string} seed
 * @returns {string} XML firmado listo para mandar a getToken
 */
function signSeed(seed) {
  const { privateKeyPem, certificatePem } = loadCert();

  const unsignedXml =
    `<getToken><item><Semilla>${seed}</Semilla></item></getToken>`;

  // Extraer el bloque de cert sin headers BEGIN/END y sin saltos (para X509Certificate).
  const certB64 = certificatePem
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s+/g, '');

  const sig = new SignedXml({
    privateKey: privateKeyPem,
    signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
    canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
  });
  sig.addReference({
    xpath: '//*[local-name(.)="getToken"]',
    digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
    transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature'],
  });
  // Incrustar el <X509Certificate> dentro del KeyInfo — el SII valida la cadena.
  sig.getKeyInfoContent = () =>
    `<X509Data><X509Certificate>${certB64}</X509Certificate></X509Data>`;

  sig.computeSignature(unsignedXml, {
    location: { reference: "//*[local-name(.)='getToken']", action: 'append' },
  });
  return sig.getSignedXml();
}

/**
 * Pide un token usando el XML firmado.
 * @param {string} signedXml
 * @returns {Promise<string>} el token (string opaco)
 */
async function getTokenFromSeed(signedXml) {
  const url = `${SII_API_BASE}/DTEWS/GetTokenFromSeed.jws`;
  // El SII espera el XML firmado como CDATA dentro de <pszXml>.
  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:def="http://DefaultNamespace">
  <soap:Body>
    <def:getToken>
      <pszXml><![CDATA[${signedXml}]]></pszXml>
    </def:getToken>
  </soap:Body>
</soap:Envelope>`;

  const res = await axios.post(url, soapBody, {
    headers: { 'Content-Type': 'text/xml; charset=utf-8', 'SOAPAction': '' },
    timeout: 30_000,
  });
  const estadoMatch = res.data.match(/<ESTADO>([^<]+)<\/ESTADO>/);
  const tokenMatch = res.data.match(/<TOKEN>([^<]+)<\/TOKEN>/);
  if (!tokenMatch) {
    logger.warn({ body: String(res.data).slice(0, 800) }, '[sii.auth] getToken: no encontré <TOKEN>');
    const estado = estadoMatch ? estadoMatch[1] : '??';
    throw new Error(`SII getToken: respuesta sin TOKEN. Estado=${estado}. Posibles causas: cert no autenticado, RUT del cert sin permisos.`);
  }
  return tokenMatch[1];
}

/**
 * Devuelve un token vigente. Reusa el cacheado si todavía no expiró,
 * o ejecuta el flujo completo (seed → firma → token) si no hay.
 *
 * @returns {Promise<string>}
 */
async function getToken() {
  const now = Date.now();
  if (_tokenCache.token && _tokenCache.expiresAt > now) {
    return _tokenCache.token;
  }
  const seed = await getSeed();
  const signed = signSeed(seed);
  const token = await getTokenFromSeed(signed);
  _tokenCache = { token, expiresAt: now + TOKEN_TTL_MS };
  logger.info({ tokenLen: token.length }, '[sii.auth] Token nuevo obtenido del SII');
  return token;
}

/** Forzar renovación al próximo getToken — para retries 401. */
function invalidateToken() {
  _tokenCache = { token: null, expiresAt: 0 };
}

module.exports = { getToken, invalidateToken, getSeed, signSeed, getTokenFromSeed };
