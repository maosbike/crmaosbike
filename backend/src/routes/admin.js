const router = require('express').Router();
const db = require('../config/db');
const { auth, roleCheck } = require('../middleware/auth');

router.use(auth);
router.use(roleCheck('super_admin'));

// DELETE /api/admin/reset-data
// Borra toda la data transaccional de prueba.
// Conserva: users, branches, moto_models.
router.delete('/reset-data', async (req, res) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Orden FK-safe
    await client.query('DELETE FROM reassignment_log');
    await client.query('DELETE FROM notifications');
    await client.query('DELETE FROM reminders');
    await client.query('DELETE FROM timeline');
    await client.query('DELETE FROM import_logs');
    await client.query('DELETE FROM tickets');
    await client.query('DELETE FROM inventory');

    await client.query('COMMIT');

    console.log(`[admin] reset-data ejecutado por user ${req.user.id}`);
    res.json({ ok: true, message: 'Data de prueba eliminada correctamente.' });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('reset-data error:', e);
    res.status(500).json({ error: 'Error al limpiar datos: ' + e.message });
  } finally {
    client.release();
  }
});

// DELETE /api/admin/reset-imports
// Borra solo los tickets que entraron vía importación masiva (source = 'importacion')
// y los import_logs. No toca tickets creados manualmente.
router.delete('/reset-imports', async (req, res) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // IDs de tickets importados
    const { rows: ids } = await client.query(
      `SELECT id FROM tickets WHERE source = 'importacion'`
    );
    const ticketIds = ids.map(r => r.id);

    if (ticketIds.length > 0) {
      const list = ticketIds.map((_, i) => `$${i + 1}`).join(',');
      await client.query(`DELETE FROM reassignment_log WHERE ticket_id IN (${list})`, ticketIds);
      await client.query(`DELETE FROM notifications   WHERE ticket_id IN (${list})`, ticketIds);
      await client.query(`DELETE FROM reminders       WHERE ticket_id IN (${list})`, ticketIds);
      await client.query(`DELETE FROM timeline        WHERE ticket_id IN (${list})`, ticketIds);
      await client.query(`DELETE FROM tickets         WHERE id        IN (${list})`, ticketIds);
    }

    await client.query('DELETE FROM import_logs');

    await client.query('COMMIT');

    console.log(`[admin] reset-imports: ${ticketIds.length} tickets eliminados por user ${req.user.id}`);
    res.json({ ok: true, deleted: ticketIds.length, message: `${ticketIds.length} tickets importados eliminados.` });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('reset-imports error:', e);
    res.status(500).json({ error: 'Error al limpiar imports: ' + e.message });
  } finally {
    client.release();
  }
});

// DELETE /api/admin/reset-catalog
// Desactiva (soft delete) todos los modelos del catálogo y borra los precios importados.
router.delete('/reset-catalog', async (req, res) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM moto_prices');
    await client.query('DELETE FROM price_import_logs');
    const { rowCount } = await client.query('UPDATE moto_models SET active = false, updated_at = NOW()');
    await client.query('COMMIT');
    console.log(`[admin] reset-catalog: ${rowCount} modelos desactivados por user ${req.user.id}`);
    res.json({ ok: true, deleted: rowCount });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('reset-catalog error:', e);
    res.status(500).json({ error: 'Error al limpiar catálogo: ' + e.message });
  } finally {
    client.release();
  }
});

module.exports = router;
