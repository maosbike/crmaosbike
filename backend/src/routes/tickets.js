const router = require('express').Router();
const db = require('../config/db');
const { auth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const SLAService = require('../services/slaService');
const TelegramService = require('../services/telegramService');
const { calcSlaDeadline } = require('../utils/slaUtils');

router.use(auth);

// List tickets
router.get('/', asyncHandler(async (req, res) => {
  const { status, branch_id, search, page = 1, limit = 50 } = req.query;
  let where = ['1=1'], params = [], idx = 1;

  if (req.user.role === 'vendedor') { where.push(`(t.seller_id = $${idx} OR t.assigned_to = $${idx})`); params.push(req.user.id); idx++; }
  if (status) { where.push(`t.status = $${idx++}`); params.push(status); }
  if (branch_id) { where.push(`t.branch_id = $${idx++}`); params.push(branch_id); }
  if (search) { where.push(`(t.first_name ILIKE $${idx} OR t.last_name ILIKE $${idx} OR t.phone ILIKE $${idx} OR t.rut ILIKE $${idx} OR t.ticket_num ILIKE $${idx})`); params.push(`%${search}%`); idx++; }

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const countR = await db.query(`SELECT COUNT(*) FROM tickets t WHERE ${where.join(' AND ')}`, params);
  const { rows } = await db.query(
    `SELECT t.*, u.first_name as seller_fn, u.last_name as seller_ln,
            b.name as branch_name, b.code as branch_code,
            m.brand as moto_brand, m.model as moto_model, m.price as moto_price, m.bonus as moto_bonus, m.image_url, m.cc, m.category, m.year as moto_year, m.colors as moto_colors
     FROM tickets t
     LEFT JOIN users u ON t.assigned_to = u.id
     LEFT JOIN branches b ON t.branch_id = b.id
     LEFT JOIN moto_models m ON t.model_id = m.id
     WHERE ${where.join(' AND ')}
     ORDER BY t.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, parseInt(limit), offset]
  );
  res.json({ data: rows, total: parseInt(countR.rows[0].count), page: parseInt(page) });
}));

// Get single ticket with timeline
router.get('/:id', asyncHandler(async (req, res) => {
  // Vendedores solo pueden ver sus propios tickets
  const params = [req.params.id];
  let ownershipClause = '';
  if (req.user.role === 'vendedor') {
    ownershipClause = 'AND (t.seller_id = $2 OR t.assigned_to = $2)';
    params.push(req.user.id);
  }

  const { rows } = await db.query(
    `SELECT t.*, u.first_name as seller_fn, u.last_name as seller_ln, u.email as seller_email,
            b.name as branch_name, b.code as branch_code, b.address as branch_addr,
            m.brand as moto_brand, m.model as moto_model, m.price as moto_price, m.bonus as moto_bonus,
            m.image_url, m.cc, m.category, m.year as moto_year, m.colors as moto_colors, m.spec_url
     FROM tickets t
     LEFT JOIN users u ON t.assigned_to = u.id
     LEFT JOIN branches b ON t.branch_id = b.id
     LEFT JOIN moto_models m ON t.model_id = m.id
     WHERE t.id = $1 ${ownershipClause}`, params
  );
  if (!rows[0]) return res.status(404).json({ error: 'Ticket no encontrado' });

  const tl = await db.query(
    `SELECT tl.*, u.first_name as user_fn, u.last_name as user_ln
     FROM timeline tl LEFT JOIN users u ON tl.user_id = u.id
     WHERE tl.ticket_id = $1 ORDER BY tl.created_at DESC`, [req.params.id]
  );

  res.json({ ...rows[0], timeline: tl.rows });
}));

// Create ticket
router.post('/', asyncHandler(async (req, res) => {
  const { first_name, last_name, rut, email, phone, comuna, source, branch_id, model_id, priority, color_pref } = req.body;
  if (!first_name) return res.status(400).json({ error: 'Nombre requerido' });

  const branch = branch_id || req.user.branch_id;
  let seller = req.user.role === 'vendedor' ? req.user.id : null;

  // Auto-assign: lógica unificada con importación (branch_id + extra_branches, least-loaded)
  if (!seller && branch) {
    const assigned = await SLAService.assignSeller(branch);
    if (assigned) seller = assigned.id;
  }

  // Transacción: ticket + timeline deben crearse juntos
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const seqR = await client.query("SELECT 'SCM-' || nextval('ticket_num_seq') AS num");
    const num = seqR.rows[0].num;

    const { rows } = await client.query(
      `INSERT INTO tickets (ticket_num, first_name, last_name, rut, email, phone, comuna, source,
                            branch_id, seller_id, assigned_to, model_id, priority, color_pref,
                            sla_deadline)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [num, first_name, last_name, rut, email, phone, comuna, source || 'presencial',
       branch, seller, seller, model_id, priority || 'media', color_pref,
       calcSlaDeadline().toISOString()]
    );

    await client.query(
      `INSERT INTO timeline (ticket_id, user_id, type, title) VALUES ($1, $2, 'system', 'Ticket creado')`,
      [rows[0].id, req.user.id]
    );

    // Log asignación inicial en reassignment_log para trazabilidad
    if (seller) {
      await client.query(
        `INSERT INTO reassignment_log (ticket_id, from_user_id, to_user_id, reason, reassigned_by)
         VALUES ($1, NULL, $2, 'initial_assignment', $3)`,
        [rows[0].id, seller, req.user.id]
      );
    }

    await client.query('COMMIT');
    const createdTicket = rows[0];
    res.status(201).json(createdTicket);

    // Telegram notification (fire-and-forget, after response sent)
    if (seller) {
      db.query(
        `SELECT u.telegram_chat_id, u.first_name, u.last_name,
                b.name AS branch_name,
                m.brand AS moto_brand, m.model AS moto_model
         FROM users u
         LEFT JOIN branches b ON b.id = $2
         LEFT JOIN moto_models m ON m.id = $3
         WHERE u.id = $1`,
        [seller, branch, createdTicket.model_id]
      )
        .then(({ rows: [r] }) => {
          if (!r?.telegram_chat_id) return;
          return TelegramService.notifyNewLead(
            { ...createdTicket, branch_name: r.branch_name, moto_brand: r.moto_brand, moto_model: r.moto_model },
            r
          );
        })
        .catch((e) => console.warn('[Telegram] notifyNewLead error:', e.message));
    }
  } catch (txErr) {
    await client.query('ROLLBACK');
    throw txErr;
  } finally {
    client.release();
  }
}));

// Update ticket
router.put('/:id', asyncHandler(async (req, res) => {
  // Vendedores solo pueden modificar sus propios tickets
  if (req.user.role === 'vendedor') {
    const check = await db.query(
      'SELECT id FROM tickets WHERE id = $1 AND (seller_id = $2 OR assigned_to = $2)',
      [req.params.id, req.user.id]
    );
    if (!check.rows[0]) return res.status(403).json({ error: 'Sin permiso para modificar este ticket' });
  }

  const fields = ['first_name','last_name','rut','birthdate','email','phone','comuna','source',
                   'model_id','color_pref','status','priority','wants_financing','sit_laboral',
                   'continuidad','renta','pie','test_ride','fin_status','fin_institution',
                   'rechazo_motivo','obs_vendedor','obs_supervisor','seller_id','post_venta','last_contact_at'];
  const sets = [], params = [];
  let idx = 1;

  for (const f of fields) {
    if (req.body[f] !== undefined) {
      // Vendedores no pueden cambiar seller_id — la reasignación es exclusiva de roles altos
      if (f === 'seller_id' && req.user.role === 'vendedor') continue;
      if (f === 'post_venta') {
        sets.push(`${f} = $${idx++}::jsonb`);
        params.push(JSON.stringify(req.body[f]));
      } else {
        sets.push(`${f} = $${idx++}`);
        params.push(req.body[f]);
      }
    }
  }

  if (sets.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });

  params.push(req.params.id);
  const { rows } = await db.query(
    `UPDATE tickets SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, params
  );
  if (!rows[0]) return res.status(404).json({ error: 'Ticket no encontrado' });

  // Registrar acciones SLA para cambios concretos
  if (req.body.test_ride === true || req.body.test_ride === 'true') {
    await SLAService.registerAction(req.params.id, 'test_ride_done');
  }
  if (req.body.fin_status && req.body.fin_status !== 'sin_movimiento') {
    await SLAService.registerAction(req.params.id, 'financing_updated');
  }

  res.json(rows[0]);
}));

// Add timeline entry
router.post('/:id/timeline', asyncHandler(async (req, res) => {
  if (req.user.role === 'vendedor') {
    const check = await db.query(
      'SELECT id FROM tickets WHERE id = $1 AND (seller_id = $2 OR assigned_to = $2)',
      [req.params.id, req.user.id]
    );
    if (!check.rows[0]) return res.status(403).json({ error: 'Sin permiso para este ticket' });
  }

  const { type, title, note, method } = req.body;

  if (!type || !title) return res.status(400).json({ error: 'type y title son requeridos' });

  if (type === 'contact_registered') {
    if (!method) return res.status(400).json({ error: 'El método de contacto es requerido (llamada, whatsapp, presencial, email, sms)' });
  }

  if (type === 'note_added') {
    if (!note || note.trim().length < 20) return res.status(400).json({ error: 'La nota debe tener al menos 20 caracteres para contar como gestión' });
  }

  const { rows } = await db.query(
    `INSERT INTO timeline (ticket_id, user_id, type, title, note, method)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [req.params.id, req.user.id, type, title, note || null, method || null]
  );

  if (type === 'contact_registered') {
    await db.query('UPDATE tickets SET last_contact_at = NOW() WHERE id = $1', [req.params.id]);
    await SLAService.registerAction(req.params.id, 'contact_registered');
  } else if (type === 'note_added') {
    await SLAService.registerAction(req.params.id, 'note_added');
  }

  res.status(201).json(rows[0]);
}));

// Dashboard stats
router.get('/stats/dashboard', asyncHandler(async (req, res) => {
  let bWhere = '', params = [], idx = 1;
  if (req.user.role === 'vendedor') { bWhere = `AND assigned_to = $${idx++}`; params.push(req.user.id); }
  else if (req.user.branch_id) { bWhere = `AND branch_id = $${idx++}`; params.push(req.user.branch_id); }

  const stats = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE status NOT IN ('ganado','perdido','cerrado')) as activos,
      COUNT(*) FILTER (WHERE status = 'ganado') as ganados,
      COUNT(*) FILTER (WHERE status = 'perdido') as perdidos,
      COUNT(*) as total
    FROM tickets WHERE 1=1 ${bWhere}`, params);

  res.json(stats.rows[0]);
}));

module.exports = router;
