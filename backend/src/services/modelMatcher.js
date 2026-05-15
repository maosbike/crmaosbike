/**
 * modelMatcher.js — fallback con Claude para resolver el modelo de una moto
 * cuando el matcher fuzzy (resolveModelWithAliases) no encuentra match en el
 * catálogo. Le pasa el texto crudo y el catálogo, y Claude elige el modelo
 * existente o propone uno nuevo si está seguro.
 *
 * Política:
 *  · Si Claude elige un model_id del catálogo con confidence >= 0.7 → match.
 *  · Si Claude no reconoce un modelo confiable → null (no inventar).
 *  · Si Claude reconoce un modelo claro pero NO está en el catálogo →
 *    devuelve { newModel: { brand, model } } para que el caller lo cree.
 *
 * Cada match exitoso se guarda como alias en model_aliases para evitar
 * gastar tokens repetidos por el mismo raw.
 */
const AnthropicLib = require('@anthropic-ai/sdk');
const Anthropic = AnthropicLib.default || AnthropicLib;
const logger = require('../config/logger');

let _client = null;
function getClient() {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) return null;
    if (typeof Anthropic !== 'function') return null;
    _client = new Anthropic();
  }
  return _client;
}

const MODEL = 'claude-haiku-4-5';

// Marcas que Maosbike vende. Si Claude propone una marca fuera de esta lista,
// rechazamos el "newModel" — el raw probablemente está sucio.
const ALLOWED_BRANDS = [
  'Yamaha','Honda','Suzuki','Kawasaki','Bajaj','TVS','KTM',
  'Royal Enfield','Benelli','Harley-Davidson','Keeway','CFMoto','Voge',
  'UM','Takasaki','Peugeot','Zongshen','SYM','Bera','QJ Motor','Cyclone',
];

async function matchWithClaude(raw, models) {
  const client = getClient();
  if (!client) return null;
  if (!raw || !models || !models.length) return null;

  // Filtrar el catálogo por marca si la podemos extraer del raw. Esto
  // baja el prompt de ~30k tokens (todo el catálogo) a ~500 tokens
  // (solo modelos de esa marca) y evita reventar el rate limit de 50k
  // tokens/min de Anthropic.
  const rawLower = raw.toLowerCase();
  const detectedBrand = ALLOWED_BRANDS.find(b =>
    rawLower.includes(b.toLowerCase())
  );
  const filtered = detectedBrand
    ? models.filter(m => (m.brand || '').toLowerCase() === detectedBrand.toLowerCase())
    : models;
  // Si después del filtro queda demasiado grande, igual cortamos a 200.
  const catalog = filtered.slice(0, 200).map(m => ({
    id: m.id,
    brand: m.brand,
    model: m.model,
    commercial: m.commercial_name || null,
  }));

  const prompt = `Texto crudo desde un Excel/CSV importado: "${raw}"

Catálogo de modelos disponibles (JSON):
${JSON.stringify(catalog)}

Identifica a qué moto se refiere el texto crudo. Considera variaciones de mayúsculas, guiones, espacios, sufijos técnicos (ABS, EFI, FI), colores y años. Marcas pueden venir mal escritas.

Responde SOLO con JSON válido en una de estas formas:
1. Si encuentras match en el catálogo:
   {"action":"match","model_id":<id>,"confidence":<0-1>,"reason":"breve"}
2. Si reconoces el modelo pero NO está en el catálogo Y estás 100% seguro:
   {"action":"new","brand":"<marca>","model":"<modelo limpio>","confidence":<0-1>,"reason":"breve"}
3. Si no estás seguro:
   {"action":"none","reason":"breve"}

Reglas estrictas:
- Solo "match" si confidence >= 0.7.
- Solo "new" si confidence >= 0.9 y la marca es de fabricante real de motos.
- Nunca inventes IDs. Solo elige de la lista.
- No agregues texto fuera del JSON.`;

  let resp;
  try {
    resp = await client.messages.create({
      model: MODEL,
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });
  } catch (e) {
    logger.warn(`modelMatcher: Claude API falló para "${raw}": ${e.message}`);
    return null;
  }

  const text = (resp.content?.[0]?.text || '').trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    logger.warn(`modelMatcher: respuesta no-JSON para "${raw}": ${text.slice(0, 200)}`);
    return null;
  }

  let parsed;
  try { parsed = JSON.parse(jsonMatch[0]); }
  catch (_) { return null; }

  if (parsed.action === 'match' && parsed.model_id && (parsed.confidence ?? 0) >= 0.7) {
    const found = models.find(m => m.id === parsed.model_id);
    if (found) {
      logger.info(`modelMatcher: "${raw}" → ${found.brand} ${found.model} (Claude conf=${parsed.confidence})`);
      return { match: found, source: 'claude_match' };
    }
  }

  if (parsed.action === 'new' && parsed.brand && parsed.model && (parsed.confidence ?? 0) >= 0.9) {
    // Validar que la marca esté en la whitelist (case-insensitive).
    const brandClean = String(parsed.brand).trim();
    const allowed = ALLOWED_BRANDS.find(b => b.toLowerCase() === brandClean.toLowerCase());
    if (!allowed) {
      logger.warn(`modelMatcher: "new" rechazado, marca no permitida: "${brandClean}"`);
      return null;
    }
    return {
      newModel: { brand: allowed, model: String(parsed.model).trim() },
      source: 'claude_new',
    };
  }

  return null;
}

module.exports = { matchWithClaude };
