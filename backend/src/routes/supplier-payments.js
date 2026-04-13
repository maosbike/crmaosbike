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

// ─── Helpers de extracción ────────────────────────────────────────────────────

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
  // Eliminar separadores de miles (punto en formato chileno) y dejar solo dígitos
  const clean = s.replace(/\./g,'').replace(/,(\d{2})$/,'').replace(/[^\d]/g,'');
  return parseInt(clean) || null;
}

function extractInvoice(text) {
  const t = text.replace(/\r/g,' ').replace(/\n+/g,' ').replace(/\s{2,}/g,' ');

  // Número de factura
  const invN =
    t.match(/(?:FACTURA|Factura)\s+(?:ELECTR[OÓ]NICA\s+)?N[°º\.]\s*(\d{4,9})/i)?.[1] ||
    t.match(/N[°º]\s*(\d{5,9})/)?.[1] ||
    null;

  // Proveedor — primera línea con nombre largo
  const provMatch = t.match(/^([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ\s,\.]{5,60}(?:S\.A\.|LTDA|SPA|CORP|CHILE|S\.A|LTDA\.)?)/);
  const provider = provMatch?.[1]?.trim() || null;

  // Fechas (DD/MM/YYYY o D de Mes de YYYY)
  const allDates = [...t.matchAll(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/g)].map(
    m => toISODate(m[1], m[2], m[3])
  ).filter(Boolean);
  const litDate = t.match(/(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+(?:de\s+)?(\d{4})/i);
  if (litDate) allDates.unshift(toISODate(litDate[1], litDate[2], litDate[3]));

  // Total
  const amtMatch =
    t.match(/(?:TOTAL\s+FACTURA|TOTAL\s+PAGAR|TOTAL)\s*\$?\s*([\d.,]+)/i) ||
    t.match(/MONTO\s*TOTAL\s*\$?\s*([\d.,]+)/i);
  const total_amount = parseAmt(amtMatch?.[1]);

  // Datos del vehículo
  const motor   = t.match(/(?:MOTOR|N[°º]\s*MOTOR)\s*:?\s*([A-Z0-9]{5,20})/i)?.[1]?.trim() || null;
  const chassis = t.match(/(?:CHASIS|CHASSIS|N[°º]\s*CHASIS|FRAME)\s*:?\s*([A-Z0-9]{5,25})/i)?.[1]?.trim() || null;
  const color   = t.match(/(?:COLOR)\s*:?\s*([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ\s]{2,20}?)(?:\s{2,}|$)/i)?.[1]?.trim() || null;
  const year    = parseInt(t.match(/(?:AÑO|ANO|MODELO\s+AÑO)\s*:?\s*(\d{4})/i)?.[1]) || null;
  const model   = t.match(/(?:MODELO)\s*:?\s*([A-Z0-9][A-Za-z0-9\-\s]{2,40}?)(?:\s{2,}|$)/i)?.[1]?.trim() || null;
  const brand   = t.match(/(?:MARCA)\s*:?\s*([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ]{2,20})/i)?.[1]?.trim() || null;
  const internalCode = t.match(/(?:C[OÓ]DIGO|COD\.?)\s*:?\s*([A-Z0-9\-]{3,20})/i)?.[1]?.trim() || null;

  return {
    provider,
    invoice_number: invN,
    invoice_date:   allDates[0] || null,
    due_date:       allDates[1] || null,
    total_amount,
    motor_num:      motor,
    chassis,
    color,
    commercial_year: year,
    model,
    brand,
    internal_code:  internalCode,
  };
}

function extractReceipt(text) {
  const t = text.replace(/\r/g,' ').replace(/\n+/g,' ').replace(/\s{2,}/g,' ');

  // Número de operación / comprobante
  const opNum =
    t.match(/N[°º\.]\s*(?:de\s*)?(?:OPERACI[OÓ]N|COMPROBANTE|FOLIO|REFERENCIA)\s*:?\s*(\d{5,15})/i)?.[1] ||
    t.match(/(?:COMPROBANTE|OPERACI[OÓ]N)\s*(?:N[°º\.])?\s*:?\s*(\d{5,15})/i)?.[1] ||
    null;

  // Fecha de operación/pago (DD/MM/YYYY, D de Mes de YYYY, o YYYY-MM-DD)
  const litDate = t.match(/(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+(?:de\s+)?(\d{4})/i);
  const numDate = t.match(/(?:FECHA)\s*(?:DE\s*(?:OPERACI[OÓ]N|PAGO|TRANSFERENCIA))?\s*:?\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i);
  let payment_date = null;
  if (litDate) payment_date = toISODate(litDate[1], litDate[2], litDate[3]);
  else if (numDate) payment_date = toISODate(numDate[1], numDate[2], numDate[3]);

  // Monto
  const amtMatch =
    t.match(/(?:MONTO|IMPORTE|TOTAL)\s*(?:PAGADO|TRANSFERIDO)?\s*:?\s*\$?\s*([\d.,]+)/i);
  const total_amount = parseAmt(amtMatch?.[1]);

  // Pagador / nombre
  const payer =
    t.match(/(?:NOMBRE|ORDENANTE|PAGADOR|TITULAR)\s*:?\s*([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ\s\.]{4,50})(?=\s{2,}|RUT|\d)/i)?.[1]?.trim() || null;

  // Referencia a número de factura en el cuerpo
  const invRef =
    t.match(/(?:FACTURA|FACT\.?)\s*N?[°º]?\s*:?\s*([\d\.]{5,10})/i)?.[1]?.replace(/\./g,'') || null;

  return { receipt_number: opNum, payment_date, total_amount, payer_name: payer, invoice_ref: invRef };
}

// ─── POST /extract — extraer datos de uno o dos PDFs ─────────────────────────
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

      // Merge: factura toma prioridad, comprobante completa lo que falta
      const merged = {
        ...(invoiceData || {}),
        ...(receiptData ? {
          receipt_number: receiptData.receipt_number,
          payment_date:   receiptData.payment_date,
          payer_name:     receiptData.payer_name,
          // Verificar coherencia de montos
          total_amount: invoiceData?.total_amount || receiptData.total_amount,
          // Si el comprobante trae referencia a una factura y la factura no tiene número, usarla
          invoice_number: invoiceData?.invoice_number || receiptData.invoice_ref || null,
        } : {}),
      };

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
        total_amount, receipt_number, payer_name, brand, model, color,
        commercial_year, motor_num, chassis, internal_code, notes, status,
        invoice_url: bodyInvUrl, receipt_url: bodyRecUrl,
      } = req.body;

      let invoice_url = bodyInvUrl || null;
      let receipt_url = bodyRecUrl || null;

      // Subir archivos a Cloudinary si se enviaron directamente
      for (const [field] of [['invoice'],['receipt']]) {
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
           total_amount, receipt_number, payer_name, brand, model, color,
           commercial_year, motor_num, chassis, internal_code,
           invoice_url, receipt_url, notes, status, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
         RETURNING *`,
        [
          provider||null, invoice_number||null,
          invoice_date||null, due_date||null, payment_date||null,
          total_amount ? parseInt(total_amount) : null,
          receipt_number||null, payer_name||null,
          brand||null, model||null, color||null,
          commercial_year ? parseInt(commercial_year) : null,
          motor_num||null, chassis||null, internal_code||null,
          invoice_url, receipt_url,
          notes||null, status||'pendiente', req.user.id,
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
      'total_amount','receipt_number','payer_name','brand','model','color',
      'commercial_year','motor_num','chassis','internal_code',
      'invoice_url','receipt_url','notes','status',
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

// ─── POST /sync-drive — leer PDFs de Drive y cruzar registros ────────────────
router.post('/sync-drive', roleCheck('super_admin', 'admin_comercial', 'backoffice'), async (req, res) => {
  const FOLDER_FACTURAS     = '17IVqwsdoFTCpURC_eagy0qC2I_6DtpRr';
  const FOLDER_COMPROBANTES = '1T6jxfQZrrqfVnsMb5p5-gubl0OGGPeKb';

  // Validar que existan credenciales
  const credsJson = process.env.GCLOUD_CREDS;
  if (!credsJson) {
    return res.status(503).json({
      error: 'Credenciales de Google no configuradas. Agregá GCLOUD_CREDS en Railway.',
    });
  }

  let creds;
  try { creds = JSON.parse(credsJson); }
  catch { return res.status(503).json({ error: 'GOOGLE_SERVICE_ACCOUNT_JSON no es JSON válido.' }); }

  const { google }  = require('googleapis');
  const { Readable } = require('stream');

  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  const drive = google.drive({ version: 'v3', auth });

  // Listar PDFs de una carpeta
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

  // Descargar PDF como Buffer
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

    // Map de comprobantes por nombre de archivo para cruce posterior
    const comprobanteMap = {};
    for (const f of comprobantes) {
      comprobanteMap[f.name] = f;
    }

    // Procesar facturas
    for (const factFile of facturas) {
      try {
        // Descargar y parsear factura
        const buf = await downloadPDF(factFile.id);
        const text = (await pdfParse(buf)).text;
        const inv  = extractInvoice(text);

        if (!inv.invoice_number) {
          results.errors.push(`${factFile.name}: no se pudo extraer número de factura`);
          continue;
        }

        // Buscar comprobante que haga match por número de factura en el nombre o contenido
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
          } catch (e) { /* comprobante falla silenciosamente */ }
        }

        // ¿Ya existe el registro?
        const { rows: existing } = await db.query(
          `SELECT id FROM supplier_payments WHERE invoice_number = $1 LIMIT 1`,
          [inv.invoice_number]
        );

        const payload = {
          provider:        inv.provider,
          invoice_number:  inv.invoice_number,
          invoice_date:    inv.invoice_date,
          due_date:        inv.due_date,
          total_amount:    inv.total_amount,
          brand:           inv.brand,
          model:           inv.model,
          color:           inv.color,
          commercial_year: inv.commercial_year,
          motor_num:       inv.motor_num,
          chassis:         inv.chassis,
          internal_code:   inv.internal_code,
          invoice_url:     factFile.webViewLink,
          ...(recData ? {
            receipt_number: recData.receipt_number,
            payment_date:   recData.payment_date,
            payer_name:     recData.payer_name,
            receipt_url:    recUrl,
          } : {}),
        };

        if (existing[0]) {
          // Actualizar solo campos no nulos (no pisar ediciones manuales)
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
               brand, model, color, commercial_year, motor_num, chassis, internal_code,
               invoice_url, receipt_number, payment_date, payer_name, receipt_url,
               status, created_by
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'pendiente',$18)`,
            [
              payload.invoice_number, payload.provider||null,
              payload.invoice_date||null, payload.due_date||null,
              payload.total_amount||null,
              payload.brand||null, payload.model||null, payload.color||null,
              payload.commercial_year||null, payload.motor_num||null,
              payload.chassis||null, payload.internal_code||null,
              payload.invoice_url||null,
              payload.receipt_number||null, payload.payment_date||null,
              payload.payer_name||null, payload.receipt_url||null,
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
    // Error de permisos de Drive es el más común
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
