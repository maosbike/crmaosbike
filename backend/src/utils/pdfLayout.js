/**
 * pdfLayout.js — extracción de texto preservando el layout del PDF.
 *
 * pdf-parse colapsa el texto en orden de lectura por filas y pega columnas
 * sin separación, lo que rompe las facturas con header multicolumna.
 * Ej: "COMUNA: Huechuraba   CIUDAD: Santiago" termina como
 *     "COMUNAHUECHURABACIUDAD:SANTIAGO".
 *
 * pdfjs-dist da las coordenadas (x, y) de cada item de texto. Aquí los
 * agrupamos por línea (y similar dentro de tolerancia) y los ordenamos
 * por x. Insertamos espacios proporcionales al gap real entre items
 * para preservar separación visual.
 *
 * Devuelve { text, lines } donde:
 *   text  — todo el documento como string, líneas separadas por \n
 *   lines — array de líneas, cada una con sus items posicionados
 */
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs');

// Tolerancia vertical (en unidades del PDF) para considerar dos items
// como la "misma línea". 2 unidades suele cubrir variaciones de ascenders
// y descenders en una misma fila de texto.
const Y_TOL = 2.5;

// Gap horizontal mínimo (en unidades) que se traduce a un espacio doble.
// Anchura típica de un caracter es ~5-7 unidades. Un gap > 8 = columna nueva.
const COL_GAP = 8;

async function extractPdfWithLayout(buffer) {
  const data = new Uint8Array(buffer);
  const doc = await pdfjsLib.getDocument({ data, disableFontFace: true, isEvalSupported: false }).promise;
  const allLines = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // Cada item: { str, transform: [a,b,c,d,e,f], width, height }
    // e = x, f = y (medido desde abajo).
    const items = content.items
      .map(it => ({
        str: it.str,
        x:   it.transform[4],
        y:   it.transform[5],
        w:   it.width || 0,
      }))
      .filter(it => it.str && it.str.trim().length > 0);

    // Agrupar por línea: items con y similar.
    items.sort((a, b) => (b.y - a.y) || (a.x - b.x));
    const lines = [];
    for (const it of items) {
      // Buscar línea existente con y dentro de tolerancia
      const existing = lines.find(L => Math.abs(L.y - it.y) <= Y_TOL);
      if (existing) {
        existing.items.push(it);
        existing.y = (existing.y + it.y) / 2; // promedio para estabilizar
      } else {
        lines.push({ y: it.y, items: [it] });
      }
    }

    // Reconstruir cada línea respetando gaps horizontales.
    for (const L of lines) {
      L.items.sort((a, b) => a.x - b.x);
      let txt = '';
      let prevEnd = -Infinity;
      for (const it of L.items) {
        if (txt.length === 0) {
          txt = it.str;
        } else {
          const gap = it.x - prevEnd;
          if (gap >= COL_GAP)        txt += '   ';   // 3 espacios = columna nueva
          else if (gap >= 2)         txt += ' ';      // espacio normal
          else if (gap >= 0)         txt += '';       // pegado (ej: "FZ-S")
          else                       txt += ' ';      // overlapping → separar
          txt += it.str;
        }
        prevEnd = it.x + it.w;
      }
      allLines.push({ y: L.y, text: txt.trim(), page: p });
    }
  }

  // Limpieza final
  const text = allLines.map(L => L.text).join('\n');
  return { text, lines: allLines };
}

module.exports = { extractPdfWithLayout };
