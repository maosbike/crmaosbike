const router = require('express').Router();
const db = require('../config/db');
const { auth, roleCheck } = require('../middleware/auth');

router.use(auth);
router.use(roleCheck('super_admin', 'admin_comercial', 'vendedor'));

// ═══════════════════════════════════════════════════
// GET /api/reports?from=&to=&branch_id=&seller_id=&brand=&model=&status=&fin_status=&color=
// Un solo endpoint optimizado que devuelve TODOS los datos de reportes
// ═══════════════════════════════════════════════════
router.get('/', async (req, res) => {
  try {
    const { from, to, branch_id, seller_id, brand, model, status, fin_status, color } = req.query;
    const isVendedor = req.user.role === 'vendedor';

    // Build WHERE clauses
    const conditions = ['1=1'];
    const params = [];
    let idx = 1;

    if (isVendedor) {
      conditions.push(`t.assigned_to = $${idx++}`);
      params.push(req.user.id);
    }
    if (from) { conditions.push(`t.created_at >= $${idx++}`); params.push(from); }
    if (to) { conditions.push(`t.created_at < ($${idx++})::date + 1`); params.push(to); }
    if (branch_id) { conditions.push(`t.branch_id = $${idx++}`); params.push(branch_id); }
    if (seller_id) { conditions.push(`t.assigned_to = $${idx++}`); params.push(seller_id); }
    if (brand) { conditions.push(`m.brand = $${idx++}`); params.push(brand); }
    if (model) { conditions.push(`m.model = $${idx++}`); params.push(model); }
    if (status) { conditions.push(`t.status = $${idx++}`); params.push(status); }
    if (fin_status) { conditions.push(`t.fin_status = $${idx++}`); params.push(fin_status); }
    if (color) { conditions.push(`t.color_pref = $${idx++}`); params.push(color); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // ── KPIs globales ──
    const kpiQ = `
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE t.status = 'ganado') as ganados,
        COUNT(*) FILTER (WHERE t.status = 'perdido') as perdidos,
        COUNT(*) FILTER (WHERE t.status NOT IN ('ganado','perdido','cerrado')) as activos,
        COUNT(*) FILTER (WHERE t.wants_financing = true) as con_fin,
        COUNT(*) FILTER (WHERE t.wants_financing = false OR t.wants_financing IS NULL) as sin_fin,
        COUNT(*) FILTER (WHERE t.sla_status = 'breached') as sla_breached,
        COUNT(*) FILTER (WHERE t.first_action_at IS NULL AND t.status NOT IN ('ganado','perdido','cerrado')) as sin_tocar,
        ROUND(AVG(EXTRACT(EPOCH FROM (t.first_action_at - t.created_at))/3600) FILTER (WHERE t.first_action_at IS NOT NULL), 1) as avg_first_action_hrs
      FROM tickets t
      LEFT JOIN moto_models m ON t.model_id = m.id
      ${where}`;

    // ── Por marca ──
    const brandQ = `
      SELECT COALESCE(m.brand, 'Sin marca') as name,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE t.status = 'ganado') as ganados,
        COUNT(*) FILTER (WHERE t.status = 'perdido') as perdidos
      FROM tickets t LEFT JOIN moto_models m ON t.model_id = m.id
      ${where}
      GROUP BY m.brand ORDER BY total DESC`;

    // ── Por modelo ──
    const modelQ = `
      SELECT COALESCE(m.brand,'?') as brand, COALESCE(m.model,'Sin modelo') as name,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE t.status = 'ganado') as ganados,
        COUNT(*) FILTER (WHERE t.status = 'perdido') as perdidos,
        ROUND(AVG(m.price)) as avg_price
      FROM tickets t LEFT JOIN moto_models m ON t.model_id = m.id
      ${where}
      GROUP BY m.brand, m.model ORDER BY total DESC LIMIT 30`;

    // ── Por sucursal ──
    const branchQ = `
      SELECT b.name,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE t.status = 'ganado') as ganados,
        COUNT(*) FILTER (WHERE t.status = 'perdido') as perdidos,
        ROUND(AVG(EXTRACT(EPOCH FROM (t.first_action_at - t.created_at))/3600) FILTER (WHERE t.first_action_at IS NOT NULL), 1) as avg_first_hrs,
        COUNT(*) FILTER (WHERE t.first_action_at IS NULL AND t.status NOT IN ('ganado','perdido','cerrado')) as sin_tocar,
        COUNT(*) FILTER (WHERE t.sla_status = 'breached') as sla_breached
      FROM tickets t LEFT JOIN moto_models m ON t.model_id = m.id LEFT JOIN branches b ON t.branch_id = b.id
      ${where}
      GROUP BY b.name ORDER BY total DESC`;

    // ── Por vendedor ──
    const sellerQ = `
      SELECT u.first_name, u.last_name, b.code as branch_code,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE t.status = 'ganado') as ganados,
        COUNT(*) FILTER (WHERE t.status = 'perdido') as perdidos,
        COUNT(*) FILTER (WHERE t.first_action_at IS NOT NULL) as trabajados,
        ROUND(AVG(EXTRACT(EPOCH FROM (t.first_action_at - t.created_at))/3600) FILTER (WHERE t.first_action_at IS NOT NULL), 1) as avg_first_hrs,
        COUNT(*) FILTER (WHERE t.sla_status = 'breached') as sla_breached,
        COUNT(*) FILTER (WHERE t.reassignment_count > 0) as reasignados
      FROM tickets t LEFT JOIN moto_models m ON t.model_id = m.id LEFT JOIN users u ON t.assigned_to = u.id LEFT JOIN branches b ON u.branch_id = b.id
      ${where}
      GROUP BY u.first_name, u.last_name, b.code ORDER BY ganados DESC`;

    // ── Por financiamiento ──
    const finQ = `
      SELECT
        COUNT(*) FILTER (WHERE t.wants_financing = true) as con_fin,
        COUNT(*) FILTER (WHERE t.wants_financing = false OR t.wants_financing IS NULL) as sin_fin,
        COUNT(*) FILTER (WHERE t.wants_financing = true AND t.fin_status = 'aprobado') as fin_aprobado,
        COUNT(*) FILTER (WHERE t.wants_financing = true AND t.fin_status = 'rechazado') as fin_rechazado,
        COUNT(*) FILTER (WHERE t.wants_financing = true AND t.fin_status = 'en_evaluacion') as fin_evaluacion,
        COUNT(*) FILTER (WHERE t.wants_financing = true AND t.fin_status = 'sin_movimiento') as fin_sin_mov,
        COUNT(*) FILTER (WHERE t.wants_financing = true AND t.fin_status = 'desistido') as fin_desistido,
        COUNT(*) FILTER (WHERE t.wants_financing = true AND t.status = 'ganado') as fin_ganados,
        COUNT(*) FILTER (WHERE (t.wants_financing = false OR t.wants_financing IS NULL) AND t.status = 'ganado') as nofin_ganados
      FROM tickets t LEFT JOIN moto_models m ON t.model_id = m.id
      ${where}`;

    // ── Por color ──
    const colorQ = `
      SELECT COALESCE(NULLIF(t.color_pref,''), 'Sin color') as name,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE t.status = 'ganado') as ganados
      FROM tickets t LEFT JOIN moto_models m ON t.model_id = m.id
      ${where}
      GROUP BY t.color_pref ORDER BY total DESC LIMIT 20`;

    // ── Por estado ──
    const statusQ = `
      SELECT t.status as name,
        COUNT(*) as total
      FROM tickets t LEFT JOIN moto_models m ON t.model_id = m.id
      ${where}
      GROUP BY t.status ORDER BY total DESC`;

    // ── Serie temporal (leads por día, últimos 90 días o rango) ──
    const timeQ = `
      SELECT DATE(t.created_at) as day,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE t.status = 'ganado') as ganados
      FROM tickets t LEFT JOIN moto_models m ON t.model_id = m.id
      ${where}
      GROUP BY DATE(t.created_at) ORDER BY day`;

    // Execute all in parallel
    const [kpi, brands, models, branches, sellers, fin, colors, statuses, timeline] = await Promise.all([
      db.query(kpiQ, params),
      db.query(brandQ, params),
      db.query(modelQ, params),
      db.query(branchQ, params),
      db.query(sellerQ, params),
      db.query(finQ, params),
      db.query(colorQ, params),
      db.query(statusQ, params),
      db.query(timeQ, params),
    ]);

    res.json({
      kpi: kpi.rows[0],
      by_brand: brands.rows,
      by_model: models.rows,
      by_branch: branches.rows,
      by_seller: sellers.rows,
      financing: fin.rows[0],
      by_color: colors.rows,
      by_status: statuses.rows,
      timeline: timeline.rows,
    });
  } catch (e) {
    console.error('Error reports:', e);
    res.status(500).json({ error: 'Error generando reportes' });
  }
});

module.exports = router;
