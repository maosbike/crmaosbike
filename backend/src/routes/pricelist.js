/**
 * pricelist.js
 * Rutas para importar listas de precios desde PDF.
 * Solo accesible por super_admin.
 */
const router  = require('express').Router();
const multer  = require('multer');
const db      = require('../config/db');
const { auth, roleCheck } = require('../middleware/auth');
const { extractFromPDF, normalizeModel } = require('../services/pdfExtractor');

router.use(auth);
router.use(roleCheck('super_admin'));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se aceptan archivos PDF'));
    }
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Busca un modelo en moto_models por marca + normalized_model.
 * Retorna: { match: 'exact'|'fuzzy'|'none', candidates: [...] }
 */
async function resolveModel(brand, normalizedName) {
  // 1. Match exacto: misma marca + mismo normalized_model
  const exact = await db.query(
    `SELECT id, brand, model, normalized_model, code, category, cc, active
     FROM moto_models
     WHERE brand ILIKE $1 AND normalized_model = $2`,
    [brand, normalizedName]
  );
  if (exact.rows.length === 1) return { match: 'exact', candidates: exact.rows };
  if (exact.rows.length > 1)   return { match: 'ambiguous', candidates: exact.rows };

  // 2. Match parcial: marca + normalized_model contiene o está contenido
  const partial = await db.query(
    `SELECT id, brand, model, normalized_model, code, category, cc, active
     FROM moto_models
     WHERE brand ILIKE $1
       AND (normalized_model ILIKE $2 OR $3 ILIKE '%' || normalized_model || '%')`,
    [brand, `%${normalizedName}%`, normalizedName]
  );
  if (partial.rows.length === 1) return { match: 'fuzzy', candidates: partial.rows };
  if (partial.rows.length > 1)   return { match: 'ambiguous', candidates: partial.rows };

  // 3. Sin marca: buscar solo por normalized_model
  const noMarca = await db.query(
    `SELECT id, brand, model, normalized_model, code, category, cc, active
     FROM moto_models
     WHERE normalized_model = $1`,
    [normalizedName]
  );
  if (noMarca.rows.length === 1) return { match: 'fuzzy_no_brand', candidates: noMarca.rows };
  if (noMarca.rows.length > 1)   return { match: 'ambiguous', candidates: noMarca.rows };

  return { match: 'none', candidates: [] };
}

// ── POST /api/pricelist/preview ───────────────────────────────────────────────

router.post('/preview', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Se requiere un archivo PDF' });

    const extracted = await extractFromPDF(req.file.buffer, req.file.originalname);

    if (!extracted.rows || extracted.rows.length === 0) {
      return res.status(422).json({
        error: 'No se pudieron extraer filas del PDF.',
        source_type: extracted.source_type,
        period: extracted.period,
      });
    }

    // Para cada fila extraída, resolver si existe en catálogo
    const preview = [];
    for (const row of extracted.rows) {
      const resolution = await resolveModel(row.brand, row.normalized_model);

      let status;
      let model_id = null;

      if (resolution.match === 'exact') {
        status   = 'match';
        model_id = resolution.candidates[0].id;
        // Verificar si ya tiene precio para este período
        if (extracted.period) {
          const existing = await db.query(
            'SELECT id FROM moto_prices WHERE model_id = $1 AND period = $2',
            [model_id, extracted.period]
          );
          if (existing.rows.length > 0) status = 'update';
        }
      } else if (resolution.match === 'fuzzy' || resolution.match === 'fuzzy_no_brand') {
        status   = 'fuzzy';
        model_id = resolution.candidates[0].id;
      } else if (resolution.match === 'ambiguous') {
        status = 'ambiguous';
      } else {
        status = 'new';
      }

      preview.push({
        ...row,
        status,        // match | update | fuzzy | ambiguous | new
        model_id,      // null si ambiguous o new
        candidates: resolution.candidates,
      });
    }

    const summary = {
      total:     preview.length,
      match:     preview.filter(r => r.status === 'match').length,
      update:    preview.filter(r => r.status === 'update').length,
      fuzzy:     preview.filter(r => r.status === 'fuzzy').length,
      ambiguous: preview.filter(r => r.status === 'ambiguous').length,
      new:       preview.filter(r => r.status === 'new').length,
    };

    res.json({
      period:      extracted.period,
      source_type: extracted.source_type,
      filename:    req.file.originalname,
      summary,
      rows:        preview,
    });
  } catch (err) {
    console.error('[pricelist/preview]', err);
    res.status(500).json({ error: err.message || 'Error al procesar el PDF' });
  }
});

// ── POST /api/pricelist/confirm ───────────────────────────────────────────────

/**
 * Body esperado:
 * {
 *   period: '2026-03',
 *   source_type: 'honda',
 *   filename: 'LISTA DE PRECIOS HONDA.pdf',
 *   rows: [
 *     {
 *       model_id: 'uuid' | null,     -- null si es modelo nuevo
 *       brand, model, normalized_model, code, category, segment, cc,
 *       price_list, bono_todo_medio, price_todo_medio,
 *       bono_financiamiento, price_financiamiento,
 *       dcto_30_dias, dcto_60_dias, notes,
 *       skip: false,                 -- true para ignorar esta fila
 *       create_new: true,            -- true para crear modelo nuevo
 *     }
 *   ]
 * }
 */
router.post('/confirm', async (req, res) => {
  const { period, source_type, filename, rows } = req.body;
  if (!period || !rows || !Array.isArray(rows)) {
    return res.status(400).json({ error: 'Faltan datos: period y rows son requeridos' });
  }

  const client = await db.connect();
  const stats  = { imported: 0, updated: 0, new_models: 0, skipped: 0, errors: [] };

  try {
    await client.query('BEGIN');

    for (const row of rows) {
      if (row.skip) { stats.skipped++; continue; }

      try {
        let model_id = row.model_id || null;

        // Crear modelo nuevo si corresponde
        if (!model_id && row.create_new) {
          const ins = await client.query(
            `INSERT INTO moto_models
               (brand, model, normalized_model, commercial_name, code, category, segment, cc, year, price, bonus, active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, true)
             RETURNING id`,
            [
              row.brand,
              row.model,
              row.normalized_model || normalizeModel(row.model),
              row.commercial_name || row.model,
              row.code || null,
              row.category || null,
              row.segment || null,
              row.cc || null,
              new Date().getFullYear(),
              row.price_list || 0,
            ]
          );
          model_id = ins.rows[0].id;
          stats.new_models++;
        }

        if (!model_id) { stats.skipped++; continue; }

        // Upsert precio del período
        const existing = await client.query(
          'SELECT id FROM moto_prices WHERE model_id = $1 AND period = $2',
          [model_id, period]
        );

        if (existing.rows.length > 0) {
          await client.query(
            `UPDATE moto_prices SET
               price_list = $1, bono_todo_medio = $2, price_todo_medio = $3,
               bono_financiamiento = $4, price_financiamiento = $5,
               dcto_30_dias = $6, dcto_60_dias = $7,
               source_file = $8, source_type = $9,
               raw_row = $10, notes = $11, updated_at = NOW()
             WHERE model_id = $12 AND period = $13`,
            [
              row.price_list, row.bono_todo_medio, row.price_todo_medio,
              row.bono_financiamiento, row.price_financiamiento,
              row.dcto_30_dias, row.dcto_60_dias,
              filename, source_type,
              JSON.stringify(row.raw || {}), row.notes,
              model_id, period,
            ]
          );
          stats.updated++;
        } else {
          await client.query(
            `INSERT INTO moto_prices
               (model_id, period, price_list, bono_todo_medio, price_todo_medio,
                bono_financiamiento, price_financiamiento, dcto_30_dias, dcto_60_dias,
                source_file, source_type, raw_row, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
            [
              model_id, period,
              row.price_list, row.bono_todo_medio, row.price_todo_medio,
              row.bono_financiamiento, row.price_financiamiento,
              row.dcto_30_dias, row.dcto_60_dias,
              filename, source_type,
              JSON.stringify(row.raw || {}), row.notes,
            ]
          );
          stats.imported++;
        }

        // Actualizar precio vigente en moto_models (campo price = price_todo_medio || price_list)
        const currentPrice = row.price_todo_medio || row.price_list;
        if (currentPrice) {
          await client.query(
            `UPDATE moto_models SET
               price = $1, bonus = $2,
               code  = COALESCE(NULLIF($3, ''), code),
               normalized_model = COALESCE(normalized_model, $4),
               commercial_name  = COALESCE(commercial_name, $5),
               updated_at = NOW()
             WHERE id = $6`,
            [
              currentPrice,
              row.bono_todo_medio || row.bono_financiamiento || 0,
              row.code || '',
              row.normalized_model || normalizeModel(row.model),
              row.commercial_name || row.model,
              model_id,
            ]
          );
        }
      } catch (rowErr) {
        console.error('[pricelist/confirm row]', rowErr.message, row);
        stats.errors.push({ model: row.model, error: rowErr.message });
      }
    }

    // Guardar log de importación
    await client.query(
      `INSERT INTO price_import_logs
         (imported_by, filename, period, source_type, total_rows, imported, updated, new_models, ambiguous, errors)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        req.user.id, filename, period, source_type,
        rows.length, stats.imported, stats.updated,
        stats.new_models, 0, stats.errors.length,
      ]
    );

    await client.query('COMMIT');
    res.json({ ok: true, period, source_type, ...stats });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[pricelist/confirm]', err);
    res.status(500).json({ error: err.message || 'Error al confirmar importación' });
  } finally {
    client.release();
  }
});

// ── GET /api/pricelist/logs ───────────────────────────────────────────────────

router.get('/logs', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT l.*, u.first_name || ' ' || u.last_name as imported_by_name
       FROM price_import_logs l
       LEFT JOIN users u ON l.imported_by = u.id
       ORDER BY l.created_at DESC
       LIMIT 50`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Error' });
  }
});

// ── GET /api/pricelist/prices?period=2026-03 ─────────────────────────────────

router.get('/prices', async (req, res) => {
  try {
    const { period } = req.query;
    let where = '1=1', params = [];
    if (period) { where = 'p.period = $1'; params.push(period); }

    const { rows } = await db.query(
      `SELECT p.*, m.brand, m.model, m.category, m.cc, m.normalized_model
       FROM moto_prices p
       JOIN moto_models m ON p.model_id = m.id
       WHERE ${where}
       ORDER BY m.brand, m.model`,
      params
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Error' });
  }
});

// ── GET /api/pricelist/periods ────────────────────────────────────────────────

router.get('/periods', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT DISTINCT period FROM moto_prices ORDER BY period DESC`
    );
    res.json(rows.map(r => r.period));
  } catch (e) {
    res.status(500).json({ error: 'Error' });
  }
});

module.exports = router;
