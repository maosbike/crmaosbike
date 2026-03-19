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

// DELETE /api/admin/reset-imports
// Borra solo los tickets que entraron vía importación masiva (source = 'importacion')
// y los import_logs. No toca tickets creados manualmente.
router.delete('/reset-imports', async (req, res) => {
  try {
    await db.query('BEGIN');

    // IDs de tickets importados
    const { rows: ids } = await db.query(
      `SELECT id FROM tickets WHERE source = 'importacion'`
    );
    const ticketIds = ids.map(r => r.id);

    if (ticketIds.length > 0) {
      const list = ticketIds.map((_, i) => `$${i + 1}`).join(',');
      await db.query(`DELETE FROM reassignment_log WHERE ticket_id IN (${list})`, ticketIds);
      await db.query(`DELETE FROM notifications   WHERE ticket_id IN (${list})`, ticketIds);
      await db.query(`DELETE FROM reminders       WHERE ticket_id IN (${list})`, ticketIds);
      await db.query(`DELETE FROM timeline        WHERE ticket_id IN (${list})`, ticketIds);
      await db.query(`DELETE FROM tickets         WHERE id        IN (${list})`, ticketIds);
    }

    await db.query('DELETE FROM import_logs');

    await db.query('COMMIT');

    console.log(`[admin] reset-imports: ${ticketIds.length} tickets eliminados por user ${req.user.id}`);
    res.json({ ok: true, deleted: ticketIds.length, message: `${ticketIds.length} tickets importados eliminados.` });
  } catch (e) {
    await db.query('ROLLBACK');
    console.error('reset-imports error:', e);
    res.status(500).json({ error: 'Error al limpiar imports: ' + e.message });
  }
});

module.exports = router;
