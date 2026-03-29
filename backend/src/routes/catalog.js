const router = require('express').Router();
const db = require('../config/db');
const { auth, roleCheck } = require('../middleware/auth');
const multer = require('multer');
const cloudinary = require('../config/cloudinary');

router.use(auth);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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
    const { brand, model, year, cc, category, colors, price, bonus } = req.body;
    const { rows } = await db.query(
      `INSERT INTO moto_models (brand, model, year, cc, category, colors, price, bonus)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8) RETURNING *`,
      [brand, model, year, cc, category, JSON.stringify(colors || []), price, bonus || 0]
    );
    res.status(201).json(rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error' }); }
});

// Update model details
router.patch('/models/:id', roleCheck('super_admin', 'admin_comercial'), async (req, res) => {
  try {
    const jsonFields = ['colors', 'image_gallery'];
    const allowed = ['brand', 'model', 'commercial_name', 'description', 'spec_url',
                     'colors', 'image_gallery', 'category', 'cc', 'year', 'price', 'bonus'];
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

// Upload model image
router.post('/models/:id/image', roleCheck('super_admin', 'admin_comercial'), upload.single('image'), async (req, res) => {
  try {
    const b64 = req.file.buffer.toString('base64');
    const result = await cloudinary.uploader.upload(`data:${req.file.mimetype};base64,${b64}`, { folder: 'crmaosbike/catalog' });
    await db.query('UPDATE moto_models SET image_url = $1 WHERE id = $2', [result.secure_url, req.params.id]);
    res.json({ url: result.secure_url });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error' }); }
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

module.exports = router;
