const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const db = require('../config/db');
const { auth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

// Máximo 10 intentos de login por IP cada 15 minutos
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos de login. Intenta de nuevo en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const identifier = (email || '').trim();
  if (!identifier || !password) return res.status(400).json({ error: 'Usuario/email y contraseña requeridos' });

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
  const refreshToken = jwt.sign({ uid: user.id }, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET + '_refresh', { expiresIn: '7d' });

  res.json({
    token,
    refreshToken,
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
      forceChange: user.force_password_change || false,
    }
  });
}));

router.get('/me', auth, asyncHandler(async (req, res) => {
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
}));

// Endpoint para renovar el access token usando el refresh token
router.post('/refresh', asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ error: 'Refresh token requerido' });

  const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET + '_refresh';
  let payload;
  try {
    payload = jwt.verify(refreshToken, secret);
  } catch {
    return res.status(401).json({ error: 'Refresh token inválido o expirado' });
  }

  const { rows } = await db.query(
    `SELECT u.*, b.name as branch_name, b.code as branch_code
     FROM users u LEFT JOIN branches b ON u.branch_id = b.id
     WHERE u.id = $1 AND u.active = true LIMIT 1`,
    [payload.uid]
  );
  if (!rows[0]) return res.status(401).json({ error: 'Usuario no encontrado' });

  const newToken = jwt.sign({ uid: rows[0].id, role: rows[0].role }, process.env.JWT_SECRET, { expiresIn: '24h' });
  res.json({ token: newToken });
}));

module.exports = router;
