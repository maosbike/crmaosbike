const router = require('express').Router();
const db = require('../config/db');
const { auth, roleCheck } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const SLAService = require('../services/slaService');
const { calcSlaDeadline } = require('../utils/slaUtils');

router.use(auth);

// ═══════════════════════════════════════════════════
// HISTORIAL COMPLETO DE ASIGNACIÓN DE UN TICKET
// GET /api/reassignments/ticket/:ticketId
// Devuelve timeline unificado: asignación inicial + cada reasignación
// con duración calculada por período
// ═══════════════════════════════════════════════════
const REASON_LABELS = {
  initial_assignment: 'Asignación inicial',
  sla_breach:         'SLA vencido (automático)',
  manual:             'Reasignación manual',
};

function formatDuration(ms) {
  if (ms < 0) ms = 0;
  const min = Math.floor(ms / 60000);
  const h   = Math.floor(min / 60);
  const d   = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${min % 60}min`;
  return `${min}min`;
}

router.get('/ticket/:ticketId', asyncHandler(async (req, res) => {
    // 1. Datos base del ticket (vendedor actual)
    const { rows: tRows } = await db.query(
      `SELECT t.created_at, t.assigned_to, t.seller_id, t.sla_status,
              t.first_action_at, t.reassignment_count, t.sla_deadline, t.branch_id,
              u.first_name as cur_fn, u.last_name as cur_ln
       FROM tickets t
       LEFT JOIN users u ON t.assigned_to = u.id
       WHERE t.id = $1`,
      [req.params.ticketId]
    );
    if (!tRows[0]) return res.status(404).json({ error: 'Ticket no encontrado' });

    // Ownership check: vendedor solo puede ver historial de sus propios tickets
    if (req.user.role === 'vendedor') {
      const tk = tRows[0];
      if (tk.seller_id !== req.user.id && tk.assigned_to !== req.user.id) {
        return res.status(403).json({ error: 'Sin permiso para ver este ticket' });
      }
    }
    // admin_comercial solo puede ver historial de tickets de su sucursal
    if (req.user.role === 'admin_comercial') {
      const tk = tRows[0];
      if (tk.branch_id !== req.user.branch_id) {
        return res.status(403).json({ error: 'Sin permiso para ver este ticket' });
      }
    }
    const tk = tRows[0];

    // 2. Todos los logs de reassignment_log en orden ASC
    const { rows: logs } = await db.query(
      `SELECT rl.*,
              uf.first_name as from_first, uf.last_name as from_last,
              ut.first_name as to_first,   ut.last_name as to_last,
              ur.first_name as by_first,   ur.last_name as by_last
       FROM reassignment_log rl
       LEFT JOIN users uf ON rl.from_user_id = uf.id
       LEFT JOIN users ut ON rl.to_user_id   = ut.id
       LEFT JOIN users ur ON rl.reassigned_by = ur.id
       WHERE rl.ticket_id = $1
       ORDER BY rl.created_at ASC`,
      [req.params.ticketId]
    );

    // 3. Construir historia unificada
    const history = [];

    const hasInitLog = logs.length > 0 && logs[0].reason === 'initial_assignment';

    if (hasInitLog) {
      // Tenemos log explícito de asignación inicial
      const init = logs[0];
      history.push({
        id: init.id, type: 'initial_assignment',
        from_name: null,
        to_name: [init.to_first, init.to_last].filter(Boolean).join(' ') || 'Sin asignar',
        reason: 'initial_assignment',
        reason_label: REASON_LABELS.initial_assignment,
        by_name: init.by_first ? `${init.by_first} ${init.by_last||''}`.trim() : 'Sistema',
        created_at: init.created_at,
      });
      for (const r of logs.slice(1)) {
        history.push(buildEvent(r));
      }
    } else {
      // Sin log inicial — inferir desde los datos del ticket
      let initName, initUserId;
      if (logs.length > 0 && logs[0].from_user_id) {
        // El primer "from" del log es el seller original
        initName   = [logs[0].from_first, logs[0].from_last].filter(Boolean).join(' ');
        initUserId = logs[0].from_user_id;
      } else {
        // Sin reasignaciones: el asignado actual ES el inicial
        initName   = [tk.cur_fn, tk.cur_ln].filter(Boolean).join(' ');
        initUserId = tk.assigned_to || tk.seller_id;
      }
      history.push({
        id: 'initial', type: 'initial_assignment',
        from_name: null,
        to_name: initName || 'Sin asignar',
        to_user_id: initUserId,
        reason: 'initial_assignment',
        reason_label: REASON_LABELS.initial_assignment,
        by_name: 'Sistema',
        created_at: tk.created_at,
      });
      for (const r of logs) history.push(buildEvent(r));
    }

    // 4. Calcular duración de cada período
    const now = new Date();
    for (let i = 0; i < history.length; i++) {
      const start = new Date(history[i].created_at);
      const end   = i + 1 < history.length ? new Date(history[i + 1].created_at) : now;
      history[i].duration_ms    = Math.max(0, end - start);
      history[i].duration_label = formatDuration(history[i].duration_ms);
      history[i].is_current     = (i === history.length - 1);
    }

    res.json(history);
}));

function buildEvent(r) {
  return {
    id: r.id, type: 'reassignment',
    from_name: [r.from_first, r.from_last].filter(Boolean).join(' ') || 'Desconocido',
    to_name:   [r.to_first,   r.to_last  ].filter(Boolean).join(' ') || 'Desconocido',
    from_user_id: r.from_user_id,
    to_user_id:   r.to_user_id,
    reason:       r.reason,
    reason_label: REASON_LABELS[r.reason] || r.reason || 'Sistema',
    by_name: r.by_first ? `${r.by_first} ${r.by_last||''}`.trim() : 'Sistema automático',
    created_at: r.created_at,
  };
}

// ═══════════════════════════════════════════════════
// REASIGNACIÓN MANUAL (solo admins)
// POST /api/reassignments/manual
// ═══════════════════════════════════════════════════
router.post('/manual', roleCheck('super_admin', 'admin_comercial'), asyncHandler(async (req, res) => {
    const { ticket_id, to_user_id } = req.body;

    if (!ticket_id || !to_user_id) {
      return res.status(400).json({ error: 'ticket_id y to_user_id son requeridos' });
    }

    // Obtener ticket (enriquecido con branch y moto para notificaciones)
    const { rows: tickets } = await db.query(
      `SELECT t.*, b.name AS branch_name,
              m.brand AS moto_brand, m.model AS moto_model
       FROM tickets t
       LEFT JOIN branches b ON b.id = t.branch_id
       LEFT JOIN moto_models m ON m.id = t.model_id
       WHERE t.id = $1`,
      [ticket_id]
    );
    if (!tickets[0]) return res.status(404).json({ error: 'Ticket no encontrado' });

    const ticket = tickets[0];

    // admin_comercial sólo puede reasignar tickets dentro de su sucursal,
    // y sólo a usuarios de su sucursal.
    if (req.user.role === 'admin_comercial') {
      if (req.user.branch_id && ticket.branch_id !== req.user.branch_id) {
        return res.status(403).json({ error: 'No podés reasignar tickets de otra sucursal' });
      }
    }

    // Obtener nombres
    const { rows: fromUser } = await db.query('SELECT first_name, last_name FROM users WHERE id = $1', [ticket.assigned_to]);
    const { rows: toUser } = await db.query('SELECT first_name, last_name, telegram_chat_id, branch_id FROM users WHERE id = $1 AND active = true', [to_user_id]);

    if (!toUser[0]) return res.status(404).json({ error: 'Vendedor destino no encontrado' });

    if (req.user.role === 'admin_comercial' &&
        req.user.branch_id &&
        toUser[0].branch_id !== req.user.branch_id) {
      return res.status(403).json({ error: 'Solo podés reasignar a usuarios de tu sucursal' });
    }

    const newDeadline = calcSlaDeadline().toISOString();

    // Actualizar ticket.
    // first_action_at: se preserva si ya había gestión real previa (contacto o evidencia).
    // Solo se resetea si el lead nunca fue contactado antes (NULL → NULL).
    // La reasignación automática por SLA sí resetea (porque ocurre exactamente por falta de contacto).
    await db.query(
      `UPDATE tickets SET
        assigned_to = $1,
        sla_status = 'reassigned',
        sla_deadline = $2,
        first_action_at = CASE WHEN first_action_at IS NOT NULL THEN first_action_at ELSE NULL END,
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

    // Notificación in-app
    const NotificationService = require('../services/notificationService');
    await NotificationService.reassigned(
      ticket,
      to_user_id,
      fromName
    );

    // Telegram (fire-and-forget)
    if (toUser[0]?.telegram_chat_id) {
      const TelegramService = require('../services/telegramService');
      TelegramService.notifyReassigned(ticket, toUser[0], fromName, 'manual')
        .catch((e) => console.warn('[Telegram] manual reassign error:', e.message));
    }

    res.json({ ok: true, message: `Reasignado a ${toName}` });
}));

// ═══════════════════════════════════════════════════
// LOG GLOBAL DE REASIGNACIONES (admins)
// GET /api/reassignments?limit=20
// ═══════════════════════════════════════════════════
router.get('/', roleCheck('super_admin', 'admin_comercial'), asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    const params = [limit];
    let branchFilter = '';
    // admin_comercial solo ve reasignaciones de tickets de su propia sucursal
    if (req.user.role === 'admin_comercial') {
      params.push(req.user.branch_id);
      branchFilter = `AND t.branch_id = $${params.length}`;
    }
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
       WHERE 1=1 ${branchFilter}
       ORDER BY rl.created_at DESC
       LIMIT $1`,
      params
    );
    res.json(rows);
}));

module.exports = router;
