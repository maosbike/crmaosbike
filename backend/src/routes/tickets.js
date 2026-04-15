const router = require('express').Router();
const db = require('../config/db');
const { auth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const SLAService = require('../services/slaService');
const TelegramService = require('../services/telegramService');
const NotificationService = require('../services/notificationService');
const { calcSlaDeadline } = require('../utils/slaUtils');
const {
  EVIDENCE_REQUIRED,
  CONTACT_ADVANCES_FROM,
  FOLLOWUP_STATUSES,
  FOLLOWUP_LABELS,
} = require('../config/leadStatus');
const { resolveAssignmentBranch } = require('../config/branchRouting');
const multer = require('multer');
const cloudinary = require('../config/cloudinary');

const uploadEvidence = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Alias para compatibilidad con referencias existentes — usa la constante compartida.
const EVIDENCE_REQUIRED_STATES = EVIDENCE_REQUIRED;

// Tope de caracteres para notas (coherente con frontend maxLength).
// Evita payloads gigantes y mantiene la UI consistente.
const NOTE_MAX      = 5000;
const NEXT_STEP_MAX = 500;

router.use(auth);

// List tickets
router.get('/', asyncHandler(async (req, res) => {
  const { status, branch_id, search, needs_attention, page = 1, limit = 50 } = req.query;
  let where = ['1=1'], params = [], idx = 1;

  if (req.user.role === 'vendedor') { where.push(`(t.seller_id = $${idx} OR t.assigned_to = $${idx})`); params.push(req.user.id); idx++; }
  if (status) { where.push(`t.status = $${idx++}`); params.push(status); }
  if (branch_id) { where.push(`t.branch_id = $${idx++}`); params.push(branch_id); }
  if (needs_attention === '1' || needs_attention === 'true') { where.push(`t.needs_attention = TRUE`); }
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
    `SELECT tl.*, u.first_name as user_fn, u.last_name as user_ln, u.role as user_role
     FROM timeline tl LEFT JOIN users u ON tl.user_id = u.id
     WHERE tl.ticket_id = $1 ORDER BY tl.created_at DESC`, [req.params.id]
  );

  // Último contacto real (contact_registered o contact_evidence)
  const lastContactRow = tl.rows.find(t => t.type === 'contact_registered' || t.type === 'contact_evidence') || null;

  // Resumen de reasignaciones: cuántas y cuándo fue la última
  const reassign = await db.query(
    `SELECT COUNT(*) AS n, MAX(created_at) AS last_at
     FROM reassignment_log
     WHERE ticket_id = $1 AND reason <> 'initial_assignment'`, [req.params.id]
  );

  res.json({
    ...rows[0],
    timeline: tl.rows,
    last_contact_entry: lastContactRow,
    reassignment_summary: {
      count: parseInt(reassign.rows[0]?.n || 0),
      last_at: reassign.rows[0]?.last_at || null,
    },
  });
}));

// Create ticket
router.post('/', asyncHandler(async (req, res) => {
  const { first_name, last_name, rut, email, phone, comuna, source, branch_id, model_id, priority, color_pref, assigned_to: manualSeller } = req.body;
  if (!first_name) return res.status(400).json({ error: 'Nombre requerido' });

  // MOV → MPN: regla documentada en config/branchRouting.js
  const branch = resolveAssignmentBranch(branch_id || req.user.branch_id);

  let seller = req.user.role === 'vendedor' ? req.user.id : null;

  // Asignación manual: solo roles admin/backoffice pueden imponer vendedor
  if (!seller && manualSeller && ['super_admin','admin_comercial','backoffice'].includes(req.user.role)) {
    seller = manualSeller;
  }

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
                            sla_deadline, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'nuevo') RETURNING *`,
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

      // In-app notification (fire-and-forget)
      NotificationService.newLeadAssigned(createdTicket, seller)
        .catch((e) => console.warn('[Notification] newLeadAssigned error:', e.message));
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

  // Guardia de evidencia: si se intenta cambiar a estado que requiere contacto real,
  // verificar que exista un contact_registered o contact_evidence en los últimos 30 días
  if (req.body.status && EVIDENCE_REQUIRED_STATES.includes(req.body.status)) {
    const cur = await db.query('SELECT status FROM tickets WHERE id = $1', [req.params.id]);
    const oldStatus = cur.rows[0]?.status;
    if (oldStatus !== req.body.status) {
      const ev = await db.query(
        `SELECT id FROM timeline
         WHERE ticket_id = $1
           AND type IN ('contact_registered', 'contact_evidence')
           AND created_at > NOW() - INTERVAL '30 days'
         LIMIT 1`,
        [req.params.id]
      );
      if (!ev.rows[0]) {
        return res.status(400).json({
          error: 'evidencia_requerida',
          message: 'Debes registrar un contacto o subir evidencia antes de cambiar a este estado.',
        });
      }
    }
  }

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

// Registrar seguimiento obligatorio (cuestionario cuando needs_attention)
// Limpia el flag, deja registro en timeline y actualiza columnas de followup.
// FOLLOWUP_STATUSES y FOLLOWUP_LABELS viven en config/leadStatus.js
router.post('/:id/followup', asyncHandler(async (req, res) => {
  if (req.user.role === 'vendedor') {
    const check = await db.query(
      'SELECT id FROM tickets WHERE id = $1 AND (seller_id = $2 OR assigned_to = $2)',
      [req.params.id, req.user.id]
    );
    if (!check.rows[0]) return res.status(403).json({ error: 'Sin permiso para este ticket' });
  }

  const { followup_status, followup_note, followup_next_step, next_followup_at } = req.body;

  if (!followup_status || !FOLLOWUP_STATUSES.includes(followup_status)) {
    return res.status(400).json({ error: 'Estado de seguimiento inválido' });
  }
  if (!followup_note || followup_note.trim().length < 15) {
    return res.status(400).json({ error: 'El comentario debe tener al menos 15 caracteres' });
  }
  if (followup_note.length > NOTE_MAX) {
    return res.status(400).json({ error: `El comentario no puede superar los ${NOTE_MAX} caracteres` });
  }
  if (!followup_next_step || followup_next_step.trim().length < 5) {
    return res.status(400).json({ error: 'Indicá el próximo paso concreto' });
  }
  if (followup_next_step.length > NEXT_STEP_MAX) {
    return res.status(400).json({ error: `El próximo paso no puede superar los ${NEXT_STEP_MAX} caracteres` });
  }
  if (!next_followup_at) {
    return res.status(400).json({ error: 'Fecha de próxima gestión requerida' });
  }

  const label = FOLLOWUP_LABELS[followup_status];
  const now = new Date().toISOString();

  await db.query(
    `UPDATE tickets SET
       needs_attention = FALSE,
       needs_attention_since = NULL,
       followup_status = $1,
       followup_note = $2,
       followup_next_step = $3,
       next_followup_at = $4,
       followup_updated_at = $5,
       last_real_action_at = $5,
       first_action_at = COALESCE(first_action_at, $5),
       sla_status = CASE WHEN sla_status = 'reassigned' THEN 'reassigned' ELSE 'normal' END
     WHERE id = $6`,
    [followup_status, followup_note.trim(), followup_next_step.trim(),
     new Date(next_followup_at).toISOString(), now, req.params.id]
  );

  const { rows } = await db.query(
    `INSERT INTO timeline (ticket_id, user_id, type, title, note)
     VALUES ($1, $2, 'note_added', $3, $4) RETURNING *`,
    [req.params.id, req.user.id,
     `Seguimiento: ${label}`,
     `${followup_note.trim()}\nPróximo paso: ${followup_next_step.trim()}\nPróxima gestión: ${new Date(next_followup_at).toLocaleDateString('es-CL')}`]
  );

  res.status(201).json({ ok: true, timeline: rows[0] });
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
  if (note && note.length > NOTE_MAX) {
    return res.status(400).json({ error: `La nota no puede superar los ${NOTE_MAX} caracteres` });
  }

  const { rows } = await db.query(
    `INSERT INTO timeline (ticket_id, user_id, type, title, note, method)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [req.params.id, req.user.id, type, title, note || null, method || null]
  );

  if (type === 'contact_registered') {
    await db.query('UPDATE tickets SET last_contact_at = NOW() WHERE id = $1', [req.params.id]);
    await SLAService.registerAction(req.params.id, 'contact_registered');
    // Auto-transición: pasa a En gestión solo si el ticket está en estados iniciales.
    // CONTACT_ADVANCES_FROM = ['nuevo', 'abierto'] — ver config/leadStatus.js
    // RETURNING nos dice si hubo cambio real; si lo hubo, dejamos traza en timeline.
    const autoTr = await db.query(
      `UPDATE tickets SET status = 'en_gestion' WHERE id = $1 AND status = ANY($2)
       RETURNING id`,
      [req.params.id, CONTACT_ADVANCES_FROM]
    );
    if (autoTr.rows[0]) {
      await db.query(
        `INSERT INTO timeline (ticket_id, user_id, type, title, note)
         VALUES ($1, $2, 'system', $3, $4)`,
        [req.params.id, req.user.id,
         'Estado automático: En gestión',
         'Transición automática al registrar contacto']
      );
    }
  } else if (type === 'note_added') {
    await SLAService.registerAction(req.params.id, 'note_added');
  }

  res.status(201).json(rows[0]);
}));

// Upload evidence for a ticket contact
router.post('/:id/evidence', uploadEvidence.single('file'), asyncHandler(async (req, res) => {
  if (req.user.role === 'vendedor') {
    const check = await db.query(
      'SELECT id FROM tickets WHERE id = $1 AND (seller_id = $2 OR assigned_to = $2)',
      [req.params.id, req.user.id]
    );
    if (!check.rows[0]) return res.status(403).json({ error: 'Sin permiso para este ticket' });
  }

  const { note, ev_type } = req.body;
  const hasFile = !!req.file;
  const hasNote = note && note.trim().length >= 50;

  if (!hasFile && !hasNote) {
    return res.status(400).json({ error: 'Debes subir un archivo o escribir una nota de al menos 50 caracteres.' });
  }

  let evidence_url = null;
  if (hasFile) {
    const b64 = Buffer.from(req.file.buffer).toString('base64');
    const result = await cloudinary.uploader.upload(
      `data:${req.file.mimetype};base64,${b64}`,
      { folder: 'crmaosbike/evidence', resource_type: 'image' }
    );
    evidence_url = result.secure_url;
  }

  const evidence_type = ev_type || (hasFile ? 'archivo' : 'nota');
  const typeLabels = { screenshot_whatsapp: 'WhatsApp', screenshot_llamada: 'Llamada', archivo: 'Archivo adjunto', nota: 'Nota detallada' };
  const title = `Evidencia registrada — ${typeLabels[evidence_type] || evidence_type}`;

  const { rows } = await db.query(
    `INSERT INTO timeline (ticket_id, user_id, type, title, note, evidence_url, evidence_type)
     VALUES ($1, $2, 'contact_evidence', $3, $4, $5, $6) RETURNING *`,
    [req.params.id, req.user.id, title, note || null, evidence_url, evidence_type]
  );

  await db.query('UPDATE tickets SET last_contact_at = NOW() WHERE id = $1', [req.params.id]);
  // Registrar como acción real — fija first_action_at y protege contra reasignación SLA
  await SLAService.registerAction(req.params.id, 'contact_evidence');
  // Auto-transición: pasa a En gestión si no está ya en un estado más avanzado o terminal.
  // RETURNING permite detectar cambio real y dejar traza en timeline.
  const autoTr = await db.query(
    `UPDATE tickets SET status = 'en_gestion'
     WHERE id = $1 AND status NOT IN ('en_gestion','cotizado','financiamiento','ganado','perdido')
     RETURNING id`,
    [req.params.id]
  );
  if (autoTr.rows[0]) {
    await db.query(
      `INSERT INTO timeline (ticket_id, user_id, type, title, note)
       VALUES ($1, $2, 'system', $3, $4)`,
      [req.params.id, req.user.id,
       'Estado automático: En gestión',
       'Transición automática al registrar evidencia de contacto']
    );
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
      COUNT(*) FILTER (WHERE status NOT IN ('ganado','perdido')) as activos,
      COUNT(*) FILTER (WHERE status = 'ganado') as ganados,
      COUNT(*) FILTER (WHERE status = 'perdido') as perdidos,
      COUNT(*) as total
    FROM tickets WHERE 1=1 ${bWhere}`, params);

  res.json(stats.rows[0]);
}));

module.exports = router;
