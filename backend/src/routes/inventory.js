const router = require('express').Router();
const db = require('../config/db');
const { auth } = require('../middleware/auth');
const multer = require('multer');
const cloudinary = require('../config/cloudinary');

router.use(auth);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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
router.post('/', async (req, res) => {
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

    // Si viene con ticket asociado, registrar en el timeline del ticket
    if (isSold && ticket_id) {
      await db.query(
        `INSERT INTO timeline (ticket_id, user_id, type, title, note)
         VALUES ($1, $2, 'system', $3, $4)`,
        [
          ticket_id,
          req.user.id,
          `Unidad asociada: ${brand} ${model} · Chasis ${chassis}`,
          `Unidad agregada manualmente al inventario y marcada como vendida. ${sale_notes || ''}`
        ]
      );
    }

    res.status(201).json(unit);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Chasis ya existe' });
    console.error(e); res.status(500).json({ error: 'Error' });
  }
});

// Update inventory unit
router.put('/:id', async (req, res) => {
  try {
    const { branch_id, status, color, price, notes } = req.body;
    const sets = [], params = [];
    let idx = 1;
    if (branch_id !== undefined) { sets.push(`branch_id = $${idx++}`); params.push(branch_id); }
    if (status !== undefined) { sets.push(`status = $${idx++}`); params.push(status); }
    if (color !== undefined) { sets.push(`color = $${idx++}`); params.push(color); }
    if (price !== undefined) { sets.push(`price = $${idx++}`); params.push(price); }
    if (notes !== undefined) { sets.push(`notes = $${idx++}`); params.push(notes); }

    if (sets.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });
    params.push(req.params.id);

    const { rows } = await db.query(
      `UPDATE inventory SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, params
    );
    if (!rows[0]) return res.status(404).json({ error: 'Unidad no encontrada' });
    res.json(rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error' }); }
});

// ─── IMPORT XLSX ──────────────────────────────────────────────────────────────

// Preview: parse xlsx, return rows with status (ok/duplicate/error)
router.post('/import/preview', upload.single('file'), async (req, res) => {
  try {
    if (!['super_admin','admin_comercial'].includes(req.user.role))
      return res.status(403).json({ error: 'Sin permiso' });
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
router.post('/import/confirm', async (req, res) => {
  try {
    if (!['super_admin','admin_comercial'].includes(req.user.role))
      return res.status(403).json({ error: 'Sin permiso' });
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
router.post('/:id/photo', upload.single('photo'), async (req, res) => {
  try {
    const { field } = req.body; // 'chassis_photo' or 'motor_photo'
    if (!['chassis_photo', 'motor_photo'].includes(field))
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
