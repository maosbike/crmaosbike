const router = require('express').Router();
const db = require('../config/db');
const { auth, roleCheck } = require('../middleware/auth');
const SLAService = require('../services/slaService');

router.use(auth);

// ═══════════════════════════════════════════════════
// HISTORIAL DE REASIGNACIONES DE UN TICKET
// GET /api/reassignments/ticket/:ticketId
// ═══════════════════════════════════════════════════
router.get('/ticket/:ticketId', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT rl.*,
              uf.first_name as from_first, uf.last_name as from_last,
              ut.first_name as to_first, ut.last_name as to_last,
              ur.first_name as by_first, ur.last_name as by_last
       FROM reassignment_log rl
       LEFT JOIN users uf ON rl.from_user_id = uf.id
       LEFT JOIN users ut ON rl.to_user_id = ut.id
       LEFT JOIN users ur ON rl.reassigned_by = ur.id
       WHERE rl.ticket_id = $1
       ORDER BY rl.created_at DESC`,
      [req.params.ticketId]
    );
    res.json(rows);
  } catch (e) {
    console.error('Error listar reasignaciones:', e);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ═══════════════════════════════════════════════════
// REASIGNACIÓN MANUAL (solo admins)
// POST /api/reassignments/manual
// ═══════════════════════════════════════════════════
router.post('/manual', roleCheck('super_admin', 'admin_comercial'), async (req, res) => {
  try {
    const { ticket_id, to_user_id } = req.body;

    if (!ticket_id || !to_user_id) {
      return res.status(400).json({ error: 'ticket_id y to_user_id son requeridos' });
    }

    // Obtener ticket
    const { rows: tickets } = await db.query('SELECT * FROM tickets WHERE id = $1', [ticket_id]);
    if (!tickets[0]) return res.status(404).json({ error: 'Ticket no encontrado' });

    const ticket = tickets[0];

    // Obtener nombres
    const { rows: fromUser } = await db.query('SELECT first_name, last_name FROM users WHERE id = $1', [ticket.assigned_to]);
    const { rows: toUser } = await db.query('SELECT first_name, last_name FROM users WHERE id = $1', [to_user_id]);

    if (!toUser[0]) return res.status(404).json({ error: 'Vendedor destino no encontrado' });

    const newDeadline = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();

    // Actualizar ticket
    await db.query(
      `UPDATE tickets SET
        assigned_to = $1,
        sla_status = 'reassigned',
        sla_deadline = $2,
        first_action_at = NULL,
        reassignment_count = reassignment_count + 1
       WHERE id = $3`,
      [to_user_id, newDeadline, ticket_id]
    );

    // Log
    await db.query(
      `INSERT INTO reassignment_log (ticket_id, from_user_id, to_user_id, reason, reassigned_by)
       VALUES ($1, $2, $3, 'manual', $4)`,
      [ticket_id, ticket.assigned_to, to_user_id, req.user.id]
    );

    // Timeline
    const fromName = fromUser[0] ? `${fromUser[0].first_name} ${fromUser[0].last_name}` : 'N/A';
    const toName = `${toUser[0].first_name} ${toUser[0].last_name}`;

    await db.query(
      `INSERT INTO timeline (ticket_id, user_id, type, title, note)
       VALUES ($1, $2, 'system', $3, $4)`,
      [
        ticket_id,
        req.user.id,
        `Reasignado manualmente a ${toName}`,
        `Antes: ${fromName}`
      ]
    );

    // Notificación
    const NotificationService = require('../services/notificationService');
    await NotificationService.reassigned(
      { ...ticket, client_name: `${ticket.first_name || ''} ${ticket.last_name || ''}` },
      to_user_id,
      fromName
    );

    res.json({ ok: true, message: `Reasignado a ${toName}` });
  } catch (e) {
    console.error('Error reasignar manual:', e);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ═══════════════════════════════════════════════════
// LOG GLOBAL DE REASIGNACIONES (admins)
// GET /api/reassignments?limit=20
// ═══════════════════════════════════════════════════
router.get('/', roleCheck('super_admin', 'admin_comercial'), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const { rows } = await db.query(
      `SELECT rl.*,
              t.ticket_num as ticket_number,
              uf.first_name as from_first, uf.last_name as from_last,
              ut.first_name as to_first, ut.last_name as to_last,
              ur.first_name as by_first, ur.last_name as by_last
       FROM reassignment_log rl
       LEFT JOIN tickets t ON rl.ticket_id = t.id
       LEFT JOIN users uf ON rl.from_user_id = uf.id
       LEFT JOIN users ut ON rl.to_user_id = ut.id
       LEFT JOIN users ur ON rl.reassigned_by = ur.id
       ORDER BY rl.created_at DESC
       LIMIT $1`,
      [limit]
    );
    res.json(rows);
  } catch (e) {
    console.error('Error listar reasignaciones global:', e);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;
