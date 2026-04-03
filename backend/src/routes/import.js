const router = require('express').Router();
const db = require('../config/db');
const { auth, roleCheck } = require('../middleware/auth');
const multer = require('multer');
const xlsx = require('xlsx');
const TelegramService = require('../services/telegramService');
const SLAService = require('../services/slaService');
const { calcSlaDeadline } = require('../utils/slaUtils');

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

// ─── Column aliases ────────────────────────────────────────────
// Soporta plantilla propia + plantilla Yamaha (distribuidor → sucursal, etc.)
const COL_ALIASES = {
  nombre:           ['nombre', 'first_name', 'name', 'nombres'],
  apellido:         ['apellido', 'last_name', 'apellidos'],
  telefono:         ['telefono', 'teléfono', 'phone', 'celular', 'fono', 'cel'],
  email:            ['email', 'correo', 'mail', 'e-mail'],
  rut:              ['rut', 'run', 'rut_cliente'],
  // 'distribuidor' es la columna de sucursal en plantillas Yamaha
  sucursal:         ['sucursal', 'branch', 'tienda', 'local', 'distribuidor'],
  // vendedor del Excel → solo referencia informativa, NO se usa para asignar
  vendedor_ref:     ['vendedor', 'vendedor_asignado', 'seller', 'asesor', 'ejecutivo'],
  fuente:           ['fuente', 'source', 'origen', 'canal'],
  prioridad:        ['prioridad', 'priority', 'urgencia'],
  comuna:           ['comuna', 'ciudad', 'city'],
  color_pref:       ['color', 'color_pref', 'color_preferido'],
  observaciones:    ['observaciones', 'obs', 'nota', 'notes', 'comentarios'],
  mensaje:          ['mensaje', 'message'],
  modelo:           ['modelo', 'product', 'producto', 'moto', 'motocicleta'],
  fecha_nacimiento: ['fecha_nacimiento', 'birth_date', 'birthdate', 'nacimiento', 'fecha_de_nacimiento'],
  test_ride:        ['test_ride', 'test ride', 'testride', 'prueba_manejo'],
  // Campos financieros Yamaha
  opcion_compra:    ['opcion_compra', 'opción_compra', 'opcion de compra'],
  financiamiento:   ['financiamiento'],
  sit_laboral:      ['situacion_laboral', 'sit_laboral', 'situación_laboral'],
  continuidad:      ['continuidad_laboral', 'continuidad'],
  renta:            ['renta_liquida', 'renta', 'renta_líquida'],
  pie:              ['pie'],
  // Evaluaciones Tanner
  pre_eval_tanner:  ['pre_evaluacion_tanner', 'pre_evaluación_tanner'],
  eval_tanner:      ['evaluacion_tanner', 'evaluación_tanner'],
  obs_tanner:       ['observaciones_evaluacion_tanner', 'observaciones_evaluación_tanner'],
  // Evaluaciones Autofin
  id_autofin:       ['id_autofin'],
  pre_eval_autofin: ['pre_evaluacion_autofin', 'pre_evaluación_autofin'],
  eval_autofin:     ['evaluacion_autofin', 'evaluación_autofin'],
  obs_autofin:      ['observaciones_evaluacion_autofin', 'observaciones_evaluación_autofin'],
};

const VALID_SOURCES  = ['web','redes_sociales','whatsapp','presencial','referido','evento','llamada','importacion'];
const VALID_PRIORITY = ['alta','media','baja'];

// Normaliza espacios → guiones bajos para que "situacion laboral" == "situacion_laboral"
function buildHeaderMap(rawHeaders) {
  const map = {};
  // Two-pass: exact matches first, then partial — avoids producto_id stealing producto slot
  for (const pass of ['exact', 'partial']) {
    rawHeaders.forEach((h, i) => {
      const key = (h || '').toString().trim().toLowerCase().replace(/\s+/g, '_');
      for (const [field, aliases] of Object.entries(COL_ALIASES)) {
        if (map[field] !== undefined) continue;
        const exactHit   = aliases.some(a => key === a);
        const partialHit = aliases.some(a => key.includes(a));
        if (pass === 'exact' ? exactHit : partialHit) {
          map[field] = i;
          break;
        }
      }
    });
  }
  return map;
}

function get(row, headerMap, field) {
  const idx = headerMap[field];
  if (idx === undefined) return '';
  return (row[idx] ?? '').toString().trim();
}

// Para validación: elimina puntos y guion → "163459779"
function normalizeRut(raw) {
  return raw.replace(/\./g, '').replace(/-/g, '').toUpperCase().trim();
}
// Para almacenamiento: elimina puntos, conserva guion → "16345977-9"
function formatRut(raw) {
  const stripped = raw.replace(/\./g, '').trim();
  // Si ya tiene guion, devolver limpio; si no, insertar guion antes del último char
  if (stripped.includes('-')) return stripped.toUpperCase();
  if (stripped.length < 2) return stripped.toUpperCase();
  return (stripped.slice(0, -1) + '-' + stripped.slice(-1)).toUpperCase();
}

// Parsea números chilenos con puntos como separadores de miles ("1.500.000" → 1500000)
function parseChileanInt(val) {
  if (!val) return null;
  const cleaned = val.toString().replace(/\./g, '').replace(/[$,\s]/g, '').trim();
  const n = parseInt(cleaned, 10);
  return isNaN(n) ? null : n;
}

// ─── Resolución robusta de sucursal ──────────────────────────
// Soporta códigos exactos (MPN), nombres exactos, y strings largos de Yamaha
// como "MAOS RACING MALL PLAZA SUR" → busca si el nombre de sucursal está
// contenido dentro del string, o viceversa.
function resolveBranch(sucursalRaw, branches) {
  if (!sucursalRaw) return null;
  const s = sucursalRaw.toLowerCase().trim();

  // 1. Coincidencia exacta por código o nombre
  for (const b of branches) {
    if (b.code.toLowerCase() === s || b.name.toLowerCase() === s) return b;
  }

  // 2. El nombre de sucursal del CRM está contenido en el string de entrada
  //    Ej: "mall plaza sur" ⊆ "maos racing mall plaza sur" ✓
  for (const b of branches) {
    if (s.includes(b.name.toLowerCase())) return b;
  }

  // 3. El string de entrada está contenido en el nombre de sucursal del CRM
  for (const b of branches) {
    if (b.name.toLowerCase().includes(s)) return b;
  }

  // 4. Score por palabras en común (≥4 caracteres)
  const sWords = new Set(s.split(/\s+/).filter(w => w.length >= 4));
  let best = null;
  let bestScore = 0;
  for (const b of branches) {
    const bWords = b.name.toLowerCase().split(/\s+/).filter(w => w.length >= 4);
    const score = bWords.filter(w => sWords.has(w)).length;
    if (score > bestScore) { bestScore = score; best = b; }
  }
  if (bestScore >= 1) return best;

  return null;
}

// ─── Resolución robusta de modelo de moto ────────────────────
function normalizeStr(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Quita prefijos de marca (yzf, xtz, mt) y sufijos de color/variante
// para obtener el "núcleo" del modelo: "YZF-R15A" → "r15", "FZ-250A AZUL" → "fz250"
function coreModel(s) {
  const COLORS = ['azul','rojo','negro','blanca','blanco','verde','gris','plata','roja','negra','amarillo','naranja'];
  const VARIANTS = ['abs','sp','connected','lw','zr'];
  return normalizeStr(s)
    .split(' ')
    .filter(t => !COLORS.includes(t) && !VARIANTS.includes(t))
    .join(' ')
    .replace(/\b(yzf|xtz|xt)\b/g, '') // quitar prefijos de marca Yamaha
    .replace(/a$/, '')                  // quitar sufijo "a" final (R15A → R15)
    .replace(/\s+/g, ' ')
    .trim();
}

// Expande números cortos: "25" → "250", "15" → "150" (convención Yamaha cc/10)
function expandNum(s) {
  return s.replace(/\b(\d{2})\b/g, (_, n) => {
    const expanded = parseInt(n) * 10;
    return `${n}|${expanded}`;
  });
}

// Devuelve el registro de moto_models que mejor matchea con modeloRaw,
// o null si no hay coincidencia suficiente.
async function resolveModelWithAliases(modeloRaw, models) {
  if (!modeloRaw) return null;
  // 1. Chequear tabla de aliases primero (más confiable)
  try {
    const { rows } = await db.query(
      `SELECT m.* FROM model_aliases a
       JOIN moto_models m ON a.model_id = m.id
       WHERE a.alias = lower($1) AND m.active = true`,
      [modeloRaw.trim()]
    );
    if (rows[0]) return rows[0];
  } catch (_) {}
  // 2. Fuzzy matching como fallback
  return resolveModel(modeloRaw, models);
}

function resolveModel(modeloRaw, models) {
  if (!modeloRaw || !models || models.length === 0) return null;
  const raw = normalizeStr(modeloRaw);
  if (!raw) return null;
  const rawCore = coreModel(modeloRaw);

  // 1. Exacta brand+model
  for (const m of models) {
    if (normalizeStr(`${m.brand} ${m.model}`) === raw) return m;
  }
  // 2. Exacta commercial_name
  for (const m of models) {
    if (m.commercial_name && normalizeStr(m.commercial_name) === raw) return m;
  }
  // 3. Exacta solo model
  for (const m of models) {
    if (normalizeStr(m.model) === raw) return m;
  }
  // 4. Input contiene brand+model completo
  for (const m of models) {
    const full = normalizeStr(`${m.brand} ${m.model}`);
    if (raw.includes(full)) return m;
  }
  // 5. brand+model contiene el input
  for (const m of models) {
    const full = normalizeStr(`${m.brand} ${m.model}`);
    if (full.includes(raw) && raw.length >= 3) return m;
  }
  // 6. Model name contiene el input
  for (const m of models) {
    const mn = normalizeStr(m.model);
    if (mn.includes(raw) && raw.length >= 3) return m;
  }
  // 7. Core match: quita colores/variantes/prefijos y compara núcleo
  for (const m of models) {
    const mc = coreModel(m.model);
    if (mc && rawCore && mc === rawCore && rawCore.length >= 2) return m;
  }
  // 8. Core del input está dentro del core del catálogo (maneja "r15" vs "yzf r15a")
  for (const m of models) {
    const mc = coreModel(m.model);
    if (mc && rawCore && mc.includes(rawCore) && rawCore.length >= 2) return m;
  }
  // 9. Expansión de números: "fz 25" → busca "fz 250" (Yamaha usa cc/10 en nombres cortos)
  const rawExpanded = expandNum(rawCore);
  for (const m of models) {
    const mc = coreModel(m.model).replace(/\s/g, '');
    const pattern = rawExpanded.replace(/\s/g, '');
    const regex = new RegExp(pattern.replace(/\|/g, '|'));
    if (regex.test(mc) && rawCore.length >= 2) return m;
  }
  return null;
}

function validateRow(row, headerMap, rowIndex) {
  const nombre         = get(row, headerMap, 'nombre');
  const apellido       = get(row, headerMap, 'apellido');
  const telefono       = get(row, headerMap, 'telefono');
  const email          = get(row, headerMap, 'email');
  const rut            = get(row, headerMap, 'rut');
  const sucursalRaw    = get(row, headerMap, 'sucursal'); // sin toLowerCase — lo hace resolveBranch
  const fuente         = get(row, headerMap, 'fuente').toLowerCase() || 'importacion';
  const prioridad      = get(row, headerMap, 'prioridad').toLowerCase() || 'media';
  const comuna         = get(row, headerMap, 'comuna');
  const colorPref      = get(row, headerMap, 'color_pref');
  // Notas y observaciones (opcionales)
  const observaciones  = get(row, headerMap, 'observaciones');
  const mensaje        = get(row, headerMap, 'mensaje');
  const modelo         = get(row, headerMap, 'modelo');
  // Campos financieros Yamaha (opcionales)
  const opcion_compra    = get(row, headerMap, 'opcion_compra');
  const financiamiento   = get(row, headerMap, 'financiamiento');
  const sit_laboral      = get(row, headerMap, 'sit_laboral');
  const continuidad      = get(row, headerMap, 'continuidad');
  const renta_raw        = get(row, headerMap, 'renta');
  const pie_raw          = get(row, headerMap, 'pie');
  const pre_eval_tanner  = get(row, headerMap, 'pre_eval_tanner');
  const eval_tanner      = get(row, headerMap, 'eval_tanner');
  const obs_tanner       = get(row, headerMap, 'obs_tanner');
  const id_autofin       = get(row, headerMap, 'id_autofin');
  const pre_eval_autofin = get(row, headerMap, 'pre_eval_autofin');
  const eval_autofin     = get(row, headerMap, 'eval_autofin');
  const obs_autofin      = get(row, headerMap, 'obs_autofin');
  const vendedor_ref     = get(row, headerMap, 'vendedor_ref'); // solo referencia, no se usa para asignar
  const fecha_nacimiento = get(row, headerMap, 'fecha_nacimiento');
  const test_ride_raw    = get(row, headerMap, 'test_ride');

  // Si no hay apellido separado, intentar partir el nombre en primera palabra + resto
  let first_name = nombre;
  let last_name  = apellido || null;
  if (!last_name && nombre.trim().includes(' ')) {
    const parts = nombre.trim().split(/\s+/);
    first_name = parts[0];
    last_name  = parts.slice(1).join(' ');
  }

  // test_ride: SI/SÍ/1/true → true
  const test_ride = /^(si|sí|yes|1|true)$/i.test(test_ride_raw.trim());

  const errors = [];

  if (!first_name)               errors.push('Nombre obligatorio');
  if (!telefono && !email)       errors.push('Teléfono o email obligatorio');
  if (!sucursalRaw)              errors.push('Sucursal obligatoria');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
                                 errors.push('Formato de email inválido');
  // Teléfono tolerante: acepta 7-15 dígitos con prefijos opcionales
  if (telefono && !/^\+?[\d\s\-\(\)]{7,16}$/.test(telefono))
                                 errors.push('Formato de teléfono inválido');
  if (rut) {
    const cleaned = normalizeRut(rut);
    if (!/^\d{6,8}[0-9K]$/.test(cleaned)) errors.push('Formato de RUT inválido');
  }
  // Prioridad: si viene en formato desconocido, se ignora y defaultea — no es error

  // Componer obs_vendedor uniendo observaciones + mensaje (ambos opcionales)
  const obs_parts = [observaciones, mensaje].filter(Boolean);
  const obs_vendedor = obs_parts.join(' | ') || null;

  // Detectar si quiere financiamiento: "SI", "SÍ", texto con "financ", o tiene evaluaciones
  const wants_financing =
    /^(si|sí|yes)$/i.test(financiamiento.trim()) ||
    /financ/i.test(opcion_compra) ||
    /financ/i.test(financiamiento) ||
    !!(pre_eval_tanner || eval_tanner || id_autofin || pre_eval_autofin || eval_autofin);

  // Parsear fecha_nacimiento: acepta YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY
  let birthdate = null;
  if (fecha_nacimiento) {
    const fn = fecha_nacimiento.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(fn)) {
      birthdate = fn; // ya en formato ISO
    } else if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(fn)) {
      const [d, m, y] = fn.split(/[\/\-]/);
      birthdate = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    }
  }

  // Construir fin_data con los campos de evaluación (solo los que tienen valor)
  const fin_data = {};
  if (modelo)           fin_data.modelo           = modelo;
  if (opcion_compra)    fin_data.opcion_compra    = opcion_compra;
  if (financiamiento)   fin_data.financiamiento   = financiamiento;
  if (pre_eval_tanner)  fin_data.pre_eval_tanner  = pre_eval_tanner;
  if (eval_tanner)      fin_data.eval_tanner      = eval_tanner;
  if (obs_tanner)       fin_data.obs_tanner       = obs_tanner;
  if (id_autofin)       fin_data.id_autofin       = id_autofin;
  if (pre_eval_autofin) fin_data.pre_eval_autofin = pre_eval_autofin;
  if (eval_autofin)     fin_data.eval_autofin     = eval_autofin;
  if (obs_autofin)      fin_data.obs_autofin      = obs_autofin;
  // Vendedor del archivo guardado como referencia — el CRM asigna por sucursal
  if (vendedor_ref)     fin_data.vendedor_ref     = vendedor_ref;

  return {
    _row:            rowIndex,
    nombre:          first_name,
    apellido:        last_name,
    telefono:        telefono   || null,
    email:           email      || null,
    rut:             rut ? formatRut(rut) : null,
    birthdate:       birthdate,
    sucursal_raw:    sucursalRaw,           // valor original para display y matching
    fuente:          VALID_SOURCES.includes(fuente) ? fuente : 'importacion',
    prioridad:       VALID_PRIORITY.includes(prioridad) ? prioridad : 'media',
    comuna:          comuna     || null,
    color_pref:      colorPref  || null,
    obs_vendedor,
    sit_laboral:     sit_laboral  || null,
    continuidad:     continuidad || null,
    renta:           parseChileanInt(renta_raw),
    pie:             parseChileanInt(pie_raw),
    test_ride,
    wants_financing,
    fin_data:        Object.keys(fin_data).length > 0 ? fin_data : null,
    errors,
    status:          errors.length > 0 ? 'error' : 'valid',
    // Resueltos después:
    branch_id:       null,
    branch_name:     null,
    dup_reason:      null,
    no_seller_warning: null,
  };
}

// ─── Helpers ──────────────────────────────────────────────────
function parseBuffer(buffer) {
  const wb = xlsx.read(buffer, { type: 'buffer', raw: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
  if (!raw || raw.length < 2) throw new Error('El archivo está vacío o solo tiene encabezados');
  return raw;
}

// ─── GET /api/import/template ─────────────────────────────────
router.get('/template', (req, res) => {
  const csv = 'nombre,apellido,telefono,email,rut,sucursal,fuente,prioridad,comuna,color_pref,observaciones\n' +
              'Juan,Pérez,+56912345678,juan@email.com,12345678-9,MPN,whatsapp,media,Huechuraba,Negro,\n';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="template_prospectos.csv"');
  res.send(csv);
});

// ─── POST /api/import/preview ─────────────────────────────────
router.post('/preview', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });

    const raw = parseBuffer(req.file.buffer);
    const rawHeaders = raw[0].map(h => (h || '').toString());
    const headerMap  = buildHeaderMap(rawHeaders);

    if (headerMap.nombre === undefined) {
      return res.status(400).json({
        error: 'El archivo debe tener una columna "nombre". Descarga la plantilla para ver el formato esperado.',
      });
    }

    // Parse y validar cada fila
    const rows = [];
    for (let i = 1; i < raw.length; i++) {
      const row = raw[i];
      if (!row || row.every(c => c === '' || c === null || c === undefined)) continue;
      rows.push(validateRow(row, headerMap, i + 1));
    }

    if (rows.length === 0) return res.status(400).json({ error: 'No se encontraron filas de datos' });

    // ── Duplicados internos al archivo ─────────────────────────
    const seenRut   = new Map();
    const seenEmail = new Map();
    const seenPhone = new Map();
    for (const r of rows) {
      if (r.rut)      seenRut.set(r.rut, (seenRut.get(r.rut) || 0) + 1);
      if (r.email)    seenEmail.set(r.email.toLowerCase(), (seenEmail.get(r.email.toLowerCase()) || 0) + 1);
      if (r.telefono) seenPhone.set(r.telefono, (seenPhone.get(r.telefono) || 0) + 1);
    }

    // ── Duplicados en base de datos ────────────────────────────
    const dbDupRuts   = new Set();
    const dbDupEmails = new Set();
    const dbDupPhones = new Set();

    const ruts   = rows.filter(r => r.rut).map(r => r.rut);
    const emails = rows.filter(r => r.email).map(r => r.email.toLowerCase());
    const phones = rows.filter(r => r.telefono).map(r => r.telefono);

    if (ruts.length) {
      // Buscar tanto el formato con guion como sin guion para máxima compatibilidad
      const rutsNorm = ruts.map(normalizeRut);
      const { rows: dr } = await db.query(
        `SELECT rut FROM tickets WHERE REPLACE(REPLACE(rut,'.',''),'-','') = ANY($1::text[]) AND rut IS NOT NULL`,
        [rutsNorm]
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

    // ── Cargar sucursales activas y catálogo de motos ─────────
    const { rows: branches } = await db.query('SELECT id, name, code FROM branches WHERE active = true');
    const { rows: models }   = await db.query('SELECT id, brand, model, commercial_name FROM moto_models WHERE active = true');

    // ── Aplicar flags ──────────────────────────────────────────
    for (const r of rows) {
      if (r.status === 'error') continue;

      // Duplicados en archivo
      const isDupFile = (r.rut      && seenRut.get(r.rut)                  > 1) ||
                        (r.email    && seenEmail.get(r.email.toLowerCase()) > 1) ||
                        (r.telefono && seenPhone.get(r.telefono)            > 1);

      // Duplicados en BD (comparar RUT normalizado)
      const isDupDB = (r.rut      && dbDupRuts.has(normalizeRut(r.rut)))     ||
                      (r.email    && dbDupEmails.has(r.email.toLowerCase())) ||
                      (r.telefono && dbDupPhones.has(r.telefono));

      if (isDupFile) {
        r.status     = 'dup_file';
        r.dup_reason = 'Duplicado dentro del archivo';
      } else if (isDupDB) {
        r.status     = 'dup_db';
        r.dup_reason = 'Ya existe en el CRM';
      }

      // Resolver sucursal usando matching robusto
      const branch = resolveBranch(r.sucursal_raw, branches);
      if (!branch) {
        r.status = 'error';
        r.errors.push(
          `Sucursal "${r.sucursal_raw}" no encontrada — válidas: ${branches.map(b => `${b.code} (${b.name})`).join(', ')}`
        );
      } else {
        r.branch_id   = branch.id;
        r.branch_name = branch.name;
      }

      // Resolver modelo de moto
      const modeloRaw = r.fin_data?.modelo || '';
      const motoMatch = await resolveModelWithAliases(modeloRaw, models);
      r.model_id            = motoMatch?.id   || null;
      r.model_resolved_name = motoMatch ? `${motoMatch.brand} ${motoMatch.model}` : null;
      r.model_raw           = modeloRaw || null;
    }

    const summary = {
      total:    rows.length,
      valid:    rows.filter(r => r.status === 'valid').length,
      errors:   rows.filter(r => r.status === 'error').length,
      dup_file: rows.filter(r => r.status === 'dup_file').length,
      dup_db:   rows.filter(r => r.status === 'dup_db').length,
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
    const { rows, filename, skip_dups = true } = req.body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'No hay filas para importar' });
    }

    const toImport = rows.filter(r =>
      r.status === 'valid' ||
      (r.status === 'dup_db' && !skip_dups)
    );

    if (toImport.length === 0) {
      return res.status(400).json({ error: 'No hay filas válidas para importar con la configuración actual' });
    }

    // ticket_num generado por secuencia PostgreSQL — sin race conditions

    // ── Cargar catálogo de motos para resolver model_id ────────
    const { rows: models } = await db.query('SELECT id, brand, model, commercial_name FROM moto_models WHERE active = true');

    // ── Least-loaded + round-robin por sucursal ────────────────
    // Usa SLAService.assignSeller como lógica oficial (branch_id + extra_branches)
    // El caché local evita queries repetidas durante importaciones masivas
    const sellerCache = {};
    async function assignSellerForImport(branch_id) {
      if (!sellerCache[branch_id]) {
        const { rows: sellers } = await db.query(
          `SELECT u.id, u.first_name, u.last_name, u.telegram_chat_id,
                  COUNT(t.id) FILTER (WHERE t.status NOT IN ('ganado','perdido','cerrado')) AS active_tickets
           FROM users u
           LEFT JOIN tickets t ON t.assigned_to = u.id
           WHERE u.role = 'vendedor' AND u.active = true
             AND (u.branch_id = $1 OR $1 = ANY(u.extra_branches))
           GROUP BY u.id, u.first_name, u.last_name, u.telegram_chat_id
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

    // ── Crear tickets ──────────────────────────────────────────
    const stats = { imported: 0, errors: 0, no_seller: 0 };
    const createdNums = [];

    for (const r of toImport) {
      try {
        const seller = r.branch_id ? await assignSellerForImport(r.branch_id) : null;
        const { rows: seqR } = await db.query("SELECT 'SCM-' || nextval('ticket_num_seq') AS num");
        const num = seqR[0].num;

        // Resolver model_id: primero el que viene del preview (si el cliente
        // lo mandó ya resuelto), sino resolverlo ahora desde el catálogo.
        const modeloRaw = r.fin_data?.modelo || r.model_raw || '';
        const motoMatch = r.model_id
          ? models.find(m => m.id === r.model_id) || await resolveModelWithAliases(modeloRaw, models)
          : await resolveModelWithAliases(modeloRaw, models);
        const resolvedModelId = motoMatch?.id || null;

        const { rows: created } = await db.query(
          `INSERT INTO tickets (
             ticket_num, first_name, last_name, rut, email, phone,
             comuna, source, branch_id, seller_id, assigned_to,
             model_id, priority, color_pref,
             obs_vendedor, wants_financing, sit_laboral, continuidad,
             renta, pie, test_ride, birthdate, fin_data,
             sla_deadline, status
           ) VALUES (
             $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
             $12,$13,$14,
             $15,$16,$17,$18,$19,$20,$21,$22,$23,
             $24, 'abierto'
           ) RETURNING id, ticket_num`,
          [
            num,
            r.nombre,
            r.apellido         || null,
            r.rut              || null,
            r.email            || null,
            r.telefono         || null,
            r.comuna           || null,
            r.fuente           || 'importacion',
            r.branch_id        || null,
            seller?.id         || null,
            seller?.id         || null,
            resolvedModelId,                               // $12 model_id
            r.prioridad        || 'media',
            r.color_pref       || null,
            r.obs_vendedor     || null,
            r.wants_financing  || false,
            r.sit_laboral      || null,
            r.continuidad      || null,
            r.renta            || null,
            r.pie              || null,
            r.test_ride        || false,
            r.birthdate        || null,
            r.fin_data ? JSON.stringify(r.fin_data) : null,
            calcSlaDeadline().toISOString(),           // $24 sla_deadline
          ]
        );

        await db.query(
          `INSERT INTO timeline (ticket_id, user_id, type, title, note)
           VALUES ($1, $2, 'system', 'Lead importado', $3)`,
          [
            created[0].id,
            req.user.id,
            `Importado por ${req.user.first_name} ${req.user.last_name}` +
            (seller ? '' : ' · Sin vendedor asignado') +
            (resolvedModelId ? ` · Moto: ${motoMatch.brand} ${motoMatch.model}` : (modeloRaw ? ` · Moto sin resolver: "${modeloRaw}"` : '')),
          ]
        );

        // Log asignación inicial para trazabilidad completa
        if (seller) {
          await db.query(
            `INSERT INTO reassignment_log (ticket_id, from_user_id, to_user_id, reason, reassigned_by)
             VALUES ($1, NULL, $2, 'initial_assignment', $3)`,
            [created[0].id, seller.id, req.user.id]
          );
        }

        // Telegram notification (fire-and-forget)
        if (seller?.telegram_chat_id) {
          TelegramService.notifyNewLead(
            {
              id: created[0].id,
              ticket_num: num,
              first_name: r.nombre,
              last_name: r.apellido || null,
              phone: r.telefono || null,
              priority: r.prioridad || 'media',
              branch_name: r.branch_name || null,
              moto_brand: motoMatch?.brand || null,
              moto_model: motoMatch?.model || null,
            },
            seller
          ).catch((e) => console.warn('[Telegram] import notifyNewLead error:', e.message));
        }

        if (!seller) stats.no_seller++;
        stats.imported++;
        createdNums.push(created[0].ticket_num);
      } catch (e) {
        console.error('[Import] Row error:', e.message, r);
        stats.errors++;
      }
    }

    // ── Guardar log de importación ─────────────────────────────
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
