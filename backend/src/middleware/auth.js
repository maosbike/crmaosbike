const jwt = require('jsonwebtoken');
const db = require('../config/db');

const auth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer '))
      return res.status(401).json({ error: 'Token requerido' });

    const token = header.slice(7).trim();
    if (!token) return res.status(401).json({ error: 'Token requerido' });

    // Forzamos HS256 explícitamente para evitar alg-confusion (alg:none, RS/HS).
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

    const { rows } = await db.query(
      `SELECT id, email, first_name, last_name, role, branch_id, active,
              session_version, force_password_change
         FROM users WHERE id = $1`,
      [decoded.uid]
    );
    const u = rows[0];
    if (!u || !u.active)
      return res.status(401).json({ error: 'Usuario inválido' });

    // Si el access token no trae sv o no coincide → invalidado por logout/cambio de pass.
    if ((decoded.sv ?? null) !== (u.session_version ?? 0)) {
      return res.status(401).json({ error: 'Sesión expirada' });
    }

    // Enforce force_password_change server-side: solo se permite cambiar la contraseña.
    if (u.force_password_change) {
      const path = req.originalUrl.split('?')[0];
      const allowed = path === '/api/users/change-password' || path === '/api/auth/me' || path === '/api/auth/logout';
      if (!allowed) {
        return res.status(403).json({ error: 'Debes cambiar tu contraseña antes de continuar', forceChange: true });
      }
    }

    req.user = u;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token inválido' });
  }
};

const roleCheck = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'No autenticado' });
  if (!roles.includes(req.user.role))
    return res.status(403).json({ error: 'Sin permisos' });
  next();
};

// Helper: ¿es admin global con visibilidad total?
const isAdminGlobal = (user) =>
  user && (user.role === 'super_admin' || user.role === 'admin_comercial' || user.role === 'backoffice');

module.exports = { auth, roleCheck, isAdminGlobal };
