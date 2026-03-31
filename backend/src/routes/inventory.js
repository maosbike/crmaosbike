const router = require('express').Router();
const db = require('../config/db');
const { auth, roleCheck } = require('../middleware/auth');
const multer = require('multer');
const cloudinary = require('../config/cloudinary');

router.use(auth);

const ALLOWED_IMG = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const ALLOWED_XLS = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                     'application/vnd.ms-excel', 'text/csv'];

// Upload de fotos (chasis / motor)
const uploadPhoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMG.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Solo se permiten imágenes (jpg, png, webp)'));
  },
});

// Upload de archivo xlsx para importación de inventario
const uploadFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const okMime = ALLOWED_XLS.includes(file.mimetype);
    const okExt  = /\.(xlsx|xls|csv)$/i.test(file.originalname);
    if (okMime || okExt) cb(null, true);
    else cb(new Error('Solo se permiten archivos Excel o CSV (.xlsx, .xls, .csv)'));
  },
});

// List inventory
router.get('/', async (req, res) => {
  try {
    const { branch_id, status, search } = req.query;
    let where = ['1=1'], params = [], idx = 1;

    if (branch_id) { where.push(`i.branch_id = $${idx++}`); params.push(branch_id); }
    if (status) { where.push(`i.status = $${idx++}`); params.push(status); }
    if (search) { where.push(`(i.brand ILIKE $${idx} OR i.model ILIKE $${idx} OR i.chassis ILIKE $${idx} OR i.color ILIKE $${idx})`); params.push(`%${search}%`); idx++; }

    const { rows } = await db.query(
      `SELECT i.*, b.name as branch_name, b.code as branch_code
       FROM inventory i LEFT JOIN branches b ON i.branch_id = b.id
       WHERE ${where.join(' AND ')} ORDER BY i.created_at DESC`, params
    );
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error' }); }
});

// Inventory counts
router.get('/counts', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT status, COUNT(*) as count FROM inventory GROUP BY status`
    );
    const counts = { disponible: 0, reservada: 0, vendida: 0, preinscrita: 0 };
    rows.forEach(r => { counts[r.status] = parseInt(r.count); });
    res.json(counts);
  } catch (e) { res.status(500).json({ error: 'Error' }); }
});

// Create inventory unit
router.post('/', roleCheck('super_admin', 'admin_comercial', 'backoffice'), async (req, res) => {
  try {
    const {
      branch_id, year, brand, model, color, chassis, motor_num, price,
      // Sale fields (optional — only when added_as_sold = true)
      added_as_sold, sold_at, sold_by, ticket_id, sale_notes, payment_method, sale_type
    } = req.body;

    if (!chassis || !brand || !model) return res.status(400).json({ error: 'Marca, modelo y chasis requeridos' });

    const isSold = !!added_as_sold;
    const finalStatus = isSold ? 'vendida' : 'disponible';
    const finalSoldAt = isSold ? (sold_at || new Date().toISOString()) : null;

    const { rows } = await db.query(
      `INSERT INTO inventory
         (branch_id, year, brand, model, color, chassis, motor_num, status, price,
          added_as_sold, sold_at, sold_by, ticket_id, sale_notes, payment_method, sale_type, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        branch_id, year, brand, model, color, chassis, motor_num || null,
        finalStatus, price || 0,
        isSold, finalSoldAt,
        sold_by || null, ticket_id || null, sale_notes || null,
        payment_method || null, sale_type || null, req.user.id
      ]
    );

    const unit = rows[0];

    // Historial de creación
    await db.query(
      `INSERT INTO inventory_history (inventory_id, event_type, to_status, user_id, note, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [unit.id, isSold ? 'sold' : 'created', finalStatus, req.user.id,
       isSold ? `Unidad creada y registrada como vendida${sale_notes ? `. ${sale_notes}` : ''}` : 'Unidad creada manualmente',
       isSold ? JSON.stringify({ payment_method, sale_type }) : null]
    );

    // Si viene con ticket asociado, registrar en el timeline del ticket
    if (isSold && ticket_id) {
      await db.query(
        `INSERT INTO timeline (ticket_id, user_id, type, title, note)
         VALUES ($1, $2, 'system', $3, $4)`,
        [ticket_id, req.user.id,
         `Unidad asociada: ${brand} ${model} · Chasis ${chassis}`,
         `Unidad agregada manualmente al inventario y marcada como vendida. ${sale_notes || ''}`]
      );
    }

    res.status(201).json(unit);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Chasis ya existe' });
    console.error(e); res.status(500).json({ error: 'Error' });
  }
});

// Update inventory unit
router.put('/:id', roleCheck('super_admin', 'admin_comercial', 'backoffice'), async (req, res) => {
  try {
    const { branch_id, status, color, price, notes } = req.body;

    // Bloquear: vendida solo se puede registrar via POST /:id/sell
    if (status === 'vendida') {
      return res.status(400).json({ error: 'Para marcar una unidad como vendida usá el flujo de venta (Registrar venta).' });
    }

    // Verificar estado actual
    const { rows: cur } = await db.query('SELECT status FROM inventory WHERE id=$1', [req.params.id]);
    if (!cur[0]) return res.status(404).json({ error: 'Unidad no encontrada' });
    if (cur[0].status === 'vendida') {
      return res.status(400).json({ error: 'Una unidad vendida no puede cambiar de estado.' });
    }

    const sets = [], params = [];
    let idx = 1;
    if (branch_id !== undefined) { sets.push(`branch_id = $${idx++}`); params.push(branch_id); }
    if (status !== undefined)    { sets.push(`status = $${idx++}`);    params.push(status); }
    if (color !== undefined)     { sets.push(`color = $${idx++}`);     params.push(color); }
    if (price !== undefined)     { sets.push(`price = $${idx++}`);     params.push(price); }
    if (notes !== undefined)     { sets.push(`notes = $${idx++}`);     params.push(notes); }

    if (sets.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });
    params.push(req.params.id);

    const { rows } = await db.query(
      `UPDATE inventory SET ${sets.join(', ')}, updated_at=NOW() WHERE id = $${idx} RETURNING *`, params
    );
    if (!rows[0]) return res.status(404).json({ error: 'Unidad no encontrada' });

    // Loguear cambio de estado en historial
    if (status && status !== cur[0].status) {
      await db.query(
        `INSERT INTO inventory_history (inventory_id, event_type, from_status, to_status, user_id, note)
         VALUES ($1,'status_changed',$2,$3,$4,$5)`,
        [req.params.id, cur[0].status, status, req.user.id,
         `Estado cambiado: ${cur[0].status} → ${status}`]
      );
    }
    // Loguear traslado de sucursal en historial
    if (branch_id) {
      await db.query(
        `INSERT INTO inventory_history (inventory_id, event_type, user_id, note)
         VALUES ($1,'moved',$2,$3)`,
        [req.params.id, req.user.id, `Unidad trasladada a nueva sucursal`]
      );
    }

    res.json(rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error' }); }
});

// ─── SELL ─────────────────────────────────────────────────────────────────────

// GET /inventory/:id/history
router.get('/:id/history', roleCheck('super_admin', 'admin_comercial', 'backoffice'), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT h.*,
              u.first_name as user_fn, u.last_name as user_ln,
              sv.first_name as seller_fn, sv.last_name as seller_ln
       FROM inventory_history h
       LEFT JOIN users u  ON h.user_id   = u.id
       LEFT JOIN inventory i ON h.inventory_id = i.id
       LEFT JOIN users sv ON i.sold_by   = sv.id
       WHERE h.inventory_id = $1
       ORDER BY h.created_at ASC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error' }); }
});

// POST /inventory/:id/sell — registrar venta de una unidad existente
router.post('/:id/sell', roleCheck('super_admin', 'admin_comercial', 'backoffice'), async (req, res) => {
  try {
    const {
      sold_by, sold_at, ticket_id, payment_method, sale_type, sale_notes,
      // Nuevos campos (migración 024)
      sale_price, cost_price, invoice_amount, client_name, client_rut,
    } = req.body;
    if (!sold_by) return res.status(400).json({ error: 'Vendedor requerido' });

    // Verificar unidad existe y no está vendida
    const { rows: unitRows } = await db.query('SELECT * FROM inventory WHERE id = $1', [req.params.id]);
    if (!unitRows[0]) return res.status(404).json({ error: 'Unidad no encontrada' });
    const unit = unitRows[0];
    if (unit.status === 'vendida') return res.status(409).json({ error: 'La unidad ya está registrada como vendida' });

    const finalSoldAt = sold_at || new Date().toISOString();
    const prevStatus  = unit.status;

    // Actualizar unidad — incluye campos extendidos de 024
    const { rows: updated } = await db.query(
      `UPDATE inventory SET
         status='vendida', sold_at=$1, sold_by=$2, ticket_id=$3,
         payment_method=$4, sale_type=$5, sale_notes=$6,
         sale_price=$7, cost_price=$8, invoice_amount=$9,
         client_name=$10, client_rut=$11,
         updated_at=NOW()
       WHERE id=$12 RETURNING *`,
      [finalSoldAt, sold_by, ticket_id||null, payment_method||null,
       sale_type||null, sale_notes||null,
       sale_price||null, cost_price||null, invoice_amount||null,
       client_name||null, client_rut||null,
       req.params.id]
    );

    // Historial
    await db.query(
      `INSERT INTO inventory_history
         (inventory_id, event_type, from_status, to_status, user_id, note, metadata)
       VALUES ($1,'sold',$2,'vendida',$3,$4,$5)`,
      [req.params.id, prevStatus, req.user.id,
       `Venta registrada${sale_notes ? '. ' + sale_notes : ''}`,
       JSON.stringify({ sold_by, payment_method, sale_type, ticket_id, sale_price })]
    );

    // Nombre del vendedor para el timeline
    const { rows: sv } = await db.query('SELECT first_name, last_name FROM users WHERE id=$1', [sold_by]);
    const svName = sv[0] ? `${sv[0].first_name} ${sv[0].last_name||''}`.trim() : 'Vendedor';

    // Timeline del ticket si existe
    if (ticket_id) {
      await db.query(
        `INSERT INTO timeline (ticket_id, user_id, type, title, note)
         VALUES ($1,$2,'system',$3,$4)`,
        [ticket_id, req.user.id,
         `Moto vendida: ${unit.brand} ${unit.model} · Chasis ${unit.chassis}`,
         `Vendida por ${svName}. ${payment_method ? 'Pago: ' + payment_method + '. ' : ''}${sale_notes||''}`]
      );
      // También marcar el ticket como ganado si no lo está aún
      await db.query(
        `UPDATE tickets SET status='ganado', updated_at=NOW() WHERE id=$1 AND status != 'ganado'`,
        [ticket_id]
      );
    }

    res.json(updated[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error al registrar venta: ' + e.message }); }
});

// ─── IMPORT XLSX ──────────────────────────────────────────────────────────────

// Preview: parse xlsx, return rows with status (ok/duplicate/error)
router.post('/import/preview', roleCheck('super_admin', 'admin_comercial'), uploadFile.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });

    const XLSX = require('xlsx');
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });

    const preferred = wb.SheetNames.filter(n => !/^(Listas|Copia)/i.test(n));
    const sheetName = preferred[0] || wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

    let headerIdx = raw.findIndex(row =>
      Array.isArray(row) && row.some(c => typeof c === 'string' && /sucursal|chasis|marca/i.test(c))
    );
    if (headerIdx === -1) return res.status(400).json({ error: 'No se encontró fila de encabezados' });

    const headers = raw[headerIdx].map(h => (h||'').toString().trim().toLowerCase());
    const col = (...pats) => { for (const p of pats) { const i = headers.findIndex(h => h.includes(p)); if (i >= 0) return i; } return -1; };

    const C = {
      branch: col('sucursal'),
      year:   col('año comercial','año'),
      brand:  col('marca'),
      model:  col('modelo'),
      color:  col('color'),
      chassis:col('chasis'),
      motor:  col('motor'),
      status: col('estado'),
      price:  col('precio tienda','precio'),
      notes:  col('observaci'),
    };

    const { rows: branches } = await db.query('SELECT id, name, code FROM branches');
    const brMap = {};
    branches.forEach(b => {
      brMap[b.name.toLowerCase()] = b.id;
      brMap[b.code.toLowerCase()] = b.id;
    });
    brMap['mall plaza norte'] = brMap['mpn']; brMap['plaza norte'] = brMap['mpn'];
    brMap['mall plaza sur']   = brMap['mps'];
    brMap['movicenter']       = brMap['mov'];

    const parsePrice  = v => { const s = String(v||'').replace(/[^0-9]/g,''); return s ? parseInt(s) : 0; };
    const parseStatus = v => ({ disponible:'disponible', reservada:'reservada', vendida:'vendida', preinscrita:'preinscrita' }[String(v||'').trim().toLowerCase()] || 'disponible');

    const { rows: existing } = await db.query('SELECT lower(chassis) as ch FROM inventory');
    const existingSet = new Set(existing.map(r => r.ch));
    const get = (row, idx) => idx >= 0 && row[idx] != null ? String(row[idx]).trim() : '';

    const preview = raw.slice(headerIdx + 1)
      .filter(row => Array.isArray(row) && row.some(c => c !== null && c !== ''))
      .map((row, i) => {
        const chassis   = get(row, C.chassis).replace(/\s/g,'').toUpperCase();
        const brand     = get(row, C.brand).toUpperCase();
        const model     = get(row, C.model).toUpperCase();
        const branchRaw = get(row, C.branch);
        const branch_id = brMap[branchRaw.toLowerCase()] || null;
        const errors    = [];
        if (!chassis)   errors.push('Sin N° Chasis');
        if (!brand)     errors.push('Sin Marca');
        if (!model)     errors.push('Sin Modelo');
        if (!branch_id) errors.push(`Sucursal no reconocida: "${branchRaw}"`);
        const duplicate = !!chassis && existingSet.has(chassis.toLowerCase());
        return {
          _row: headerIdx + 2 + i, _status: duplicate ? 'duplicate' : errors.length ? 'error' : 'ok',
          _errors: errors, branch_id, branch_raw: branchRaw,
          year:      parseInt(get(row, C.year)) || new Date().getFullYear(),
          brand, model,
          color:     get(row, C.color).toUpperCase() || 'SIN COLOR',
          chassis,   motor_num: get(row, C.motor) || null,
          status:    parseStatus(get(row, C.status)),
          price:     parsePrice(get(row, C.price)),
          notes:     get(row, C.notes) || null,
        };
      });

    res.json({
      sheet: sheetName, total: preview.length,
      ok: preview.filter(r => r._status==='ok').length,
      duplicates: preview.filter(r => r._status==='duplicate').length,
      errors: preview.filter(r => r._status==='error').length,
      rows: preview,
    });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error al procesar: ' + e.message }); }
});

// Confirm: insert ok rows
router.post('/import/confirm', roleCheck('super_admin', 'admin_comercial'), async (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'Sin filas' });
    let inserted = 0, skipped = 0;
    for (const r of rows) {
      try {
        await db.query(
          `INSERT INTO inventory (branch_id,year,brand,model,color,chassis,motor_num,status,price,notes,created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (chassis) DO NOTHING`,
          [r.branch_id, r.year, r.brand, r.model, r.color, r.chassis,
           r.motor_num||null, r.status, r.price||0, r.notes||null, req.user.id]
        );
        inserted++;
      } catch (e) { if (e.code==='23505') skipped++; else throw e; }
    }
    res.json({ inserted, skipped });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error al importar: ' + e.message }); }
});

// Upload photo (chassis or motor)
router.post('/:id/photo', uploadPhoto.single('photo'), async (req, res) => {
  try {
    const { field } = req.body; // 'chassis_photo', 'motor_photo', or 'unit_photo'
    if (!['chassis_photo', 'motor_photo', 'unit_photo'].includes(field))
      return res.status(400).json({ error: 'Campo inválido' });

    if (!req.file) return res.status(400).json({ error: 'Foto requerida' });

    // Upload to Cloudinary
    const b64 = req.file.buffer.toString('base64');
    const dataUri = `data:${req.file.mimetype};base64,${b64}`;

    const result = await cloudinary.uploader.upload(dataUri, {
      folder: 'crmaosbike/inventory',
      resource_type: 'image',
    });

    // Save URL in database
    await db.query(
      `UPDATE inventory SET ${field} = $1 WHERE id = $2`,
      [result.secure_url, req.params.id]
    );

    res.json({ url: result.secure_url });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error al subir foto' }); }
});

module.exports = router;
