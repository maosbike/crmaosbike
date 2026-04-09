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
    else { where.push(`i.status != 'vendida'`); }
    if (search) { where.push(`(i.brand ILIKE $${idx} OR i.model ILIKE $${idx} OR i.chassis ILIKE $${idx} OR i.color ILIKE $${idx})`); params.push(`%${search}%`); idx++; }

    const { rows } = await db.query(
      `SELECT i.*, b.name as branch_name, b.code as branch_code,
              COALESCE(
                -- 1) precio propio de la unidad (si fue cargado con precio)
                NULLIF(i.price, 0),
                -- 2) modelo vinculado por FK directa (más confiable)
                (SELECT mm.price FROM moto_models mm WHERE mm.id = i.model_id AND mm.price > 0 LIMIT 1),
                -- 3) moto_prices más reciente via FK
                (SELECT mp.price_list FROM moto_prices mp
                   JOIN moto_models mm ON mp.model_id = mm.id
                  WHERE mm.id = i.model_id AND mp.price_list > 0
                  ORDER BY mp.period DESC LIMIT 1),
                -- 4) moto_models por texto brand+model (sin filtro active para máxima cobertura)
                (SELECT mm.price FROM moto_models mm
                  WHERE LOWER(TRIM(mm.brand)) = LOWER(TRIM(i.brand))
                    AND LOWER(TRIM(mm.model)) = LOWER(TRIM(i.model))
                    AND mm.price > 0
                  ORDER BY mm.updated_at DESC LIMIT 1),
                -- 5) moto_prices por texto brand+model, período más reciente
                (SELECT mp.price_list FROM moto_prices mp
                   JOIN moto_models mm ON mp.model_id = mm.id
                  WHERE LOWER(TRIM(mm.brand)) = LOWER(TRIM(i.brand))
                    AND LOWER(TRIM(mm.model)) = LOWER(TRIM(i.model))
                    AND mp.price_list > 0
                  ORDER BY mp.period DESC LIMIT 1)
              ) AS catalog_price
       FROM inventory i
       LEFT JOIN branches b ON i.branch_id = b.id
       WHERE ${where.join(' AND ')}
       ORDER BY
         CASE WHEN i.sort_order IS NULL OR i.sort_order = 0 THEN 1 ELSE 0 END,
         i.sort_order ASC,
         i.created_at DESC`, params
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
      branch_id, year, brand, model, model_id, color, chassis, motor_num,
      // Sale fields (optional — only when added_as_sold = true)
      added_as_sold, sold_at, sold_by, ticket_id, sale_notes, payment_method, sale_type
    } = req.body;

    if (!brand || !model) return res.status(400).json({ error: 'Marca y modelo son requeridos' });

    const isSold = !!added_as_sold;
    const finalStatus = isSold ? 'vendida' : 'disponible';
    const finalSoldAt = isSold ? (sold_at || new Date().toISOString()) : null;

    const { rows } = await db.query(
      `INSERT INTO inventory
         (branch_id, year, brand, model, model_id, color, chassis, motor_num, status, price,
          added_as_sold, sold_at, sold_by, ticket_id, sale_notes, payment_method, sale_type, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING *`,
      [
        branch_id, year, brand, model, model_id || null, color, chassis, motor_num || null,
        finalStatus, 0,
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

// ─── REORDER — solo super_admin ───────────────────────────────────────────────
// Body: { items: [{id, sort_order}, ...] }
router.put('/reorder', roleCheck('super_admin'), async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || !items.length)
      return res.status(400).json({ error: 'Se requiere array items [{id, sort_order}]' });

    // Actualizar en una transacción para atomicidad
    await db.query('BEGIN');
    for (const { id, sort_order } of items) {
      if (!id || sort_order == null) continue;
      await db.query(
        `UPDATE inventory SET sort_order = $1, updated_at = NOW() WHERE id = $2`,
        [sort_order, id]
      );
    }
    await db.query('COMMIT');
    res.json({ ok: true, updated: items.length });
  } catch (e) {
    await db.query('ROLLBACK').catch(() => {});
    console.error('[inventory/reorder]', e);
    res.status(500).json({ error: 'Error al guardar orden' });
  }
});

// Update inventory unit (edición completa para admin)
router.put('/:id', roleCheck('super_admin', 'admin_comercial', 'backoffice'), async (req, res) => {
  try {
    const { branch_id, status, color, price, notes, brand, model, year, chassis, motor_num } = req.body;

    // Bloquear: vendida solo se puede registrar via POST /:id/sell
    if (status === 'vendida') {
      return res.status(400).json({ error: 'Para marcar una unidad como vendida usá el flujo de venta (Registrar venta).' });
    }

    // Verificar estado actual
    const { rows: cur } = await db.query('SELECT status, branch_id FROM inventory WHERE id=$1', [req.params.id]);
    if (!cur[0]) return res.status(404).json({ error: 'Unidad no encontrada' });
    if (cur[0].status === 'vendida') {
      return res.status(400).json({ error: 'Una unidad vendida no puede modificarse.' });
    }

    // Chasis: verificar unicidad si se quiere cambiar
    if (chassis !== undefined && chassis !== '') {
      const cleanChassis = chassis.replace(/\s/g, '').toUpperCase();
      const { rows: dup } = await db.query(
        `SELECT id FROM inventory WHERE UPPER(REPLACE(chassis,' ','')) = $1 AND id != $2`,
        [cleanChassis, req.params.id]
      );
      if (dup.length > 0)
        return res.status(400).json({ error: 'Ese número de chasis ya existe en otra unidad.' });
    }

    const sets = [], params = [];
    let idx = 1;
    if (branch_id  !== undefined) { sets.push(`branch_id = $${idx++}`);  params.push(branch_id); }
    if (status     !== undefined) { sets.push(`status = $${idx++}`);     params.push(status); }
    if (color      !== undefined) { sets.push(`color = $${idx++}`);      params.push(String(color).toUpperCase()); }
    if (price      !== undefined) { sets.push(`price = $${idx++}`);      params.push(Number(price) || 0); }
    if (notes      !== undefined) { sets.push(`notes = $${idx++}`);      params.push(notes); }
    if (brand      !== undefined) { sets.push(`brand = $${idx++}`);      params.push(String(brand).toUpperCase()); }
    if (model      !== undefined) { sets.push(`model = $${idx++}`);      params.push(String(model).toUpperCase()); }
    if (year       !== undefined) { sets.push(`year = $${idx++}`);       params.push(parseInt(year) || null); }
    if (chassis    !== undefined && chassis !== '') {
      sets.push(`chassis = $${idx++}`);
      params.push(chassis.replace(/\s/g, '').toUpperCase());
    }
    if (motor_num  !== undefined) { sets.push(`motor_num = $${idx++}`);  params.push(motor_num || null); }

    if (sets.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });
    params.push(req.params.id);

    const { rows } = await db.query(
      `UPDATE inventory SET ${sets.join(', ')}, updated_at=NOW() WHERE id = $${idx} RETURNING *`, params
    );
    if (!rows[0]) return res.status(404).json({ error: 'Unidad no encontrada' });

    // Historial: cambio de estado
    if (status && status !== cur[0].status) {
      await db.query(
        `INSERT INTO inventory_history (inventory_id, event_type, from_status, to_status, user_id, note)
         VALUES ($1,'status_changed',$2,$3,$4,$5)`,
        [req.params.id, cur[0].status, status, req.user.id,
         `Estado cambiado: ${cur[0].status} → ${status}`]
      );
    }
    // Historial: traslado de sucursal
    if (branch_id && branch_id !== cur[0].branch_id) {
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
      Array.isArray(row) && row.some(c => typeof c === 'string' && /sucursal|chasis|marca|modelo|estado/i.test(c))
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
      chassis:col('chasis','n° chasis','n chasis','numero chasis'),
      motor:  col('motor'),
      status: col('estado'),
      price:  col('precio tienda','precio'),
      notes:  col('observaci'),
    };

    // Fallback: si no hay columna "marca" explícita, inferir la columna de marca
    // buscando la col entre "año" y "modelo" que tenga texto en las primeras filas de datos
    if (C.brand === -1) {
      const dataRows = raw.slice(headerIdx + 1).filter(r => Array.isArray(r) && r.some(c => c != null));
      const yearCol  = C.year  >= 0 ? C.year  : -1;
      const modelCol = C.model >= 0 ? C.model : -1;
      // Candidatos: columnas entre año y modelo (o simplemente las que tengan texto no numérico)
      const candidates = [];
      if (yearCol >= 0 && modelCol > yearCol + 1) {
        for (let ci = yearCol + 1; ci < modelCol; ci++) candidates.push(ci);
      }
      // Si no hay candidatos por posición, buscar la primera columna con strings de marcas conocidas
      const KNOWN_BRANDS = /^(yamaha|honda|suzuki|kawasaki|um|opai|kymco|bajaj|benelli|royal enfield|tvs|lifan|haojue|cfmoto|sym)/i;
      if (candidates.length === 0) {
        for (let ci = 0; ci < (raw[headerIdx] || []).length; ci++) {
          const hasKnown = dataRows.slice(0, 5).some(r => r[ci] && KNOWN_BRANDS.test(String(r[ci]).trim()));
          if (hasKnown) { candidates.push(ci); break; }
        }
      }
      if (candidates.length > 0) C.brand = candidates[0];
    }

    const { rows: branches } = await db.query('SELECT id, name, code FROM branches');
    const brMap = {};
    branches.forEach(b => {
      brMap[b.name.toLowerCase().trim()] = b.id;
      brMap[b.code.toLowerCase().trim()] = b.id;
    });
    // Aliases adicionales
    brMap['mall plaza norte']     = brMap['mpn'] || brMap['mall plaza norte'];
    brMap['plaza norte']          = brMap['mpn'] || brMap['plaza norte'];
    brMap['mall plaza sur']       = brMap['mps'] || brMap['mall plaza sur'];
    brMap['yamaha mall plaza sur']= brMap['mps'] || brMap['yamaha mall plaza sur'];
    brMap['movicenter']           = brMap['mov'] || brMap['movicenter'];

    // Búsqueda flexible de sucursal (exact → partial → fuzzy)
    const findBranch = (raw) => {
      if (!raw) return null;
      const lower = raw.toLowerCase().trim();
      if (brMap[lower]) return brMap[lower];
      // Partial: buscar key que esté contenida en el valor o viceversa
      for (const [key, id] of Object.entries(brMap)) {
        if (id && (lower.includes(key) || key.includes(lower))) return id;
      }
      return null;
    };

    const parsePrice  = v => { const s = String(v||'').replace(/[^0-9]/g,''); return s ? parseInt(s) : 0; };
    const parseStatus = v => ({ disponible:'disponible', reservada:'reservada', vendida:'vendida', preinscrita:'preinscrita' }[String(v||'').trim().toLowerCase()] || 'disponible');

    const { rows: existing } = await db.query('SELECT lower(chassis) as ch FROM inventory');
    const existingSet = new Set(existing.map(r => r.ch));
    const PLACEHOLDER = /^[\-–—\/nd]+$/i; // —, N/D, n/d, -, etc.
    const get = (row, idx) => {
      if (idx < 0 || row[idx] == null) return '';
      const v = String(row[idx]).trim();
      return PLACEHOLDER.test(v) ? '' : v;
    };

    const preview = raw.slice(headerIdx + 1)
      .filter(row => Array.isArray(row) && row.some(c => c !== null && c !== ''))
      .map((row, i) => {
        const chassis   = get(row, C.chassis).replace(/\s/g,'').toUpperCase() || null;
        const brand     = get(row, C.brand).toUpperCase();
        const model     = get(row, C.model).toUpperCase();
        const branchRaw = get(row, C.branch);
        const branch_id = findBranch(branchRaw);
        // Errores bloqueantes: sin marca, sin modelo o sucursal no reconocida
        const errors    = [];
        if (!brand)     errors.push('Sin Marca');
        if (!model)     errors.push('Sin Modelo');
        if (!branch_id) errors.push(`Sucursal no reconocida: "${branchRaw}"`);
        // Advertencias: datos faltantes pero la unidad igual entra (admin completa después)
        const warnings  = [];
        if (!chassis)   warnings.push('Sin N° Chasis');
        const duplicate = !!chassis && existingSet.has(chassis.toLowerCase());
        const _status   = duplicate ? 'duplicate' : errors.length ? 'error' : warnings.length ? 'warning' : 'ok';
        return {
          _row: headerIdx + 2 + i, _status,
          _errors: errors, _warnings: warnings,
          branch_id, branch_raw: branchRaw,
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
      ok:         preview.filter(r => r._status==='ok').length,
      warnings:   preview.filter(r => r._status==='warning').length,
      duplicates: preview.filter(r => r._status==='duplicate').length,
      errors:     preview.filter(r => r._status==='error').length,
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
        const chassis = r.chassis || null; // null si no viene — Postgres permite múltiples NULL en UNIQUE
        if (chassis) {
          // Con chasis: usar ON CONFLICT para evitar duplicados
          await db.query(
            `INSERT INTO inventory (branch_id,year,brand,model,color,chassis,motor_num,status,price,notes,created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (chassis) DO NOTHING`,
            [r.branch_id, r.year, r.brand, r.model, r.color, chassis,
             r.motor_num||null, r.status, r.price||0, r.notes||null, req.user.id]
          );
        } else {
          // Sin chasis: insertar directo (sin ON CONFLICT — NULL no genera conflicto en PG)
          await db.query(
            `INSERT INTO inventory (branch_id,year,brand,model,color,chassis,motor_num,status,price,notes,created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [r.branch_id, r.year, r.brand, r.model, r.color, null,
             r.motor_num||null, r.status, r.price||0, r.notes||null, req.user.id]
          );
        }
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

// ─── DELETE ───────────────────────────────────────────────────────────────────
router.delete('/:id', roleCheck('super_admin', 'admin_comercial'), async (req, res) => {
  try {
    const { rows } = await db.query(
      'DELETE FROM inventory WHERE id=$1 RETURNING id, brand, model, chassis',
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Unidad no encontrada' });
    res.json({ ok: true, deleted: rows[0] });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error al eliminar' }); }
});

// ─── EXPORT — genera XLSX con todo el inventario ──────────────────────────────
router.get('/export', async (req, res) => {
  try {
    const { branch_id, status } = req.query;
    let where = ['1=1'], params = [], idx = 1;
    if (branch_id) { where.push(`i.branch_id = $${idx++}`); params.push(branch_id); }
    if (status)    { where.push(`i.status = $${idx++}`);    params.push(status); }

    const { rows } = await db.query(
      `SELECT i.*, b.name as branch_name, b.code as branch_code,
              COALESCE(
                -- 1) precio propio de la unidad
                NULLIF(i.price, 0),
                -- 2) modelo vinculado por FK directa
                (SELECT mm.price FROM moto_models mm WHERE mm.id = i.model_id AND mm.price > 0 LIMIT 1),
                -- 3) moto_prices más reciente via FK
                (SELECT mp.price_list FROM moto_prices mp
                   JOIN moto_models mm ON mp.model_id = mm.id
                  WHERE mm.id = i.model_id AND mp.price_list > 0
                  ORDER BY mp.period DESC LIMIT 1),
                -- 4) moto_models por texto brand+model
                (SELECT mm.price FROM moto_models mm
                  WHERE LOWER(TRIM(mm.brand)) = LOWER(TRIM(i.brand))
                    AND LOWER(TRIM(mm.model)) = LOWER(TRIM(i.model))
                    AND mm.price > 0
                  ORDER BY mm.updated_at DESC LIMIT 1),
                -- 5) moto_prices por texto brand+model, período más reciente
                (SELECT mp.price_list FROM moto_prices mp
                   JOIN moto_models mm ON mp.model_id = mm.id
                  WHERE LOWER(TRIM(mm.brand)) = LOWER(TRIM(i.brand))
                    AND LOWER(TRIM(mm.model)) = LOWER(TRIM(i.model))
                    AND mp.price_list > 0
                  ORDER BY mp.period DESC LIMIT 1)
              ) AS catalog_price
       FROM inventory i
       LEFT JOIN branches b ON i.branch_id = b.id
       WHERE ${where.join(' AND ')}
       ORDER BY
         CASE WHEN i.sort_order IS NULL OR i.sort_order = 0 THEN 1 ELSE 0 END,
         i.sort_order ASC, i.created_at DESC`,
      params
    );

    const XLSX = require('xlsx');
    const exportRows = [];
    const failedRows = [];

    for (const r of rows) {
      try {
        exportRows.push({
          'Sucursal':       r.branch_name  || r.branch_code || '—',
          'Año':            r.year         || '',
          'Marca':          r.brand        || '',
          'Modelo':         r.model        || '',
          'Color':          r.color        || '',
          'N° Chasis':      r.chassis      || '',
          'N° Motor':       r.motor_num    || '',
          'Estado':         r.status       || '',
          'Precio':         r.catalog_price ? Number(r.catalog_price) : '',
          'Fecha Ingreso':  r.created_at   ? new Date(r.created_at).toLocaleDateString('es-CL') : '',
          'Fecha Venta':    r.sold_at      ? new Date(r.sold_at).toLocaleDateString('es-CL') : '',
          'Notas':          r.notes        || '',
        });
      } catch (rowErr) {
        failedRows.push({ chassis: r.chassis || r.id, error: rowErr.message });
        console.warn(`[inventory/export] fila omitida: chassis=${r.chassis||r.id} — ${rowErr.message}`);
      }
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportRows);

    // Ancho de columnas
    ws['!cols'] = [
      {wch:22},{wch:6},{wch:12},{wch:20},{wch:14},{wch:18},{wch:16},
      {wch:14},{wch:12},{wch:14},{wch:14},{wch:30},
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario');

    // Hoja de errores (si los hubo)
    if (failedRows.length > 0) {
      const wsErr = XLSX.utils.json_to_sheet(failedRows);
      XLSX.utils.book_append_sheet(wb, wsErr, 'Filas con error');
    }

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `inventario_${new Date().toISOString().slice(0,10)}.xlsx`;

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (e) {
    console.error('[inventory/export]', e);
    res.status(500).json({ error: 'Error al generar exportación' });
  }
});

module.exports = router;
