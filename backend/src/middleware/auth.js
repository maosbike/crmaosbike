const jwt = require('jsonwebtoken');
const db = require('../config/db');

const auth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer '))
      return res.status(401).json({ error: 'Token requerido' });

    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    const { rows } = await db.query(
      'SELECT id, email, first_name, last_name, role, branch_id, active FROM users WHERE id = $1',
      [decoded.uid]
    );
    if (!rows[0] || !rows[0].active)
      return res.status(401).json({ error: 'Usuario inválido' });

    req.user = rows[0];
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token inválido' });
  }
};

const roleCheck = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role))
    return res.status(403).json({ error: 'Sin permisos' });
  next();
};

module.exports = { auth, roleCheck };
