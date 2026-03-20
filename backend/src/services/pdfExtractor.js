/**
 * pdfExtractor.js
 * Extrae datos de listas de precios de motos en distintos formatos PDF.
 * Formatos soportados: honda | yamaha | mmb | promobility
 */
const pdfParse = require('pdf-parse');

// ─── Utilidades comunes ───────────────────────────────────────────────────────

const MONTHS = {
  enero: '01', febrero: '02', marzo: '03', abril: '04',
  mayo: '05', junio: '06', julio: '07', agosto: '08',
  septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12',
};

/**
 * Parsea precio chileno: "$1.699.000" | "1.699.000" | "1699000" → 1699000
 * Retorna null si es 0, vacío o "-"
 */
function parsePrice(str) {
  if (!str) return null;
  const s = String(str).trim();
  if (s === '-' || s === '' || s === '$0' || s === '0') return null;
  const n = parseInt(s.replace(/[$\s.]/g, '').replace(',', ''), 10);
  return isNaN(n) || n === 0 ? null : n;
}

/** Parsea porcentaje: "16%" → "16%" | null */
function parsePct(str) {
  if (!str) return null;
  const m = String(str).match(/(\d+)\s*%/);
  return m ? `${m[1]}%` : null;
}

/**
 * Normaliza un nombre de modelo para matching:
 * - Elimina prefijo "NEW"
 * - Elimina sufijos entre paréntesis
 * - Elimina años (20xx)
 * - Lowercase, trim, espacios simples
 */
function normalizeModel(name) {
  return name
    .replace(/^new\s+/i, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\b(20\d{2})\b/g, '')
    .replace(/[^a-z0-9\s\-]/gi, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Commercial name: sin newlines, espacios normalizados */
function commercialName(name) {
  return name.replace(/\s+/g, ' ').trim();
}

/** Detecta período a partir de texto: "MARZO 2026" → "2026-03" */
function detectPeriod(text) {
  const re = /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(\d{4})\b/i;
  const m = text.match(re);
  if (!m) return null;
  return `${m[2]}-${MONTHS[m[1].toLowerCase()]}`;
}

// ─── Detección de formato ─────────────────────────────────────────────────────

function detectSourceType(text) {
  const t = text.toLowerCase();
  if (t.includes('yamaha') && (t.includes('cilindrada') || t.includes('yamaimport') || t.includes('bono yamaha'))) return 'yamaha';
  if (t.includes('lista de precios honda') || (t.includes('honda') && t.includes('cod p') && t.includes('pbv'))) return 'honda';
  if (t.includes('promobility') || (t.includes('suzuki') && t.includes('cyclone') && t.includes('royal enfield'))) return 'promobility';
  if ((t.includes('keeway') || t.includes('benelli') || t.includes('qj motor')) && t.includes('bono marca')) return 'mmb';
  return null;
}

// ─── Parser: HONDA ────────────────────────────────────────────────────────────

// Categorías válidas de Honda
const HONDA_CATEGORIES = ['Commuter', 'Mid Size', 'Big Size', 'Big Bike', 'Off', 'ATV', 'BB special'];
const HONDA_CAT_RE = new RegExp(`(${HONDA_CATEGORIES.join('|')})`, 'i');

function parseHonda(text) {
  const rows = [];

  // Período
  let period = null;
  const pm = text.match(/PERIODO[:\s]+(\w+)\s+(\d{4})/i);
  if (pm) period = `${pm[2]}-${MONTHS[pm[1].toLowerCase()] || '??'}`;
  if (!period) period = detectPeriod(text);

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Una fila Honda tiene: COD MODELO CATEGORIA PBV PRECIO [...bonos...]
  // El código tiene formato: 2-3 letras + dígitos + sufijos opcionales
  const codeRe = /^([A-Z]{2,4}\d+[A-Z0-9]*(?:EXT|EP|ES|EXD|EXT)?)\s+/;

  let currentCategory = null;

  for (const line of lines) {
    // Detectar sección de categoría (LMC ON, SC TTL, etc.) — las ignoramos
    // Detectar cambio de categoría implícito en la fila
    const catM = line.match(HONDA_CAT_RE);
    if (catM) currentCategory = catM[1];

    const codeM = line.match(codeRe);
    if (!codeM) continue;

    const code = codeM[1];
    const rest = line.slice(codeM[0].length);

    // Extraer categoría de la línea
    const lineCatM = rest.match(HONDA_CAT_RE);
    const category = lineCatM ? lineCatM[1] : currentCategory;

    if (!category) continue; // sin categoría => no es fila de dato

    // Antes de la categoría está el modelo
    const catPos = rest.indexOf(category);
    const modelRaw = rest.slice(0, catPos).trim();
    if (!modelRaw) continue;

    // Después de la categoría: PBV PRECIO [BONO_TMP] [PRECIO_TMP] [BONO_AF] [PRECIO_AF] [notas]
    const afterCat = rest.slice(catPos + category.length).trim();

    // Extraer todos los números de precio (formato: d.ddd.ddd)
    const nums = [];
    const numRe = /\b(\d{1,3}(?:\.\d{3})+)\b/g;
    let nm;
    while ((nm = numRe.exec(afterCat)) !== null) nums.push(nm[1]);

    // PBV es el primero (3 dígitos), luego vienen precios
    const pbv = nums[0] && nums[0].length <= 5 ? nums.shift() : null;

    const price_list           = parsePrice(nums[0]) || null;
    let   bono_todo_medio      = null;
    let   price_todo_medio     = null;
    let   bono_financiamiento  = null;
    let   price_financiamiento = null;

    // Notas al final (texto no numérico)
    const notes = afterCat.replace(/\b\d{1,3}(?:\.\d{3})+\b/g, '').replace(/-/g, '').trim() || null;

    // Detectar tipo de bono desde notas
    const hasTMP   = /TODO MEDIO/i.test(notes || '');
    const hasAF    = /AUTOFIN/i.test(notes || '');
    const hasAmbos = hasTMP && hasAF;

    if (hasAmbos && nums.length >= 5) {
      // PRECIO BONO_TMP PRECIO_TMP BONO_AF PRECIO_AF
      bono_todo_medio      = parsePrice(nums[1]);
      price_todo_medio     = parsePrice(nums[2]);
      bono_financiamiento  = parsePrice(nums[3]);
      price_financiamiento = parsePrice(nums[4]);
    } else if (hasTMP && nums.length >= 3) {
      bono_todo_medio      = parsePrice(nums[1]);
      price_todo_medio     = parsePrice(nums[2]);
    } else if (hasAF && nums.length >= 3) {
      bono_financiamiento  = parsePrice(nums[1]);
      price_financiamiento = parsePrice(nums[2]);
    }

    rows.push({
      brand: 'Honda',
      model: commercialName(modelRaw),
      normalized_model: normalizeModel(modelRaw),
      code,
      category,
      segment: null,
      cc: null,
      price_list,
      bono_todo_medio,
      price_todo_medio,
      bono_financiamiento,
      price_financiamiento,
      dcto_30_dias: null,
      dcto_60_dias: null,
      notes,
      raw: { code, model: modelRaw, category, pbv, afterCat },
    });
  }

  return { period, source_type: 'honda', rows };
}

// ─── Parser: YAMAHA ───────────────────────────────────────────────────────────

const YAMAHA_CATEGORIES = [
  'URBANA', 'NAKED', 'R-WORLD', 'ON-OFF', 'SPORT TURING', 'SPORT HERITAGE',
  'CROSS', 'ENDURO', 'SCOOTERS', 'ATV', 'UTV', 'NAUTICA', 'COMPETICION',
];

function parseYamaha(text) {
  const rows = [];
  const period = detectPeriod(text);
  const lines  = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Regex para detectar cilindrada: "150 cc" | "150cc" | "1000 cc"
  const ccRe = /(\d+)\s*cc/i;
  // Regex para precios
  const priceRe = /\b(\d{1,3}(?:\.\d{3})+)\b/g;

  const catSet = new Set(YAMAHA_CATEGORIES);
  let currentCategory = null;

  for (const line of lines) {
    // Detectar si la línea ES o EMPIEZA con una categoría
    let isCatLine = false;
    for (const cat of YAMAHA_CATEGORIES) {
      if (line.toUpperCase().startsWith(cat)) {
        currentCategory = cat;
        isCatLine = true;
        break;
      }
    }

    if (!currentCategory) continue;

    // Extraer la parte del modelo (antes del primer cc)
    const ccM = line.match(ccRe);
    if (!ccM) continue; // sin cilindrada → no es fila de dato

    const ccIdx = line.indexOf(ccM[0]);
    let modelPart = line.slice(0, ccIdx).trim();

    // Si la línea empieza con una categoría, quitarla del modelo
    for (const cat of YAMAHA_CATEGORIES) {
      if (modelPart.toUpperCase().startsWith(cat)) {
        modelPart = modelPart.slice(cat.length).trim();
        break;
      }
    }

    if (!modelPart) continue;

    const cc = parseInt(ccM[1], 10);
    const afterCc = line.slice(ccIdx + ccM[0].length).trim();

    // Extraer todos los precios del resto de la línea
    const prices = [];
    let pm;
    priceRe.lastIndex = 0;
    while ((pm = priceRe.exec(afterCc)) !== null) prices.push(pm[1]);

    if (prices.length === 0) continue;

    const price_list           = parsePrice(prices[0]);
    let   bono_todo_medio      = null;
    let   price_todo_medio     = null;
    let   bono_financiamiento  = null;
    let   price_financiamiento = null;

    // Yamaha: si hay 3 números → precio_lista, precio_tmp (=lista), bono_autofin, precio_autofin
    // Si hay 4 → precio_lista, bono_yamaha, precio_tmp, bono_autofin, precio_autofin
    if (prices.length === 5) {
      bono_todo_medio      = parsePrice(prices[1]);
      price_todo_medio     = parsePrice(prices[2]);
      bono_financiamiento  = parsePrice(prices[3]);
      price_financiamiento = parsePrice(prices[4]);
    } else if (prices.length === 4) {
      // precio_lista, precio_tmp (sin bono yamaha), bono_autofin, precio_autofin
      price_todo_medio     = parsePrice(prices[1]);
      bono_financiamiento  = parsePrice(prices[2]);
      price_financiamiento = parsePrice(prices[3]);
    } else if (prices.length === 3) {
      price_todo_medio     = parsePrice(prices[1]);
      price_financiamiento = parsePrice(prices[2]);
    } else if (prices.length === 2) {
      price_todo_medio = parsePrice(prices[1]);
    }

    rows.push({
      brand: 'Yamaha',
      model: commercialName(modelPart),
      normalized_model: normalizeModel(modelPart),
      code: null,
      category: mapYamahaCategory(currentCategory),
      segment: currentCategory,
      cc,
      price_list,
      bono_todo_medio,
      price_todo_medio,
      bono_financiamiento,
      price_financiamiento,
      dcto_30_dias: null,
      dcto_60_dias: null,
      notes: null,
      raw: { segment: currentCategory, model: modelPart, cc, prices },
    });
  }

  return { period, source_type: 'yamaha', rows };
}

function mapYamahaCategory(seg) {
  const map = {
    'URBANA': 'Commuter', 'NAKED': 'Naked', 'R-WORLD': 'Sport',
    'ON-OFF': 'Dual Sport', 'SPORT TURING': 'Touring', 'SPORT HERITAGE': 'Custom',
    'CROSS': 'Cross', 'ENDURO': 'Enduro', 'SCOOTERS': 'Scooter',
    'ATV': 'ATV', 'COMPETICION': 'ATV', 'UTV': 'UTV', 'NAUTICA': 'Náutica',
  };
  return map[seg] || seg;
}

// ─── Parser: MMB (Keeway / Benelli / Benda / QJ Motor) ───────────────────────

const MMB_BRANDS = ['KEEWAY', 'BENELLI', 'BENDA', 'QJ MOTOR'];

function parseMMB(text) {
  const rows = [];
  const period = detectPeriod(text);
  const lines  = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Regex para detectar marca al inicio de línea
  const brandRe = new RegExp(`^(${MMB_BRANDS.join('|')})\\s+(.+)$`, 'i');
  // Regex para precios con $ o sin
  const priceRe = /\$?\s*(\d{1,3}(?:\.\d{3})+)/g;
  const pctRe   = /(\d+)\s*%/g;

  for (const line of lines) {
    const bm = line.match(brandRe);
    if (!bm) continue;

    const brand    = bm[1].toUpperCase().trim();
    const restLine = bm[2].trim();

    // Extraer precios
    const prices = [];
    let pm;
    priceRe.lastIndex = 0;
    while ((pm = priceRe.exec(restLine)) !== null) prices.push(pm[1]);

    // Extraer porcentajes de descuento
    const pcts = [];
    pctRe.lastIndex = 0;
    while ((pm = pctRe.exec(restLine)) !== null) pcts.push(`${pm[1]}%`);

    // El modelo es la parte antes del primer precio
    const firstPriceIdx = restLine.search(/\$?\s*\d{1,3}(?:\.\d{3})+/);
    const modelRaw = firstPriceIdx > 0 ? restLine.slice(0, firstPriceIdx).trim() : restLine;

    if (!modelRaw) continue;

    const price_list           = parsePrice(prices[0]);
    const bono_todo_medio      = parsePrice(prices[1]);
    const price_todo_medio     = parsePrice(prices[2]);
    const price_financiamiento = prices[3] ? parsePrice(prices[3]) : price_todo_medio;
    const dcto_30_dias         = pcts[0] || null;
    const dcto_60_dias         = pcts[1] || null;

    // Notas (texto después de los números)
    const numPctRe = /[\$\d\.\%\s]+$/;
    const notesM   = restLine.replace(/\$?\s*\d{1,3}(?:\.\d{3})+/g, '').replace(/\d+%/g, '').trim();
    // Buscar textos como "No aplica pronto pago" o "Arribo 25/03 aprox"
    const notesRe = /(No aplica pronto pago|Arribo\s+[\w\/\s]+aprox\.?|NUEVO MODELO)/i;
    const notesMatch = restLine.match(notesRe);
    const notes = notesMatch ? notesMatch[0] : null;

    // Ignorar filas con precio_list = 0 (fuera de stock) pero marcarlas
    const inStock = price_list !== null;

    rows.push({
      brand: normalizeBrandMMB(brand),
      model: commercialName(modelRaw),
      normalized_model: normalizeModel(modelRaw),
      code: null,
      category: null,   // MMB no trae categoría
      segment: null,
      cc: null,
      price_list:           inStock ? price_list : null,
      bono_todo_medio:      inStock ? bono_todo_medio : null,
      price_todo_medio:     inStock ? price_todo_medio : null,
      bono_financiamiento:  null,
      price_financiamiento: inStock ? price_financiamiento : null,
      dcto_30_dias,
      dcto_60_dias,
      notes: inStock ? notes : 'Sin stock / sin precio',
      raw: { brand, model: modelRaw, prices, pcts },
    });
  }

  return { period, source_type: 'mmb', rows };
}

function normalizeBrandMMB(brand) {
  const map = { 'QJ MOTOR': 'QJ Motor' };
  const b = brand.toUpperCase();
  return map[b] || (brand.charAt(0).toUpperCase() + brand.slice(1).toLowerCase());
}

// ─── Parser: PROMOBILITY ─────────────────────────────────────────────────────

// Marcas que distribuye Promobility
const PROMO_BRANDS = ['Suzuki', 'Cyclone', 'Zonsen', 'KYMCO', 'Royal Enfield'];

function parsePromobility(text) {
  const rows   = [];
  const period = detectPeriod(text);
  if (!period) {
    // Intentar desde "Precios válidos hasta el DD-MM-YYYY"
    const vm = text.match(/hasta el\s+(\d{2})-(\d{2})-(\d{4})/i);
    // Solo tomamos el mes/año
  }

  // Detectar período desde "Precios válidos hasta el 31-03-2026"
  let finalPeriod = period;
  if (!finalPeriod) {
    const vm = text.match(/hasta el\s+\d{2}-(\d{2})-(\d{4})/i);
    if (vm) finalPeriod = `${vm[2]}-${String(vm[1]).padStart(2, '0')}`;
  }

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Rastrear marca/segmento actuales desde encabezados de sub-tabla
  let currentBrand   = null;
  let currentSegment = null;

  const brandSet = new Set(PROMO_BRANDS.map(b => b.toLowerCase()));
  // Regex para precios
  const priceRe = /\$\s*(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{3})?|\d+)/g;

  for (const line of lines) {
    // Detectar encabezado de marca
    const lowerLine = line.toLowerCase();
    for (const brand of PROMO_BRANDS) {
      if (lowerLine === brand.toLowerCase() || lowerLine.startsWith(brand.toLowerCase() + ' ')) {
        currentBrand = brand;
        break;
      }
    }

    // Detectar segmento (Calle, Adventure, Cross/Enduro, ATV Trabajo, etc.)
    if (/^(Calle|Adventure|Cross|Enduro|ATV|UTV|Sport|Fun)/i.test(line) && !priceRe.test(line)) {
      currentSegment = line.replace(/^\w+\s*/, '').trim() || line.trim();
      priceRe.lastIndex = 0;
      continue;
    }

    if (!currentBrand) continue;

    // Detectar fila de dato: debe tener año (20xx) y al menos un precio
    const yearM = line.match(/\b(20\d{2})\b/);
    if (!yearM) continue;

    const year = parseInt(yearM[1], 10);

    // Extraer precios
    const prices = [];
    let pm;
    priceRe.lastIndex = 0;
    while ((pm = priceRe.exec(line)) !== null) {
      prices.push(pm[1].replace(/[.,]/g, (c, i, s) => {
        // Normalizar separadores: último separador si hay 3 cifras después → decimal, si no → miles
        return '.';
      }));
    }
    priceRe.lastIndex = 0;

    // El modelo es la parte antes del año
    const yearIdx = line.indexOf(yearM[0]);
    const modelRaw = line.slice(0, yearIdx).trim();
    if (!modelRaw) continue;

    // Limpiar precios (pueden venir como "2.299.900")
    const parsedPrices = prices.map(p => parsePrice(p));

    const price_list      = parsedPrices[0] || null;
    const bono_todo_medio = parsedPrices[1] || null;
    const price_todo_medio= parsedPrices[2] || null;

    rows.push({
      brand: currentBrand,
      model: commercialName(modelRaw),
      normalized_model: normalizeModel(modelRaw),
      code: null,
      category: mapPromoSegment(currentSegment),
      segment: currentSegment,
      cc: null,
      year,
      price_list,
      bono_todo_medio,
      price_todo_medio,
      bono_financiamiento:  null,
      price_financiamiento: null,
      dcto_30_dias: null,
      dcto_60_dias: null,
      notes: null,
      raw: { brand: currentBrand, segment: currentSegment, model: modelRaw, year, prices },
    });
  }

  return { period: finalPeriod, source_type: 'promobility', rows };
}

function mapPromoSegment(seg) {
  if (!seg) return null;
  const s = seg.toLowerCase();
  if (s.includes('calle') || s.includes('sport')) return 'Commuter';
  if (s.includes('adventure')) return 'Dual Sport';
  if (s.includes('cross') || s.includes('enduro')) return 'Cross';
  if (s.includes('atv')) return 'ATV';
  if (s.includes('utv')) return 'UTV';
  if (s.includes('scooter')) return 'Scooter';
  return seg;
}

// ─── Función principal de extracción ─────────────────────────────────────────

/**
 * @param {Buffer} buffer  — buffer del PDF
 * @param {string} filename — nombre del archivo (para logs)
 * @returns {{ period, source_type, rows, raw_text }}
 */
async function extractFromPDF(buffer, filename) {
  const data = await pdfParse(buffer);
  const text = data.text;

  const source_type = detectSourceType(text);
  if (!source_type) {
    throw new Error('Formato de PDF no reconocido. Formatos soportados: Honda, Yamaha, MMB (Keeway/Benelli/Benda/QJ), Promobility.');
  }

  let result;
  switch (source_type) {
    case 'honda':       result = parseHonda(text);       break;
    case 'yamaha':      result = parseYamaha(text);      break;
    case 'mmb':         result = parseMMB(text);         break;
    case 'promobility': result = parsePromobility(text); break;
  }

  return { ...result, raw_text: text, filename };
}

module.exports = { extractFromPDF, normalizeModel, detectSourceType };
