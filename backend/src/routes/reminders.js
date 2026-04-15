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
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 200));
    const offset = (page - 1) * limit;

    // Construimos el WHERE una sola vez para reusar en COUNT y SELECT
    const whereParts = ['1=1'];
    const params = [];

    if (req.user.role === 'vendedor') {
      params.push(req.user.id);
      whereParts.push(`r.assigned_to = $${params.length}`);
    } else if (my === 'true') {
      params.push(req.user.id);
      whereParts.push(`r.assigned_to = $${params.length}`);
    }
    if (ticket_id) {
      params.push(ticket_id);
      whereParts.push(`r.ticket_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      whereParts.push(`r.status = $${params.length}`);
    }
    if (date_from) {
      params.push(date_from);
      whereParts.push(`r.due_date >= $${params.length}`);
    }
    if (date_to) {
      params.push(date_to);
      whereParts.push(`r.due_date <= $${params.length}`);
    }

    const whereClause = whereParts.join(' AND ');

    const countR = await db.query(
      `SELECT COUNT(*)::int AS n FROM reminders r WHERE ${whereClause}`,
      params
    );
    const total = countR.rows[0]?.n || 0;

    const query = `
      SELECT r.*,
             u_creator.first_name as creator_first_name,
             u_creator.last_name as creator_last_name,
             u_assigned.first_name as assigned_first_name,
             u_assigned.last_name as assigned_last_name,
             t.ticket_num as ticket_number, t.first_name as client_first_name, t.last_name as client_last_name
      FROM reminders r
      LEFT JOIN users u_creator ON r.created_by = u_creator.id
      LEFT JOIN users u_assigned ON r.assigned_to = u_assigned.id
      LEFT JOIN tickets t ON r.ticket_id = t.id
      WHERE ${whereClause}
      ORDER BY r.due_date ASC, r.due_time ASC NULLS LAST
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    const { rows } = await db.query(query, [...params, limit, offset]);

    // Devolvemos data+total+page+limit. El consumer actual (RemindersTab) lee
    // `d.reminders` (que nunca existió → siempre caía a []) así que exponemos
    // también `reminders` como alias para no romper nada.
    res.json({ data: rows, reminders: rows, total, page, limit });
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

    const rem = rows[0];
    if (rem.created_by !== req.user.id && rem.assigned_to !== req.user.id &&
        !['super_admin', 'admin_comercial'].includes(req.user.role)) {
      return res.status(403).json({ error: 'No tienes permiso para ver este recordatorio' });
    }

    res.json(rem);
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

    // Vendedores solo pueden asignarse recordatorios a sí mismos
    if (req.user.role === 'vendedor') {
      if (assigned_to && assigned_to !== req.user.id) {
        return res.status(403).json({ error: 'No puedes asignar recordatorios a otros usuarios' });
      }
    }

    // Admins que asignan a otro usuario: verificar que ese usuario exista y esté activo
    let assignee = assigned_to || req.user.id;
    if (assigned_to && assigned_to !== req.user.id) {
      const { rows: targetRows } = await db.query(
        'SELECT id FROM users WHERE id = $1 AND active = true',
        [assigned_to]
      );
      if (!targetRows[0]) {
        return res.status(400).json({ error: 'El usuario destino no existe o está inactivo' });
      }
    }

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
        `INSERT INTO timeline (ticket_id, user_id, type, title, note)
         VALUES ($1, $2, 'system', $3, $4)`,
        [
          ticket_id,
          req.user.id,
          `Recordatorio creado: ${title}`,
          `Para: ${due_date}${due_time ? ' ' + due_time : ''} | Tipo: ${reminder_type || 'follow_up'}`
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

    // Vendedores no pueden cambiar el destinatario
    if (req.user.role === 'vendedor' && assigned_to && assigned_to !== req.user.id) {
      return res.status(403).json({ error: 'No puedes reasignar recordatorios a otros usuarios' });
    }

    // Admins que reasignan: verificar que el usuario destino exista y esté activo
    if (assigned_to && assigned_to !== rem.assigned_to) {
      const { rows: targetRows } = await db.query(
        'SELECT id FROM users WHERE id = $1 AND active = true',
        [assigned_to]
      );
      if (!targetRows[0]) {
        return res.status(400).json({ error: 'El usuario destino no existe o está inactivo' });
      }
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
    const check = await db.query('SELECT * FROM reminders WHERE id = $1', [req.params.id]);
    if (!check.rows[0]) return res.status(404).json({ error: 'Recordatorio no encontrado' });

    const rem = check.rows[0];
    if (rem.created_by !== req.user.id && rem.assigned_to !== req.user.id &&
        !['super_admin', 'admin_comercial'].includes(req.user.role)) {
      return res.status(403).json({ error: 'No tienes permiso para completar este recordatorio' });
    }

    const { rows } = await db.query(
      `UPDATE reminders SET status = 'completed', completed_at = NOW()
       WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Recordatorio no encontrado' });

    // Si tiene ticket, agregar al timeline
    if (rows[0].ticket_id) {
      await db.query(
        `INSERT INTO timeline (ticket_id, user_id, type, title, note)
         VALUES ($1, $2, 'system', $3, '')`,
        [
          rows[0].ticket_id,
          req.user.id,
          `Recordatorio completado: ${rows[0].title}`
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
