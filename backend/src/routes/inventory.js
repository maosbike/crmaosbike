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
    const { branch_id, year, brand, model, color, chassis, motor_num, status, price } = req.body;
    if (!chassis || !brand || !model) return res.status(400).json({ error: 'Marca, modelo y chasis requeridos' });

    const { rows } = await db.query(
      `INSERT INTO inventory (branch_id, year, brand, model, color, chassis, motor_num, status, price)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [branch_id, year, brand, model, color, chassis, motor_num, status || 'disponible', price]
    );
    res.status(201).json(rows[0]);
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
