/**
 * pdfExtractor.js — v2
 * Extrae datos de listas de precios de motos desde PDFs reales.
 *
 * Formatos soportados:
 *   honda       — LISTA DE PRECIOS HONDA (código en línea separada)
 *   yamaha      — Yamaimport (modelo / cc+precios / continuación opcional)
 *   mmb         — Keeway/Benelli/Benda/QJ Motor (multi-línea por marca)
 *   promobility — Promobility (modelo+año concatenados, precios en sig. línea)
 */

const pdfParse = require('pdf-parse');

// ─── Utilidades ───────────────────────────────────────────────────────────────

const MONTHS = {
  enero:'01', febrero:'02', marzo:'03', abril:'04',
  mayo:'05', junio:'06', julio:'07', agosto:'08',
  septiembre:'09', octubre:'10', noviembre:'11', diciembre:'12',
};

/** Parsea precio chileno → entero. Retorna null si 0/vacío/"-" */
function parsePrice(str) {
  if (!str) return null;
  const s = String(str).trim();
  if (!s || s === '-' || s === '$0' || s === '0') return null;
  const n = parseInt(s.replace(/[$\s.]/g, '').replace(',', ''), 10);
  return isNaN(n) || n === 0 ? null : n;
}

/** Extrae todos los precios en formato chileno de un texto */
function extractPrices(text) {
  const nums = [];
  const re = /(\d{1,3}(?:\.\d{3})+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const v = parseInt(m[1].replace(/\./g, ''), 10);
    if (v > 0) nums.push(v);
  }
  return nums;
}

/**
 * Asigna columnas de precios usando la heurística de ratio:
 *   - Un valor < precio_lista / 2  →  es un bono
 *   - Un valor ≥ precio_lista / 2  →  es un precio final
 *
 * Orden de columnas esperado:
 *   price_list | [bono_todo_medio | price_todo_medio] | [bono_financiamiento | price_financiamiento]
 *
 * @param {number[]} nums  Array de enteros en orden de aparición
 * @param {boolean}  hasDash  Si el texto original tenía "-" en la columna bono_tmp
 */
function assignPriceColumns(nums, hasDash = false) {
  if (!nums || nums.length === 0) return {};

  const price_list = nums[0];
  let bono_todo_medio      = null;
  let price_todo_medio     = null;
  let bono_financiamiento  = null;
  let price_financiamiento = null;

  const threshold = price_list / 2;

  if (hasDash) {
    // Bono TMP es null (dash). Siguiente valor = price_todo_medio
    price_todo_medio = nums[1] || null;
    // Luego, pares (bono, precio)
    let i = 2;
    while (i < nums.length) {
      if (nums[i] < threshold && nums[i + 1] != null) {
        bono_financiamiento  = nums[i];
        price_financiamiento = nums[i + 1];
        i += 2;
      } else {
        if (price_financiamiento === null) price_financiamiento = nums[i];
        i++;
      }
    }
  } else {
    let i = 1;
    while (i < nums.length) {
      const v = nums[i];
      if (v < threshold) {
        // Es un bono
        if (bono_todo_medio === null) {
          bono_todo_medio = v;
        } else {
          bono_financiamiento = v;
        }
      } else {
        // Es un precio
        if (price_todo_medio === null) {
          price_todo_medio = v;
        } else {
          price_financiamiento = v;
        }
      }
      i++;
    }
  }

  return { price_list, bono_todo_medio, price_todo_medio, bono_financiamiento, price_financiamiento };
}

/** Normaliza nombre de modelo para matching */
function normalizeModel(name) {
  return name
    .replace(/^new\s+/i, '')          // quitar prefijo NEW
    .replace(/\(.*?\)/g, '')          // quitar contenido entre paréntesis
    .replace(/\b(20\d{2})\b/g, '')    // quitar años
    .replace(/[^a-z0-9\s\-]/gi, ' ')  // solo alfanumérico, espacios, guiones
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Limpia el nombre comercial (sin newlines ni espacios dobles) */
function commercialName(name) {
  return name.replace(/\s+/g, ' ').trim();
}

/** Detecta período: "MARZO 2026" → "2026-03" */
function detectPeriod(text) {
  const re = /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(\d{4})\b/i;
  const m = text.match(re);
  if (!m) return null;
  return `${m[2]}-${MONTHS[m[1].toLowerCase()]}`;
}

/** Detecta formato del PDF */
function detectSourceType(text) {
  const t = text.toLowerCase();

  // Honda: título explícito o columnas características (PBV + COD P)
  if (t.includes('lista de precios honda') ||
      (t.includes('honda') && (t.includes('pbv') || t.includes('cod p')))) {
    return 'honda';
  }

  // Yamaha: encabezado Yamaimport o combinación yamaha+cilindrada (sin exigir "bono yamaha")
  if (t.includes('yamaimport') ||
      (t.includes('yamaha') && t.includes('cilindrada'))) {
    return 'yamaha';
  }

  // Promobility: nombre exacto
  if (t.includes('promobility')) return 'promobility';

  // MMB: al menos una marca del grupo + alguna referencia a bono o lista de precios
  const hasMmbBrand = t.includes('keeway') || t.includes('benelli') ||
                      t.includes('qj motor') || t.includes('benda');
  const hasMmbKeyword = t.includes('bono marca') || t.includes('bono de marca') ||
                        t.includes('valor lista') || t.includes('lista de precios');
  if (hasMmbBrand && hasMmbKeyword) return 'mmb';

  // Fallback: solo por marca (sin keywords de columna)
  if (hasMmbBrand) return 'mmb';

  return null;
}

// ─── Parser Honda ─────────────────────────────────────────────────────────────
//
// Estructura en el PDF:
//   Línea A: código interno (ej: "LJA73")
//   Línea B: "MODELO CATEGORIA PBV    PRECIO    [BONO_TMP|-]    PRECIO_TMP    [BONO_AF    PRECIO_AF]    [NOTAS]"
//
// Categorías válidas: Commuter, Mid Size, Big Bike, Off, ATV, BB special

const HONDA_CATEGORIES = ['Commuter', 'Mid Size', 'Big Bike', 'Off', 'ATV', 'BB special'];
// Regex que detecta donde empieza la categoría en la línea de datos
const HONDA_CAT_RE = new RegExp(`(${HONDA_CATEGORIES.join('|')})`, 'i');
// Regex que detecta una línea de código Honda
const HONDA_CODE_RE = /^[A-Z]{2,4}\d+[A-Z0-9]*$/;
// Secciones agrupadas (no son datos)
const HONDA_SKIP_RE = /^(LMC ON|LMC ON\/OFF|MC ON|MC ON\/OFF|SC TTL|OFF|ATV|PVB|DESDE|HASTA EL|LISTA DE PRECIOS|OBSERVACIONES|\*|Nuevas|Nuestro|28-|02-)/i;

function parseHonda(text) {
  const rows  = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const period = detectPeriod(text);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // ¿Es una línea de código Honda?
    if (HONDA_CODE_RE.test(line)) {
      const code    = line;
      const dataLine = lines[i + 1] || '';
      i += 2;

      if (HONDA_SKIP_RE.test(dataLine)) continue;

      // Limpiar tabs
      const dl = dataLine.replace(/\t/g, '').trim();

      // Encontrar la categoría en la línea
      const catMatch = dl.match(HONDA_CAT_RE);
      if (!catMatch) continue;

      const category = catMatch[1];
      const catIdx   = dl.indexOf(category);

      // Modelo = todo antes de la categoría
      const modelRaw = dl.slice(0, catIdx).trim();
      if (!modelRaw) continue;

      // Texto después de la categoría: PBV + precios + notas
      const afterCat = dl.slice(catIdx + category.length).trim();

      // Extraer PBV (primer número pequeño, 2-3 dígitos, solo si no es BB special)
      let pbv = null;
      let priceText = afterCat;
      if (category !== 'BB special') {
        const pbvMatch = afterCat.match(/^(\d{2,3})\s+/);
        if (pbvMatch) {
          pbv = parseInt(pbvMatch[1]);
          priceText = afterCat.slice(pbvMatch[0].length);
        }
      }

      // ¿Tiene dash en la columna de BONO_TODO_MEDIO?
      const hasDash = /\s-\s/.test(priceText);

      // Extraer todos los precios
      const nums = extractPrices(priceText);

      // Asignar columnas
      const prices = assignPriceColumns(nums, hasDash);

      // Notas (texto que queda después de eliminar números y dashes)
      const notes = priceText
        .replace(/\d{1,3}(?:\.\d{3})+/g, '')
        .replace(/\s-\s/g, ' ')
        .replace(/\/\/\//g, ' ')
        .replace(/\s+/g, ' ')
        .trim() || null;

      rows.push({
        brand:            'Honda',
        model:            commercialName(modelRaw),
        normalized_model: normalizeModel(modelRaw),
        code,
        category,
        segment:          null,
        cc:               null,
        ...prices,
        dcto_30_dias:     null,
        dcto_60_dias:     null,
        notes,
        raw: { code, model: modelRaw, category, pbv, afterCat },
      });
    } else {
      i++;
    }
  }

  return { period, source_type: 'honda', rows };
}

// ─── Parser Yamaha ────────────────────────────────────────────────────────────
//
// Estructura en el PDF (extraída por pdf-parse):
//   Línea categoría: "URBANA" / "ON-OFF" / "SPORT TURING" etc.
//   Línea modelo:    "FZ-S 4.0 "
//   Línea cc:        "150 cc2.690.0002.690.000"  (cc + precios concatenados)
//   Líneas extra:    "150.000"                    (solo número = bono o precio)
//                    "2.540.000"
//
// Algunas líneas cc no tienen precios inline; vienen en las siguientes.

// Categorías que aparecen EN ORDEN en el texto
const YAMAHA_CATS_ORDERED = [
  'URBANA', 'ON-OFF', 'SPORT TURING', 'SPORT HERITAGE',
  'ATV \\(4 ruedas agrícola\\)', 'ATV', 'UTV', 'NAUTICA',
  'COMPETICION\\s+RAPTOR', 'ENDURO',
];
const YAMAHA_CAT_RE = new RegExp(`^(${YAMAHA_CATS_ORDERED.join('|')})$`, 'i');

// Categorías que aparecen FUERA DE ORDEN (detectadas por patrones de modelo)
const YAMAHA_CAT_MAP = {
  'mt-':      'Naked',
  'yzf-r':    'Sport',
  'yz-':      'Cross',
  'wr-':      'Enduro',
  'pw-':      'Enduro',
  'ttr-':     'Enduro',
  'cygnus':   'Scooter',
  'nmax':     'Scooter',
  'x-max':    'Scooter',
  'fz-s':     'Commuter',
  'fz-x':     'Commuter',
  'fz-250':   'Commuter',
  'tracer':   'Touring',
  'teneré':   'Dual Sport',
  'tenere':   'Dual Sport',
  'xtz-':     'Dual Sport',
  'bolt':     'Custom',
  'yfm-':     'ATV',
  'yfz-':     'ATV',
  'yxz-':     'UTV',
  'wolverine':'UTV',
  'vx ':      'Náutica',
  'fx-':      'Náutica',
  'gp ho':    'Náutica',
  'sj-':      'Náutica',
};

function mapYamahaCategory(seg) {
  const m = {
    'URBANA':'Commuter', 'NAKED':'Naked', 'R-WORLD':'Sport',
    'ON-OFF':'Dual Sport', 'SPORT TURING':'Touring', 'SPORT HERITAGE':'Custom',
    'CROSS':'Cross', 'ENDURO':'Enduro', 'SCOOTERS':'Scooter',
    'ATV':'ATV', 'COMPETICION RAPTOR':'ATV', 'UTV':'UTV', 'NAUTICA':'Náutica',
    'ATV (4 RUEDAS AGRÍCOLA)':'ATV',
  };
  return m[seg.toUpperCase()] || seg;
}

function inferYamahaCategory(model) {
  const ml = model.toLowerCase();
  for (const [prefix, cat] of Object.entries(YAMAHA_CAT_MAP)) {
    if (ml.startsWith(prefix) || ml.includes(prefix)) return cat;
  }
  return null;
}

// Detecta líneas de solo-números (continuación de precios)
const PURE_NUMS_RE = /^\d{1,3}(?:\.\d{3})+(?:\d{1,3}(?:\.\d{3})+)*$/;

function parseYamaha(text) {
  const rows   = [];
  const period = detectPeriod(text);
  const lines  = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Keywords a ignorar completamente
  const SKIP_RE = /^(LISTADE PRECIOS|LISTA DE PRECIOS|CILINDRADA|PRECIO|BONO|PAGO|AUTOFIN|FINANCIAMIENTO|z$|RAPTOR|COMPETICION|4 ruedas|ATV Trabajo|Todo Medio|NAUTICA|UTV$|ATV$)/i;

  let currentCategory = null;
  let pendingModel    = null;
  let pendingCc       = null;
  let pendingNums     = [];

  const emit = () => {
    if (!pendingModel || pendingNums.length === 0) {
      pendingModel = null; pendingCc = null; pendingNums = [];
      return;
    }
    const prices = assignPriceColumns(pendingNums, false);
    const cat = currentCategory ? mapYamahaCategory(currentCategory) : inferYamahaCategory(pendingModel);
    rows.push({
      brand:            'Yamaha',
      model:            commercialName(pendingModel),
      normalized_model: normalizeModel(pendingModel),
      code:             null,
      category:         cat,
      segment:          currentCategory,
      cc:               pendingCc,
      ...prices,
      dcto_30_dias:     null,
      dcto_60_dias:     null,
      notes:            null,
      raw: { segment: currentCategory, model: pendingModel, cc: pendingCc, nums: pendingNums },
    });
    pendingModel = null; pendingCc = null; pendingNums = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Ignorar encabezados y texto decorativo
    if (SKIP_RE.test(line)) continue;
    if (line.match(/^\d{2}-\d{2}-\d{4}$/)) continue; // fechas

    // ¿Es un encabezado de categoría que aparece en orden?
    const catMatch = line.match(YAMAHA_CAT_RE);
    if (catMatch) {
      emit();
      currentCategory = line.trim();
      continue;
    }

    // ¿Es una línea de cc (tiene "cc" y/o números)?
    const ccMatch = line.match(/^(\d+)\s*cc(.*)$/i);
    if (ccMatch) {
      // Si hay modelo pendiente, actualizamos su cc
      if (pendingModel === null) { continue; } // cc sin modelo → skip (el for ya hace i++)
      if (pendingCc !== null) emit(); // había otro modelo — emitirlo primero

      pendingCc = parseInt(ccMatch[1]);
      const afterCc = ccMatch[2].trim();
      if (afterCc) pendingNums.push(...extractPrices(afterCc));
      continue;
    }

    // ¿Es una línea de solo números (continuación de precios)?
    if (PURE_NUMS_RE.test(line)) {
      if (pendingModel && pendingCc !== null) {
        pendingNums.push(...extractPrices(line));
      }
      continue;
    }

    // ¿Es una línea de precios en formato "cc" en realidad cortada? (ej: "125 cc")
    // Ya cubierta arriba.

    // Cualquier otro texto = nombre de modelo (si no es skip)
    if (pendingModel !== null && pendingCc !== null) emit();
    if (pendingModel !== null && pendingCc === null) {
      // Modelo anterior sin cc → descartar
      pendingModel = null;
    }
    pendingModel = line;
    pendingCc    = null;
    pendingNums  = [];
  }

  emit(); // el último modelo pendiente

  return { period, source_type: 'yamaha', rows };
}

// ─── Parser MMB (Keeway / Benelli / Benda / QJ Motor) ────────────────────────
//
// Columnas del PDF:
//   MARCA | MODELO | VALOR LISTA | BONO MARCA | PRECIO CON TODO MEDIO DE PAGO |
//   BONO FINANCIAMIENTO | PRECIO CON CREDITO | DCTO 30 Días | DCTO 60 Días
//
// pdf-parse produce tres patrones:
//   A) "MARCA + MODELO + TODOS_PRECIOS" en una sola línea
//   B) "MARCA" sola → "MODELO" sola → "PRECIOS" sola
//   C) "MARCA+MODELO" → "PRECIOS" (sin precios en la línea del modelo)
//
// Regla de columnas:
//   1. VALOR LISTA
//   2. BONO MARCA        (si valor < VALOR_LISTA / 2 — sino no hay bono)
//   3. PRECIO TODO MEDIO
//   4. PRECIO CON CREDITO (= PRECIO TODO MEDIO si no hay bono financiamiento)
//   5. DCTO 30 días (%)
//   6. DCTO 60 días (%)

const MMB_BRANDS_MAP = {
  'KEEWAY':   'Keeway',
  'BENELLI':  'Benelli',
  'BENDA':    'Benda',
  'QJ MOTOR': 'QJ Motor',
};
const MMB_BRANDS = Object.keys(MMB_BRANDS_MAP);

function parseMMB(text) {
  const rows   = [];
  const period = detectPeriod(text);
  const lines  = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Detectar línea de inicio de marca
  function getBrand(line) {
    for (const b of MMB_BRANDS) {
      if (line.toUpperCase().startsWith(b)) return b;
    }
    return null;
  }

  // Detecta si una línea contiene precios MMB ($x.xxx.xxx o x.xxx.xxx con $)
  const MMB_PRICE_RE = /\$\d{1,3}(?:\.\d{3})+/;

  // Parsear una línea de precios MMB
  function parsePriceLine(priceText) {
    // Extraer precios
    const re = /\$?(\d{1,3}(?:\.\d{3})+)/g;
    const nums = [];
    let m;
    while ((m = re.exec(priceText)) !== null) {
      const v = parseInt(m[1].replace(/\./g, ''), 10);
      if (v > 0) nums.push(v);
    }
    // Extraer porcentajes
    const pctRe = /(\d+)\s*%/g;
    const pcts  = [];
    while ((m = pctRe.exec(priceText)) !== null) pcts.push(`${m[1]}%`);

    // Asignar columnas
    // MMB siempre tiene: price_list | [bono_tmp] | price_tmp | price_fin
    // Si no hay bono (DARKFLAG): price_list = price_tmp = price_fin
    let price_list = null, bono_todo_medio = null, price_todo_medio = null, price_financiamiento = null;

    if (nums.length >= 4) {
      price_list           = nums[0];
      bono_todo_medio      = nums[1] < nums[0] / 2 ? nums[1] : null;
      price_todo_medio     = bono_todo_medio !== null ? nums[2] : nums[1];
      price_financiamiento = bono_todo_medio !== null ? nums[3] : nums[2];
    } else if (nums.length === 3) {
      price_list = nums[0];
      if (nums[1] < nums[0] / 2) {
        bono_todo_medio      = nums[1];
        price_todo_medio     = nums[2];
        price_financiamiento = nums[2]; // igual a price_todo_medio
      } else {
        price_todo_medio     = nums[1];
        price_financiamiento = nums[2];
      }
    } else if (nums.length === 2) {
      price_list = nums[0];
      if (nums[1] < nums[0] / 2) {
        bono_todo_medio  = nums[1];
        price_todo_medio = null;
      } else {
        price_todo_medio = nums[1];
      }
    } else if (nums.length === 1) {
      price_list = nums[0];
    }

    // Notas (texto no numérico)
    const notes = priceText
      .replace(/\$?\d{1,3}(?:\.\d{3})+/g, '')
      .replace(/\d+%/g, '')
      .replace(/\s+/g, ' ')
      .trim() || null;

    return {
      price_list,
      bono_todo_medio,
      price_todo_medio,
      bono_financiamiento:  null, // siempre vacío en estos PDFs
      price_financiamiento,
      dcto_30_dias: pcts[0] || null,
      dcto_60_dias: pcts[1] || null,
      notes,
    };
  }

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const brandKey = getBrand(line);

    if (!brandKey) { i++; continue; }

    const brand      = MMB_BRANDS_MAP[brandKey];
    const restOfLine = line.slice(brandKey.length).trim();

    // ¿La misma línea tiene precios?
    if (MMB_PRICE_RE.test(line)) {
      // Patrón A o C: brand+model+prices en una línea
      // Extraer modelo (todo antes del primer precio)
      const priceStart = line.search(/\$\d{1,3}(?:\.\d{3})+/);
      const brandModel = line.slice(0, priceStart).trim();
      const modelRaw   = brandModel.slice(brandKey.length).trim();
      const priceText  = line.slice(priceStart);

      if (!modelRaw) { i++; continue; }

      const prices = parsePriceLine(priceText);

      // Skip modelos con precio 0 (fuera de stock)
      if (!prices.price_list) {
        rows.push({
          brand, model: commercialName(modelRaw),
          normalized_model: normalizeModel(modelRaw),
          code: null, category: null, segment: null, cc: null,
          price_list: null, bono_todo_medio: null, price_todo_medio: null,
          bono_financiamiento: null, price_financiamiento: null,
          dcto_30_dias: prices.dcto_30_dias, dcto_60_dias: prices.dcto_60_dias,
          notes: 'Sin precio / fuera de stock',
          raw: { brand: brandKey, model: modelRaw, line },
        });
        i++; continue;
      }

      rows.push({
        brand,
        model:            commercialName(modelRaw),
        normalized_model: normalizeModel(modelRaw),
        code:             null,
        category:         null,
        segment:          null,
        cc:               null,
        ...prices,
        raw: { brand: brandKey, model: modelRaw, line },
      });
      i++;
    } else if (restOfLine && !MMB_PRICE_RE.test(lines[i + 1] || '')) {
      // Brand+modelo en línea actual, pero precios en la siguiente → Patrón C incompleto
      // OR: la brand está sola (restOfLine puede ser el modelo si no hay precios)
      // Comprobamos la siguiente línea
      const nextLine = lines[i + 1] || '';
      if (MMB_PRICE_RE.test(nextLine)) {
        // restOfLine = modelo, nextLine = precios
        const modelRaw = restOfLine;
        const prices   = parsePriceLine(nextLine);
        if (modelRaw) {
          rows.push({
            brand,
            model:            commercialName(modelRaw),
            normalized_model: normalizeModel(modelRaw),
            code:             null,
            category:         null,
            segment:          null,
            cc:               null,
            price_list: prices.price_list,
            bono_todo_medio: prices.bono_todo_medio,
            price_todo_medio: prices.price_todo_medio,
            bono_financiamiento: null,
            price_financiamiento: prices.price_financiamiento,
            dcto_30_dias: prices.dcto_30_dias,
            dcto_60_dias: prices.dcto_60_dias,
            notes: prices.price_list ? prices.notes : 'Sin precio / fuera de stock',
            raw: { brand: brandKey, model: modelRaw, nextLine },
          });
        }
        i += 2;
      } else {
        // Brand sola (Patrón B): brand, luego modelo, luego precios
        const modelLine  = lines[i + 1] || '';
        const priceLine  = lines[i + 2] || '';
        if (modelLine && MMB_PRICE_RE.test(priceLine)) {
          const modelRaw = modelLine.trim();
          const prices   = parsePriceLine(priceLine);
          if (modelRaw && !getBrand(modelRaw)) {
            rows.push({
              brand,
              model:            commercialName(modelRaw),
              normalized_model: normalizeModel(modelRaw),
              code:             null,
              category:         null,
              segment:          null,
              cc:               null,
              price_list: prices.price_list,
              bono_todo_medio: prices.bono_todo_medio,
              price_todo_medio: prices.price_todo_medio,
              bono_financiamiento: null,
              price_financiamiento: prices.price_financiamiento,
              dcto_30_dias: prices.dcto_30_dias,
              dcto_60_dias: prices.dcto_60_dias,
              notes: prices.price_list ? prices.notes : 'Sin precio / fuera de stock',
              raw: { brand: brandKey, model: modelRaw, priceLine },
            });
            i += 3;
          } else {
            i++;
          }
        } else {
          i++;
        }
      }
    } else {
      i++;
    }
  }

  return { period, source_type: 'mmb', rows };
}

// ─── Parser Promobility ───────────────────────────────────────────────────────
//
// Estructura:
//   Encabezado sub-tabla: "MarcaSegmentoModeloAño..."
//   Modelo + año concatenados: "BURGMAN STREET 1252026" (model+year)
//   Precios en línea siguiente: "2.299.900$  100.000$  2.199.900$"
//
// Los nombres de marca aparecen FUERA DE ORDEN al final del texto.
// Usamos el número de sub-tabla y patrones de modelo para inferir la marca.

// Lookup de modelo → marca para Promobility
const PROMO_MODEL_BRAND = [
  [/^(BURGMAN|GSX|GS[XR]|DS-|DL-|DRZ|RMZ|LT-[FA])/i, 'Suzuki'],
  [/^(RA2|RX-|RX1$|RX3$)/i,                            'Cyclone'],
  [/^ZII$/i,                                             'Zonsen'],
  [/^(XTOWN|MXU|UXV)/i,                                 'KYMCO'],
  [/^(HUNTER|CLASSIC|METEOR|GRR|HIMALAYAN|SHOTGUN|BEAR|SUPER METEOR)/i, 'Royal Enfield'],
];

function inferPromoBrand(model) {
  for (const [re, brand] of PROMO_MODEL_BRAND) {
    if (re.test(model.trim())) return brand;
  }
  return 'Promobility'; // fallback
}

function parsePromobility(text) {
  const rows   = [];
  const period = detectPeriod(text);
  const lines  = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Regex para detectar "modelo+año" concatenado (termina en 202x o 202x)
  const MODEL_YEAR_RE = /^(.+?)(20\d{2})$/;
  // Regex para precios Promobility (usan $)
  const PROMO_PRICE_RE = /\$\s*[\d,]+/;

  // Textos a ignorar
  const SKIP_RE = /^(Marca|Segmento|Modelo|Año|Precio|Bono|Precios válidos|Lista de precios|Todo Medio|Calle|Adventure|Cross|ATV|UTV|Fun|Sport|Trabajo|Calle\s+Sport)/i;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Ignorar encabezados y textos descriptivos
    if (SKIP_RE.test(line) || line.length < 3) { i++; continue; }

    // ¿Es una línea de precios? (no modelo)
    if (PROMO_PRICE_RE.test(line)) { i++; continue; }

    // ¿La línea termina con un año? → es modelo+año
    const yearMatch = line.match(MODEL_YEAR_RE);
    if (!yearMatch) { i++; continue; }

    const modelRaw = yearMatch[1].trim();
    const year     = parseInt(yearMatch[2]);
    const nextLine = lines[i + 1] || '';

    // La siguiente línea debe tener precios con "$"
    if (!PROMO_PRICE_RE.test(nextLine)) { i++; continue; }

    // Parsear precios de la siguiente línea
    const priceRe = /\$\s*([\d.,]+)/g;
    const prices  = [];
    let pm;
    while ((pm = priceRe.exec(nextLine)) !== null) {
      const v = parsePrice(pm[1].replace(/,/g, '.'));
      if (v) prices.push(v);
    }

    if (prices.length === 0) { i += 2; continue; }

    const price_list      = prices[0] || null;
    const bono_todo_medio = prices.length >= 3 ? (prices[1] < (prices[0] / 2) ? prices[1] : null) : null;
    const price_todo_medio= prices.length >= 3 ? prices[2] : (prices.length === 2 ? prices[1] : null);

    const brand = inferPromoBrand(modelRaw);

    rows.push({
      brand,
      model:            commercialName(modelRaw),
      normalized_model: normalizeModel(modelRaw),
      code:             null,
      category:         null,
      segment:          null,
      cc:               null,
      year,
      price_list,
      bono_todo_medio,
      price_todo_medio,
      bono_financiamiento:  null,
      price_financiamiento: null,
      dcto_30_dias:         null,
      dcto_60_dias:         null,
      notes:                null,
      raw: { model: modelRaw, year, prices },
    });

    i += 2; // consumir línea modelo + línea precios
  }

  return { period, source_type: 'promobility', rows };
}

// ─── Función principal ────────────────────────────────────────────────────────

async function extractFromPDF(buffer, filename) {
  // 1. Extraer texto
  let data;
  try {
    data = await pdfParse(buffer);
  } catch (e) {
    throw new Error(`No se pudo leer el PDF: ${e.message}`);
  }

  const text = data.text || '';
  if (!text.trim()) {
    throw new Error('El PDF no contiene texto extraíble (posiblemente escaneado o protegido).');
  }

  // 2. Detectar formato
  const source_type = detectSourceType(text);
  if (!source_type) {
    // Devolver primeros 800 chars para diagnóstico
    const snippet = text.replace(/\s+/g, ' ').slice(0, 800);
    throw new Error(
      `Formato de PDF no reconocido.\n` +
      `Formatos soportados: Honda, Yamaha (Yamaimport), MMB (Keeway/Benelli/Benda/QJ), Promobility.\n` +
      `Texto detectado (primeros 800 chars): ${snippet}`
    );
  }

  // 3. Parsear
  let result;
  try {
    switch (source_type) {
      case 'honda':       result = parseHonda(text);       break;
      case 'yamaha':      result = parseYamaha(text);      break;
      case 'mmb':         result = parseMMB(text);         break;
      case 'promobility': result = parsePromobility(text); break;
    }
  } catch (e) {
    throw new Error(`Error en parser ${source_type}: ${e.message}`);
  }

  return { ...result, raw_text: text, filename };
}

/** Expone el texto crudo + detección para debugging (no hace parsing) */
async function debugPDF(buffer, filename) {
  let data;
  try { data = await pdfParse(buffer); } catch (e) { return { error: e.message, text: null }; }
  const text = data.text || '';
  const source_type = detectSourceType(text);
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  return {
    filename,
    source_type,
    num_lines: lines.length,
    num_chars: text.length,
    first_50_lines: lines.slice(0, 50),
    text_snippet: text.replace(/\s+/g, ' ').slice(0, 2000),
  };
}

module.exports = { extractFromPDF, debugPDF, normalizeModel, detectSourceType };
