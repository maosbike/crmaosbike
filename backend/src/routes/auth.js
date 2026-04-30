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

// Hash dummy precomputado: sirve para que el tiempo de respuesta de un login con
// usuario inexistente sea similar al de un usuario válido con password equivocado.
// Mitiga enumeración de usuarios por timing.
const DUMMY_HASH = '$2a$12$CwTycUXWue0Thq9StjUM0uJ8i7jqM7N4aV1nCx/GWi.6oLm8mB6Lq';
const BCRYPT_ROUNDS = 12;

// Opciones de cookie para el refresh token — httpOnly impide lectura por JS (protección XSS)
const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production', // Solo HTTPS en prod
  sameSite: 'strict',
  path: '/api/auth',    // Cookie solo viaja a /api/auth/* — no a toda la API
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días en ms
};

// Bloqueo por usuario: tras N fallos seguidos, la cuenta queda bloqueada por X minutos
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  const identifier = typeof email === 'string' ? email.trim() : '';
  const pwd = typeof password === 'string' ? password : '';
  if (!identifier || !pwd) return res.status(400).json({ error: 'Email y contraseña requeridos' });
  // Defensa básica contra payloads abusivos (DoS de bcrypt, query bombs).
  if (identifier.length > 254 || pwd.length > 256) {
    return res.status(400).json({ error: 'Credenciales inválidas' });
  }

  // Lookup case-insensitive SÓLO por email.
  const { rows } = await db.query(
    `SELECT u.*, b.name as branch_name, b.code as branch_code
     FROM users u LEFT JOIN branches b ON u.branch_id = b.id
     WHERE LOWER(u.email) = LOWER($1)
     LIMIT 1`,
    [identifier]
  );
  const user = rows[0];

  // Mensaje y timing uniforme para todos los rechazos: no exponer si la cuenta
  // existe, está bloqueada o desactivada (anti-enumeración).
  const GENERIC = { status: 401, body: { error: 'Credenciales inválidas' } };

  // Si no existe el usuario, ejecutamos un compare contra el hash dummy para
  // emparejar el costo en CPU del flujo válido.
  if (!user) {
    await bcrypt.compare(pwd, DUMMY_HASH).catch(() => false);
    return res.status(GENERIC.status).json(GENERIC.body);
  }

  // Cuenta bloqueada/desactivada → mismo mensaje genérico, sin revelar el motivo.
  if (!user.active) {
    await bcrypt.compare(pwd, DUMMY_HASH).catch(() => false);
    return res.status(GENERIC.status).json(GENERIC.body);
  }
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    await bcrypt.compare(pwd, DUMMY_HASH).catch(() => false);
    return res.status(GENERIC.status).json(GENERIC.body);
  }

  const valid = await bcrypt.compare(pwd, user.password_hash);
  if (!valid) {
    const nextAttempts = (user.failed_login_attempts || 0) + 1;
    if (nextAttempts >= MAX_FAILED_ATTEMPTS) {
      await db.query(
        `UPDATE users SET failed_login_attempts = 0,
                         locked_until = NOW() + ($1 || ' minutes')::interval
         WHERE id = $2`,
        [String(LOCKOUT_MINUTES), user.id]
      );
    } else {
      await db.query(
        'UPDATE users SET failed_login_attempts = $1 WHERE id = $2',
        [nextAttempts, user.id]
      );
    }
    return res.status(GENERIC.status).json(GENERIC.body);
  }

  // Login exitoso — limpia contador y lockout, y rehash si el costo es bajo.
  if (user.failed_login_attempts > 0 || user.locked_until) {
    await db.query(
      'UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1',
      [user.id]
    );
  }
  try {
    if (bcrypt.getRounds(user.password_hash) < BCRYPT_ROUNDS) {
      const newHash = await bcrypt.hash(pwd, BCRYPT_ROUNDS);
      await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, user.id]);
    }
  } catch { /* getRounds puede fallar con hashes legacy — ignorar */ }

  const sv = user.session_version || 0;
  // Access token corto (15min) — incluye sv para invalidación inmediata.
  const token = jwt.sign(
    { uid: user.id, role: user.role, sv },
    process.env.JWT_SECRET,
    { expiresIn: '15m', algorithm: 'HS256' }
  );
  const refreshToken = jwt.sign(
    { uid: user.id, sv },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d', algorithm: 'HS256' }
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
    payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET, { algorithms: ['HS256'] });
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

  const currentSv = rows[0].session_version || 0;
  if ((payload.sv ?? 0) !== currentSv) {
    return res.status(401).json({ error: 'Sesión expirada, inicia sesión nuevamente' });
  }

  const newToken = jwt.sign(
    { uid: rows[0].id, role: rows[0].role, sv: currentSv },
    process.env.JWT_SECRET,
    { expiresIn: '15m', algorithm: 'HS256' }
  );
  const newRefreshToken = jwt.sign(
    { uid: rows[0].id, sv: currentSv },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d', algorithm: 'HS256' }
  );
  res.cookie('crt', newRefreshToken, REFRESH_COOKIE_OPTS);

  res.json({ token: newToken });
}));

// Cerrar sesión — invalida la sesión bumpeando session_version e elimina la cookie.
// Tras logout, ningún access/refresh token previo del usuario sirve.
router.post('/logout', asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.crt;
  if (refreshToken) {
    try {
      const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET, { algorithms: ['HS256'] });
      if (payload?.uid) {
        await db.query(
          'UPDATE users SET session_version = session_version + 1, updated_at = NOW() WHERE id = $1',
          [payload.uid]
        );
      }
    } catch { /* token inválido — solo limpiamos cookie */ }
  }
  res.clearCookie('crt', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/auth',
  });
  res.json({ ok: true });
}));

module.exports = router;
