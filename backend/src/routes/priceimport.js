/**
 * priceimport.js
 * Nuevo flujo seguro de importación de precios:
 *   CSV/Excel → staging → revisión manual → publicar al catálogo.
 * Los datos NUNCA impactan el catálogo sin aprobación explícita del super_admin.
 */
const router = require('express').Router();
const multer = require('multer');
const xlsx   = require('xlsx');
const db     = require('../config/db');
const { auth, roleCheck } = require('../middleware/auth');
const { normalizeModel }  = require('../services/pdfExtractor');

router.use(auth);
router.use(roleCheck('super_admin', 'admin_comercial'));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(csv|xlsx|xls)$/i.test(file.originalname) ||
      ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
       'application/vnd.ms-excel', 'text/csv', 'application/csv'].includes(file.mimetype);
    cb(ok ? null : new Error('Solo se aceptan archivos CSV o Excel (.csv, .xlsx, .xls)'), ok);
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const COL_ALIASES = {
  brand:            ['marca','brand'],
  model:            ['modelo','model'],
  commercial_name:  ['nombre_comercial','commercial_name','nombre comercial','nombre'],
  category:         ['categoria','categoría','category'],
  cc:               ['cc','cilindrada'],
  year:             ['año','year','anio'],
  price_list:       ['precio_lista','price_list','precio lista','precio'],
  bonus:            ['bono','bonus'],
  description:      ['descripcion','descripción','description'],
};

function findCol(headers, field) {
  const aliases = COL_ALIASES[field] || [field];
  for (const alias of aliases) {
    const idx = headers.findIndex(h => String(h).trim().toLowerCase() === alias.toLowerCase());
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseNum(v) {
  if (v == null || v === '') return null;
  const n = parseInt(String(v).replace(/[$\s.]/g, '').replace(',', ''), 10);
  return isNaN(n) ? null : n;
}

function validateRow(row) {
  const errors = [];
  if (!row.brand || !String(row.brand).trim()) errors.push('Marca requerida');
  if (!row.model || !String(row.model).trim()) errors.push('Modelo requerido');
  if (!row.price_list || row.price_list <= 0)  errors.push('Precio lista debe ser mayor a 0');
  if (row.bonus && row.price_list && row.bonus >= row.price_list)
    errors.push(`Bono (${row.bonus}) debe ser menor al precio lista (${row.price_list})`);
  if (row.bonus && row.price_list && row.bonus > row.price_list * 0.40)
    errors.push(`Bono (${row.bonus}) supera el 40% del precio lista — verificar dato`);
  return errors;
}

async function resolveModel(brand, model) {
  const norm = normalizeModel(model);
  const exact = await db.query(
    `SELECT id FROM moto_models WHERE brand ILIKE $1 AND normalized_model = $2 AND active = true`,
    [brand, norm]
  );
  if (exact.rows.length === 1) return { model_id: exact.rows[0].id, match_type: 'exact' };
  const fuzzy = await db.query(
    `SELECT id FROM moto_models
     WHERE brand ILIKE $1 AND active = true
       AND (normalized_model ILIKE $2 OR $3 ILIKE '%'||normalized_model||'%')
     LIMIT 2`,
    [brand, `%${norm}%`, norm]
  );
  if (fuzzy.rows.length === 1) return { model_id: fuzzy.rows[0].id, match_type: 'fuzzy' };
  if (fuzzy.rows.length > 1)   return { model_id: null, match_type: 'ambiguous' };
  return { model_id: null, match_type: 'new' };
}

// ── POST /api/priceimport/upload ──────────────────────────────────────────────
router.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Se requiere un archivo CSV o Excel' });
  try {
    const wb  = xlsx.read(req.file.buffer, { type: 'buffer' });
    const ws  = wb.Sheets[wb.SheetNames[0]];
    const raw = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });

    if (raw.length < 2) return res.status(422).json({ error: 'El archivo está vacío o solo tiene encabezados' });

    const headers = raw[0].map(h => String(h).trim());
    const colIdx  = {};
    for (const field of Object.keys(COL_ALIASES)) colIdx[field] = findCol(headers, field);

    if (colIdx.brand === -1 || colIdx.model === -1 || colIdx.price_list === -1) {
      return res.status(422).json({
        error: 'Columnas requeridas faltantes. El archivo debe tener: marca, modelo, precio_lista',
        headers_found: headers,
      });
    }

    const parsed = [];
    for (let i = 1; i < raw.length; i++) {
      const r     = raw[i];
      const brand = String(r[colIdx.brand] || '').trim();
      const model = String(r[colIdx.model] || '').trim();
      if (!brand && !model) continue;
      parsed.push({
        row_number:      i,
        brand,
        model,
        commercial_name: colIdx.commercial_name !== -1 ? String(r[colIdx.commercial_name] || '').trim() || null : null,
        category:        colIdx.category    !== -1 ? String(r[colIdx.category]    || '').trim() || null : null,
        cc:              colIdx.cc          !== -1 ? parseNum(r[colIdx.cc])    : null,
        year:            colIdx.year        !== -1 ? parseNum(r[colIdx.year])   : null,
        price_list:      parseNum(r[colIdx.price_list]),
        bonus:           colIdx.bonus       !== -1 ? parseNum(r[colIdx.bonus])  : null,
        description:     colIdx.description !== -1 ? String(r[colIdx.description] || '').trim() || null : null,
      });
    }

    if (parsed.length === 0) return res.status(422).json({ error: 'No se encontraron filas con datos' });

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const batchRes = await client.query(
        `INSERT INTO price_staging_batches (filename, uploaded_by, total_rows) VALUES ($1,$2,$3) RETURNING id`,
        [req.file.originalname, req.user.id, parsed.length]
      );
      const batch_id = batchRes.rows[0].id;
      const rows = [];
      for (const row of parsed) {
        const errors = validateRow(row);
        const { model_id, match_type } = errors.length === 0
          ? await resolveModel(row.brand, row.model)
          : { model_id: null, match_type: 'unknown' };
        const ins = await client.query(
          `INSERT INTO price_staging
             (batch_id, row_number, brand, model, commercial_name, category, cc, year,
              price_list, bonus, description, model_id, match_type, validation_errors)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
          [batch_id, row.row_number, row.brand, row.model, row.commercial_name,
           row.category, row.cc, row.year, row.price_list, row.bonus, row.description,
           model_id, match_type, JSON.stringify(errors)]
        );
        rows.push(ins.rows[0]);
      }
      await client.query('COMMIT');
      const valid = rows.filter(r => !r.validation_errors || r.validation_errors.length === 0).length;
      res.json({ batch_id, filename: req.file.originalname, total: rows.length, valid, with_errors: rows.length - valid, rows });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('[priceimport/upload]', e);
    res.status(500).json({ error: e.message || 'Error al procesar el archivo' });
  }
});

// ── GET /api/priceimport/batches ──────────────────────────────────────────────
router.get('/batches', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT b.*, u.first_name||' '||u.last_name as uploaded_by_name,
              (SELECT COUNT(*) FROM price_staging WHERE batch_id=b.id AND status='pending')  as pending_rows,
              (SELECT COUNT(*) FROM price_staging WHERE batch_id=b.id AND status='approved') as approved_rows,
              (SELECT COUNT(*) FROM price_staging WHERE batch_id=b.id AND status='rejected') as rejected_rows
       FROM price_staging_batches b
       LEFT JOIN users u ON b.uploaded_by = u.id
       ORDER BY b.created_at DESC LIMIT 20`
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Error' }); }
});

// ── GET /api/priceimport/batches/:id ─────────────────────────────────────────
router.get('/batches/:id', async (req, res) => {
  try {
    const batch = await db.query(`SELECT * FROM price_staging_batches WHERE id=$1`, [req.params.id]);
    if (!batch.rows.length) return res.status(404).json({ error: 'Batch no encontrado' });
    const { rows } = await db.query(
      `SELECT s.*, m.brand as catalog_brand, m.model as catalog_model
       FROM price_staging s LEFT JOIN moto_models m ON s.model_id = m.id
       WHERE s.batch_id=$1 ORDER BY s.row_number`,
      [req.params.id]
    );
    res.json({ batch: batch.rows[0], rows });
  } catch (e) { res.status(500).json({ error: 'Error' }); }
});

// ── PATCH /api/priceimport/rows/:id ──────────────────────────────────────────
router.patch('/rows/:id', async (req, res) => {
  try {
    const existing = await db.query(`SELECT * FROM price_staging WHERE id=$1`, [req.params.id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Fila no encontrada' });
    const merged   = { ...existing.rows[0], ...req.body };
    const errors   = validateRow(merged);
    const { model_id, match_type } = errors.length === 0
      ? await resolveModel(merged.brand, merged.model)
      : { model_id: null, match_type: 'unknown' };
    const allowed = ['brand','model','commercial_name','category','cc','year','price_list','bonus','description'];
    const sets = [], params = [];
    let idx = 1;
    for (const key of allowed) {
      if (key in req.body) { sets.push(`${key}=$${idx++}`); params.push(req.body[key]); }
    }
    sets.push(`validation_errors=$${idx++}`); params.push(JSON.stringify(errors));
    sets.push(`model_id=$${idx++}`);          params.push(model_id);
    sets.push(`match_type=$${idx++}`);        params.push(match_type);
    sets.push(`updated_at=NOW()`);
    params.push(req.params.id);
    const { rows } = await db.query(`UPDATE price_staging SET ${sets.join(',')} WHERE id=$${idx} RETURNING *`, params);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: 'Error' }); }
});

// ── DELETE /api/priceimport/rows/:id ─────────────────────────────────────────
router.delete('/rows/:id', async (req, res) => {
  try {
    await db.query(`UPDATE price_staging SET status='rejected', updated_at=NOW() WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Error' }); }
});

// ── POST /api/priceimport/batches/:id/publish — solo super_admin ──────────────
router.post('/batches/:id/publish', roleCheck('super_admin'), async (req, res) => {
  const { row_ids } = req.body;
  try {
    let q = `SELECT * FROM price_staging WHERE batch_id=$1 AND status='pending' AND (validation_errors IS NULL OR validation_errors='[]'::jsonb)`;
    const params = [req.params.id];
    if (row_ids && row_ids.length > 0) { q += ` AND id = ANY($2::uuid[])`; params.push(row_ids); }
    const { rows } = await db.query(q, params);
    if (!rows.length) return res.status(422).json({ error: 'No hay filas válidas para publicar' });

    const client = await db.connect();
    const stats  = { published: 0, created: 0, errors: [] };
    try {
      await client.query('BEGIN');
      for (const row of rows) {
        try {
          let model_id = row.model_id;
          if (!model_id) {
            const ins = await client.query(
              `INSERT INTO moto_models
                 (brand, model, normalized_model, commercial_name, category, cc, year, price, bonus, active)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true) RETURNING id`,
              [row.brand, row.model, normalizeModel(row.model),
               row.commercial_name || row.model, row.category, row.cc, row.year,
               row.price_list || 0, row.bonus || 0]
            );
            model_id = ins.rows[0].id;
            stats.created++;
          } else {
            await client.query(
              `UPDATE moto_models SET price=$1, bonus=$2,
                 commercial_name=COALESCE(NULLIF($3,''), commercial_name),
                 category=COALESCE(NULLIF($4,''), category),
                 cc=COALESCE($5, cc), year=COALESCE($6, year), updated_at=NOW()
               WHERE id=$7`,
              [row.price_list, row.bonus || 0, row.commercial_name, row.category, row.cc, row.year, model_id]
            );
            stats.published++;
          }
          await client.query(
            `UPDATE price_staging SET status='approved', model_id=$1, updated_at=NOW() WHERE id=$2`,
            [model_id, row.id]
          );
        } catch (rowErr) {
          stats.errors.push({ model: row.model, error: rowErr.message });
        }
      }
      await client.query(
        `UPDATE price_staging_batches SET
           status=CASE WHEN (SELECT COUNT(*) FROM price_staging WHERE batch_id=$1 AND status='pending')=0
                       THEN 'published' ELSE 'partial' END,
           updated_at=NOW() WHERE id=$1`,
        [req.params.id]
      );
      await client.query('COMMIT');
      res.json({ ok: true, ...stats });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('[priceimport/publish]', e);
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/priceimport/batches/:id ───────────────────────────────────────
router.delete('/batches/:id', roleCheck('super_admin'), async (req, res) => {
  try {
    await db.query(`DELETE FROM price_staging_batches WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Error' }); }
});

// ── GET /api/priceimport/template ─────────────────────────────────────────────
router.get('/template', (req, res) => {
  const wb   = xlsx.utils.book_new();
  const data = [
    ['marca','modelo','nombre_comercial','categoria','cc','año','precio_lista','bono','descripcion'],
    ['Honda','CB 300F','Honda CB 300F ABS','Commuter',300,2025,4990000,200000,''],
    ['Yamaha','FZ-S 4.0','Yamaha FZ-S 4.0','Commuter',150,2025,2690000,100000,''],
    ['Keeway','TX 125','Keeway TX 125','Commuter',125,2025,1490000,0,''],
  ];
  const ws = xlsx.utils.aoa_to_sheet(data);
  xlsx.utils.book_append_sheet(wb, ws, 'Plantilla Precios');
  const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="plantilla_precios.xlsx"');
  res.send(buf);
});

module.exports = router;
