const router = require('express').Router();
const db = require('../config/db');
const { auth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

router.use(auth);

// ═══════════════════════════════════════════════════
// STATS DE GESTIÓN COMERCIAL
// GET /api/dashboard/commercial
// ═══════════════════════════════════════════════════
router.get('/commercial', asyncHandler(async (req, res) => {
    const isVendedor = req.user.role === 'vendedor';
    const isAdminComercial = req.user.role === 'admin_comercial' && req.user.branch_id;
    const userId = req.user.id;

    // Filtro base según rol.
    // - vendedor → sólo lo asignado a él (param $1)
    // - admin_comercial → sólo su sucursal (param $1)
    // - super_admin / backoffice → sin filtro
    let userFilter = '';
    let params = [];
    let userFilterReminders = '';
    let userFilterReassign = '';
    if (isVendedor) {
      userFilter = 'AND t.assigned_to = $1';
      userFilterReminders = 'AND r.assigned_to = $1';
      userFilterReassign = 'AND (rl.from_user_id = $1 OR rl.to_user_id = $1)';
      params = [userId];
    } else if (isAdminComercial) {
      userFilter = 'AND t.branch_id = $1';
      // Reminders y reassign no tienen branch directo: scope vía ticket asociado.
      userFilterReminders = 'AND (r.ticket_id IS NULL OR EXISTS (SELECT 1 FROM tickets tt WHERE tt.id = r.ticket_id AND tt.branch_id = $1))';
      userFilterReassign  = 'AND EXISTS (SELECT 1 FROM tickets tt WHERE tt.id = rl.ticket_id AND tt.branch_id = $1)';
      params = [req.user.branch_id];
    }

    // 1. Leads sin tocar (sin first_action_at, activos)
    const { rows: [sinTocar] } = await db.query(
      `SELECT COUNT(*) as count FROM tickets t
       WHERE t.status NOT IN ('ganado','perdido')
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
       WHERE 1=1 ${userFilterReassign}
       AND DATE(rl.created_at) = CURRENT_DATE`,
      params
    );

    // 5. Recordatorios de hoy
    const { rows: [remHoy] } = await db.query(
      `SELECT COUNT(*) as count FROM reminders r
       WHERE r.due_date = CURRENT_DATE
       AND r.status = 'pending'
       ${userFilterReminders}`,
      params
    );

    // 6. Recordatorios vencidos
    const { rows: [remVencidos] } = await db.query(
      `SELECT COUNT(*) as count FROM reminders r
       WHERE r.status = 'overdue'
       ${userFilterReminders}`,
      params
    );

    // 7. Leads urgentes (ordenados por tiempo restante SLA)
    const { rows: urgentes } = await db.query(
      `SELECT t.id, t.ticket_num as ticket_number, t.first_name, t.last_name,
              t.sla_deadline, t.sla_status, t.assigned_to,
              u.first_name as seller_first, u.last_name as seller_last,
              EXTRACT(EPOCH FROM (t.sla_deadline - NOW())) / 3600 as hours_left
       FROM tickets t
       LEFT JOIN users u ON t.assigned_to = u.id
       WHERE t.status NOT IN ('ganado','perdido')
       AND t.sla_status IN ('normal','warning','breached')
       AND t.first_action_at IS NULL
       ${userFilter}
       ORDER BY t.sla_deadline ASC
       LIMIT 10`,
      params
    );

    // 8. Recordatorios de hoy (lista)
    const { rows: remHoyList } = await db.query(
      `SELECT r.*, t.ticket_num as ticket_number, t.first_name as client_first, t.last_name as client_last
       FROM reminders r
       LEFT JOIN tickets t ON r.ticket_id = t.id
       WHERE r.due_date = CURRENT_DATE AND r.status = 'pending'
       ${userFilterReminders}
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
}));

module.exports = router;
