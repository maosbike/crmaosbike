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

// Opciones de cookie para el refresh token — httpOnly impide lectura por JS (protección XSS)
const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production', // Solo HTTPS en prod
  sameSite: 'strict',
  path: '/api/auth',    // Cookie solo viaja a /api/auth/* — no a toda la API
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días en ms
};

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
  if (!user || !user.active) return res.status(401).json({ error: 'Credenciales inválidas' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Credenciales inválidas' });

  // Access token corto (15min) — se renueva silenciosamente vía refresh cookie
  const token = jwt.sign(
    { uid: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
  // sv (session_version) en el refresh token — permite invalidar tokens al cambiar contraseña
  const refreshToken = jwt.sign(
    { uid: user.id, sv: user.session_version || 0 },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );

  // Refresh token en cookie httpOnly — JavaScript nunca puede leerla
  res.cookie('crt', refreshToken, REFRESH_COOKIE_OPTS);

  // Solo se devuelve el access token en el body — refresh token NO viaja en JSON
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
      forceChange: user.force_password_change || false,
    }
  });
}));

router.get('/me', auth, asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT u.id, u.email, u.username, u.first_name, u.last_name, u.role, u.branch_id,
            u.force_password_change,
            b.name as branch_name, b.code as branch_code
     FROM users u LEFT JOIN branches b ON u.branch_id = b.id WHERE u.id = $1`,
    [req.user.id]
  );
  const u = rows[0];
  res.json({
    id: u.id, email: u.email, username: u.username,
    fn: u.first_name, ln: u.last_name, role: u.role, branch: u.branch_id,
    branchName: u.branch_name, branchCode: u.branch_code,
    forceChange: u.force_password_change || false,
  });
}));

// Renovar access token usando el refresh token desde la cookie httpOnly
router.post('/refresh', asyncHandler(async (req, res) => {
  // Lee desde cookie httpOnly — JavaScript del frontend nunca tuvo acceso a este valor
  const refreshToken = req.cookies?.crt;
  if (!refreshToken) return res.status(401).json({ error: 'Sesión expirada' });

  let payload;
  try {
    payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  } catch {
    return res.status(401).json({ error: 'Sesión expirada' });
  }

  const { rows } = await db.query(
    `SELECT u.*, b.name as branch_name, b.code as branch_code
     FROM users u LEFT JOIN branches b ON u.branch_id = b.id
     WHERE u.id = $1 AND u.active = true LIMIT 1`,
    [payload.uid]
  );
  if (!rows[0]) return res.status(401).json({ error: 'Usuario no encontrado' });

  // Verificar session_version — si el usuario cambió contraseña, el token queda inválido
  const currentSv = rows[0].session_version || 0;
  if ((payload.sv ?? 0) !== currentSv) {
    return res.status(401).json({ error: 'Sesión expirada, inicia sesión nuevamente' });
  }

  const newToken = jwt.sign(
    { uid: rows[0].id, role: rows[0].role },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );

  // Rotar la cookie de refresh con sv actualizado
  const newRefreshToken = jwt.sign(
    { uid: rows[0].id, sv: currentSv },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );
  res.cookie('crt', newRefreshToken, REFRESH_COOKIE_OPTS);

  res.json({ token: newToken });
}));

// Cerrar sesión — elimina la cookie del refresh token
router.post('/logout', asyncHandler(async (req, res) => {
  res.clearCookie('crt', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/auth',
  });
  res.json({ ok: true });
}));

module.exports = router;
