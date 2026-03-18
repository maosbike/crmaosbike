const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { auth, roleCheck } = require('../middleware/auth');

router.use(auth);

router.put('/change-password', async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) return res.status(400).json({ error: 'Contraseña actual y nueva son requeridas' });
    if (new_password.length < 6) return res.status(400).json({ error: 'La nueva contraseña debe tener mínimo 6 caracteres' });
    if (current_password === new_password) return res.status(400).json({ error: 'La nueva contraseña debe ser diferente a la actual' });
    const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
    const valid = await bcrypt.compare(current_password, rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    const newHash = await bcrypt.hash(new_password, 10);
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.user.id]);
    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (e) { console.error('Error cambiar contraseña:', e); res.status(500).json({ error: 'Error del servidor' }); }
});

router.get('/', roleCheck('super_admin'), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.role,
              u.branch_id, u.active, u.created_at,
              b.name as branch_name, b.code as branch_code
       FROM users u LEFT JOIN branches b ON u.branch_id = b.id ORDER BY u.first_name`
    );
    res.json(rows);
  } catch (e) { console.error('Error listar usuarios:', e); res.status(500).json({ error: 'Error del servidor' }); }
});

router.post('/', roleCheck('super_admin'), async (req, res) => {
  try {
    const { email, password, first_name, last_name, phone, role, branch_id } = req.body;
    if (!email || !password || !first_name || !last_name || !role) return res.status(400).json({ error: 'Faltan campos obligatorios' });
    if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener mínimo 6 caracteres' });
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing.rows.length > 0) return res.status(400).json({ error: 'Ya existe un usuario con ese email' });
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, phone, role, branch_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, email, first_name, last_name, phone, role, branch_id, active, created_at`,
      [email.toLowerCase().trim(), hash, first_name, last_name, phone || null, role, branch_id || null]
    );
    res.status(201).json(rows[0]);
  } catch (e) { console.error('Error crear usuario:', e); res.status(500).json({ error: 'Error del servidor' }); }
});

router.put('/:id', roleCheck('super_admin'), async (req, res) => {
  try {
    const { first_name, last_name, email, phone, role, branch_id, active } = req.body;
    const check = await db.query('SELECT id FROM users WHERE id = $1', [req.params.id]);
    if (!check.rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (email) {
      const dup = await db.query('SELECT id FROM users WHERE email = $1 AND id != $2', [email.toLowerCase().trim(), req.params.id]);
      if (dup.rows.length > 0) return res.status(400).json({ error: 'Ya existe otro usuario con ese email' });
    }
    const { rows } = await db.query(
      `UPDATE users SET first_name=COALESCE($1,first_name), last_name=COALESCE($2,last_name),
       email=COALESCE($3,email), phone=COALESCE($4,phone), role=COALESCE($5,role),
       branch_id=$6, active=COALESCE($7,active) WHERE id=$8
       RETURNING id, email, first_name, last_name, phone, role, branch_id, active`,
      [first_name, last_name, email?.toLowerCase().trim(), phone, role, branch_id || null, active, req.params.id]
    );
    res.json(rows[0]);
  } catch (e) { console.error('Error editar usuario:', e); res.status(500).json({ error: 'Error del servidor' }); }
});

router.put('/:id/reset-password', roleCheck('super_admin'), async (req, res) => {
  try {
    const { new_password } = req.body;
    if (!new_password) return res.status(400).json({ error: 'Nueva contraseña requerida' });
    if (new_password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener mínimo 6 caracteres' });
    const check = await db.query('SELECT id, first_name, last_name FROM users WHERE id = $1', [req.params.id]);
    if (!check.rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
    const hash = await bcrypt.hash(new_password, 10);
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.params.id]);
    res.json({ message: `Contraseña de ${check.rows[0].first_name} ${check.rows[0].last_name} reseteada correctamente` });
  } catch (e) { console.error('Error resetear contraseña:', e); res.status(500).json({ error: 'Error del servidor' }); }
});

module.exports = router;
