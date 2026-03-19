const router = require('express').Router();
const db = require('../config/db');
const { auth, roleCheck } = require('../middleware/auth');
const multer = require('multer');
const xlsx = require('xlsx');

// ─── Multer config ────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const ok = /\.(csv|xlsx|xls)$/i.test(file.originalname);
    if (ok) cb(null, true);
    else cb(new Error('Solo se permiten archivos CSV o Excel (.csv, .xlsx)'));
  },
});

router.use(auth);
router.use(roleCheck('super_admin'));

// ─── Column aliases (normalize incoming headers) ──────────────
const COL_ALIASES = {
  nombre:     ['nombre', 'first_name', 'name', 'nombres'],
  apellido:   ['apellido', 'last_name', 'apellidos'],
  telefono:   ['telefono', 'teléfono', 'phone', 'celular', 'fono', 'cel'],
  email:      ['email', 'correo', 'mail', 'e-mail'],
  rut:        ['rut', 'run', 'rut_cliente'],
  sucursal:   ['sucursal', 'branch', 'tienda', 'local'],
  fuente:     ['fuente', 'source', 'origen', 'canal'],
  prioridad:  ['prioridad', 'priority', 'urgencia'],
  comuna:     ['comuna', 'ciudad', 'city'],
  color_pref: ['color', 'color_pref', 'color_preferido'],
};

const VALID_SOURCES  = ['web','redes_sociales','whatsapp','presencial','referido','evento','llamada','importacion'];
const VALID_PRIORITY = ['alta','media','baja'];

function buildHeaderMap(rawHeaders) {
  const map = {};
  rawHeaders.forEach((h, i) => {
    const key = (h || '').toString().trim().toLowerCase();
    for (const [field, aliases] of Object.entries(COL_ALIASES)) {
      if (aliases.some(a => key === a || key.includes(a))) {
        if (map[field] === undefined) map[field] = i;
        break;
      }
    }
  });
  return map;
}

function get(row, headerMap, field) {
  const idx = headerMap[field];
  if (idx === undefined) return '';
  return (row[idx] ?? '').toString().trim();
}

function normalizeRut(raw) {
  return raw.replace(/\./g, '').replace(/-/g, '').toUpperCase().trim();
}

function validateRow(row, headerMap, rowIndex) {
  const nombre    = get(row, headerMap, 'nombre');
  const apellido  = get(row, headerMap, 'apellido');
  const telefono  = get(row, headerMap, 'telefono');
  const email     = get(row, headerMap, 'email');
  const rut       = get(row, headerMap, 'rut');
  const sucursal  = get(row, headerMap, 'sucursal').toLowerCase();
  const fuente    = get(row, headerMap, 'fuente').toLowerCase() || 'importacion';
  const prioridad = get(row, headerMap, 'prioridad').toLowerCase() || 'media';
  const comuna    = get(row, headerMap, 'comuna');
  const colorPref = get(row, headerMap, 'color_pref');

  const errors = [];

  if (!nombre)                     errors.push('Nombre obligatorio');
  if (!telefono && !email)         errors.push('Teléfono o email obligatorio');
  if (!sucursal)                   errors.push('Sucursal obligatoria');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
                                   errors.push('Formato de email inválido');
  if (telefono && !/^\+?[\d\s\-\(\)]{6,16}$/.test(telefono))
                                   errors.push('Formato de teléfono inválido');
  if (rut) {
    const cleaned = normalizeRut(rut);
    if (!/^\d{6,8}[0-9K]$/.test(cleaned)) errors.push('Formato de RUT inválido');
  }
  if (prioridad && !VALID_PRIORITY.includes(prioridad))
    errors.push(`Prioridad inválida — usar: alta, media, baja`);

  return {
    _row: rowIndex,
    nombre,
    apellido:   apellido || null,
    telefono:   telefono || null,
    email:      email    || null,
    rut:        rut ? normalizeRut(rut) : null,
    sucursal,
    fuente:     VALID_SOURCES.includes(fuente) ? fuente : 'importacion',
    prioridad:  VALID_PRIORITY.includes(prioridad) ? prioridad : 'media',
    comuna:     comuna    || null,
    color_pref: colorPref || null,
    errors,
    status:     errors.length > 0 ? 'error' : 'valid',
    // resolved later:
    branch_id:  null,
    branch_name: null,
    dup_reason: null,
    no_seller_warning: null,
  };
}

// ─── Helpers ─────────────────────────────────────────────────
function parseBuffer(buffer, originalname) {
  const wb = xlsx.read(buffer, { type: 'buffer', raw: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
  if (!raw || raw.length < 2) throw new Error('El archivo está vacío o solo tiene encabezados');
  return raw;
}

// ─── GET /api/import/template ─────────────────────────────────
// Returns a CSV template as text for download
router.get('/template', (req, res) => {
  const csv = 'nombre,apellido,telefono,email,rut,sucursal,fuente,prioridad,comuna,color_pref\n' +
              'Juan,Pérez,+56912345678,juan@email.com,12345678-9,MPN,whatsapp,media,Huechuraba,Negro\n';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="template_prospectos.csv"');
  res.send(csv);
});

// ─── POST /api/import/preview ─────────────────────────────────
router.post('/preview', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });

    const raw = parseBuffer(req.file.buffer, req.file.originalname);
    const rawHeaders = raw[0].map(h => (h || '').toString());
    const headerMap  = buildHeaderMap(rawHeaders);

    if (headerMap.nombre === undefined) {
      return res.status(400).json({
        error: 'El archivo debe tener una columna "nombre". Descarga la plantilla para ver el formato esperado.',
      });
    }

    // Parse and validate each row
    const rows = [];
    for (let i = 1; i < raw.length; i++) {
      const row = raw[i];
      if (!row || row.every(c => c === '' || c === null || c === undefined)) continue;
      rows.push(validateRow(row, headerMap, i + 1)); // +1 for 1-based row number
    }

    if (rows.length === 0) return res.status(400).json({ error: 'No se encontraron filas de datos' });

    // ── Detect in-file duplicates ──────────────────────────────
    const seenRut   = new Map();
    const seenEmail = new Map();
    const seenPhone = new Map();
    for (const r of rows) {
      if (r.rut)     seenRut.set(r.rut,                (seenRut.get(r.rut) || 0)                   + 1);
      if (r.email)   seenEmail.set(r.email.toLowerCase(), (seenEmail.get(r.email.toLowerCase()) || 0) + 1);
      if (r.telefono) seenPhone.set(r.telefono,         (seenPhone.get(r.telefono) || 0)            + 1);
    }

    // ── Check DB duplicates ────────────────────────────────────
    const dbDupRuts   = new Set();
    const dbDupEmails = new Set();
    const dbDupPhones = new Set();

    const ruts   = rows.filter(r => r.rut).map(r => r.rut);
    const emails = rows.filter(r => r.email).map(r => r.email.toLowerCase());
    const phones = rows.filter(r => r.telefono).map(r => r.telefono);

    if (ruts.length) {
      const { rows: dr } = await db.query(
        `SELECT rut FROM tickets WHERE rut = ANY($1::text[]) AND rut IS NOT NULL`, [ruts]
      );
      dr.forEach(r => dbDupRuts.add(normalizeRut(r.rut)));
    }
    if (emails.length) {
      const { rows: de } = await db.query(
        `SELECT email FROM tickets WHERE LOWER(email) = ANY($1::text[]) AND email IS NOT NULL`, [emails]
      );
      de.forEach(r => dbDupEmails.add(r.email.toLowerCase()));
    }
    if (phones.length) {
      const { rows: dp } = await db.query(
        `SELECT phone FROM tickets WHERE phone = ANY($1::text[]) AND phone IS NOT NULL`, [phones]
      );
      dp.forEach(r => dbDupPhones.add(r.phone));
    }

    // ── Load active branches ───────────────────────────────────
    const { rows: branches } = await db.query('SELECT id, name, code FROM branches WHERE active = true');
    const branchMap = {};
    branches.forEach(b => {
      branchMap[b.code.toLowerCase()] = b;
      branchMap[b.name.toLowerCase()] = b;
      // partial match for names with spaces
      b.name.toLowerCase().split(' ').forEach(word => {
        if (word.length > 3 && !branchMap[word]) branchMap[word] = b;
      });
    });

    // ── Load seller count per branch ──────────────────────────
    const { rows: sellerCounts } = await db.query(
      `SELECT branch_id, COUNT(*) as cnt FROM users WHERE role = 'vendedor' AND active = true GROUP BY branch_id`
    );
    const sellersByBranch = {};
    sellerCounts.forEach(s => { sellersByBranch[s.branch_id] = parseInt(s.cnt); });

    // ── Apply flags to rows ────────────────────────────────────
    for (const r of rows) {
      if (r.status === 'error') continue;

      // In-file dup check
      const isDupFile = (r.rut     && seenRut.get(r.rut)                       > 1) ||
                        (r.email   && seenEmail.get(r.email.toLowerCase())      > 1) ||
                        (r.telefono && seenPhone.get(r.telefono)               > 1);

      // DB dup check
      const isDupDB = (r.rut     && dbDupRuts.has(r.rut))                   ||
                      (r.email   && dbDupEmails.has(r.email.toLowerCase()))  ||
                      (r.telefono && dbDupPhones.has(r.telefono));

      if (isDupFile) {
        r.status     = 'dup_file';
        r.dup_reason = 'Duplicado dentro del archivo';
      } else if (isDupDB) {
        r.status     = 'dup_db';
        r.dup_reason = 'Ya existe en el CRM';
      }

      // Resolve branch
      const branch = branchMap[r.sucursal] || branchMap[r.sucursal.split(' ')[0]];
      if (!branch) {
        r.status = 'error';
        r.errors.push(`Sucursal "${r.sucursal}" no encontrada — válidas: ${branches.map(b => b.code).join(', ')}`);
      } else {
        r.branch_id   = branch.id;
        r.branch_name = branch.name;

        // Check sellers availability (only for valid/dup rows)
        if (r.status === 'valid' && (sellersByBranch[branch.id] || 0) === 0) {
          r.status             = 'no_seller';
          r.no_seller_warning  = `Sin vendedores activos en ${branch.name}`;
        }
      }
    }

    const summary = {
      total:     rows.length,
      valid:     rows.filter(r => r.status === 'valid').length,
      errors:    rows.filter(r => r.status === 'error').length,
      dup_file:  rows.filter(r => r.status === 'dup_file').length,
      dup_db:    rows.filter(r => r.status === 'dup_db').length,
      no_seller: rows.filter(r => r.status === 'no_seller').length,
    };

    res.json({ rows, summary, filename: req.file.originalname });
  } catch (e) {
    console.error('[Import] Preview error:', e);
    res.status(400).json({ error: e.message || 'Error al procesar el archivo' });
  }
});

// ─── POST /api/import/confirm ─────────────────────────────────
router.post('/confirm', async (req, res) => {
  try {
    const { rows, filename, skip_dups = true, include_no_seller = true } = req.body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'No hay filas para importar' });
    }

    // Filter which rows will be imported
    const toImport = rows.filter(r =>
      r.status === 'valid' ||
      (r.status === 'no_seller' && include_no_seller) ||
      (r.status === 'dup_db'    && !skip_dups)
    );

    if (toImport.length === 0) {
      return res.status(400).json({ error: 'No hay filas válidas para importar con la configuración actual' });
    }

    // Current ticket count for numbering (read once, increment in memory)
    const { rows: countR } = await db.query('SELECT COUNT(*) FROM tickets');
    let ticketCount = parseInt(countR[0].count);

    // ── Least-loaded seller cache per branch ──────────────────
    // Loads sorted list of sellers (by active ticket count) per branch.
    // Then cycles through them round-robin so bulk imports distribute evenly.
    const sellerCache = {}; // branch_id -> { sellers: [], idx: number }
    async function assignSeller(branch_id) {
      if (!sellerCache[branch_id]) {
        const { rows: sellers } = await db.query(
          `SELECT u.id,
                  COUNT(t.id) FILTER (WHERE t.status NOT IN ('ganado','perdido','cerrado')) AS active_tickets
           FROM users u
           LEFT JOIN tickets t ON t.assigned_to = u.id
           WHERE u.role = 'vendedor' AND u.active = true AND u.branch_id = $1
           GROUP BY u.id
           ORDER BY active_tickets ASC`,
          [branch_id]
        );
        sellerCache[branch_id] = { sellers, idx: 0 };
      }
      const cache = sellerCache[branch_id];
      if (cache.sellers.length === 0) return null;
      const seller = cache.sellers[cache.idx % cache.sellers.length];
      cache.idx++;
      return seller;
    }

    // ── Create tickets ─────────────────────────────────────────
    const stats = { imported: 0, errors: 0, no_seller: 0 };
    const createdNums = [];

    for (const r of toImport) {
      try {
        const seller = r.branch_id ? await assignSeller(r.branch_id) : null;
        const num    = `SCM-${247001 + ticketCount++}`;

        const { rows: created } = await db.query(
          `INSERT INTO tickets (
             ticket_num, first_name, last_name, rut, email, phone,
             comuna, source, branch_id, seller_id, assigned_to,
             priority, color_pref, sla_deadline, status
           ) VALUES (
             $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
             NOW() + INTERVAL '8 hours', 'abierto'
           ) RETURNING id, ticket_num`,
          [
            num,
            r.nombre,
            r.apellido  || null,
            r.rut       || null,
            r.email     || null,
            r.telefono  || null,
            r.comuna    || null,
            r.fuente    || 'importacion',
            r.branch_id || null,
            seller?.id  || null,
            seller?.id  || null,
            r.prioridad || 'media',
            r.color_pref || null,
          ]
        );

        await db.query(
          `INSERT INTO timeline (ticket_id, user_id, type, title, note)
           VALUES ($1, $2, 'system', 'Lead importado', $3)`,
          [
            created[0].id,
            req.user.id,
            `Importado por ${req.user.first_name} ${req.user.last_name}${seller ? '' : ' · Sin vendedor asignado'}`,
          ]
        );

        if (!seller) stats.no_seller++;
        stats.imported++;
        createdNums.push(created[0].ticket_num);
      } catch (e) {
        console.error('[Import] Row error:', e.message, r);
        stats.errors++;
      }
    }

    // ── Save import log ────────────────────────────────────────
    await db.query(
      `INSERT INTO import_logs (imported_by, filename, total_rows, imported, errors, duplicates, no_seller)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        req.user.id,
        filename || 'desconocido',
        rows.length,
        stats.imported,
        stats.errors,
        rows.filter(r => r.status === 'dup_file' || r.status === 'dup_db').length,
        stats.no_seller,
      ]
    );

    res.json({ ...stats, tickets: createdNums });
  } catch (e) {
    console.error('[Import] Confirm error:', e);
    res.status(500).json({ error: 'Error al importar leads' });
  }
});

// ─── GET /api/import/logs ─────────────────────────────────────
router.get('/logs', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT l.*, u.first_name, u.last_name
       FROM import_logs l
       LEFT JOIN users u ON l.imported_by = u.id
       ORDER BY l.created_at DESC
       LIMIT 50`
    );
    res.json(rows);
  } catch (e) {
    console.error('[Import] Logs error:', e);
    res.status(500).json({ error: 'Error' });
  }
});

module.exports = router;
