const router = require('express').Router();
const db = require('../config/db');
const { auth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

router.use(auth);

// ═══════════════════════════════════════════════════
// LISTAR NOTIFICACIONES DEL USUARIO
// GET /api/notifications?unread_only=true&limit=30
// ═══════════════════════════════════════════════════
router.get('/', asyncHandler(async (req, res) => {
    const { unread_only, limit = 30 } = req.query;
    let query = `
      SELECT * FROM notifications
      WHERE user_id = $1
    `;
    const params = [req.user.id];

    if (unread_only === 'true') {
      query += ` AND is_read = false`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit));

    const { rows } = await db.query(query, params);

    // Contar no leídas
    const { rows: countRows } = await db.query(
      `SELECT COUNT(*) as unread FROM notifications WHERE user_id = $1 AND is_read = false`,
      [req.user.id]
    );

    res.json({
      notifications: rows,
      unread_count: parseInt(countRows[0].unread)
    });
}));

// ═══════════════════════════════════════════════════
// CONTAR NO LEÍDAS (para badge)
// GET /api/notifications/unread-count
// ═══════════════════════════════════════════════════
router.get('/unread-count', asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      `SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false`,
      [req.user.id]
    );
    res.json({ count: parseInt(rows[0].count) });
}));

// ═══════════════════════════════════════════════════
// MARCAR UNA COMO LEÍDA
// PUT /api/notifications/:id/read
// ═══════════════════════════════════════════════════
router.put('/:id/read', asyncHandler(async (req, res) => {
    await db.query(
      `UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    res.json({ ok: true });
}));

// ═══════════════════════════════════════════════════
// MARCAR TODAS COMO LEÍDAS
// PUT /api/notifications/read-all
// ═══════════════════════════════════════════════════
router.put('/read-all', asyncHandler(async (req, res) => {
    const { rowCount } = await db.query(
      `UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false`,
      [req.user.id]
    );
    res.json({ ok: true, marked: rowCount });
}));

module.exports = router;
