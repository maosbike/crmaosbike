const router = require('express').Router();
const db = require('../config/db');
const { auth } = require('../middleware/auth');

router.use(auth);

// ═══════════════════════════════════════════════════
// STATS DE GESTIÓN COMERCIAL
// GET /api/dashboard/commercial
// ═══════════════════════════════════════════════════
router.get('/commercial', async (req, res) => {
  try {
    const isVendedor = req.user.role === 'vendedor';
    const userId = req.user.id;

    // Filtro base según rol
    const userFilter = isVendedor ? 'AND t.assigned_to = $1' : '';
    const params = isVendedor ? [userId] : [];

    // 1. Leads sin tocar (sin first_action_at, activos)
    const { rows: [sinTocar] } = await db.query(
      `SELECT COUNT(*) as count FROM tickets t
       WHERE t.status NOT IN ('ganado','perdido','cerrado')
       AND t.first_action_at IS NULL ${userFilter}`,
      params
    );

    // 2. Leads próximos a vencer SLA
    const { rows: [proxVencer] } = await db.query(
      `SELECT COUNT(*) as count FROM tickets t
       WHERE t.sla_status = 'warning' ${userFilter}`,
      params
    );

    // 3. Leads SLA vencido
    const { rows: [vencidos] } = await db.query(
      `SELECT COUNT(*) as count FROM tickets t
       WHERE t.sla_status = 'breached' ${userFilter}`,
      params
    );

    // 4. Reasignados hoy
    const { rows: [reasignadosHoy] } = await db.query(
      `SELECT COUNT(*) as count FROM reassignment_log rl
       ${isVendedor ? 'WHERE (rl.from_user_id = $1 OR rl.to_user_id = $1)' : 'WHERE 1=1'}
       AND DATE(rl.created_at) = CURRENT_DATE`,
      params
    );

    // 5. Recordatorios de hoy
    const { rows: [remHoy] } = await db.query(
      `SELECT COUNT(*) as count FROM reminders r
       WHERE r.due_date = CURRENT_DATE
       AND r.status = 'pending'
       ${isVendedor ? 'AND r.assigned_to = $1' : ''}`,
      params
    );

    // 6. Recordatorios vencidos
    const { rows: [remVencidos] } = await db.query(
      `SELECT COUNT(*) as count FROM reminders r
       WHERE r.status = 'overdue'
       ${isVendedor ? 'AND r.assigned_to = $1' : ''}`,
      params
    );

    // 7. Leads urgentes (ordenados por tiempo restante SLA)
    const { rows: urgentes } = await db.query(
      `SELECT t.id, t.ticket_number, t.first_name, t.last_name,
              t.sla_deadline, t.sla_status, t.assigned_to,
              u.first_name as seller_first, u.last_name as seller_last,
              EXTRACT(EPOCH FROM (t.sla_deadline - NOW())) / 3600 as hours_left
       FROM tickets t
       LEFT JOIN users u ON t.assigned_to = u.id
       WHERE t.status NOT IN ('ganado','perdido','cerrado')
       AND t.sla_status IN ('normal','warning','breached')
       AND t.first_action_at IS NULL
       ${userFilter}
       ORDER BY t.sla_deadline ASC
       LIMIT 10`,
      params
    );

    // 8. Recordatorios de hoy (lista)
    const { rows: remHoyList } = await db.query(
      `SELECT r.*, t.ticket_number, t.first_name as client_first, t.last_name as client_last
       FROM reminders r
       LEFT JOIN tickets t ON r.ticket_id = t.id
       WHERE r.due_date = CURRENT_DATE AND r.status = 'pending'
       ${isVendedor ? 'AND r.assigned_to = $1' : ''}
       ORDER BY r.due_time ASC NULLS LAST
       LIMIT 10`,
      params
    );

    res.json({
      stats: {
        sin_tocar: parseInt(sinTocar.count),
        prox_vencer: parseInt(proxVencer.count),
        vencidos: parseInt(vencidos.count),
        reasignados_hoy: parseInt(reasignadosHoy.count),
        recordatorios_hoy: parseInt(remHoy.count),
        recordatorios_vencidos: parseInt(remVencidos.count)
      },
      leads_urgentes: urgentes,
      recordatorios_hoy: remHoyList
    });
  } catch (e) {
    console.error('Error dashboard commercial:', e);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;
