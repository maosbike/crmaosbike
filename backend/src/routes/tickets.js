const router = require('express').Router();
const db = require('../config/db');
const { auth } = require('../middleware/auth');

router.use(auth);

// List tickets
router.get('/', async (req, res) => {
  try {
    const { status, branch_id, search, page = 1, limit = 50 } = req.query;
    let where = ['1=1'], params = [], idx = 1;

    if (req.user.role === 'vendedor') { where.push(`t.seller_id = $${idx++}`); params.push(req.user.id); }
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
       LEFT JOIN users u ON t.seller_id = u.id
       LEFT JOIN branches b ON t.branch_id = b.id
       LEFT JOIN moto_models m ON t.model_id = m.id
       WHERE ${where.join(' AND ')}
       ORDER BY t.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, parseInt(limit), offset]
    );
    res.json({ data: rows, total: parseInt(countR.rows[0].count), page: parseInt(page) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error' }); }
});

// Get single ticket with timeline
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT t.*, u.first_name as seller_fn, u.last_name as seller_ln, u.email as seller_email,
              b.name as branch_name, b.code as branch_code, b.address as branch_addr,
              m.brand as moto_brand, m.model as moto_model, m.price as moto_price, m.bonus as moto_bonus,
              m.image_url, m.cc, m.category, m.year as moto_year, m.colors as moto_colors, m.spec_url
       FROM tickets t
       LEFT JOIN users u ON t.seller_id = u.id
       LEFT JOIN branches b ON t.branch_id = b.id
       LEFT JOIN moto_models m ON t.model_id = m.id
       WHERE t.id = $1`, [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Ticket no encontrado' });

    const tl = await db.query(
      `SELECT tl.*, u.first_name as user_fn, u.last_name as user_ln
       FROM timeline tl LEFT JOIN users u ON tl.user_id = u.id
       WHERE tl.ticket_id = $1 ORDER BY tl.created_at DESC`, [req.params.id]
    );

    res.json({ ...rows[0], timeline: tl.rows });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error' }); }
});

// Create ticket
router.post('/', async (req, res) => {
  try {
    const { first_name, last_name, rut, email, phone, comuna, source, branch_id, model_id, priority, color_pref } = req.body;
    if (!first_name) return res.status(400).json({ error: 'Nombre requerido' });

    const branch = branch_id || req.user.branch_id;
    let seller = req.user.role === 'vendedor' ? req.user.id : null;

    // Auto-assign: vendedor with fewest open tickets in that branch
    if (!seller && branch) {
      const { rows: sellers } = await db.query(
        `SELECT u.id, COUNT(t.id) as cnt FROM users u
         LEFT JOIN tickets t ON t.seller_id = u.id AND t.status NOT IN ('ganado','perdido','cerrado')
         WHERE u.branch_id = $1 AND u.role = 'vendedor' AND u.active = true
         GROUP BY u.id ORDER BY cnt ASC LIMIT 1`, [branch]
      );
      if (sellers[0]) seller = sellers[0].id;
    }

    // Generate ticket number
    const countR = await db.query('SELECT COUNT(*) FROM tickets');
    const num = `SCM-${247001 + parseInt(countR.rows[0].count)}`;

    // SLA deadline = 8 hours from now
    const { rows } = await db.query(
      `INSERT INTO tickets (ticket_num, first_name, last_name, rut, email, phone, comuna, source,
                            branch_id, seller_id, model_id, priority, color_pref)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [num, first_name, last_name, rut, email, phone, comuna, source || 'presencial',
       branch, seller, model_id, priority || 'media', color_pref]
    );

    // Add timeline entry
    await db.query(
      `INSERT INTO timeline (ticket_id, user_id, type, title) VALUES ($1, $2, 'system', 'Ticket creado')`,
      [rows[0].id, req.user.id]
    );

    res.status(201).json(rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error al crear ticket' }); }
});

// Update ticket
router.put('/:id', async (req, res) => {
  try {
    const fields = ['first_name','last_name','rut','birthdate','email','phone','comuna','source',
                     'model_id','color_pref','status','priority','wants_financing','sit_laboral',
                     'continuidad','renta','pie','test_ride','fin_status','fin_institution',
                     'rechazo_motivo','obs_vendedor','obs_supervisor','seller_id','post_venta','last_contact_at'];
    const sets = [], params = [];
    let idx = 1;

    for (const f of fields) {
      if (req.body[f] !== undefined) {
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
    res.json(rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error' }); }
});

// Add timeline entry
router.post('/:id/timeline', async (req, res) => {
  try {
    const { type, title, note, method } = req.body;
    const { rows } = await db.query(
      `INSERT INTO timeline (ticket_id, user_id, type, title, note, method)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.params.id, req.user.id, type, title, note, method]
    );
    // Update last contact
    if (type === 'contact') {
      await db.query('UPDATE tickets SET last_contact_at = NOW() WHERE id = $1', [req.params.id]);
    }
    res.status(201).json(rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error' }); }
});

// Dashboard stats
router.get('/stats/dashboard', async (req, res) => {
  try {
    let bWhere = '', params = [], idx = 1;
    if (req.user.role === 'vendedor') { bWhere = `AND seller_id = $${idx++}`; params.push(req.user.id); }
    else if (req.user.branch_id) { bWhere = `AND branch_id = $${idx++}`; params.push(req.user.branch_id); }

    const stats = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status NOT IN ('ganado','perdido','cerrado')) as activos,
        COUNT(*) FILTER (WHERE status = 'ganado') as ganados,
        COUNT(*) FILTER (WHERE status = 'perdido') as perdidos,
        COUNT(*) as total
      FROM tickets WHERE 1=1 ${bWhere}`, params);

    res.json(stats.rows[0]);
  } catch (e) { res.status(500).json({ error: 'Error' }); }
});

module.exports = router;
