/**
 * claudeSupplierPaymentParser.js — extractor Claude para los 2 PDFs que
 * componen un pago a proveedor:
 *  · invoice — factura emitida por el distribuidor (Yamaha, Suzuki, etc.)
 *  · receipt — comprobante de pago bancario (BCI, Banco Estado, Santander…)
 *
 * Devuelve el mismo shape que extractInvoice/extractReceipt del regex parser
 * para no romper sync-payments.
 */
const AnthropicLib = require('@anthropic-ai/sdk');
const Anthropic = AnthropicLib.default || AnthropicLib;

let _client = null;
function getClient() {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY no configurada');
    if (typeof Anthropic !== 'function') throw new Error('@anthropic-ai/sdk no se importó correctamente');
    _client = new Anthropic();
  }
  return _client;
}

const MODEL = 'claude-haiku-4-5';

// ─── INVOICE: factura del distribuidor a Maosbike ──────────────────────────
const INVOICE_SYSTEM = `Eres un extractor de facturas de distribuidores de motos hacia Maosbike (concesionario chileno). El distribuidor (Yamaimport, Importadora Imoto, Royal Enfield Chile, etc.) emite la factura. Maosbike (RUT 76.405.840-2) es el receptor. Lee el PDF y devolvé los datos llamando a extract_supplier_invoice una vez.

REGLAS:
- provider — nombre del distribuidor o marca de la moto. Preferí la marca conocida (YAMAHA, SUZUKI, ROYAL ENFIELD, BAJAJ, HONDA) si aparece en el detalle "MARCA :"; si no, la razón social.
- invoice_number — folio de la factura (ej "393014").
- invoice_date — YYYY-MM-DD.
- total_amount, neto, iva — enteros sin decimales en pesos chilenos. IVA es el monto, NO el 19%.
- Para motos: motor_num, chassis, color, commercial_year, model, brand. Buscá los anchors "MARCA :", "COD.MODELO :", "N DE CHASIS :", "N MOTOR :", "ANO COMERCIAL :", "COLOR :".
- model: preferí el COD.MODELO si existe (ej "YZF-R3A") sobre el descriptivo.
- internal_code: el código interno del distribuidor que identifica el producto (suele ser la primera columna del detalle, ej "INT1-0300YZFR3A26A"). Si no existe, usá el mismo del model.
- description: 1 frase sobre QUÉ se facturó (motocicleta + marca + modelo + año, o servicio/repuesto).
- Si no es una moto (es repuesto, accesorio, servicio), dejá motor_num/chassis/color/commercial_year/model/brand en null.

NO inventes. Si un dato no está, devolvé null.`;

const INVOICE_TOOL = {
  name: 'extract_supplier_invoice',
  description: 'Datos de la factura emitida por el distribuidor a Maosbike.',
  input_schema: {
    type: 'object', additionalProperties: false,
    properties: {
      provider:        { type: ['string','null'] },
      invoice_number:  { type: ['string','null'] },
      invoice_date:    { type: ['string','null'], description: 'YYYY-MM-DD' },
      due_date:        { type: ['string','null'], description: 'YYYY-MM-DD' },
      total_amount:    { type: ['integer','null'] },
      neto:            { type: ['integer','null'] },
      iva:             { type: ['integer','null'] },
      motor_num:       { type: ['string','null'] },
      chassis:         { type: ['string','null'] },
      color:           { type: ['string','null'] },
      commercial_year: { type: ['integer','null'] },
      model:           { type: ['string','null'] },
      brand:           { type: ['string','null'] },
      internal_code:   { type: ['string','null'] },
      description:     { type: ['string','null'] },
    },
    required: [],
  },
};

async function parseSupplierInvoiceWithClaude(pdfBuffer, fileName = '') {
  const client = getClient();
  const base64Pdf = pdfBuffer.toString('base64');
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: [{ type: 'text', text: INVOICE_SYSTEM, cache_control: { type: 'ephemeral' } }],
    tools: [{ ...INVOICE_TOOL, cache_control: { type: 'ephemeral' } }],
    tool_choice: { type: 'tool', name: 'extract_supplier_invoice' },
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Pdf } },
        { type: 'text', text: fileName ? `Archivo: ${fileName}` : 'Extrae los datos.' },
      ],
    }],
  });
  const tu = response.content.find(b => b.type === 'tool_use' && b.name === 'extract_supplier_invoice');
  if (!tu) throw new Error('Claude no devolvió tool_use (invoice)');
  const d = tu.input;
  return {
    provider:        d.provider || null,
    invoice_number:  d.invoice_number || null,
    invoice_date:    d.invoice_date || null,
    due_date:        d.due_date || null,
    total_amount:    d.total_amount || null,
    neto:            d.neto || null,
    iva:             d.iva || null,
    motor_num:       d.motor_num || null,
    chassis:         d.chassis || null,
    color:           d.color || null,
    commercial_year: d.commercial_year || null,
    model:           d.model || null,
    brand:           d.brand || null,
    internal_code:   d.internal_code || d.model || null,
    description:     d.description || null,
    _usage: response.usage,
  };
}

// ─── RECEIPT: comprobante de pago bancario ─────────────────────────────────
const RECEIPT_SYSTEM = `Eres un extractor de comprobantes de pago bancarios chilenos. Estos son comprobantes que Maosbike (cliente del banco, RUT 76.405.840-2) emite cuando paga una factura a un distribuidor. Cada banco tiene su formato (BCI, Banco de Chile, Santander, Banco Estado, transferencias, etc).

Lee el PDF y devolvé los datos llamando a extract_payment_receipt una vez.

REGLAS:
- banco — nombre de la institución bancaria (ej "Banco de Credito e Inversiones (BCI)", "Banco Estado", "Santander", "Banco de Chile").
- receipt_number — número de operación / comprobante / registro / folio.
- payment_date — YYYY-MM-DD. La FECHA EFECTIVA del pago. Suele decir "Fecha operación", "Fecha de pago", "Fecha de transferencia". NO confundir con vencimiento ni con fecha de emisión de la factura.
- due_date — fecha de vencimiento de la factura referenciada (si aparece). YYYY-MM-DD.
- total_amount — monto pagado en pesos chilenos como entero. CUIDADO: en formatos chilenos NUNCA hay espacios dentro del monto, solo "." de miles. Si ves "$ 2.205.800" el monto es 2205800.
- payer_name — quién hizo el pago (debería ser Maosbike o similar).
- invoice_ref — número de factura referenciada en el comprobante (ej "N. Factura: 389.242" → "389242").
- payment_method — "Transferencia", "Cheque", "Efectivo", o null.
- detail_lines — si el comprobante paga MÚLTIPLES facturas en una sola transacción (típico Yamaha/Banco de Chile), array con una entrada por factura: { invoice_number, due_date, amount }. Si paga una sola factura, dejá array vacío.

NO inventes. null si no aparece.`;

const RECEIPT_TOOL = {
  name: 'extract_payment_receipt',
  description: 'Datos del comprobante de pago bancario.',
  input_schema: {
    type: 'object', additionalProperties: false,
    properties: {
      banco:           { type: ['string','null'] },
      receipt_number:  { type: ['string','null'] },
      payment_date:    { type: ['string','null'], description: 'YYYY-MM-DD' },
      due_date:        { type: ['string','null'], description: 'YYYY-MM-DD' },
      total_amount:    { type: ['integer','null'] },
      payer_name:      { type: ['string','null'] },
      invoice_ref:     { type: ['string','null'] },
      payment_method:  { type: ['string','null'], enum: ['Transferencia','Cheque','Efectivo', null] },
      detail_lines:    {
        type: 'array',
        description: 'Solo si el comprobante paga varias facturas',
        items: {
          type: 'object', additionalProperties: false,
          properties: {
            invoice_number: { type: ['string','null'] },
            due_date:       { type: ['string','null'] },
            amount:         { type: ['integer','null'] },
          },
          required: [],
        },
      },
    },
    required: [],
  },
};

async function parseReceiptWithClaude(pdfBuffer, fileName = '') {
  const client = getClient();
  const base64Pdf = pdfBuffer.toString('base64');
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: [{ type: 'text', text: RECEIPT_SYSTEM, cache_control: { type: 'ephemeral' } }],
    tools: [{ ...RECEIPT_TOOL, cache_control: { type: 'ephemeral' } }],
    tool_choice: { type: 'tool', name: 'extract_payment_receipt' },
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Pdf } },
        { type: 'text', text: fileName ? `Archivo: ${fileName}` : 'Extrae los datos del comprobante.' },
      ],
    }],
  });
  const tu = response.content.find(b => b.type === 'tool_use' && b.name === 'extract_payment_receipt');
  if (!tu) throw new Error('Claude no devolvió tool_use (receipt)');
  const d = tu.input;
  return {
    receipt_number:  d.receipt_number || null,
    payment_date:    d.payment_date || null,
    due_date:        d.due_date || null,
    total_amount:    d.total_amount || null,
    payer_name:      d.payer_name || null,
    invoice_ref:     d.invoice_ref || null,
    banco:           d.banco || null,
    payment_method:  d.payment_method || null,
    detail_lines:    Array.isArray(d.detail_lines) ? d.detail_lines : [],
    _usage: response.usage,
  };
}

module.exports = { parseSupplierInvoiceWithClaude, parseReceiptWithClaude };
