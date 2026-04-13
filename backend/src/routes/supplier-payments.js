/**
 * Pagos a proveedor/distribuidor — CRMaosBike
 * Soporta extracción automática de datos desde PDF (factura + comprobante)
 */
const router  = require('express').Router();
const db      = require('../config/db');
const { auth, roleCheck } = require('../middleware/auth');
const multer  = require('multer');
const cloudinary = require('../config/cloudinary');
const pdfParse   = require('pdf-parse');

router.use(auth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/\.(pdf|PDF)$/.test(file.originalname)) cb(null, true);
    else cb(new Error('Solo se aceptan archivos PDF'));
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toISODate(d, m, y) {
  if (!d || !m || !y) return null;
  const mm = isNaN(parseInt(m)) ? {
    enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,
    julio:7,agosto:8,septiembre:9,octubre:10,noviembre:11,diciembre:12
  }[String(m).toLowerCase()] : parseInt(m);
  if (!mm) return null;
  return `${y}-${String(mm).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

function parseAmt(s) {
  if (!s) return null;
  // Formato chileno: puntos como separadores de miles (1.853.614)
  const clean = String(s).replace(/\./g,'').replace(/,(\d{2})$/,'').replace(/[^\d]/g,'');
  return parseInt(clean) || null;
}

/**
 * Extrae datos de una factura Yamaha (o similar).
 * Basado en el formato real:
 *   YAMAIMPORT S.A.  RUT: 79.831.090-9
 *   FACTURA ELECTRONICA Nº 389242
 *   Fecha Emision:27 de Febrero del 2026
 *   N MOTOR : G3T8E0028091
 *   N DE CHASIS : ME1RG9711T3019117
 *   COD.MODELO : FZ-S
 *   COLOR : NEGRO
 *   MARCA : YAMAHA
 *   ANO COMERCIAL : 2026
 *   MONTO NETO$1.853.614
 *   I.V.A. 19%$ 352.186
 *   TOTAL$2.205.800
 */
function extractInvoice(text) {
  const t = text.replace(/\r/g,' ').replace(/\n+/g,' ').replace(/\s{2,}/g,' ');

  // ── Número de factura ──
  const invN =
    t.match(/(?:FACTURA[A-Z\s]*?)N[°º]\s*(\d{4,9})/i)?.[1] ||
    t.match(/N[°º\.]\s*(\d{5,9})/)?.[1] ||
    null;

  // ── Proveedor — texto antes de "RUT:" ──
  const provMatch = t.match(/([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ\s,\.]+?(?:S\.A\.|LTDA\.?|SPA\.?|E\.I\.R\.L\.?)?)\s*RUT/i);
  const provider = provMatch?.[1]?.trim().replace(/\s+/g,' ') || null;

  // ── Fecha emisión factura: "Fecha Emision:27 de Febrero del 2026" ──
  const dateMatch =
    t.match(/Fecha\s+Emisi[oó]n\s*:?\s*(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+(?:del?\s+)?(\d{4})/i) ||
    t.match(/(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+(?:del?\s+)?(\d{4})/i);
  const invoice_date = dateMatch ? toISODate(dateMatch[1], dateMatch[2], dateMatch[3]) : null;

  // ── Importes ──
  const netoMatch  = t.match(/MONTO\s+NETO\s*\$?\s*([\d\.,]+)/i);
  const ivaMatch   = t.match(/I\.V\.A\.[\s\d%]*\$\s*([\d\.,]+)/i);
  const totalMatch =
    t.match(/\bTOTAL\s*\$\s*([\d\.,]+)/i) ||
    t.match(/TOTAL\s+FACTURA[^$]*\$\s*([\d\.,]+)/i) ||
    t.match(/TOTAL\s+([\d\.,]+)/i);
  const neto         = parseAmt(netoMatch?.[1]);
  const iva          = parseAmt(ivaMatch?.[1]);
  const total_amount = parseAmt(totalMatch?.[1]);

  // ── Datos del vehículo ──
  const motor   = t.match(/N\s+MOTOR\s*:\s*([A-Z0-9]+)/i)?.[1]?.trim() ||
                  t.match(/N[°º]\s*MOTOR\s*:?\s*([A-Z0-9]+)/i)?.[1]?.trim() || null;

  const chassis = t.match(/N\s+DE\s+CHASIS\s*:\s*([A-Z0-9]+)/i)?.[1]?.trim() ||
                  t.match(/CHASIS\s*:\s*([A-Z0-9]+)/i)?.[1]?.trim() || null;

  // COD.MODELO es el código/nombre del modelo
  const modelMatch = t.match(/COD\.?\s*MODELO\s*:\s*([A-Z0-9][A-Z0-9\-\s]*?)(?=\s+[A-Z]{2,}\s*:|$)/i) ||
                     t.match(/MODELO\s*:\s*([A-Z0-9][A-Z0-9\-\s]*?)(?=\s+[A-Z]{2,}|$)/i);
  const model = modelMatch?.[1]?.trim() || null;

  const colorMatch = t.match(/\bCOLOR\s*:\s*([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ]+)/i);
  const color = colorMatch?.[1]?.trim() || null;

  const brand = t.match(/\bMARCA\s*:\s*([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ]+)/i)?.[1]?.trim() || null;

  const year  = parseInt(t.match(/ANO\s+COMERCIAL\s*:\s*(\d{4})/i)?.[1] ||
                          t.match(/A[ÑN]O\s+COMERCIAL\s*:\s*(\d{4})/i)?.[1]) || null;

  const internalCode = t.match(/COD\.?\s*MODELO\s*:\s*([A-Z0-9\-]+)/i)?.[1]?.trim() || null;

  // Proveedor = marca (YAMAHA), no el nombre del importador
  const resolvedProvider = brand || provider;

  return {
    provider:        resolvedProvider,
    invoice_number:  invN,
    invoice_date,
    due_date:        null,
    total_amount,
    neto,
    iva,
    motor_num:       motor,
    chassis,
    color,
    commercial_year: year,
    model,
    brand,
    internal_code:   internalCode,
  };
}

/**
 * Extrae datos de un comprobante BCI (o similar).
 * Basado en el formato real:
 *   Institución : Banco de Credito e Invensiones (BCI)
 *   Número de registro : #0000014829
 *   Cliente : SOCIEDAD COMERCIALIZADORA...
 *   Fecha operación : 13 de Abril del 2026
 *   N. Factura: 389.242
 *   Fecha Emisión: 27 de Febrero del 2026
 *   Vencimiento: 28 de Abril del 2026
 *   Monto: $ 2.205.800
 */
function extractReceipt(text) {
  const t = text.replace(/\r/g,' ').replace(/\n+/g,' ').replace(/\s{2,}/g,' ');

  // ── Banco / institución ──
  const bancoMatch = t.match(/Instituci[oó]n\s*:\s*(.+?)(?=\s+N[úu]mero|\s+Cliente|\s+Fecha|\s*$)/i);
  const banco = bancoMatch?.[1]?.trim() || null;

  // ── Número de comprobante/registro ──
  const opNum =
    t.match(/N[úu]mero\s+de\s+registro\s*:\s*#?(\d+)/i)?.[1] ||
    t.match(/N[°º\.]\s*(?:de\s*)?(?:OPERACI[OÓ]N|COMPROBANTE|FOLIO|REFERENCIA)\s*:?\s*(\d{5,15})/i)?.[1] ||
    null;

  // ── Fecha de operación/pago ──
  const payDateMatch =
    t.match(/Fecha\s+operaci[oó]n\s*:\s*(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+(?:del?\s+)?(\d{4})/i) ||
    t.match(/Fecha\s+(?:de\s+)?(?:pago|transferencia)\s*:\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i);
  const payment_date = payDateMatch ? toISODate(payDateMatch[1], payDateMatch[2], payDateMatch[3]) : null;

  // ── Fecha de vencimiento ──
  const dueDateMatch =
    t.match(/Vencimiento\s*:\s*(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+(?:del?\s+)?(\d{4})/i) ||
    t.match(/Vencimiento\s*:\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i);
  const due_date = dueDateMatch ? toISODate(dueDateMatch[1], dueDateMatch[2], dueDateMatch[3]) : null;

  // ── Monto ──
  const amtMatch =
    t.match(/Monto\s*:\s*\$?\s*([\d\.,]+)/i) ||
    t.match(/(?:TOTAL|IMPORTE)\s*:?\s*\$?\s*([\d\.,]+)/i);
  const total_amount = parseAmt(amtMatch?.[1]);

  // ── Pagador/cliente ──
  const payerMatch = t.match(/Cliente\s*:\s*(.+?)(?=\s+Fecha|\s+N[\.°]|\s+Monto|\s*$)/i);
  const payer_name = payerMatch?.[1]?.trim() || null;

  // ── Referencia a número de factura ──
  const invRef =
    t.match(/N[\.°º]?\s*Factura\s*:\s*([\d\.]+)/i)?.[1]?.replace(/\./g,'') ||
    t.match(/(?:FACTURA|FACT\.?)\s*N?[°º]?\s*:?\s*([\d\.]{5,10})/i)?.[1]?.replace(/\./g,'') ||
    null;

  // ── Medio de pago ──
  const payMethod =
    t.match(/(?:medio|forma|tipo)\s*(?:de\s*)?pago\s*:\s*([^\n,;]+)/i)?.[1]?.trim() ||
    (t.match(/\btransferencia\b/i) ? 'Transferencia' : null) ||
    null;

  return {
    receipt_number:  opNum,
    payment_date,
    due_date,
    total_amount,
    payer_name,
    invoice_ref:     invRef,
    banco,
    payment_method:  payMethod,
  };
}

// ─── POST /extract ────────────────────────────────────────────────────────────
router.post('/extract', roleCheck('super_admin','admin_comercial','backoffice'),
  upload.fields([{ name:'invoice', maxCount:1 }, { name:'receipt', maxCount:1 }]),
  async (req, res) => {
    try {
      let invoiceData = null, receiptData = null;

      if (req.files?.invoice?.[0]) {
        const txt = (await pdfParse(req.files.invoice[0].buffer)).text;
        invoiceData = extractInvoice(txt);
      }
      if (req.files?.receipt?.[0]) {
        const txt = (await pdfParse(req.files.receipt[0].buffer)).text;
        receiptData = extractReceipt(txt);
      }

      const merged = {
        ...(invoiceData || {}),
        ...(receiptData ? {
          receipt_number:  receiptData.receipt_number,
          payment_date:    receiptData.payment_date,
          due_date:        invoiceData?.due_date || receiptData.due_date,
          payer_name:      receiptData.payer_name,
          banco:           receiptData.banco,
          payment_method:  receiptData.payment_method,
          total_amount:    invoiceData?.total_amount || receiptData.total_amount,
          invoice_number:  invoiceData?.invoice_number || receiptData.invoice_ref || null,
        } : {}),
      };
      // Fallback: si no hay due_date, calcular como invoice_date + 1 mes
      if (!merged.due_date && merged.invoice_date) {
        const d = new Date(merged.invoice_date + 'T12:00:00');
        d.setMonth(d.getMonth() + 1);
        merged.due_date = d.toISOString().slice(0, 10);
      }

      res.json({ invoice: invoiceData, receipt: receiptData, merged });
    } catch (e) {
      console.error('[SupPay/extract]', e);
      res.status(500).json({ error: 'Error al procesar PDFs: ' + e.message });
    }
  }
);

// ─── POST / — crear registro ──────────────────────────────────────────────────
router.post('/', roleCheck('super_admin','admin_comercial','backoffice'),
  upload.fields([{ name:'invoice', maxCount:1 }, { name:'receipt', maxCount:1 }]),
  async (req, res) => {
    try {
      const {
        provider, invoice_number, invoice_date, due_date, payment_date,
        total_amount, neto, iva, receipt_number, payer_name,
        brand, model, color, commercial_year, motor_num, chassis, internal_code,
        notes, status, payment_method, banco,
        invoice_url: bodyInvUrl, receipt_url: bodyRecUrl,
      } = req.body;

      let invoice_url = bodyInvUrl || null;
      let receipt_url = bodyRecUrl || null;

      for (const field of ['invoice','receipt']) {
        const file = req.files?.[field]?.[0];
        if (file) {
          const b64 = file.buffer.toString('base64');
          const up  = await cloudinary.uploader.upload(`data:application/pdf;base64,${b64}`, {
            folder:        'crmaosbike/supplier-payments',
            resource_type: 'raw',
            public_id:     `${field}_${invoice_number || Date.now()}_${Date.now()}`,
          });
          if (field === 'invoice') invoice_url = up.secure_url;
          else                     receipt_url  = up.secure_url;
        }
      }

      const { rows } = await db.query(
        `INSERT INTO supplier_payments (
           provider, invoice_number, invoice_date, due_date, payment_date,
           total_amount, neto, iva,
           receipt_number, payer_name,
           brand, model, color, commercial_year, motor_num, chassis, internal_code,
           invoice_url, receipt_url, notes, status,
           payment_method, banco, created_by
         ) VALUES (
           $1,$2,$3,$4,$5,
           $6,$7,$8,
           $9,$10,
           $11,$12,$13,$14,$15,$16,$17,
           $18,$19,$20,$21,
           $22,$23,$24
         ) RETURNING *`,
        [
          provider||null, invoice_number||null,
          invoice_date||null, due_date||null, payment_date||null,
          total_amount ? parseInt(total_amount) : null,
          neto         ? parseInt(neto)         : null,
          iva          ? parseInt(iva)          : null,
          receipt_number||null, payer_name||null,
          brand||null, model||null, color||null,
          commercial_year ? parseInt(commercial_year) : null,
          motor_num||null, chassis||null, internal_code||null,
          invoice_url, receipt_url,
          notes||null, status||'pendiente',
          payment_method||null, banco||null,
          req.user.id,
        ]
      );
      res.status(201).json(rows[0]);
    } catch (e) {
      console.error('[SupPay] POST', e);
      res.status(500).json({ error: 'Error al crear registro: ' + e.message });
    }
  }
);

// ─── GET / ────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { q, status, from, to } = req.query;
    const where = [], params = [];
    let idx = 1;
    if (status) { where.push(`status = $${idx++}`); params.push(status); }
    if (from)   { where.push(`invoice_date >= $${idx++}`); params.push(from); }
    if (to)     { where.push(`invoice_date <= $${idx++}`); params.push(to); }
    if (q) {
      where.push(`(invoice_number ILIKE $${idx} OR provider ILIKE $${idx} OR chassis ILIKE $${idx} OR motor_num ILIKE $${idx} OR model ILIKE $${idx})`);
      params.push(`%${q}%`); idx++;
    }
    const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const { rows } = await db.query(
      `SELECT * FROM supplier_payments ${clause} ORDER BY created_at DESC`, params
    );
    res.json({ data: rows, total: rows.length });
  } catch (e) { console.error('[SupPay] GET', e); res.status(500).json({ error: 'Error' }); }
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM supplier_payments WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'No encontrado' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: 'Error' }); }
});

// ─── PATCH /:id ───────────────────────────────────────────────────────────────
router.patch('/:id', roleCheck('super_admin','admin_comercial','backoffice'), async (req, res) => {
  try {
    const FIELDS = [
      'provider','invoice_number','invoice_date','due_date','payment_date',
      'total_amount','neto','iva',
      'receipt_number','payer_name','brand','model','color',
      'commercial_year','motor_num','chassis','internal_code',
      'invoice_url','receipt_url','notes','status',
      'payment_method','banco',
    ];
    const sets = [], params = [];
    let idx = 1;
    for (const f of FIELDS) {
      if (req.body[f] !== undefined) { sets.push(`${f}=$${idx++}`); params.push(req.body[f] || null); }
    }
    if (!sets.length) return res.status(400).json({ error: 'Nada que actualizar' });
    params.push(req.params.id);
    const { rows } = await db.query(
      `UPDATE supplier_payments SET ${sets.join(',')}, updated_at=NOW() WHERE id=$${idx} RETURNING *`, params
    );
    if (!rows[0]) return res.status(404).json({ error: 'No encontrado' });
    res.json(rows[0]);
  } catch (e) { console.error('[SupPay] PATCH', e); res.status(500).json({ error: 'Error' }); }
});

// ─── DELETE /:id ──────────────────────────────────────────────────────────────
router.delete('/:id', roleCheck('super_admin'), async (req, res) => {
  try {
    const { rows } = await db.query('DELETE FROM supplier_payments WHERE id=$1 RETURNING id', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Error' }); }
});

// ─── POST /sync-drive ─────────────────────────────────────────────────────────
router.post('/sync-drive', roleCheck('super_admin', 'admin_comercial', 'backoffice'), async (req, res) => {
  const FOLDER_FACTURAS     = '17IVqwsdoFTCpURC_eagy0qC2I_6DtpRr';
  const FOLDER_COMPROBANTES = '1T6jxfQZrrqfVnsMb5p5-gubl0OGGPeKb';

  const credsJson = process.env.GCLOUD_CREDS;
  if (!credsJson) {
    return res.status(503).json({ error: 'Credenciales de Google no configuradas. Agregá GCLOUD_CREDS en Railway.' });
  }

  let creds;
  try { creds = JSON.parse(credsJson); }
  catch { return res.status(503).json({ error: 'GCLOUD_CREDS no es JSON válido.' }); }

  const { google }   = require('googleapis');
  const driveAuth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  const drive = google.drive({ version: 'v3', auth: driveAuth });

  async function listPDFs(folderId) {
    const files = [];
    let pageToken = null;
    do {
      const resp = await drive.files.list({
        q: `'${folderId}' in parents and mimeType='application/pdf' and trashed=false`,
        fields: 'nextPageToken, files(id, name, webViewLink)',
        pageSize: 100,
        pageToken: pageToken || undefined,
      });
      files.push(...(resp.data.files || []));
      pageToken = resp.data.nextPageToken;
    } while (pageToken);
    return files;
  }

  async function downloadPDF(fileId) {
    const resp = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'arraybuffer' }
    );
    return Buffer.from(resp.data);
  }

  try {
    const [facturas, comprobantes] = await Promise.all([
      listPDFs(FOLDER_FACTURAS),
      listPDFs(FOLDER_COMPROBANTES),
    ]);

    const results = { created: 0, updated: 0, skipped: 0, errors: [] };

    for (const factFile of facturas) {
      try {
        const buf  = await downloadPDF(factFile.id);
        const text = (await pdfParse(buf)).text;
        const inv  = extractInvoice(text);

        if (!inv.invoice_number) {
          results.errors.push(`${factFile.name}: no se pudo extraer número de factura`);
          continue;
        }

        let recData = null;
        let recUrl  = null;
        const invNum = inv.invoice_number.replace(/\./g,'');
        const matchRec = comprobantes.find(c =>
          c.name.replace(/\./g,'').includes(invNum) ||
          c.name.replace(/[^0-9]/g,'').includes(invNum)
        );
        if (matchRec) {
          try {
            const recBuf = await downloadPDF(matchRec.id);
            const recTxt = (await pdfParse(recBuf)).text;
            recData = extractReceipt(recTxt);
            recUrl  = matchRec.webViewLink;
          } catch (_) { /* comprobante falla silenciosamente */ }
        }

        const { rows: existing } = await db.query(
          `SELECT id FROM supplier_payments WHERE invoice_number = $1 LIMIT 1`,
          [inv.invoice_number]
        );

        // Fallback due_date = invoice_date + 1 mes
        const rawDueDate = inv.due_date || recData?.due_date || null;
        let computedDueDate = rawDueDate;
        if (!computedDueDate && inv.invoice_date) {
          const d = new Date(inv.invoice_date + 'T12:00:00');
          d.setMonth(d.getMonth() + 1);
          computedDueDate = d.toISOString().slice(0, 10);
        }

        const payload = {
          provider:        inv.provider,
          invoice_number:  inv.invoice_number,
          invoice_date:    inv.invoice_date,
          due_date:        computedDueDate,
          total_amount:    inv.total_amount,
          neto:            inv.neto,
          iva:             inv.iva,
          brand:           inv.brand,
          model:           inv.model,
          color:           inv.color,
          commercial_year: inv.commercial_year,
          motor_num:       inv.motor_num,
          chassis:         inv.chassis,
          internal_code:   inv.internal_code,
          invoice_url:     factFile.webViewLink,
          ...(recData ? {
            receipt_number:  recData.receipt_number,
            payment_date:    recData.payment_date,
            payer_name:      recData.payer_name,
            banco:           recData.banco,
            payment_method:  recData.payment_method,
            receipt_url:     recUrl,
          } : {}),
        };

        if (existing[0]) {
          const sets = [], params = [];
          let idx = 1;
          for (const [k, v] of Object.entries(payload)) {
            if (v !== null && v !== undefined) {
              sets.push(`${k} = COALESCE(${k}, $${idx++})`);
              params.push(v);
            }
          }
          if (sets.length) {
            params.push(existing[0].id);
            await db.query(
              `UPDATE supplier_payments SET ${sets.join(', ')}, updated_at=NOW() WHERE id=$${idx}`,
              params
            );
          }
          results.updated++;
        } else {
          await db.query(
            `INSERT INTO supplier_payments (
               invoice_number, provider, invoice_date, due_date, total_amount,
               neto, iva,
               brand, model, color, commercial_year, motor_num, chassis, internal_code,
               invoice_url, receipt_number, payment_date, payer_name,
               banco, payment_method, receipt_url,
               status, created_by
             ) VALUES (
               $1,$2,$3,$4,$5,
               $6,$7,
               $8,$9,$10,$11,$12,$13,$14,
               $15,$16,$17,$18,
               $19,$20,$21,
               'pendiente',$22
             )`,
            [
              payload.invoice_number, payload.provider||null,
              payload.invoice_date||null, payload.due_date||null,
              payload.total_amount||null,
              payload.neto||null, payload.iva||null,
              payload.brand||null, payload.model||null, payload.color||null,
              payload.commercial_year||null, payload.motor_num||null,
              payload.chassis||null, payload.internal_code||null,
              payload.invoice_url||null,
              payload.receipt_number||null, payload.payment_date||null,
              payload.payer_name||null,
              payload.banco||null, payload.payment_method||null,
              payload.receipt_url||null,
              req.user.id,
            ]
          );
          results.created++;
        }
      } catch (e) {
        results.errors.push(`${factFile.name}: ${e.message}`);
      }
    }

    res.json({
      ok: true,
      facturas_leidas:     facturas.length,
      comprobantes_leidos: comprobantes.length,
      ...results,
    });
  } catch (e) {
    console.error('[SupPay/sync-drive]', e);
    if (e.code === 403 || (e.message || '').includes('permission')) {
      return res.status(403).json({
        error: `Sin acceso a las carpetas de Drive. Compartí ambas carpetas con: ${creds.client_email}`,
        service_account_email: creds.client_email,
      });
    }
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
