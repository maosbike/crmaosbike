const router = require('express').Router();
const db = require('../config/db');
const { auth, roleCheck } = require('../middleware/auth');

router.use(auth);
router.use(roleCheck('super_admin'));

// DELETE /api/admin/reset-data
// Borra toda la data transaccional de prueba.
// Conserva: users, branches, moto_models.
router.delete('/reset-data', async (req, res) => {
  try {
    await db.query('BEGIN');

    // Orden FK-safe
    await db.query('DELETE FROM reassignment_log');
    await db.query('DELETE FROM notifications');
    await db.query('DELETE FROM reminders');
    await db.query('DELETE FROM timeline');
    await db.query('DELETE FROM import_logs');
    await db.query('DELETE FROM tickets');
    await db.query('DELETE FROM inventory');

    await db.query('COMMIT');

    console.log(`[admin] reset-data ejecutado por user ${req.user.id}`);
    res.json({ ok: true, message: 'Data de prueba eliminada correctamente.' });
  } catch (e) {
    await db.query('ROLLBACK');
    console.error('reset-data error:', e);
    res.status(500).json({ error: 'Error al limpiar datos: ' + e.message });
  }
});

module.exports = router;
