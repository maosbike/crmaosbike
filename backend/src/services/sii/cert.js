/**
 * cert.js — carga el certificado digital (.pfx) desde variables de entorno
 * y expone la clave privada + certificado en PEM para firmar XML-DSig.
 *
 * Variables de entorno:
 *   SII_CERT_PFX_B64   — el .pfx codificado en base64 (output de `base64 -i`).
 *   SII_CERT_PASSWORD  — contraseña del .pfx (la que pusiste al descargarlo).
 *
 * Cacheamos el resultado a nivel módulo: parsear el PKCS#12 cuesta algunos ms
 * y se usa en cada renovación de token (~cada 9 min).
 */
const forge = require('node-forge');

let _cached = null;

/**
 * Parsea el .pfx una vez y devuelve { privateKeyPem, certificatePem, rutCert }.
 * Si las env vars no están seteadas, tira un error claro (el caller decide qué hacer).
 *
 * @returns {{ privateKeyPem: string, certificatePem: string, rutCert: string|null }}
 */
function loadCert() {
  if (_cached) return _cached;

  const b64 = process.env.SII_CERT_PFX_B64;
  const password = process.env.SII_CERT_PASSWORD;
  if (!b64) throw new Error('SII_CERT_PFX_B64 no configurada');
  if (!password) throw new Error('SII_CERT_PASSWORD no configurada');

  // Decodificar base64 → buffer → string binario que entiende forge.
  const pfxBuffer = Buffer.from(b64, 'base64');
  const pfxDer = forge.util.createBuffer(pfxBuffer.toString('binary'));
  const p12Asn1 = forge.asn1.fromDer(pfxDer);
  let p12;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);
  } catch (e) {
    throw new Error(`No se pudo abrir el .pfx — contraseña incorrecta o archivo dañado: ${e.message}`);
  }

  // Buscar el bag con la clave privada. eCertChile típicamente la guarda en
  // pkcs8ShroudedKeyBag; algunos providers usan keyBag. Probamos ambos.
  let keyBag = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
  if (!keyBag) {
    keyBag = p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0];
  }
  if (!keyBag || !keyBag.key) {
    throw new Error('No se encontró la clave privada dentro del .pfx');
  }

  const certBag = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0];
  if (!certBag || !certBag.cert) {
    throw new Error('No se encontró el certificado dentro del .pfx');
  }

  const privateKeyPem = forge.pki.privateKeyToPem(keyBag.key);
  const certificatePem = forge.pki.certificateToPem(certBag.cert);

  // El RUT del titular está en el Subject del cert, dentro del extension
  // 'serialNumber' (OID 2.5.4.5). Sirve solo para logging — el SII lo extrae
  // por su cuenta de la firma.
  let rutCert = null;
  try {
    const sn = certBag.cert.subject.getField({ name: 'serialNumber' });
    if (sn) rutCert = sn.value;
  } catch (_) {}

  _cached = { privateKeyPem, certificatePem, rutCert };
  return _cached;
}

/** Reset del cache — solo para tests. */
function _resetCache() {
  _cached = null;
}

module.exports = { loadCert, _resetCache };
