/**
 * priceimport.js
 * Nuevo flujo seguro de importación de precios:
 *   PDF → staging → revisión manual → publicar al catálogo.
 * Los datos NUNCA impactan el catálogo sin aprobación explícita del super_admin.
 * Formatos PDF soportados: Honda, Yamaha (Yamaimport), MMB (Keeway/Benelli/Benda/QJ), Promobility.
 */
const router = require('express').Router();
const multer = require('multer');
const db     = require('../config/db');
const { auth, roleCheck }          = require('../middleware/auth');
const { extractFromPDF, normalizeModel } = require('../services/pdfExtractor');

router.use(auth);
router.use(roleCheck('super_admin', 'admin_comercial'));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname);
    cb(ok ? null : new Error('Solo se aceptan archivos PDF'), ok);
  },
});

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
  if (!req.file) return res.status(400).json({ error: 'Se requiere un archivo PDF' });
  try {
    // Extraer datos del PDF usando el parser existente
    const extracted = await extractFromPDF(req.file.buffer, req.file.originalname);

    if (!extracted.rows || extracted.rows.length === 0) {
      return res.status(422).json({
        error: `PDF reconocido como "${extracted.source_type}" pero no se extrajeron filas. Verificá que el PDF contenga la tabla de precios y no esté protegido o escaneado.`,
        source_type: extracted.source_type,
        period: extracted.period,
      });
    }

    // Mapear filas del parser al formato de staging
    const parsed = extracted.rows.map((row, i) => ({
      row_number:      i + 1,
      brand:           row.brand           || '',
      model:           row.model           || '',
      commercial_name: row.commercial_name || null,
      category:        row.category        || null,
      cc:              row.cc              || null,
      year:            row.year            || null,
      price_list:      row.price_list      || null,
      bonus:           row.bono_todo_medio || null,
    }));

    if (parsed.length === 0) return res.status(422).json({ error: 'No se encontraron filas con datos' });

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const batchRes = await client.query(
        `INSERT INTO price_staging_batches (filename, uploaded_by, total_rows, status)
         VALUES ($1,$2,$3,'pending') RETURNING id`,
        [
          `${req.file.originalname} [${extracted.source_type}${extracted.period ? ' · ' + extracted.period : ''}]`,
          req.user.id,
          parsed.length,
        ]
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
        await client.query('SAVEPOINT row_save');
        try {
          let model_id = row.model_id;
          if (!model_id) {
            const ins = await client.query(
              `INSERT INTO moto_models
                 (brand, model, normalized_model, commercial_name, category, cc, year, price, bonus, active)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true) RETURNING id`,
              [row.brand, row.model, normalizeModel(row.model),
               row.commercial_name || row.model, row.category, row.cc, row.year || new Date().getFullYear(),
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
          await client.query('RELEASE SAVEPOINT row_save');
        } catch (rowErr) {
          await client.query('ROLLBACK TO SAVEPOINT row_save');
          console.error(`[publish row error] ${row.brand} ${row.model}:`, rowErr.message);
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
