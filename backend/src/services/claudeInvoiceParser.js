/**
 * claudeInvoiceParser.js — extracción estructurada de facturas DTE chilenas
 * usando Claude Haiku 4.5 con tool use + prompt caching.
 *
 * Approach: pasamos el PDF como `document` content block al modelo, le damos
 * UN tool con schema JSON de los campos que necesitamos, y forzamos su uso
 * con `tool_choice: {type: 'tool', name: 'extract_invoice'}`. El modelo
 * devuelve un solo `tool_use` block con el input estructurado.
 *
 * Caching:
 *   · system prompt (instrucciones del rol) → cached (5min TTL ephemeral)
 *   · tool definition → cached automáticamente porque va antes del PDF
 *   · PDF (volátil, distinto cada llamada) → NO cached, va al final
 *
 * Costo aproximado por factura (Haiku 4.5, input ~3k tokens):
 *   · primera llamada del día:   ~$0.003 (cache write)
 *   · siguientes (cache read):   ~$0.0008
 *   · 50 facturas → ~$0.05 total
 */
const AnthropicLib = require('@anthropic-ai/sdk');
// CommonJS interop — la SDK exporta `default` en algunas versiones, en otras
// el módulo ES es el constructor mismo. Soportamos ambos casos.
const Anthropic = AnthropicLib.default || AnthropicLib;

let _client = null;
function getClient() {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY no configurada en el entorno');
    }
    if (typeof Anthropic !== 'function') {
      throw new Error('SDK @anthropic-ai/sdk no se importó correctamente — Anthropic no es constructor');
    }
    _client = new Anthropic();
  }
  return _client;
}

const MODEL = 'claude-haiku-4-5';

const SYSTEM_PROMPT = `Eres un extractor especializado de datos de facturas electrónicas chilenas (DTE — formato SII tipo 33/34/61).

Tu única tarea: leer el PDF de la factura y devolver los datos estructurados llamando a la tool extract_invoice exactamente una vez.

Reglas estrictas:
1. RUT del proveedor (rut_emisor): el RUT que NO es 76.405.840-2 (ese es Maosbike, el receptor).
2. Para facturas de motos, el bloque de detalle del item suele tener líneas como "MARCA : YAMAHA", "COD.MODELO : YZF-R3A", "N DE CHASIS : MH3RH25...", "N MOTOR : H08E-...", "ANO COMERCIAL : 2026", "COLOR : VERDE". Extrae cada uno.
3. Si la factura NO es de una moto (servicios, repuestos, municipal, etc), deja brand/model/chassis/motor_num/color/commercial_year como null y categoriza correctamente.
4. Categoría:
   - "motos": tiene chasis o marca conocida de moto + modelo (Yamaha, Suzuki, Royal Enfield, Bajaj, Honda, etc.)
   - "partes": repuestos, aceite, neumáticos, accesorios de moto
   - "servicios": arriendo, electricidad, internet, honorarios, mantención, marketing, contabilidad, transporte
   - "municipal": patente, permiso de circulación, impuestos, tesorería
   - "otros": cualquier cosa que no cuadre
5. fecha_emision en formato YYYY-MM-DD.
6. Montos como enteros sin decimales (en pesos chilenos). Si IVA aparece como "I.V.A. 19% $ 833.557", el monto del IVA es 833557 (no 19).
7. descripcion: 1-3 frases que describan QUÉ se facturó (ej "Motocicleta Yamaha YZF-R3A 2026 verde" o "Arriendo local comercial mes de abril 2026"). NO copies labels de la factura ni encabezados de columna.
8. Si un campo no aparece en la factura, devuélvelo null. NO inventes datos.`;

// JSON Schema para la tool — define exactamente qué esperamos de vuelta.
// Usar additionalProperties:false ayuda al modelo a no agregar campos extras.
const TOOL_DEF = {
  name: 'extract_invoice',
  description: 'Devuelve los datos estructurados extraídos de la factura electrónica chilena (DTE).',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      folio:           { type: ['string','null'], description: 'Número de folio de la factura, ej "392914"' },
      fecha_emision:   { type: ['string','null'], description: 'Fecha emisión en formato YYYY-MM-DD' },
      doc_type:        { type: 'string', enum: ['factura','nota_credito','nota_debito','boleta'], description: 'Tipo de documento DTE' },
      rut_emisor:      { type: ['string','null'], description: 'RUT del proveedor (no Maosbike), formato XX.XXX.XXX-X' },
      emisor_nombre:   { type: ['string','null'], description: 'Razón social del proveedor, ej "YAMAIMPORT S.A."' },
      rut_cliente:     { type: ['string','null'], description: 'RUT del receptor (Maosbike: 76.405.840-2)' },
      monto_neto:      { type: ['integer','null'], description: 'Monto neto en pesos chilenos, sin decimales' },
      iva:             { type: ['integer','null'], description: 'IVA en pesos chilenos (no el porcentaje), sin decimales' },
      monto_exento:    { type: ['integer','null'], description: 'Monto exento de IVA, sin decimales' },
      total:           { type: ['integer','null'], description: 'Total de la factura en pesos chilenos, sin decimales' },
      category:        { type: 'string', enum: ['motos','partes','servicios','municipal','otros'], description: 'Categoría inferida del contenido' },
      brand:           { type: ['string','null'], description: 'Marca de la moto (solo si category=motos)' },
      model:           { type: ['string','null'], description: 'Modelo / código de modelo, ej "YZF-R3A" (solo motos)' },
      color:           { type: ['string','null'], description: 'Color de la moto (solo motos)' },
      commercial_year: { type: ['integer','null'], description: 'Año comercial, ej 2026 (solo motos)' },
      motor_num:       { type: ['string','null'], description: 'Número de motor (solo motos)' },
      chassis:         { type: ['string','null'], description: 'Número de chasis / VIN (solo motos)' },
      descripcion:     { type: ['string','null'], description: '1-3 frases describiendo qué se facturó. NO copies labels.' },
    },
    required: ['doc_type','category'],
  },
};

/**
 * Extrae datos de una factura PDF usando Claude.
 * @param {Buffer} pdfBuffer - bytes del PDF
 * @param {string} fileName - nombre del archivo (sólo para logging/contexto)
 * @returns {Promise<object|null>} los campos extraídos en el shape de extractRecibida, o null si falla
 */
async function parseInvoiceWithClaude(pdfBuffer, fileName = '') {
  const client = getClient();
  const base64Pdf = pdfBuffer.toString('base64');

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    // System prompt con cache_control — se cachea entre llamadas (TTL 5min)
    system: [{
      type: 'text',
      text: SYSTEM_PROMPT,
      cache_control: { type: 'ephemeral' },
    }],
    // Tool con cache_control — la definición se cachea junto con el system
    tools: [{ ...TOOL_DEF, cache_control: { type: 'ephemeral' } }],
    // Forzamos uso de la tool — siempre devuelve un tool_use block
    tool_choice: { type: 'tool', name: 'extract_invoice' },
    messages: [{
      role: 'user',
      content: [
        // PDF como document — Claude lo lee directo, no necesita pre-procesamiento
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64Pdf },
        },
        {
          type: 'text',
          text: fileName
            ? `Extrae los datos de esta factura. Nombre del archivo: ${fileName}`
            : 'Extrae los datos de esta factura.',
        },
      ],
    }],
  });

  // Encontrar el tool_use block — siempre hay uno por tool_choice forzado
  const toolUse = response.content.find(b => b.type === 'tool_use' && b.name === 'extract_invoice');
  if (!toolUse) {
    throw new Error('Claude no devolvió tool_use — respuesta inesperada');
  }

  const data = toolUse.input;

  // Mapear al shape que extractRecibida (regex parser) devolvía, así
  // el resto del flujo (sync-drive-recibidas) no necesita cambiar.
  return {
    source:           'recibida',
    doc_type:         data.doc_type || 'factura',
    category:         data.category || 'otros',
    folio:            data.folio || null,
    rut_emisor:       data.rut_emisor || null,
    emisor_nombre:    data.emisor_nombre || null,
    rut_cliente:      data.rut_cliente || null,
    cliente_nombre:   null,
    cliente_direccion: null,
    cliente_comuna:   null,
    cliente_giro:     null,
    fecha_emision:    data.fecha_emision || null,
    monto_neto:       data.monto_neto || 0,
    iva:              data.iva || 0,
    monto_exento:     data.monto_exento || 0,
    total:            data.total || 0,
    brand:            data.brand || null,
    model:            data.model || null,
    color:            data.color || null,
    commercial_year:  data.commercial_year || null,
    motor_num:        data.motor_num || null,
    chassis:          data.chassis || null,
    descripcion:      data.descripcion || null,
    ref_folio:        null,
    ref_rut_emisor:   null,
    ref_fecha:        null,
    ref_tipo:         null,
    notes:            null,
    // Para diagnóstico — el caller puede loguear cache hit rate
    _usage: response.usage,
  };
}

module.exports = { parseInvoiceWithClaude };
