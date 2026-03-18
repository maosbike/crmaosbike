const router = require('express').Router();
const db = require('../config/db');
const { auth, roleCheck } = require('../middleware/auth');
const SLAService = require('../services/slaService');

router.use(auth);

// ═══════════════════════════════════════════════════
// LISTAR RECORDATORIOS
// GET /api/reminders?ticket_id=X&status=pending&my=true
// ═══════════════════════════════════════════════════
router.get('/', async (req, res) => {
  try {
    const { ticket_id, status, my, date_from, date_to } = req.query;
    let query = `
      SELECT r.*,
             u_creator.first_name as creator_first_name,
             u_creator.last_name as creator_last_name,
             u_assigned.first_name as assigned_first_name,
             u_assigned.last_name as assigned_last_name,
             t.ticket_number, t.first_name as client_first_name, t.last_name as client_last_name
      FROM reminders r
      LEFT JOIN users u_creator ON r.created_by = u_creator.id
      LEFT JOIN users u_assigned ON r.assigned_to = u_assigned.id
      LEFT JOIN tickets t ON r.ticket_id = t.id
      WHERE 1=1
    `;
    const params = [];

    // Vendedores solo ven los suyos
    if (req.user.role === 'vendedor') {
      params.push(req.user.id);
      query += ` AND r.assigned_to = $${params.length}`;
    } else if (my === 'true') {
      params.push(req.user.id);
      query += ` AND r.assigned_to = $${params.length}`;
    }

    if (ticket_id) {
      params.push(ticket_id);
      query += ` AND r.ticket_id = $${params.length}`;
    }

    if (status) {
      params.push(status);
      query += ` AND r.status = $${params.length}`;
    }

    if (date_from) {
      params.push(date_from);
      query += ` AND r.due_date >= $${params.length}`;
    }

    if (date_to) {
      params.push(date_to);
      query += ` AND r.due_date <= $${params.length}`;
    }

    query += ` ORDER BY r.due_date ASC, r.due_time ASC NULLS LAST`;

    const { rows } = await db.query(query, params);
    res.json(rows);
  } catch (e) {
    console.error('Error listar reminders:', e);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ═══════════════════════════════════════════════════
// OBTENER UN RECORDATORIO
// GET /api/reminders/:id
// ═══════════════════════════════════════════════════
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT r.*,
              u_creator.first_name as creator_first_name,
              u_creator.last_name as creator_last_name,
              u_assigned.first_name as assigned_first_name,
              u_assigned.last_name as assigned_last_name
       FROM reminders r
       LEFT JOIN users u_creator ON r.created_by = u_creator.id
       LEFT JOIN users u_assigned ON r.assigned_to = u_assigned.id
       WHERE r.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Recordatorio no encontrado' });
    res.json(rows[0]);
  } catch (e) {
    console.error('Error obtener reminder:', e);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ═══════════════════════════════════════════════════
// CREAR RECORDATORIO
// POST /api/reminders
// ═══════════════════════════════════════════════════
router.post('/', async (req, res) => {
  try {
    const { ticket_id, title, description, due_date, due_time, priority, reminder_type, assigned_to } = req.body;

    if (!title || !due_date) {
      return res.status(400).json({ error: 'Título y fecha son requeridos' });
    }

    const assignee = assigned_to || req.user.id;

    const { rows } = await db.query(
      `INSERT INTO reminders (ticket_id, title, description, due_date, due_time, priority, reminder_type, created_by, assigned_to)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        ticket_id || null,
        title,
        description || null,
        due_date,
        due_time || null,
        priority || 'alta',
        reminder_type || 'follow_up',
        req.user.id,
        assignee
      ]
    );

    // Si está asociado a un ticket, agregar al timeline y registrar acción SLA
    if (ticket_id) {
      await db.query(
        `INSERT INTO ticket_timeline (ticket_id, type, title, note, user_name)
         VALUES ($1, 'system', $2, $3, $4)`,
        [
          ticket_id,
          `Recordatorio creado: ${title}`,
          `Para: ${due_date}${due_time ? ' ' + due_time : ''} | Tipo: ${reminder_type || 'follow_up'}`,
          `${req.user.first_name || ''} ${req.user.last_name || ''}`
        ]
      );
      // Cuenta como acción real para SLA
      await SLAService.registerAction(ticket_id, 'reminder_created');
    }

    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('Error crear reminder:', e);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ═══════════════════════════════════════════════════
// EDITAR RECORDATORIO
// PUT /api/reminders/:id
// ═══════════════════════════════════════════════════
router.put('/:id', async (req, res) => {
  try {
    const { title, description, due_date, due_time, priority, reminder_type, assigned_to } = req.body;

    // Verificar que existe y que el usuario puede editarlo
    const check = await db.query('SELECT * FROM reminders WHERE id = $1', [req.params.id]);
    if (!check.rows[0]) return res.status(404).json({ error: 'Recordatorio no encontrado' });

    const rem = check.rows[0];
    // Solo el creador o admins pueden editar
    if (rem.created_by !== req.user.id && !['super_admin', 'admin_comercial'].includes(req.user.role)) {
      return res.status(403).json({ error: 'No tienes permiso para editar este recordatorio' });
    }

    const { rows } = await db.query(
      `UPDATE reminders SET
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        due_date = COALESCE($3, due_date),
        due_time = $4,
        priority = COALESCE($5, priority),
        reminder_type = COALESCE($6, reminder_type),
        assigned_to = COALESCE($7, assigned_to)
       WHERE id = $8 RETURNING *`,
      [title, description, due_date, due_time || null, priority, reminder_type, assigned_to, req.params.id]
    );

    res.json(rows[0]);
  } catch (e) {
    console.error('Error editar reminder:', e);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ═══════════════════════════════════════════════════
// COMPLETAR RECORDATORIO
// PUT /api/reminders/:id/complete
// ═══════════════════════════════════════════════════
router.put('/:id/complete', async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE reminders SET status = 'completed', completed_at = NOW()
       WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Recordatorio no encontrado' });

    // Si tiene ticket, agregar al timeline
    if (rows[0].ticket_id) {
      await db.query(
        `INSERT INTO ticket_timeline (ticket_id, type, title, note, user_name)
         VALUES ($1, 'system', $2, '', $3)`,
        [
          rows[0].ticket_id,
          `Recordatorio completado: ${rows[0].title}`,
          `${req.user.first_name || ''} ${req.user.last_name || ''}`
        ]
      );
    }

    res.json(rows[0]);
  } catch (e) {
    console.error('Error completar reminder:', e);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ═══════════════════════════════════════════════════
// ELIMINAR RECORDATORIO
// DELETE /api/reminders/:id
// ═══════════════════════════════════════════════════
router.delete('/:id', async (req, res) => {
  try {
    const check = await db.query('SELECT * FROM reminders WHERE id = $1', [req.params.id]);
    if (!check.rows[0]) return res.status(404).json({ error: 'Recordatorio no encontrado' });

    const rem = check.rows[0];
    if (rem.created_by !== req.user.id && !['super_admin', 'admin_comercial'].includes(req.user.role)) {
      return res.status(403).json({ error: 'No tienes permiso' });
    }

    await db.query('DELETE FROM reminders WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error('Error eliminar reminder:', e);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;
