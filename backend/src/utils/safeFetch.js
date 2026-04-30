// Fetch SSRF-safe: solo permite HTTPS hacia hosts en una allowlist explícita
// y rechaza IPs privadas, link-local, loopback y multicast. Aplica timeout.
//
// Uso: const buf = await safeFetchBuffer(url, { allowHosts: [...], timeoutMs: 15000 })

const dns = require('dns').promises;
const net = require('net');

const DEFAULT_ALLOW_HOSTS = [
  'res.cloudinary.com',
  'drive.google.com',
  'www.googleapis.com',
];

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_BYTES = 25 * 1024 * 1024; // 25MB

function isPrivateIPv4(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  // 10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, 100.64/10 (CGNAT),
  // 0/8, 224/4 (multicast), 240/4 (reservado), 255.255.255.255 (broadcast).
  if (p[0] === 10) return true;
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
  if (p[0] === 192 && p[1] === 168) return true;
  if (p[0] === 127) return true;
  if (p[0] === 169 && p[1] === 254) return true;
  if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;
  if (p[0] === 0) return true;
  if (p[0] >= 224) return true;
  if (p.join('.') === '255.255.255.255') return true;
  return false;
}

function isPrivateIPv6(ip) {
  const lc = ip.toLowerCase();
  // ::, ::1, fc00::/7 (ULA), fe80::/10 (link-local), ff00::/8 (multicast), ::ffff:0:0/96 IPv4-mapped.
  if (lc === '::' || lc === '::1') return true;
  if (lc.startsWith('fc') || lc.startsWith('fd')) return true;
  if (lc.startsWith('fe8') || lc.startsWith('fe9') || lc.startsWith('fea') || lc.startsWith('feb')) return true;
  if (lc.startsWith('ff')) return true;
  if (lc.startsWith('::ffff:')) {
    const v4 = lc.slice(7);
    if (net.isIPv4(v4)) return isPrivateIPv4(v4);
  }
  return false;
}

async function assertSafeUrl(rawUrl, { allowHosts = DEFAULT_ALLOW_HOSTS } = {}) {
  let u;
  try { u = new URL(rawUrl); } catch { throw new Error('URL inválida'); }
  if (u.protocol !== 'https:') throw new Error('Solo se permite https');
  const host = u.hostname.toLowerCase();
  const ok = allowHosts.some((h) => host === h || host.endsWith('.' + h));
  if (!ok) throw new Error('Host no permitido');

  // Resolver y validar IPs reales — defensa contra DNS rebinding y A records a IPs privadas.
  let addrs;
  try {
    addrs = await dns.lookup(host, { all: true });
  } catch {
    throw new Error('No se pudo resolver el host');
  }
  for (const a of addrs) {
    if (a.family === 4 && isPrivateIPv4(a.address)) throw new Error('IP destino no permitida');
    if (a.family === 6 && isPrivateIPv6(a.address)) throw new Error('IP destino no permitida');
  }
  return u;
}

async function safeFetchBuffer(url, opts = {}) {
  const { allowHosts, timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes = DEFAULT_MAX_BYTES } = opts;
  await assertSafeUrl(url, { allowHosts });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, redirect: 'error' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const len = parseInt(r.headers.get('content-length') || '0', 10);
    if (len && len > maxBytes) throw new Error('Respuesta demasiado grande');
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > maxBytes) throw new Error('Respuesta demasiado grande');
    return buf;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { safeFetchBuffer, assertSafeUrl };
