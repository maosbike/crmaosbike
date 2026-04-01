const router = require('express').Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../config/db');
const { auth, roleCheck } = require('../middleware/auth');

router.use(auth);

router.put('/change-password', async (req, res) => {
  try {
    const { current_password, new_password, confirm_password } = req.body;
    if (!current_password || !new_password) return res.status(400).json({ error: 'Contraseña actual y nueva son requeridas' });
    if (confirm_password !== undefined && new_password !== confirm_password) return res.status(400).json({ error: 'Las contraseñas nuevas no coinciden' });
    if (new_password.length < 8) return res.status(400).json({ error: 'La nueva contraseña debe tener mínimo 8 caracteres' });
    if (current_password === new_password) return res.status(400).json({ error: 'La nueva contraseña debe ser diferente a la actual' });
    const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
    const valid = await bcrypt.compare(current_password, rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    const newHash = await bcrypt.hash(new_password, 10);
    await db.query(
      'UPDATE users SET password_hash = $1, force_password_change = false, session_version = session_version + 1, updated_at = NOW() WHERE id = $2',
      [newHash, req.user.id]
    );
    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (e) { console.error('Error cambiar contraseña:', e); res.status(500).json({ error: 'Error del servidor' }); }
});

router.get('/', roleCheck('super_admin'), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.email, u.username, u.first_name, u.last_name, u.phone, u.role,
              u.branch_id, u.active, u.created_at,
              b.name as branch_name, b.code as branch_code
       FROM users u LEFT JOIN branches b ON u.branch_id = b.id ORDER BY u.first_name`
    );
    res.json(rows);
  } catch (e) { console.error('Error listar usuarios:', e); res.status(500).json({ error: 'Error del servidor' }); }
});

router.post('/', roleCheck('super_admin'), async (req, res) => {
  try {
    const { email, username, password, first_name, last_name, phone, role, branch_id } = req.body;
    if ((!email && !username) || !password || !first_name || !last_name || !role)
      return res.status(400).json({ error: 'Faltan campos obligatorios (username o email, password, nombre, rol)' });
    const VALID_ROLES = ['super_admin', 'admin_comercial', 'vendedor', 'backoffice'];
    if (!VALID_ROLES.includes(role))
      return res.status(400).json({ error: 'Rol inválido' });
    if (password.length < 8) return res.status(400).json({ error: 'La contraseña debe tener mínimo 8 caracteres' });
    if (email) {
      const existing = await db.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email.trim()]);
      if (existing.rows.length > 0) return res.status(400).json({ error: 'Ya existe un usuario con ese email' });
    }
    if (username) {
      const existing = await db.query('SELECT id FROM users WHERE username = $1', [username.trim()]);
      if (existing.rows.length > 0) return res.status(400).json({ error: 'Ya existe un usuario con ese username' });
    }
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      `INSERT INTO users (username, email, password_hash, first_name, last_name, phone, role, branch_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, username, email, first_name, last_name, phone, role, branch_id, active, created_at`,
      [username?.trim() || null, email?.toLowerCase().trim() || null, hash, first_name, last_name, phone || null, role, branch_id || null]
    );
    res.status(201).json(rows[0]);
  } catch (e) { console.error('Error crear usuario:', e); res.status(500).json({ error: 'Error del servidor' }); }
});

router.put('/:id', roleCheck('super_admin'), async (req, res) => {
  try {
    const { first_name, last_name, email, phone, role, branch_id, active, telegram_chat_id } = req.body;
    const check = await db.query('SELECT id FROM users WHERE id = $1', [req.params.id]);
    if (!check.rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (role !== undefined) {
      const VALID_ROLES = ['super_admin', 'admin_comercial', 'vendedor', 'backoffice'];
      if (!VALID_ROLES.includes(role))
        return res.status(400).json({ error: 'Rol inválido' });
    }
    if (email) {
      const dup = await db.query('SELECT id FROM users WHERE email = $1 AND id != $2', [email.toLowerCase().trim(), req.params.id]);
      if (dup.rows.length > 0) return res.status(400).json({ error: 'Ya existe otro usuario con ese email' });
    }
    const { rows } = await db.query(
      `UPDATE users SET first_name=COALESCE($1,first_name), last_name=COALESCE($2,last_name),
       email=COALESCE($3,email), phone=COALESCE($4,phone), role=COALESCE($5,role),
       branch_id=$6, active=COALESCE($7,active),
       telegram_chat_id=COALESCE($8,telegram_chat_id) WHERE id=$9
       RETURNING id, email, first_name, last_name, phone, role, branch_id, active, telegram_chat_id`,
      [first_name, last_name, email?.toLowerCase().trim(), phone, role, branch_id || null, active, telegram_chat_id || null, req.params.id]
    );
    res.json(rows[0]);
  } catch (e) { console.error('Error editar usuario:', e); res.status(500).json({ error: 'Error del servidor' }); }
});

// Returns count of open tickets assigned to this user (pre-deactivation warning)
router.get('/:id/active-tickets', roleCheck('super_admin'), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT COUNT(*) AS count FROM tickets
       WHERE assigned_to = $1 AND status NOT IN ('ganado','perdido','cerrado')`,
      [req.params.id]
    );
    res.json({ count: parseInt(rows[0].count) });
  } catch (e) { res.status(500).json({ error: 'Error del servidor' }); }
});

// Deactivate user + optionally bulk-reassign their open tickets
router.post('/:id/deactivate', roleCheck('super_admin'), async (req, res) => {
  try {
    const { reassign_to } = req.body; // optional UUID to receive tickets
    const check = await db.query('SELECT id, first_name, last_name, active FROM users WHERE id = $1', [req.params.id]);
    if (!check.rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (req.params.id === req.user.id) return res.status(400).json({ error: 'No puedes desactivarte a ti mismo' });

    let reassigned = 0;
    if (reassign_to) {
      const target = await db.query('SELECT id FROM users WHERE id = $1 AND active = true', [reassign_to]);
      if (!target.rows[0]) return res.status(400).json({ error: 'Usuario destino no encontrado o inactivo' });
      const { rowCount } = await db.query(
        `UPDATE tickets SET assigned_to = $1
         WHERE assigned_to = $2 AND status NOT IN ('ganado','perdido','cerrado')`,
        [reassign_to, req.params.id]
      );
      reassigned = rowCount;
    }

    await db.query(
      'UPDATE users SET active = false, session_version = session_version + 1, updated_at = NOW() WHERE id = $1',
      [req.params.id]
    );
    const u = check.rows[0];
    res.json({ message: `${u.first_name} ${u.last_name} desactivado`, reassigned });
  } catch (e) { console.error('Error desactivar usuario:', e); res.status(500).json({ error: 'Error del servidor' }); }
});

router.put('/:id/reset-password', roleCheck('super_admin'), async (req, res) => {
  try {
    const check = await db.query('SELECT id, first_name, last_name FROM users WHERE id = $1', [req.params.id]);
    if (!check.rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const bytes = crypto.randomBytes(10);
    const tempPassword = Array.from(bytes).map(b => chars[b % chars.length]).join('');
    const hash = await bcrypt.hash(tempPassword, 10);
    await db.query(
      'UPDATE users SET password_hash = $1, force_password_change = true, session_version = session_version + 1, updated_at = NOW() WHERE id = $2',
      [hash, req.params.id]
    );
    const u = check.rows[0];
    res.json({ message: `Contraseña de ${u.first_name} ${u.last_name} reseteada`, temp_password: tempPassword });
  } catch (e) { console.error('Error resetear contraseña:', e); res.status(500).json({ error: 'Error del servidor' }); }
});

module.exports = router;
