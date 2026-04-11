/**
 * Módulo de Ventas — CRMaosBike
 *
 * Permisos:
 *   GET  /api/sales          → todos los roles autenticados (ownership check para vendedor)
 *   GET  /api/sales/stats    → todos los roles autenticados (ownership check para vendedor)
 *   GET  /api/sales/:id      → todos los roles (ownership check para vendedor)
 *   POST /api/sales          → solo super_admin y backoffice
 *   PATCH /api/sales/:id     → solo super_admin y backoffice
 *   DELETE /api/sales/:id    → solo super_admin
 *   POST /api/sales/:id/doc  → solo super_admin y backoffice
 *
 * Costos internos (cost_price, invoice_amount):
 *   Nunca se devuelven a vendedores — eliminados en sanitizeSale() antes de cada respuesta.
 */

const router = require('express').Router();
const db = require('../config/db');
const { auth, roleCheck } = require('../middleware/auth');
const multer = require('multer');
const cloudinary = require('../config/cloudinary');

router.use(auth);

// ─── Config ───────────────────────────────────────────────────────────────────

const COST_FIELDS = ['cost_price', 'invoice_amount'];

const DOC_FIELDS = ['doc_factura_dist', 'doc_factura_cli', 'doc_homologacion', 'doc_inscripcion'];

const uploadDoc = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(jpg|jpeg|png|webp|pdf)$/i.test(file.originalname);
    if (ok) cb(null, true);
    else cb(new Error('Solo se permiten imágenes (jpg/png/webp) o PDF'));
  },
});

// ─── Helper: elimina campos sensibles para vendedores ─────────────────────────
function sanitizeSale(sale, userRole) {
  if (userRole === 'vendedor') {
    const out = { ...sale };
    COST_FIELDS.forEach(f => delete out[f]);
    return out;
  }
  return sale;
}

// ─── Query base — join enriquecido de ventas ──────────────────────────────────
const BASE_SELECT = `
  SELECT
    i.id,
    i.status,
    i.brand, i.model, i.year, i.chassis, i.color, i.motor_num,
    i.price,
    i.sale_price, i.cost_price, i.invoice_amount,
    i.sold_at, i.payment_method, i.sale_type, i.sale_notes,
    i.delivered, i.distributor_paid,
    i.doc_factura_dist, i.doc_factura_cli, i.doc_homologacion, i.doc_inscripcion,
    i.ticket_id,
    -- Vendedor
    sv.id          AS seller_id,
    sv.first_name  AS seller_fn,
    sv.last_name   AS seller_ln,
    -- Sucursal
    b.id           AS branch_id,
    b.name         AS branch_name,
    b.code         AS branch_code,
    -- Cliente: manual > ticket
    t.ticket_num,
    COALESCE(
      NULLIF(TRIM(i.client_name), ''),
      TRIM(CONCAT_WS(' ', t.first_name, t.last_name))
    ) AS client_name,
    COALESCE(
      NULLIF(TRIM(i.client_rut), ''),
      t.rut
    ) AS client_rut
  FROM inventory i
  LEFT JOIN users    sv ON i.sold_by   = sv.id
  LEFT JOIN branches b  ON i.branch_id = b.id
  LEFT JOIN tickets  t  ON i.ticket_id = t.id
  WHERE i.status IN ('vendida', 'reservada')
`;

// ─── GET /api/sales ───────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { from, to, branch_id, seller_id, q, status } = req.query;
    const where = [], params = [];
    let idx = 1;

    // Filtro de tipo: reserva o venta
    if (status === 'vendida')   { where.push(`i.status = $${idx++}`); params.push('vendida'); }
    else if (status === 'reservada') { where.push(`i.status = $${idx++}`); params.push('reservada'); }

    if (req.user.role === 'vendedor') {
      where.push(`sv.id = $${idx++}`);
      params.push(req.user.id);
    } else if (seller_id) {
      where.push(`sv.id = $${idx++}`);
      params.push(seller_id);
    }

    if (from)      { where.push(`i.sold_at >= $${idx++}`);  params.push(from); }
    if (to)        { where.push(`i.sold_at <= $${idx++}`);  params.push(to + ' 23:59:59'); }
    if (branch_id) { where.push(`i.branch_id = $${idx++}`); params.push(branch_id); }

    if (q) {
      where.push(`(
        i.chassis    ILIKE $${idx}
        OR i.brand   ILIKE $${idx}
        OR i.model   ILIKE $${idx}
        OR t.ticket_num ILIKE $${idx}
        OR TRIM(CONCAT_WS(' ', t.first_name, t.last_name)) ILIKE $${idx}
        OR i.client_name ILIKE $${idx}
      )`);
      params.push(`%${q}%`);
      idx++;
    }

    const clause = where.length ? 'AND ' + where.join(' AND ') : '';
    const { rows } = await db.query(
      `${BASE_SELECT} ${clause} ORDER BY i.sold_at DESC NULLS LAST`,
      params
    );

    res.json({ data: rows.map(s => sanitizeSale(s, req.user.role)), total: rows.length });
  } catch (e) {
    console.error('[Sales] GET /', e);
    res.status(500).json({ error: 'Error al obtener ventas' });
  }
});

// ─── GET /api/sales/stats ─────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const { from, to, branch_id } = req.query;
    const where = [], params = [];
    let idx = 1;

    if (req.user.role === 'vendedor') {
      where.push(`i.sold_by = $${idx++}`);
      params.push(req.user.id);
    }

    const monthStart = from || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const monthEnd   = to   ? to + ' 23:59:59' : new Date().toISOString();
    where.push(`i.sold_at >= $${idx++}`); params.push(monthStart);
    where.push(`i.sold_at <= $${idx++}`); params.push(monthEnd);

    if (branch_id) { where.push(`i.branch_id = $${idx++}`); params.push(branch_id); }

    const whereClause = `WHERE i.status = 'vendida' AND ${where.join(' AND ')}`;

    const { rows } = await db.query(`
      SELECT
        COUNT(*)                                                           AS total,
        COUNT(*) FILTER (WHERE i.doc_factura_cli  IS NULL
                            OR  i.doc_factura_cli  = '')                   AS sin_factura_cli,
        COUNT(*) FILTER (WHERE i.doc_homologacion IS NULL
                            OR  i.doc_homologacion = '')                   AS sin_homologacion,
        COUNT(*) FILTER (WHERE i.doc_inscripcion  IS NULL
                            OR  i.doc_inscripcion  = '')                   AS sin_inscripcion,
        COUNT(*) FILTER (WHERE i.delivered = false
                            OR  i.delivered IS NULL)                       AS pendiente_entrega,
        COUNT(*) FILTER (WHERE i.distributor_paid = false
                            OR  i.distributor_paid IS NULL)                AS pendiente_distribuidor,
        SUM(i.sale_price)                                                  AS total_venta,
        SUM(i.cost_price)                                                  AS total_costo,
        SUM(i.invoice_amount)                                              AS total_facturado
      FROM inventory i
      ${whereClause}
    `, params);

    const s = rows[0];
    const base = {
      total:                  parseInt(s.total)                  || 0,
      sin_factura_cli:        parseInt(s.sin_factura_cli)        || 0,
      sin_homologacion:       parseInt(s.sin_homologacion)       || 0,
      sin_inscripcion:        parseInt(s.sin_inscripcion)        || 0,
      pendiente_entrega:      parseInt(s.pendiente_entrega)      || 0,
      pendiente_distribuidor: parseInt(s.pendiente_distribuidor) || 0,
      total_venta:            parseInt(s.total_venta)            || 0,
    };

    if (req.user.role !== 'vendedor') {
      base.total_costo     = parseInt(s.total_costo)     || 0;
      base.total_facturado = parseInt(s.total_facturado) || 0;
    }

    res.json(base);
  } catch (e) {
    console.error('[Sales] GET /stats', e);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

// ─── GET /api/sales/:id ───────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await db.query(`${BASE_SELECT} AND i.id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Venta no encontrada' });

    const sale = rows[0];
    if (req.user.role === 'vendedor' && sale.seller_id !== req.user.id) {
      return res.status(403).json({ error: 'Sin permiso para ver esta venta' });
    }

    res.json(sanitizeSale(sale, req.user.role));
  } catch (e) {
    console.error('[Sales] GET /:id', e);
    res.status(500).json({ error: 'Error' });
  }
});

// ─── POST /api/sales ──────────────────────────────────────────────────────────
router.post('/', roleCheck('super_admin', 'backoffice'), async (req, res) => {
  try {
    const {
      branch_id, year, brand, model, color, chassis, motor_num, price,
      sold_by, sold_at, ticket_id, payment_method, sale_type, sale_notes,
      sale_price, cost_price, invoice_amount, delivered,
      client_name, client_rut,
    } = req.body;

    if (!brand || !model)
      return res.status(400).json({ error: 'Marca y modelo son obligatorios' });
    if (!sold_by)
      return res.status(400).json({ error: 'Vendedor obligatorio' });

    const finalSoldAt = sold_at ? new Date(sold_at).toISOString() : new Date().toISOString();

    const { rows } = await db.query(
      `INSERT INTO inventory (
         branch_id, year, brand, model, color, chassis, motor_num, price, status,
         added_as_sold, sold_at, sold_by, ticket_id,
         payment_method, sale_type, sale_notes,
         sale_price, cost_price, invoice_amount, delivered,
         client_name, client_rut, created_by
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,'vendida',
         true,$9,$10,$11,
         $12,$13,$14,
         $15,$16,$17,$18,
         $19,$20,$21
       ) RETURNING *`,
      [
        branch_id || null,
        year      ? parseInt(year)   : null,
        brand.trim().toUpperCase(),
        model.trim().toUpperCase(),
        color  || null,
        chassis ? chassis.trim().toUpperCase() : null,
        motor_num || null,
        price     ? parseInt(price)  : 0,
        finalSoldAt,
        sold_by,
        ticket_id  || null,
        payment_method || null,
        sale_type      || null,
        sale_notes     || null,
        sale_price     ? parseInt(sale_price)     : null,
        cost_price     ? parseInt(cost_price)     : null,
        invoice_amount ? parseInt(invoice_amount) : null,
        delivered      ? true : false,
        client_name    || null,
        client_rut     || null,
        req.user.id,
      ]
    );

    const unit = rows[0];

    await db.query(
      `INSERT INTO inventory_history (inventory_id, event_type, to_status, user_id, note, metadata)
       VALUES ($1, 'sold', 'vendida', $2, $3, $4)`,
      [
        unit.id, req.user.id,
        `Venta registrada desde módulo de ventas${sale_notes ? '. ' + sale_notes : ''}`,
        JSON.stringify({ sold_by, payment_method, sale_type, ticket_id }),
      ]
    );

    if (ticket_id) {
      await db.query(
        `INSERT INTO timeline (ticket_id, user_id, type, title, note)
         VALUES ($1, $2, 'system', $3, $4)`,
        [
          ticket_id, req.user.id,
          `Moto vendida: ${unit.brand} ${unit.model} · Chasis ${unit.chassis}`,
          `Registrada por ${req.user.first_name}. ${payment_method ? 'Pago: ' + payment_method + '. ' : ''}${sale_notes || ''}`,
        ]
      );
    }

    res.status(201).json(unit);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Chasis ya existe en el inventario' });
    console.error('[Sales] POST /', e);
    res.status(500).json({ error: 'Error al registrar venta' });
  }
});

// ─── PATCH /api/sales/:id ─────────────────────────────────────────────────────
router.patch('/:id', roleCheck('super_admin', 'admin_comercial', 'backoffice', 'vendedor'), async (req, res) => {
  try {
    const UPDATABLE = [
      'sale_price', 'cost_price', 'invoice_amount',
      'sale_type', 'payment_method', 'sale_notes',
      'delivered', 'distributor_paid',
      'doc_factura_dist', 'doc_factura_cli', 'doc_homologacion', 'doc_inscripcion',
      'client_name', 'client_rut',
    ];

    const sets = [], params = [];
    let idx = 1;

    for (const field of UPDATABLE) {
      if (req.body[field] !== undefined) {
        sets.push(`${field} = $${idx++}`);
        params.push(req.body[field]);
      }
    }

    if (sets.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });
    params.push(req.params.id);

    const { rows } = await db.query(
      `UPDATE inventory SET ${sets.join(', ')}, updated_at = NOW()
       WHERE id = $${idx} AND status IN ('vendida', 'reservada')
       RETURNING *`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: 'Venta no encontrada' });

    res.json(rows[0]);
  } catch (e) {
    console.error('[Sales] PATCH /:id', e);
    res.status(500).json({ error: 'Error al actualizar venta' });
  }
});

// ─── DELETE /api/sales/:id — solo super_admin ─────────────────────────────────
// No borra la fila: revierte la unidad a 'disponible' y limpia todos los campos
// de venta. Registra el evento en inventory_history para trazabilidad completa.
// El ticket vinculado NO se toca — su estado lo gestiona el admin manualmente.
router.delete('/:id', roleCheck('super_admin'), async (req, res) => {
  try {
    // Verificar que existe y está vendida o reservada
    const { rows: cur } = await db.query(
      `SELECT id, brand, model, chassis, ticket_id, sold_by, status FROM inventory WHERE id = $1 AND status IN ('vendida', 'reservada')`,
      [req.params.id]
    );
    if (!cur[0]) return res.status(404).json({ error: 'Registro no encontrado' });

    const unit = cur[0];

    // Revertir a disponible, limpiar todos los campos de venta
    await db.query(
      `UPDATE inventory SET
         status          = 'disponible',
         sold_at         = NULL,
         sold_by         = NULL,
         ticket_id       = NULL,
         sale_notes      = NULL,
         payment_method  = NULL,
         sale_type       = NULL,
         added_as_sold   = false,
         sale_price      = NULL,
         cost_price      = NULL,
         invoice_amount  = NULL,
         delivered       = false,
         distributor_paid= false,
         doc_factura_dist= NULL,
         doc_factura_cli = NULL,
         doc_homologacion= NULL,
         doc_inscripcion = NULL,
         client_name     = NULL,
         client_rut      = NULL,
         updated_at      = NOW()
       WHERE id = $1`,
      [req.params.id]
    );

    // Registrar en historial para trazabilidad
    await db.query(
      `INSERT INTO inventory_history (inventory_id, event_type, from_status, to_status, user_id, note, metadata)
       VALUES ($1, 'status_changed', $5, 'disponible', $2, $3, $4)`,
      [
        req.params.id,
        req.user.id,
        `${unit.status === 'reservada' ? 'Reserva' : 'Venta'} eliminada — unidad revertida a disponible por ${req.user.first_name || req.user.email}`,
        JSON.stringify({ deleted_by: req.user.id, ticket_id_was: unit.ticket_id }),
        unit.status,
      ]
    );

    res.json({
      ok: true,
      message: `Unidad ${unit.brand} ${unit.model} (${unit.chassis}) revertida a disponible`,
      ticket_id_was: unit.ticket_id || null,
    });
  } catch (e) {
    console.error('[Sales] DELETE /:id', e);
    res.status(500).json({ error: 'Error al eliminar venta' });
  }
});

// ─── POST /api/sales/:id/doc ──────────────────────────────────────────────────
router.post('/:id/doc', roleCheck('super_admin', 'backoffice'), uploadDoc.single('file'), async (req, res) => {
  try {
    const { field } = req.body;

    if (!DOC_FIELDS.includes(field)) {
      return res.status(400).json({ error: `Campo inválido. Válidos: ${DOC_FIELDS.join(', ')}` });
    }
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });

    const { rows: check } = await db.query(
      `SELECT id FROM inventory WHERE id = $1 AND status = 'vendida'`,
      [req.params.id]
    );
    if (!check[0]) return res.status(404).json({ error: 'Venta no encontrada' });

    const b64     = req.file.buffer.toString('base64');
    const dataUri = `data:${req.file.mimetype};base64,${b64}`;
    const result  = await cloudinary.uploader.upload(dataUri, {
      folder:        'crmaosbike/sales',
      resource_type: 'auto',
    });

    await db.query(
      `UPDATE inventory SET ${field} = $1, updated_at = NOW() WHERE id = $2`,
      [result.secure_url, req.params.id]
    );

    res.json({ url: result.secure_url });
  } catch (e) {
    console.error('[Sales] POST /:id/doc', e);
    res.status(500).json({ error: 'Error al subir documento' });
  }
});

module.exports = router;
