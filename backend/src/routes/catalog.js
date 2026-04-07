const router = require('express').Router();
const db = require('../config/db');
const { auth, roleCheck } = require('../middleware/auth');
const multer = require('multer');
const cloudinary = require('../config/cloudinary');

router.use(auth);

const MAX_GALLERY = 8;

const uploadImg = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },   // 5 MB por foto
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Solo se permiten imágenes (jpg, png, webp)'));
  },
});

// Alias de compatibilidad para el endpoint /image existente
const upload = uploadImg;

const uploadPdf = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },  // 15 MB para PDF
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname);
    if (ok) cb(null, true);
    else cb(new Error('Solo se permiten archivos PDF'));
  },
});

// ── CATALOG ──
router.get('/models', async (req, res) => {
  try {
    const { brand, search } = req.query;
    let where = ['active = true'], params = [], idx = 1;
    if (brand) { where.push(`brand = $${idx++}`); params.push(brand); }
    if (search) { where.push(`(brand ILIKE $${idx} OR model ILIKE $${idx})`); params.push(`%${search}%`); idx++; }
    const { rows } = await db.query(`SELECT * FROM moto_models WHERE ${where.join(' AND ')} ORDER BY brand, model`, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Error' }); }
});

router.get('/brands', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT DISTINCT brand FROM moto_models WHERE active = true ORDER BY brand');
    res.json(rows.map(r => r.brand));
  } catch (e) { res.status(500).json({ error: 'Error' }); }
});

router.post('/models', roleCheck('super_admin', 'admin_comercial'), async (req, res) => {
  try {
    const { brand, model, year, cc, category, colors, price, bonus,
            bono_tipo, bono_condicion, bono_requisitos } = req.body;
    const { rows } = await db.query(
      `INSERT INTO moto_models
         (brand, model, year, cc, category, colors, price, bonus,
          bono_tipo, bono_condicion, bono_requisitos)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11) RETURNING *`,
      [brand, model, year, cc, category, JSON.stringify(colors || []), price, bonus || 0,
       bono_tipo || null, bono_condicion || null, bono_requisitos || null]
    );
    res.status(201).json(rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error' }); }
});

// Update model details
router.patch('/models/:id', roleCheck('super_admin', 'admin_comercial'), async (req, res) => {
  try {
    const jsonFields = ['colors', 'image_gallery', 'color_photos'];
    const allowed = ['brand', 'model', 'commercial_name', 'description', 'spec_url',
                     'colors', 'image_gallery', 'color_photos', 'category', 'cc', 'year', 'price', 'bonus',
                     'bono_tipo', 'bono_condicion', 'bono_requisitos'];
    const sets = [], params = [];
    let idx = 1;
    for (const key of allowed) {
      if (key in req.body) {
        const val = req.body[key];
        if (jsonFields.includes(key)) {
          sets.push(`${key} = $${idx++}::jsonb`);
          params.push(JSON.stringify(val));
        } else {
          sets.push(`${key} = $${idx++}`);
          params.push(val);
        }
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'Sin campos a actualizar' });
    params.push(req.params.id);
    const { rows } = await db.query(
      `UPDATE moto_models SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'Modelo no encontrado' });
    res.json(rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error' }); }
});

// Delete model (soft delete — solo super_admin)
router.delete('/models/:id', roleCheck('super_admin'), async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE moto_models SET active = false, updated_at = NOW() WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Modelo no encontrado' });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error' }); }
});

// Upload model main image
router.post('/models/:id/image', roleCheck('super_admin', 'admin_comercial'), uploadImg.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Imagen requerida' });
    const b64 = req.file.buffer.toString('base64');
    const result = await cloudinary.uploader.upload(`data:${req.file.mimetype};base64,${b64}`, { folder: 'crmaosbike/catalog' });
    await db.query('UPDATE moto_models SET image_url = $1, updated_at = NOW() WHERE id = $2', [result.secure_url, req.params.id]);
    res.json({ url: result.secure_url });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error al subir imagen' }); }
});

// Add gallery photo (máx MAX_GALLERY fotos)
router.post('/models/:id/gallery', roleCheck('super_admin', 'admin_comercial'), uploadImg.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Foto requerida' });

    // Verificar límite de galería
    const { rows } = await db.query('SELECT image_gallery FROM moto_models WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Modelo no encontrado' });
    const current = Array.isArray(rows[0].image_gallery) ? rows[0].image_gallery
                    : (rows[0].image_gallery ? JSON.parse(rows[0].image_gallery) : []);
    if (current.length >= MAX_GALLERY)
      return res.status(400).json({ error: `Máximo ${MAX_GALLERY} fotos por modelo` });

    const b64 = req.file.buffer.toString('base64');
    const result = await cloudinary.uploader.upload(`data:${req.file.mimetype};base64,${b64}`, {
      folder: 'crmaosbike/catalog/gallery',
      transformation: [{ width: 1200, crop: 'limit', quality: 'auto:good' }],
    });

    const updated = [...current, result.secure_url];
    await db.query(
      'UPDATE moto_models SET image_gallery = $1::jsonb, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(updated), req.params.id]
    );
    res.json({ url: result.secure_url, gallery: updated });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error al subir foto' }); }
});

// Remove gallery photo
router.delete('/models/:id/gallery', roleCheck('super_admin', 'admin_comercial'), async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL requerida' });

    const { rows } = await db.query('SELECT image_gallery FROM moto_models WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Modelo no encontrado' });
    const current = Array.isArray(rows[0].image_gallery) ? rows[0].image_gallery
                    : (rows[0].image_gallery ? JSON.parse(rows[0].image_gallery) : []);
    const updated = current.filter(u => u !== url);
    await db.query(
      'UPDATE moto_models SET image_gallery = $1::jsonb, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(updated), req.params.id]
    );
    res.json({ gallery: updated });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error al eliminar foto' }); }
});

// Upload photo for a specific color
router.post('/models/:id/color-photo', roleCheck('super_admin', 'admin_comercial'), uploadImg.single('photo'), async (req, res) => {
  try {
    const { color } = req.body;
    if (!color) return res.status(400).json({ error: 'color requerido' });
    if (!req.file) return res.status(400).json({ error: 'foto requerida' });

    const { rows } = await db.query('SELECT color_photos FROM moto_models WHERE id=$1 AND active=true', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Modelo no encontrado' });

    const current = Array.isArray(rows[0].color_photos) ? rows[0].color_photos
                  : (rows[0].color_photos ? JSON.parse(rows[0].color_photos) : []);

    const b64 = req.file.buffer.toString('base64');
    const result = await cloudinary.uploader.upload(`data:${req.file.mimetype};base64,${b64}`, {
      folder: 'crmaosbike/catalog/colors',
      transformation: [{ width: 1200, crop: 'limit', quality: 'auto:good' }],
    });

    // Upsert: reemplazar si ya existe foto para ese color, agregar si no
    const colorLow = color.toLowerCase().trim();
    const filtered = current.filter(p => p.color.toLowerCase().trim() !== colorLow);
    const updated = [...filtered, { color: color.trim(), url: result.secure_url }];

    await db.query(
      'UPDATE moto_models SET color_photos = $1::jsonb, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(updated), req.params.id]
    );
    res.json({ color: color.trim(), url: result.secure_url, color_photos: updated });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error al subir foto de color' }); }
});

// Remove photo for a specific color
router.delete('/models/:id/color-photo', roleCheck('super_admin', 'admin_comercial'), async (req, res) => {
  try {
    const { color } = req.body;
    if (!color) return res.status(400).json({ error: 'color requerido' });

    const { rows } = await db.query('SELECT color_photos FROM moto_models WHERE id=$1 AND active=true', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Modelo no encontrado' });

    const current = Array.isArray(rows[0].color_photos) ? rows[0].color_photos
                  : (rows[0].color_photos ? JSON.parse(rows[0].color_photos) : []);

    const colorLow = color.toLowerCase().trim();
    const updated = current.filter(p => p.color.toLowerCase().trim() !== colorLow);

    await db.query(
      'UPDATE moto_models SET color_photos = $1::jsonb, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(updated), req.params.id]
    );
    res.json({ color_photos: updated });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error al eliminar foto de color' }); }
});

// Upload spec PDF
router.post('/models/:id/spec', roleCheck('super_admin', 'admin_comercial'), uploadPdf.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'PDF requerido' });
    const b64 = req.file.buffer.toString('base64');
    const result = await cloudinary.uploader.upload(`data:application/pdf;base64,${b64}`, {
      folder: 'crmaosbike/specs',
      resource_type: 'raw',
      format: 'pdf',
    });
    await db.query(
      'UPDATE moto_models SET spec_url = $1, updated_at = NOW() WHERE id = $2',
      [result.secure_url, req.params.id]
    );
    res.json({ url: result.secure_url });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error al subir PDF' }); }
});

// ── BRANCHES ──
router.get('/branches', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM branches WHERE active = true ORDER BY name');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Error' }); }
});

// ── USERS ──
router.get('/users', roleCheck('super_admin', 'admin_comercial'), async (req, res) => {
  try {
    const { role, branch_id } = req.query;
    let where = ['1=1'], params = [], idx = 1;
    if (role) { where.push(`role = $${idx++}`); params.push(role); }
    if (branch_id) { where.push(`branch_id = $${idx++}`); params.push(branch_id); }
    const { rows } = await db.query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.branch_id, u.active,
              b.name as branch_name, b.code as branch_code
       FROM users u LEFT JOIN branches b ON u.branch_id = b.id
       WHERE ${where.join(' AND ')} ORDER BY u.first_name`, params
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Error' }); }
});

router.get('/sellers', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.first_name, u.last_name, u.branch_id, b.code as branch_code
       FROM users u LEFT JOIN branches b ON u.branch_id = b.id
       WHERE u.role = 'vendedor' AND u.active = true ORDER BY u.first_name`
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Error' }); }
});

// ── MODEL ALIASES ──
router.get('/aliases', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT a.id, a.alias, a.model_id, a.created_at,
              m.brand, m.model, m.commercial_name
       FROM model_aliases a JOIN moto_models m ON a.model_id = m.id
       ORDER BY a.alias`
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Error' }); }
});

router.post('/aliases', roleCheck('super_admin', 'admin_comercial'), async (req, res) => {
  try {
    const { alias, model_id } = req.body;
    if (!alias || !model_id) return res.status(400).json({ error: 'alias y model_id requeridos' });
    const { rows } = await db.query(
      `INSERT INTO model_aliases (alias, model_id, created_by) VALUES (lower($1), $2, $3)
       ON CONFLICT (alias) DO UPDATE SET model_id=$2, created_by=$3
       RETURNING *`,
      [alias.trim(), model_id, req.user.id]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: 'Error' }); }
});

router.delete('/aliases/:id', roleCheck('super_admin', 'admin_comercial'), async (req, res) => {
  try {
    await db.query('DELETE FROM model_aliases WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Error' }); }
});

// Renombrar categoría en todos los modelos
router.patch('/categories/rename', roleCheck('super_admin', 'admin_comercial'), async (req, res) => {
  const { from, to } = req.body;
  if (!from || !to) return res.status(400).json({ error: 'from y to requeridos' });
  try {
    const { rowCount } = await db.query(
      `UPDATE moto_models SET category = $1 WHERE LOWER(TRIM(category)) = LOWER(TRIM($2))`,
      [to.trim(), from.trim()]
    );
    res.json({ ok: true, updated: rowCount });
  } catch (e) { res.status(500).json({ error: 'Error' }); }
});

// Listar categorías únicas
router.get('/categories', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT category, COUNT(*) AS count FROM moto_models WHERE category IS NOT NULL AND category <> '' GROUP BY category ORDER BY category`
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Error' }); }
});

module.exports = router;
