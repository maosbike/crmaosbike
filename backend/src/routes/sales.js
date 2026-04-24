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
 * Costos internos (cost_price):
 *   Nunca se devuelven a vendedores — eliminados en sanitizeSale() antes de cada respuesta.
 *   invoice_amount (abono del cliente) sí es visible para vendedores.
 *
 * Arquitectura de datos:
 *   - Unidad real del inventario marcada como vendida/reservada → tabla inventory
 *   - Nota comercial sin stock (added_as_sold legacy / nueva) → tabla sales_notes
 *   - POST /sales crea SIEMPRE en sales_notes, nunca toca inventory
 *   - PATCH/DELETE ruteados por is_note_only (body) o ?note=1 (query)
 */

const router = require('express').Router();
const db = require('../config/db');
const logger = require('../config/logger');
const { auth, roleCheck } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const multer = require('multer');
const cloudinary = require('../config/cloudinary');

router.use(auth);

// ─── Config ───────────────────────────────────────────────────────────────────

const COST_FIELDS = ['cost_price'];   // invoice_amount = abono del cliente, visible para vendedores

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

// ─── Vista combinada: inventory (vendida/reservada) + sales_notes ─────────────
// is_note_only discrimina el origen. Se usa en GET, stats y GET/:id.
const COMBINED_FROM = `(
  SELECT
    i.id,
    i.status,
    i.brand, i.model, i.year, i.chassis, i.color, i.motor_num,
    i.price,
    i.sale_price, i.cost_price, i.invoice_amount,
    i.sold_at, i.payment_method, i.sale_type, i.sale_notes,
    i.accessories, i.charge_type, i.charge_amt, i.discount_amt, i.abono_lines,
    i.delivered, i.distributor_paid,
    i.doc_factura_dist, i.doc_factura_cli, i.doc_homologacion, i.doc_inscripcion,
    i.ticket_id,
    i.added_as_sold,
    FALSE AS is_note_only,
    i.model_id,
    mm.image_url,
    sv.id          AS seller_id,
    sv.first_name  AS seller_fn,
    sv.last_name   AS seller_ln,
    b.id           AS branch_id,
    b.name         AS branch_name,
    b.code         AS branch_code,
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
  LEFT JOIN users       sv ON i.sold_by   = sv.id
  LEFT JOIN branches    b  ON i.branch_id = b.id
  LEFT JOIN tickets     t  ON i.ticket_id = t.id
  LEFT JOIN moto_models mm ON i.model_id  = mm.id
  WHERE i.status IN ('vendida', 'reservada')

  UNION ALL

  SELECT
    n.id,
    n.status,
    n.brand, n.model, n.year, n.chassis, n.color, n.motor_num,
    n.price,
    n.sale_price, n.cost_price, n.invoice_amount,
    n.sold_at, n.payment_method, n.sale_type, n.sale_notes,
    n.accessories, n.charge_type, n.charge_amt, n.discount_amt, n.abono_lines,
    n.delivered, n.distributor_paid,
    n.doc_factura_dist, n.doc_factura_cli, n.doc_homologacion, n.doc_inscripcion,
    n.ticket_id,
    TRUE  AS added_as_sold,
    TRUE  AS is_note_only,
    n.model_id,
    mm.image_url,
    sv.id          AS seller_id,
    sv.first_name  AS seller_fn,
    sv.last_name   AS seller_ln,
    b.id           AS branch_id,
    b.name         AS branch_name,
    b.code         AS branch_code,
    t.ticket_num,
    COALESCE(
      NULLIF(TRIM(n.client_name), ''),
      TRIM(CONCAT_WS(' ', t.first_name, t.last_name))
    ) AS client_name,
    COALESCE(
      NULLIF(TRIM(n.client_rut), ''),
      t.rut
    ) AS client_rut
  FROM sales_notes n
  LEFT JOIN users       sv ON n.sold_by   = sv.id
  LEFT JOIN branches    b  ON n.branch_id = b.id
  LEFT JOIN tickets     t  ON n.ticket_id = t.id
  LEFT JOIN moto_models mm ON n.model_id  = mm.id
) c`;

// ─── GET /api/sales ───────────────────────────────────────────────────────────
// Acepta ?page&limit (default 100, max 500). Devuelve data + total + page + limit.
// Compatibilidad: consumidores viejos siguen recibiendo `data` y `total`.
router.get('/', asyncHandler(async (req, res) => {
    const { from, to, branch_id, seller_id, q, status } = req.query;
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 100));
    const offset = (page - 1) * limit;

    const where = [], params = [];
    let idx = 1;

    if (status === 'vendida')        { where.push(`c.status = $${idx++}`); params.push('vendida'); }
    else if (status === 'reservada') { where.push(`c.status = $${idx++}`); params.push('reservada'); }

    if (req.user.role === 'vendedor') {
      where.push(`c.seller_id = $${idx++}`);
      params.push(req.user.id);
    } else if (seller_id) {
      where.push(`c.seller_id = $${idx++}`);
      params.push(seller_id);
    }

    if (from)      { where.push(`c.sold_at >= $${idx++}`);  params.push(from); }
    if (to)        { where.push(`c.sold_at <= $${idx++}`);  params.push(to + ' 23:59:59'); }
    if (branch_id) { where.push(`c.branch_id = $${idx++}`); params.push(branch_id); }

    if (q) {
      where.push(`(
        c.chassis      ILIKE $${idx}
        OR c.brand     ILIKE $${idx}
        OR c.model     ILIKE $${idx}
        OR c.ticket_num  ILIKE $${idx}
        OR c.client_name ILIKE $${idx}
      )`);
      params.push(`%${q}%`);
      idx++;
    }

    const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const countR = await db.query(
      `SELECT COUNT(*)::int AS n FROM ${COMBINED_FROM} ${clause}`,
      params
    );
    const total = countR.rows[0]?.n || 0;

    const { rows } = await db.query(
      `SELECT * FROM ${COMBINED_FROM} ${clause}
       ORDER BY c.sold_at DESC NULLS LAST
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    );

    res.json({
      data: rows.map(s => sanitizeSale(s, req.user.role)),
      total,
      page,
      limit,
    });
}));

// ─── GET /api/sales/stats ─────────────────────────────────────────────────────
router.get('/stats', asyncHandler(async (req, res) => {
    const { from, to, branch_id } = req.query;
    const where = [], params = [];
    let idx = 1;

    if (req.user.role === 'vendedor') {
      where.push(`c.seller_id = $${idx++}`);
      params.push(req.user.id);
    }

    const monthStart = from || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const monthEnd   = to   ? to + ' 23:59:59' : new Date().toISOString();
    where.push(`c.sold_at >= $${idx++}`); params.push(monthStart);
    where.push(`c.sold_at <= $${idx++}`); params.push(monthEnd);

    if (branch_id) { where.push(`c.branch_id = $${idx++}`); params.push(branch_id); }

    const whereClause = `WHERE c.status = 'vendida' AND ${where.join(' AND ')}`;

    const { rows } = await db.query(`
      SELECT
        COUNT(*)                                                                   AS total,
        COUNT(*) FILTER (WHERE c.doc_factura_cli  IS NULL
                           OR  c.doc_factura_cli  = '')                            AS sin_factura_cli,
        COUNT(*) FILTER (WHERE c.doc_homologacion IS NULL
                           OR  c.doc_homologacion = '')                            AS sin_homologacion,
        COUNT(*) FILTER (WHERE c.doc_inscripcion  IS NULL
                           OR  c.doc_inscripcion  = '')                            AS sin_inscripcion,
        COUNT(*) FILTER (WHERE c.delivered = false
                           OR  c.delivered IS NULL)                                AS pendiente_entrega,
        COUNT(*) FILTER (WHERE c.distributor_paid = false
                           OR  c.distributor_paid IS NULL)                         AS pendiente_distribuidor,
        SUM(c.sale_price)                                                          AS total_venta,
        SUM(c.cost_price)                                                          AS total_costo,
        SUM(c.invoice_amount)                                                      AS total_facturado
      FROM ${COMBINED_FROM}
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
}));

// ─── GET /api/sales/:id ───────────────────────────────────────────────────────
router.get('/:id', asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      `SELECT * FROM ${COMBINED_FROM} WHERE c.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Venta no encontrada' });

    const sale = rows[0];
    if (req.user.role === 'vendedor' && sale.seller_id !== req.user.id) {
      return res.status(403).json({ error: 'Sin permiso para ver esta venta' });
    }

    res.json(sanitizeSale(sale, req.user.role));
}));

// ─── POST /api/sales ──────────────────────────────────────────────────────────
// Siempre inserta en sales_notes — nunca crea filas en inventory.
// Para vincular una unidad real usá POST /inventory/:id/sell.
router.post('/', roleCheck('super_admin', 'admin_comercial', 'backoffice', 'vendedor'), async (req, res) => {
  try {
    const {
      branch_id, year, brand, model, color, chassis, motor_num, price,
      sold_at, ticket_id, payment_method, sale_type, sale_notes,
      sale_price, invoice_amount, delivered,
      client_name, client_rut, status: reqStatus,
      model_id: reqModelId,
      accessories, charge_type, charge_amt, discount_amt,
    } = req.body;

    // Normaliza desglose de extras
    const accArr = Array.isArray(accessories)
      ? accessories
          .filter(a => a && (a.description || a.amount))
          .map(a => ({
            description: String(a.description || '').slice(0, 200),
            amount: parseInt(a.amount) || 0,
          }))
      : null;
    const chType = ['completa','inscripcion','transferencia'].includes(charge_type) ? charge_type : null;
    const chAmt  = charge_amt  != null && charge_amt  !== '' ? (parseInt(charge_amt)  || 0) : null;
    const dcAmt  = discount_amt != null && discount_amt !== '' ? (parseInt(discount_amt) || 0) : null;

    // Vendedor: solo puede registrar ventas propias. Forzamos sold_by a su propio id.
    const sold_by = req.user.role === 'vendedor' ? req.user.id : (req.body.sold_by || null);
    // Vendedor no puede pasar cost_price
    const cost_price = req.user.role === 'vendedor' ? null : (req.body.cost_price || null);

    if (!brand || !model)
      return res.status(400).json({ error: 'Marca y modelo son obligatorios' });
    if (!sold_by)
      return res.status(400).json({ error: 'Vendedor obligatorio' });

    const finalStatus = reqStatus === 'reservada' ? 'reservada' : 'vendida';
    const finalSoldAt = sold_at ? new Date(sold_at).toISOString() : new Date().toISOString();

    await db.query('BEGIN');

    // Auto-asociación al catálogo por match canónico (marca+modelo) si no viene explícito.
    // Preferimos el de mismo año, luego activos.
    let finalModelId = reqModelId || null;
    if (!finalModelId) {
      const mlu = await db.query(
        `SELECT id FROM moto_models
         WHERE UPPER(REGEXP_REPLACE(brand, '[\\s\\-\\.]', '', 'g'))
             = UPPER(REGEXP_REPLACE($1, '[\\s\\-\\.]', '', 'g'))
           AND UPPER(REGEXP_REPLACE(model, '[\\s\\-\\.]', '', 'g'))
             = UPPER(REGEXP_REPLACE($2, '[\\s\\-\\.]', '', 'g'))
         ORDER BY CASE WHEN year = $3 THEN 0 ELSE 1 END, active DESC
         LIMIT 1`,
        [brand, model, year ? parseInt(year) : null]
      );
      finalModelId = mlu.rows[0]?.id || null;
    }

    const { rows } = await db.query(
      `INSERT INTO sales_notes (
         status, branch_id, year, brand, model, color, chassis, motor_num, price,
         sold_at, sold_by, ticket_id,
         payment_method, sale_type, sale_notes,
         sale_price, cost_price, invoice_amount, delivered,
         client_name, client_rut, created_by, model_id,
         accessories, charge_type, charge_amt, discount_amt
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9,
         $10, $11, $12,
         $13, $14, $15,
         $16, $17, $18, $19,
         $20, $21, $22, $23,
         $24, $25, $26, $27
       ) RETURNING *`,
      [
        finalStatus,
        branch_id  || null,
        year       ? parseInt(year)  : null,
        brand.trim().toUpperCase(),
        model.trim().toUpperCase(),
        color      || null,
        chassis    ? chassis.trim().toUpperCase() : null,
        motor_num  || null,
        price      ? parseInt(price) : 0,
        finalSoldAt,
        sold_by,
        ticket_id  || null,
        payment_method || null,
        sale_type      || null,
        sale_notes     || null,
        sale_price     ? parseInt(sale_price)     : null,
        cost_price     ? parseInt(cost_price)     : null,
        invoice_amount ? parseInt(invoice_amount) : null,
        delivered ? true : false,
        client_name || null,
        client_rut  || null,
        req.user.id,
        finalModelId,
        accArr && accArr.length ? JSON.stringify(accArr) : null,
        chType,
        chAmt,
        dcAmt,
      ]
    );

    // Cierre atómico del ticket cuando es venta (no reserva) y viene vinculada a un ticket
    if (ticket_id && finalStatus === 'vendida') {
      await db.query(
        `UPDATE tickets SET status = 'ganado', updated_at = NOW()
         WHERE id = $1 AND status != 'ganado'`,
        [ticket_id]
      );
    }

    await db.query('COMMIT');

    // Notificación a admins por Telegram — fire-and-forget para no bloquear la respuesta.
    // sales_notes vive fuera del inventario real → in_inventory: false.
    (async () => {
      try {
        const [{ rows: br }, { rows: se }] = await Promise.all([
          branch_id ? db.query('SELECT name FROM branches WHERE id = $1', [branch_id]) : Promise.resolve({ rows: [] }),
          sold_by   ? db.query('SELECT first_name, last_name FROM users WHERE id = $1', [sold_by]) : Promise.resolve({ rows: [] }),
        ]);
        const TelegramService = require('../services/telegramService');
        await TelegramService.notifyAdminsOfSale({
          kind: finalStatus === 'reservada' ? 'reserva' : 'venta',
          in_inventory: false,
          brand, model, year, color,
          list_price:     price,
          sale_price,
          invoice_amount,
          payment_method, sale_type, sale_notes,
          client_name, client_rut,
          branch_name: br[0]?.name || null,
          seller_name: se[0] ? `${se[0].first_name || ''} ${se[0].last_name || ''}`.trim() : null,
          accessories:  accArr,
          charge_type:  chType,
          charge_amt:   chAmt,
          discount_amt: dcAmt,
        });
      } catch (e) {
        logger.warn(`[Telegram] sales.POST notify error: ${e.message}`);
      }
    })();

    res.status(201).json({ ...rows[0], is_note_only: true });
  } catch (e) {
    await db.query('ROLLBACK').catch(() => {});
    logger.error({err:e},'[Sales] POST /');
    res.status(500).json({ error: 'Error al registrar venta' });
  }
});

// ─── PATCH /api/sales/:id ─────────────────────────────────────────────────────
// is_note_only en el body → UPDATE sales_notes
// sin is_note_only (o false) → UPDATE inventory
router.patch('/:id', roleCheck('super_admin', 'admin_comercial', 'backoffice', 'vendedor'), asyncHandler(async (req, res) => {
    const isNoteOnly = req.body.is_note_only === true || req.body.is_note_only === 'true';

    // Vendedor: ownership check y bloqueo de campos sensibles
    if (req.user.role === 'vendedor') {
      const tbl = isNoteOnly ? 'sales_notes' : 'inventory';
      const sc  = isNoteOnly ? '' : `AND status IN ('vendida','reservada')`;
      const { rows: own } = await db.query(
        `SELECT 1 FROM ${tbl} WHERE id = $1 AND sold_by = $2 ${sc}`,
        [req.params.id, req.user.id]
      );
      if (!own[0]) return res.status(403).json({ error: 'Sin permiso para editar esta venta' });
      // Bloquear solo campos internos — invoice_amount (abono) sí es editable por vendedor
      ['cost_price', 'distributor_paid', 'doc_factura_dist'].forEach(f => delete req.body[f]);
    }

    const UPDATABLE_BASE = [
      'sale_price', 'cost_price', 'invoice_amount',
      'sale_type', 'payment_method', 'sale_notes',
      'delivered', 'distributor_paid',
      'doc_factura_dist', 'doc_factura_cli', 'doc_homologacion', 'doc_inscripcion',
      'client_name', 'client_rut', 'sold_by', 'branch_id', 'model_id',
      'accessories', 'charge_type', 'charge_amt', 'discount_amt', 'abono_lines',
    ];

    // abono_lines: si viene array, derivar invoice_amount (suma) y
    // payment_method ('Mixto' si >1) antes de aplicar la lista UPDATABLE.
    if (req.body.abono_lines !== undefined) {
      const arr = Array.isArray(req.body.abono_lines)
        ? req.body.abono_lines
            .filter(l => l && l.method && Number(l.amount) > 0)
            .map(l => ({ method: String(l.method).slice(0, 50), amount: parseInt(l.amount) || 0 }))
        : null;
      req.body.abono_lines = arr && arr.length ? arr : null;
      if (arr && arr.length) {
        req.body.invoice_amount = arr.reduce((s, l) => s + l.amount, 0);
        if (!req.body.payment_method) {
          req.body.payment_method = arr.length > 1 ? 'Mixto' : arr[0].method;
        }
      }
    }
    // sales_notes admite además cambio de estado, fecha y datos del vehículo
    const UPDATABLE = isNoteOnly
      ? [...UPDATABLE_BASE, 'status', 'sold_at', 'brand', 'model', 'year', 'color', 'chassis', 'motor_num']
      : UPDATABLE_BASE;

    // Columnas numéricas — el form manda '' cuando está vacío, Postgres falla en INTEGER
    const INT_FIELDS = new Set(['sale_price', 'cost_price', 'invoice_amount', 'year']);
    const JSON_FIELDS = new Set(['accessories', 'abono_lines']);
    const coerce = (field, v) => {
      if (INT_FIELDS.has(field)) {
        if (v === '' || v === null || v === undefined) return null;
        const n = parseInt(v, 10);
        return isNaN(n) ? null : n;
      }
      if (JSON_FIELDS.has(field)) {
        if (v == null) return null;
        return Array.isArray(v) && v.length ? JSON.stringify(v) : null;
      }
      if (field === 'charge_type') {
        return ['completa','inscripcion','transferencia'].includes(v) ? v : null;
      }
      // UUIDs que pueden venir como '' desde selects
      if ((field === 'sold_by' || field === 'branch_id' || field === 'model_id') && v === '') return null;
      return v;
    };

    const sets = [], params = [];
    let idx = 1;

    for (const field of UPDATABLE) {
      if (req.body[field] !== undefined) {
        sets.push(`${field} = $${idx++}`);
        params.push(coerce(field, req.body[field]));
      }
    }

    if (sets.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });
    params.push(req.params.id);

    const table       = isNoteOnly ? 'sales_notes' : 'inventory';
    const statusCheck = isNoteOnly ? '' : `AND status IN ('vendida', 'reservada')`;

    const { rows } = await db.query(
      `UPDATE ${table} SET ${sets.join(', ')}, updated_at = NOW()
       WHERE id = $${idx} ${statusCheck}
       RETURNING *`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: 'Venta no encontrada' });

    res.json({ ...rows[0], is_note_only: isNoteOnly });
}));

// ─── DELETE /api/sales/:id — solo super_admin ─────────────────────────────────
// ?note=1  → DELETE de sales_notes (fila eliminada definitivamente)
// sin flag → revierte unidad de inventory a 'disponible'
router.delete('/:id', roleCheck('super_admin'), async (req, res) => {
  try {
    const isNoteOnly = req.query.note === '1';

    if (isNoteOnly) {
      const { rows } = await db.query(
        `DELETE FROM sales_notes WHERE id = $1 RETURNING *`,
        [req.params.id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Registro no encontrado' });
      return res.json({
        ok: true,
        message: 'Nota comercial eliminada',
        ticket_id_was: rows[0].ticket_id || null,
      });
    }

    // Unidad real de inventario: verificar y revertir
    const { rows: cur } = await db.query(
      `SELECT id, brand, model, chassis, ticket_id, sold_by, status
       FROM inventory WHERE id = $1 AND status IN ('vendida', 'reservada')`,
      [req.params.id]
    );
    if (!cur[0]) return res.status(404).json({ error: 'Registro no encontrado' });

    const unit = cur[0];

    await db.query('BEGIN');

    await db.query(
      `UPDATE inventory SET
         status           = 'disponible',
         sold_at          = NULL,
         sold_by          = NULL,
         ticket_id        = NULL,
         sale_notes       = NULL,
         payment_method   = NULL,
         sale_type        = NULL,
         added_as_sold    = false,
         sale_price       = NULL,
         cost_price       = NULL,
         invoice_amount   = NULL,
         delivered        = false,
         distributor_paid = false,
         doc_factura_dist = NULL,
         doc_factura_cli  = NULL,
         doc_homologacion = NULL,
         doc_inscripcion  = NULL,
         client_name      = NULL,
         client_rut       = NULL,
         updated_at       = NOW()
       WHERE id = $1`,
      [req.params.id]
    );

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

    // Si era venta (no reserva) con ticket vinculado y ticket estaba en 'ganado' → reabrir
    if (unit.ticket_id && unit.status === 'vendida') {
      const { rows: reopened } = await db.query(
        `UPDATE tickets SET status = 'en_gestion', updated_at = NOW()
         WHERE id = $1 AND status = 'ganado'
         RETURNING id`,
        [unit.ticket_id]
      );
      if (reopened[0]) {
        await db.query(
          `INSERT INTO timeline (ticket_id, user_id, type, title)
           VALUES ($1, $2, 'system', 'Venta eliminada — ticket reabierto')`,
          [unit.ticket_id, req.user.id]
        );
      }
    }

    await db.query('COMMIT');

    res.json({
      ok: true,
      message: `Unidad ${unit.brand} ${unit.model} (${unit.chassis}) revertida a disponible`,
      ticket_id_was: unit.ticket_id || null,
    });
  } catch (e) {
    await db.query('ROLLBACK').catch(() => {});
    logger.error({err:e},'[Sales] DELETE /:id');
    res.status(500).json({ error: 'Error al eliminar venta' });
  }
});

// ─── POST /api/sales/:id/doc ──────────────────────────────────────────────────
// ?note=1 → sube doc a sales_notes; sin flag → a inventory
router.post('/:id/doc', roleCheck('super_admin', 'admin_comercial', 'backoffice', 'vendedor'), uploadDoc.single('file'), asyncHandler(async (req, res) => {
    const { field } = req.body;
    const isNoteOnly = req.query.note === '1';

    if (!DOC_FIELDS.includes(field)) {
      return res.status(400).json({ error: `Campo inválido. Válidos: ${DOC_FIELDS.join(', ')}` });
    }
    // Vendedor no puede subir la factura del distribuidor
    if (req.user.role === 'vendedor' && field === 'doc_factura_dist') {
      return res.status(403).json({ error: 'Sin permiso para subir este documento' });
    }
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });

    const table       = isNoteOnly ? 'sales_notes' : 'inventory';
    const statusCheck = isNoteOnly ? '' : `AND status IN ('vendida','reservada')`;

    // Ownership check para vendedor — parametrizado (nada de interpolación).
    const isVendedor  = req.user.role === 'vendedor';
    const ownerClause = isVendedor ? `AND sold_by = $2` : '';
    const checkParams = isVendedor ? [req.params.id, req.user.id] : [req.params.id];
    const { rows: check } = await db.query(
      `SELECT id FROM ${table} WHERE id = $1 ${statusCheck} ${ownerClause}`,
      checkParams
    );
    if (!check[0]) return res.status(404).json({ error: 'Venta no encontrada' });

    const b64     = req.file.buffer.toString('base64');
    const dataUri = `data:${req.file.mimetype};base64,${b64}`;
    const result  = await cloudinary.uploader.upload(dataUri, {
      folder:        'crmaosbike/sales',
      resource_type: 'auto',
    });

    await db.query(
      `UPDATE ${table} SET ${field} = $1, updated_at = NOW() WHERE id = $2`,
      [result.secure_url, req.params.id]
    );

    res.json({ url: result.secure_url });
}));

module.exports = router;
