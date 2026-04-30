/**
 * claudeEmitidaParser.js — extracción de facturas EMITIDAS por Maosbike a sus
 * clientes. Usa Claude Haiku 4.5 con tool use + prompt caching.
 *
 * Diferencia clave vs claudeInvoiceParser (recibidas):
 *  · Maosbike es el EMISOR (rut_emisor = 76.405.840-2). El RUT que NO es
 *    Maos es el CLIENTE.
 *  · Importan los datos del cliente (nombre, dirección, comuna, giro) para
 *    auto-rellenar el form de venta.
 *  · Hay notas de crédito que referencian la factura original (ref_folio,
 *    ref_tipo: anulacion / correccion / ajuste).
 *  · charge_type — distingue inscripción vehicular vs documentación completa
 *    vs transferencia, importante para reportes y para regenerar la nota.
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

const SYSTEM_PROMPT = `Eres un extractor de facturas EMITIDAS por Maosbike (un concesionario de motos chileno) a sus clientes finales. Lee el PDF y devuelve los datos llamando a la tool extract_emitida exactamente una vez.

QUIÉN ES QUIÉN:
- Maosbike (Maosracing Limitada, RUT 76.405.840-2) es el EMISOR. Va en rut_emisor.
- El CLIENTE (persona natural o empresa que compra la moto) es el RECEPTOR. Sus datos van en rut_cliente, cliente_nombre, cliente_direccion, cliente_comuna, cliente_giro.
- NUNCA confundas emisor con cliente. El emisor SIEMPRE es Maosbike.

TIPOS DE DOCUMENTO:
- "factura" — factura electrónica normal (SII tipo 33/34).
- "nota_credito" — nota de crédito (SII tipo 61). Anula o corrige una factura previa. Tiene ref_folio (folio referenciado), ref_tipo:
  · "anulacion" — anula la factura completa (texto típico: "Anula Documento de la Referencia")
  · "correccion" — corrige datos del cliente sin cambiar montos ("Corrige Dato Receptor")
  · "ajuste" — corrige monto ("Corrige Monto")

CATEGORÍA:
- "motos" — la factura es por una motocicleta (tiene chasis, marca de moto, palabra MOTOCICLETA en el detalle)
- "otras" — accesorios, servicios, refacturaciones que no son una unidad

CAMPOS OBLIGATORIOS:
1. folio — número de factura/NC (ej "7621"). Suele estar arriba a la derecha bajo "FACTURA ELECTRONICA Nº" o "NOTA DE CREDITO Nº".
2. fecha_emision — formato YYYY-MM-DD.
3. doc_type — factura | nota_credito.
4. rut_cliente — RUT del cliente comprador (NO 76.405.840-2 que es Maosbike).
5. cliente_nombre — nombre o razón social del cliente.
6. cliente_direccion, cliente_comuna, cliente_giro — datos del cliente para reportes/regeneración de nota.
7. monto_neto, iva, total — enteros sin decimales en pesos chilenos. CUIDADO: el IVA es el monto, no el porcentaje 19.
8. monto_exento — el monto exento de IVA (puede ser 0).

PARA MOTOS (category=motos):
- brand — marca (ej "YAMAHA", "ROYAL ENFIELD", "SUZUKI").
- model — modelo o código del catálogo (ej "FZ-S", "GIXXER 150 DI", "HUNTER 350").
- chassis — número de chasis (ej "ME1RG971XT3023392").
- motor_num — número de motor.
- color — color de la moto.
- commercial_year — año comercial como entero (ej 2026).
- charge_type — tipo de cobro de documentación, infiere del detalle:
  · "inscripcion" — solo inscripción vehicular ($90.000 aprox)
  · "completa" — Documentación completa: inscripción + SOAP + permiso de circulación ($300.000 aprox)
  · "transferencia" — Transferencia vehicular ($120.000)
  · "sin_detalle" — la factura no muestra desglose de documentación

PARA NOTAS DE CRÉDITO:
- ref_folio — folio de la factura que referencia.
- ref_fecha — fecha de la factura referenciada (YYYY-MM-DD).
- ref_tipo — anulacion | correccion | ajuste (ver arriba).

descripcion: 1-2 frases sobre QUÉ se vendió. Para motos algo como "Motocicleta Yamaha FZ-S 2026 negra". NO copies labels ni headers.

Si un campo no aparece, devolvé null. NO inventes.`;

const TOOL_DEF = {
  name: 'extract_emitida',
  description: 'Devuelve los datos estructurados de la factura/NC emitida por Maosbike.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      folio:             { type: ['string','null'] },
      fecha_emision:     { type: ['string','null'], description: 'YYYY-MM-DD' },
      doc_type:          { type: 'string', enum: ['factura','nota_credito','nota_debito','boleta'] },
      category:          { type: 'string', enum: ['motos','otras'] },
      rut_emisor:        { type: ['string','null'], description: 'RUT Maosbike: 76.405.840-2' },
      emisor_nombre:     { type: ['string','null'] },
      rut_cliente:       { type: ['string','null'] },
      cliente_nombre:    { type: ['string','null'] },
      cliente_direccion: { type: ['string','null'] },
      cliente_comuna:    { type: ['string','null'] },
      cliente_giro:      { type: ['string','null'] },
      monto_neto:        { type: ['integer','null'] },
      iva:               { type: ['integer','null'] },
      monto_exento:      { type: ['integer','null'] },
      total:             { type: ['integer','null'] },
      brand:             { type: ['string','null'] },
      model:             { type: ['string','null'] },
      color:             { type: ['string','null'] },
      commercial_year:   { type: ['integer','null'] },
      motor_num:         { type: ['string','null'] },
      chassis:           { type: ['string','null'] },
      charge_type:       { type: ['string','null'], enum: ['inscripcion','completa','transferencia','sin_detalle', null] },
      descripcion:       { type: ['string','null'] },
      ref_folio:         { type: ['string','null'], description: 'Para NC: folio de factura referenciada' },
      ref_fecha:         { type: ['string','null'], description: 'Para NC: fecha factura ref YYYY-MM-DD' },
      ref_tipo:          { type: ['string','null'], enum: ['anulacion','correccion','ajuste', null] },
    },
    required: ['doc_type','category'],
  },
};

async function parseEmitidaWithClaude(pdfBuffer, fileName = '') {
  const client = getClient();
  const base64Pdf = pdfBuffer.toString('base64');

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: [{
      type: 'text',
      text: SYSTEM_PROMPT,
      cache_control: { type: 'ephemeral' },
    }],
    tools: [{ ...TOOL_DEF, cache_control: { type: 'ephemeral' } }],
    tool_choice: { type: 'tool', name: 'extract_emitida' },
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64Pdf },
        },
        {
          type: 'text',
          text: fileName ? `Extrae los datos. Archivo: ${fileName}` : 'Extrae los datos.',
        },
      ],
    }],
  });

  const toolUse = response.content.find(b => b.type === 'tool_use' && b.name === 'extract_emitida');
  if (!toolUse) {
    throw new Error('Claude no devolvió tool_use');
  }

  const data = toolUse.input;
  const refFolio = data.ref_folio || null;
  return {
    source:           'emitida',
    doc_type:         data.doc_type || 'factura',
    category:         data.category || 'otras',
    folio:            data.folio || null,
    rut_emisor:       data.rut_emisor || null,
    emisor_nombre:    data.emisor_nombre || null,
    rut_cliente:      data.rut_cliente || null,
    cliente_nombre:   data.cliente_nombre || null,
    cliente_direccion: data.cliente_direccion || null,
    cliente_comuna:   data.cliente_comuna || null,
    cliente_giro:     data.cliente_giro || null,
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
    charge_type:      data.charge_type || null,
    ref_folio:        refFolio,
    ref_rut_emisor:   refFolio ? (data.rut_emisor || null) : null,
    ref_fecha:        data.ref_fecha || null,
    ref_tipo:         data.ref_tipo || null,
    notes:            null,
    _usage:           response.usage,
  };
}

module.exports = { parseEmitidaWithClaude };
