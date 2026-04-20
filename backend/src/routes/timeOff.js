const router = require('express').Router();
const db = require('../config/db');
const { auth, roleCheck } = require('../middleware/auth');

router.use(auth);

// Timezone fijo para que "hoy" siempre sea el día calendario de Chile,
// sin importar el TZ del server. Se usa en la exclusión de asignación.
const TZ_SQL = `(NOW() AT TIME ZONE 'America/Santiago')::date`;

// Listar días libres en un rango (por default el mes en curso + siguiente)
// Incluye el nombre del vendedor para render directo en la UI.
router.get('/', roleCheck('super_admin', 'admin_comercial'), async (req, res) => {
  try {
    const { from, to, user_id } = req.query;
    const where = [];
    const params = [];
    let i = 1;
    if (from)    { where.push(`t.off_date >= $${i++}::date`); params.push(from); }
    if (to)      { where.push(`t.off_date <= $${i++}::date`); params.push(to); }
    if (user_id) { where.push(`t.user_id = $${i++}`);         params.push(user_id); }
    const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const { rows } = await db.query(
      `SELECT t.id, t.user_id, t.off_date, t.note, t.created_at,
              u.first_name, u.last_name, u.role, u.branch_id
         FROM user_time_off t
         JOIN users u ON u.id = t.user_id
         ${clause}
         ORDER BY t.off_date, u.first_name`,
      params
    );
    res.json(rows);
  } catch (e) {
    console.error('Error listar time-off:', e);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Marcar uno o varios días libres para un vendedor.
// Body: { user_id, dates: ['2026-04-22', ...], note? }
// Upsert por (user_id, off_date) — idempotente.
router.post('/', roleCheck('super_admin', 'admin_comercial'), async (req, res) => {
  try {
    const { user_id, dates, note } = req.body;
    if (!user_id || !Array.isArray(dates) || !dates.length) {
      return res.status(400).json({ error: 'user_id y dates[] son requeridos' });
    }
    const valid = dates.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));
    if (!valid.length) return res.status(400).json({ error: 'Fechas inválidas (YYYY-MM-DD)' });

    const u = await db.query('SELECT id FROM users WHERE id = $1 AND active = true', [user_id]);
    if (!u.rows[0]) return res.status(404).json({ error: 'Usuario no encontrado o inactivo' });

    const inserted = [];
    for (const d of valid) {
      const { rows } = await db.query(
        `INSERT INTO user_time_off (user_id, off_date, note, created_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, off_date) DO UPDATE SET note = EXCLUDED.note
         RETURNING id, user_id, off_date, note`,
        [user_id, d, note || null, req.user.id]
      );
      inserted.push(rows[0]);
    }
    res.status(201).json({ inserted, count: inserted.length });
  } catch (e) {
    console.error('Error crear time-off:', e);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Borrar un día libre específico
router.delete('/:id', roleCheck('super_admin', 'admin_comercial'), async (req, res) => {
  try {
    const { rowCount } = await db.query('DELETE FROM user_time_off WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true });
  } catch (e) {
    console.error('Error borrar time-off:', e);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Quiénes están libres HOY (útil para debug/banner en dashboard)
router.get('/today', roleCheck('super_admin', 'admin_comercial'), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT t.user_id, t.note, u.first_name, u.last_name, u.role, u.branch_id
         FROM user_time_off t
         JOIN users u ON u.id = t.user_id
        WHERE t.off_date = ${TZ_SQL}
        ORDER BY u.first_name`
    );
    res.json(rows);
  } catch (e) {
    console.error('Error listar libres de hoy:', e);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;
