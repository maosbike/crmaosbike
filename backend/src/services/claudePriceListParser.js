/**
 * claudePriceListParser.js — extracción de listas de precios de motos (PDF)
 * usando Claude Haiku 4.5 con tool use + prompt caching.
 *
 * Reemplaza el matching frágil por marca (Honda / Yamaha / MMB / Promobility /
 * Imoto) que vive en services/pdfExtractor.js. Cada distribuidor cambia su
 * formato cada cierto tiempo y el parser regex se rompe. Claude lee la tabla
 * directo del PDF sin importar el layout y devuelve filas estructuradas.
 *
 * El shape de salida es compatible con extractFromPDF():
 *   { period, source_type: 'claude', rows: [{ brand, model, commercial_name,
 *     category, cc, year, price_list, bono_todo_medio, description }] }
 */
const AnthropicLib = require('@anthropic-ai/sdk');
const Anthropic = AnthropicLib.default || AnthropicLib;

let _client = null;
function getClient() {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY no configurada');
    }
    if (typeof Anthropic !== 'function') {
      throw new Error('SDK @anthropic-ai/sdk no se importó correctamente');
    }
    _client = new Anthropic();
  }
  return _client;
}

const MODEL = 'claude-haiku-4-5';

const SYSTEM_PROMPT = `Eres un extractor de listas de precios de motocicletas para un concesionario chileno (Maosbike). Lee el PDF y devuelve TODAS las filas de la tabla de precios llamando a la tool extract_price_list exactamente una vez.

QUÉ EXTRAER:
La gran mayoría de los PDFs son tablas con una fila por modelo. Las columnas típicas (los nombres exactos varían por distribuidor) son:
- Marca (a veces solo aparece como título del PDF, no en la fila)
- Modelo / código (ej "CB 300F", "MT-09", "YZF-R3A")
- Nombre comercial (ej "Honda CB 300F ABS"). A veces igual al modelo.
- Categoría (ej "Commuter", "Big Bike", "Naked", "Scooter", "Adventure", "ATV", "Off-Road")
- Cilindrada en cc
- Año comercial
- Precio lista (PBV / PRECIO / PVP). El precio "completo" antes de bonos.
- Bono "todo medio de pago" (descuento aplicable con cualquier forma de pago)

CAMPOS POR FILA (todos como integers en CLP cuando aplique):
1. brand — marca de la moto. Si el PDF es de un solo distribuidor (ej "LISTA DE PRECIOS HONDA"), todas las filas comparten esa marca. Si el PDF mezcla marcas (ej Yamaimport con Yamaha y otra), poner la marca real de cada fila.
2. model — código del modelo SIN la marca delante. Si el PDF dice "Yamaha MT-09", devuelve solo "MT-09". Si dice "Honda CB 300F ABS", devuelve "CB 300F ABS". REGLA CRÍTICA: nunca incluyas la marca como prefijo de model. El campo brand ya lleva la marca aparte; duplicarla rompe el catálogo.
3. commercial_name — nombre comercial SIN la marca delante. Si el PDF muestra "Yamaha MT-09 Standard", devuelve "MT-09 Standard". Si no aparece nombre comercial distinto al code del modelo, usa null.
4. category — categoría del distribuidor (Commuter / Big Bike / Mid Size / etc). Si no aparece, null.
5. cc — cilindrada como entero (ej 300). Null si no aparece.
6. year — año comercial como entero. Null si no aparece. (Si el PDF dice "PERIODO: Mayo 2026" usa 2026 como año por defecto).
7. price_list — precio lista como entero CLP, SIN puntos ni miles ($2.990.000 → 2990000). Null si no aplica.
8. bono_todo_medio — bono "todo medio de pago" como entero CLP. Null o 0 si no hay bono.
9. description — descripción breve si aparece, o null.

REGLAS:
- IGNORA filas que sean encabezados, separadores, totales, observaciones, o filas vacías.
- IGNORA renglones con palabras como "OBSERVACIONES", "PERIODO", "DESDE", "HASTA", "FOOTER".
- Si una fila no tiene precio lista, sáltala (no la incluyas en rows).
- Si el PDF tiene un período (ej "PERIODO: Mayo 2026"), inclúyelo en el campo period del payload como "YYYY-MM" (ej "2026-05"). Si no hay período, null.
- Devuelve TODAS las filas válidas, no resumas ni truncas. Una lista de Honda típica tiene 30-50 filas. Una de Yamaha puede tener 80+.

Si el PDF está escaneado o no tiene tabla legible, devuelve rows vacío.`;

const TOOL_DEF = {
  name: 'extract_price_list',
  description: 'Devuelve TODAS las filas de la lista de precios del PDF.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      period: {
        type: ['string', 'null'],
        description: 'Período de la lista en formato YYYY-MM, ej "2026-05".',
      },
      rows: {
        type: 'array',
        description: 'Una entrada por cada modelo en la lista.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            brand:            { type: ['string', 'null'] },
            model:            { type: ['string', 'null'] },
            commercial_name:  { type: ['string', 'null'] },
            category:         { type: ['string', 'null'] },
            cc:               { type: ['integer', 'null'] },
            year:             { type: ['integer', 'null'] },
            price_list:       { type: ['integer', 'null'] },
            bono_todo_medio:  { type: ['integer', 'null'] },
            description:      { type: ['string', 'null'] },
          },
          required: ['model', 'price_list'],
        },
      },
    },
    required: ['rows'],
  },
};

/**
 * Parsea un PDF de lista de precios con Claude.
 * @param {Buffer} pdfBuffer
 * @param {string} fileName
 * @returns {Promise<{period: string|null, source_type: 'claude', rows: Array, _usage}>}
 */
async function parsePriceListWithClaude(pdfBuffer, fileName = '') {
  const client = getClient();
  const base64Pdf = pdfBuffer.toString('base64');

  const response = await client.messages.create({
    model: MODEL,
    // Listas grandes (Yamaha con 80+ filas) necesitan más tokens. Haiku 4.5
    // soporta hasta 8192 max_tokens — quedamos cómodos en 8000.
    max_tokens: 8000,
    system: [{
      type: 'text',
      text: SYSTEM_PROMPT,
      cache_control: { type: 'ephemeral' },
    }],
    tools: [{ ...TOOL_DEF, cache_control: { type: 'ephemeral' } }],
    tool_choice: { type: 'tool', name: 'extract_price_list' },
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64Pdf },
        },
        {
          type: 'text',
          text: fileName
            ? `Extrae todas las filas de la lista. Archivo: ${fileName}`
            : 'Extrae todas las filas de la lista.',
        },
      ],
    }],
  });

  const toolUse = response.content.find(b => b.type === 'tool_use' && b.name === 'extract_price_list');
  if (!toolUse) {
    throw new Error('Claude no devolvió tool_use');
  }

  const data = toolUse.input || {};
  const rawRows = Array.isArray(data.rows) ? data.rows : [];

  // Red de seguridad: si Claude devuelve el modelo con la marca prefijada
  // (ej brand="Yamaha", model="Yamaha MT-09"), removemos el prefijo. Sin
  // esto la card del catálogo muestra "Yamaha Yamaha MT-09" y el matcher
  // de inventario no encuentra los modelos correctos.
  const stripBrand = (name, brand) => {
    if (!name || !brand) return name;
    const bn = String(brand).trim();
    if (!bn) return name;
    // Probar prefijo exacto + variantes con guión (Royal-Enfield, etc).
    const escaped = bn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('^' + escaped.replace(/\s+/g, '[\\s-]+') + '[\\s-]+', 'i');
    return String(name).replace(re, '').trim();
  };

  // Limpia y normaliza: descarta filas sin model o sin precio, asegura tipos.
  const rows = rawRows
    .filter(r => r && r.model && r.price_list && Number(r.price_list) > 0)
    .map(r => {
      const brand = r.brand || null;
      return {
        brand,
        model:           stripBrand(String(r.model).trim(), brand),
        commercial_name: r.commercial_name ? stripBrand(r.commercial_name, brand) : null,
        category:        r.category || null,
        cc:              r.cc != null ? parseInt(r.cc, 10) || null : null,
        year:            r.year != null ? parseInt(r.year, 10) || null : null,
        price_list:      parseInt(r.price_list, 10) || null,
        bono_todo_medio: r.bono_todo_medio != null ? parseInt(r.bono_todo_medio, 10) || 0 : 0,
        description:     r.description || null,
      };
    });

  return {
    period:      data.period || null,
    source_type: 'claude',
    rows,
    _usage:      response.usage,
  };
}

module.exports = { parsePriceListWithClaude };
