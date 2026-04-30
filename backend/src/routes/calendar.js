const router = require('express').Router();
const db = require('../config/db');
const { auth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

router.use(auth);

// ═══════════════════════════════════════════════════
// EVENTOS DEL CALENDARIO
// GET /api/calendar/events?start=2026-03-01&end=2026-03-31&user_id=5&branch_id=1
// ═══════════════════════════════════════════════════
router.get('/events', asyncHandler(async (req, res) => {
    const { start, end, user_id, branch_id } = req.query;

    if (!start || !end) {
      return res.status(400).json({ error: 'start y end son requeridos' });
    }

    const events = [];

    // 1. RECORDATORIOS
    let remQuery = `
      SELECT r.id, r.title, r.description, r.due_date, r.due_time,
             r.priority, r.status, r.reminder_type, r.ticket_id,
             r.assigned_to,
             u.first_name as assigned_name,
             t.ticket_num as ticket_number,
             NULLIF(TRIM(CONCAT_WS(' ', t.first_name, t.last_name)), '') as client_name
      FROM reminders r
      LEFT JOIN users u ON r.assigned_to = u.id
      LEFT JOIN tickets t ON r.ticket_id = t.id
      WHERE r.due_date >= $1 AND r.due_date <= $2
    `;
    const remParams = [start, end];

    if (req.user.role === 'vendedor') {
      remParams.push(req.user.id);
      remQuery += ` AND r.assigned_to = $${remParams.length}`;
    } else if (user_id) {
      remParams.push(user_id);
      remQuery += ` AND r.assigned_to = $${remParams.length}`;
    }
    // admin_comercial: solo ve recordatorios de su sucursal (vía ticket).
    if (req.user.role === 'admin_comercial' && req.user.branch_id) {
      remParams.push(req.user.branch_id);
      remQuery += ` AND (t.branch_id = $${remParams.length} OR r.ticket_id IS NULL)`;
    }

    const { rows: reminders } = await db.query(remQuery, remParams);

    const colorMap = {
      pending: '#3B82F6',
      completed: '#10B981',
      overdue: '#EF4444'
    };

    for (const r of reminders) {
      const dateStr = String(r.due_date).split('T')[0];
      const timeStr = r.due_time ? String(r.due_time).slice(0, 5) : null;
      events.push({
        id: `rem-${r.id}`,
        title: r.title,
        start: timeStr ? `${dateStr}T${timeStr}` : dateStr,
        date: dateStr,
        time: timeStr,
        allDay: !r.due_time,
        color: colorMap[r.status] || '#3B82F6',
        type: 'reminder',
        subtype: r.reminder_type,
        status: r.status,
        priority: r.priority,
        link_type: 'ticket',
        link_id: r.ticket_id,
        ticket_id: r.ticket_id,
        reminder_id: r.id,
        meta: {
          assigned_name: r.assigned_name,
          assigned_to: r.assigned_to,
          ticket_number: r.ticket_number,
          client_name: r.client_name,
          description: r.description
        }
      });
    }

    // 2. VENCIMIENTOS SLA (tickets activos con SLA próximo)
    const SLA_LABELS = {
      normal: 'Sin gestionar',
      warning: 'Atender ya',
      breached: 'Vencido',
      reassigned: 'Reasignado'
    };

    const slaColors = {
      normal: '#6B7280',
      warning: '#F97316',
      breached: '#EF4444',
      reassigned: '#8B5CF6'
    };

    let slaQuery = `
      SELECT t.id, t.ticket_num as ticket_number, t.sla_deadline, t.sla_status,
             t.first_name as client_first, t.last_name as client_last,
             t.assigned_to, t.branch_id,
             u.first_name as seller_name
      FROM tickets t
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.status NOT IN ('ganado', 'perdido')
        AND t.sla_deadline IS NOT NULL
        AND DATE(t.sla_deadline) >= $1
        AND DATE(t.sla_deadline) <= $2
    `;
    const slaParams = [start, end];

    if (req.user.role === 'vendedor') {
      slaParams.push(req.user.id);
      slaQuery += ` AND t.assigned_to = $${slaParams.length}`;
    } else if (user_id) {
      slaParams.push(user_id);
      slaQuery += ` AND t.assigned_to = $${slaParams.length}`;
    }
    // admin_comercial: scope a su sucursal — el query param branch_id solo se respeta
    // si coincide con la suya.
    if (req.user.role === 'admin_comercial' && req.user.branch_id) {
      slaParams.push(req.user.branch_id);
      slaQuery += ` AND t.branch_id = $${slaParams.length}`;
    } else if (branch_id) {
      slaParams.push(branch_id);
      slaQuery += ` AND t.branch_id = $${slaParams.length}`;
    }

    const { rows: slaTickets } = await db.query(slaQuery, slaParams);

    for (const t of slaTickets) {
      const dl = t.sla_deadline ? new Date(t.sla_deadline) : null;
      const dateStr = dl ? dl.toISOString().split('T')[0] : null;
      const timeStr = dl ? dl.toISOString().split('T')[1].slice(0, 5) : null;
      const label = SLA_LABELS[t.sla_status] || 'Sin gestionar';
      const clientName = `${t.client_first || ''} ${t.client_last || ''}`.trim();
      events.push({
        id: `sla-${t.id}`,
        title: `${label}: ${clientName} · ${t.ticket_number}`,
        start: t.sla_deadline,
        date: dateStr,
        time: timeStr,
        allDay: false,
        color: slaColors[t.sla_status] || '#6B7280',
        type: 'sla',
        status: t.sla_status,
        sla_label: label,
        link_type: 'ticket',
        link_id: t.id,
        ticket_id: t.id,
        meta: {
          seller_name: t.seller_name,
          ticket_number: t.ticket_number,
          client_name: clientName
        }
      });
    }

    res.json(events);
}));

module.exports = router;
