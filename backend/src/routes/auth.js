const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { auth } = require('../middleware/auth');

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const identifier = (email || '').trim();
    if (!identifier || !password) return res.status(400).json({ error: 'Usuario/email y contraseña requeridos' });

    // Buscar por username (exacto) O email (case-insensitive)
    const { rows } = await db.query(
      `SELECT u.*, b.name as branch_name, b.code as branch_code
       FROM users u LEFT JOIN branches b ON u.branch_id = b.id
       WHERE u.username = $1 OR LOWER(u.email) = LOWER($1)
       LIMIT 1`,
      [identifier]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });
    if (!user.active) return res.status(401).json({ error: 'Usuario desactivado' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Credenciales inválidas' });

    const token = jwt.sign({ uid: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '24h' });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        fn: user.first_name,
        ln: user.last_name,
        role: user.role,
        branch: user.branch_id,
        branchName: user.branch_name,
        branchCode: user.branch_code,
      }
    });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error del servidor' }); }
});

router.get('/me', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.email, u.username, u.first_name, u.last_name, u.role, u.branch_id,
              b.name as branch_name, b.code as branch_code
       FROM users u LEFT JOIN branches b ON u.branch_id = b.id WHERE u.id = $1`,
      [req.user.id]
    );
    const u = rows[0];
    res.json({
      id: u.id, email: u.email, username: u.username,
      fn: u.first_name, ln: u.last_name, role: u.role, branch: u.branch_id,
      branchName: u.branch_name, branchCode: u.branch_code,
    });
  } catch (e) { res.status(500).json({ error: 'Error' }); }
});

module.exports = router;
