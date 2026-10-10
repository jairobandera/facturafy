// Utilidades para exportar/importar datos a Excel usando la libreria XLSX (CDN).
import { h } from '../core/dom.js';

/** Exporta un arreglo de objetos a un archivo .xlsx. */
export function exportToExcel(rows, filename, sheetName = 'Datos') {
  const XLSX = window.XLSX;
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

/** Abre un selector de archivos y resuelve el primer sheet leido segun el modo. */
function pickAndRead(mode) {
  return new Promise((resolve, reject) => {
    const input = h('input', { type: 'file', accept: '.xlsx,.xls,.csv', style: { display: 'none' } });
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const XLSX = window.XLSX;
          const wb = XLSX.read(e.target.result, { type: 'array' });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          if (mode === 'matrix') {
            // Array de arrays: conserva el layout crudo (para saltar preambulos/pies).
            resolve(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false }));
          } else {
            resolve(XLSX.utils.sheet_to_json(sheet, { defval: null }));
          }
        } catch (err) { reject(err); }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
    document.body.append(input);
    input.click();
    setTimeout(() => input.remove(), 1000);
  });
}

/** Abre un selector y devuelve las filas del primer sheet como objetos (encabezado = 1ra fila). */
export function importFromExcel() {
  return pickAndRead('objects');
}

/** Abre un selector y devuelve el primer sheet como array de arrays (filas crudas). */
export function importFromExcelRaw() {
  return pickAndRead('matrix');
}

/** Normaliza un encabezado para comparar: minusculas, sin acentos, solo alfanumerico. */
export function normalizeHeader(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Mapea columnas de forma dinamica a partir de una fila de encabezados.
 * @param {Array} headerRow  Fila de encabezados (celdas).
 * @param {Object<string,string[]>} aliasMap  { campo: [alias aceptados...] }.
 * @returns {Object<string,number>} { campo: indiceColumna } (solo los encontrados).
 */
export function matchColumns(headerRow, aliasMap) {
  const normalized = (headerRow || []).map(normalizeHeader);
  const result = {};
  const tomadas = new Set();
  // Primera pasada: coincidencias EXACTAS. Van antes que las aproximadas para que
  // "codigo_producto" no se quede con la columna "codigo_de_barras" por contener
  // la palabra "codigo" (eso dejaba el mapa indexado por EAN y perdia todo).
  for (const [field, aliases] of Object.entries(aliasMap)) {
    const wanted = aliases.map(normalizeHeader);
    const idx = normalized.findIndex((hdr, i) => hdr && !tomadas.has(i) && wanted.includes(hdr));
    if (idx !== -1) { result[field] = idx; tomadas.add(idx); }
  }
  // Segunda pasada: coincidencia por "contiene", sin reusar columnas ya asignadas.
  for (const [field, aliases] of Object.entries(aliasMap)) {
    if (result[field] !== undefined) continue;
    const wanted = aliases.map(normalizeHeader);
    const idx = normalized.findIndex((hdr, i) =>
      hdr && !tomadas.has(i) && wanted.some((w) => hdr.includes(w) || w.includes(hdr)));
    if (idx !== -1) { result[field] = idx; tomadas.add(idx); }
  }
  return result;
}

/**
 * Como matchColumns pero devuelve TODAS las columnas que matchean cada campo.
 * Hace falta para los codigos de barra: un archivo puede traer EAN1, EAN2, EAN3...
 * y quedarse solo con la primera es perder codigos sin avisar.
 * @returns {Object<string, number[]>} { campo: [indices...] }
 */
export function matchColumnsMulti(headerRow, aliasMap) {
  const normalized = (headerRow || []).map(normalizeHeader);
  const exactos = matchColumns(headerRow, aliasMap);
  const result = {};
  for (const [field, aliases] of Object.entries(aliasMap)) {
    const wanted = aliases.map(normalizeHeader);
    const indices = new Set();
    if (exactos[field] !== undefined) indices.add(exactos[field]);
    normalized.forEach((hdr, i) => {
      if (!hdr) return;
      // Solo se suman columnas que matchean EXACTO o que empiezan con un alias
      // ("ean2", "codigobarra3"): evita arrastrar columnas de otro campo.
      if (wanted.includes(hdr) || wanted.some((w) => w && hdr.startsWith(w))) indices.add(i);
    });
    // No se roban las columnas que otro campo ya tomo en exclusiva.
    for (const [otro, idx] of Object.entries(exactos)) {
      if (otro !== field) indices.delete(idx);
    }
    if (indices.size) result[field] = [...indices].sort((a, b) => a - b);
  }
  return result;
}

/**
 * Clave para cruzar codigos de producto entre un Excel y la base.
 * Los codigos tienen ceros a la izquierda ("002187944") y Excel los puede traer
 * como numero (2187944), con lo que la comparacion exacta no encuentra nada.
 */
export function claveCodigo(valor) {
  const texto = String(valor ?? '').trim().toUpperCase();
  return texto.replace(/^0+(?=.)/, '');
}

/**
 * Busca la fila de encabezados dentro de una matriz (array de arrays).
 * Recorre las primeras filas y devuelve la primera cuyo mapeo contiene TODOS
 * los campos requeridos. Util para saltar preambulos (p.ej. general.xls).
 * @returns {{ index:number, cols:Object<string,number> } | null}
 */
export function findHeaderRow(matrix, aliasMap, requiredFields, maxScan = 20) {
  const limit = Math.min(matrix.length, maxScan);
  for (let i = 0; i < limit; i++) {
    const cols = matchColumns(matrix[i], aliasMap);
    if (requiredFields.every((f) => cols[f] !== undefined)) {
      return { index: i, cols };
    }
  }
  return null;
}

/**
 * Parsea un entero tolerando separadores de miles/decimales en formato uruguayo
 * ("1.234,00" = 1234), es-US ("1,234.00") y simples. Devuelve null si el valor tiene
 * decimales REALES (p.ej. combustibles en litros "49.921,83") o si no es valido.
 *
 * Reglas (aditivas, no rompen lo anterior):
 *  - punto Y coma: el decimal es el ULTIMO separador que aparece; el otro es de miles.
 *  - solo coma: coma = decimal.
 *  - solo punto (o sin separador): se mantiene el criterio anterior (punto = miles).
 */
export function parseNumeroEntero(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isInteger(value) ? value : null;
  let raw = String(value).trim().replace(/[^\d.,-]/g, '');
  if (!raw || !/\d/.test(raw)) return null;
  const tienePunto = raw.includes('.');
  const tieneComa = raw.includes(',');
  if (tienePunto && tieneComa) {
    const sepDec = raw.lastIndexOf('.') > raw.lastIndexOf(',') ? '.' : ',';
    const sepMil = sepDec === '.' ? ',' : '.';
    raw = raw.split(sepMil).join('');
    const [ent, dec] = raw.split(sepDec);
    if (dec && /[1-9]/.test(dec)) return null; // decimal real -> se saltea
    const n = Number.parseInt(ent, 10);
    return Number.isNaN(n) ? null : n;
  }
  if (tieneComa) {
    const [ent, dec] = raw.split(',');
    if (dec && /[1-9]/.test(dec)) return null;
    const n = Number.parseInt(ent, 10);
    return Number.isNaN(n) ? null : n;
  }
  // Solo punto o sin separador: punto como separador de miles (criterio histórico).
  const n = Number.parseInt(raw.replace(/\./g, ''), 10);
  return Number.isNaN(n) ? null : n;
}

/**
 * Parsea un precio tolerando "$u", espacios y separadores decimales en formato
 * uruguayo ("1.234,56" = 1234.56), es-US ("1,234.56") y simples.
 *  - punto Y coma: el decimal es el ULTIMO separador; el otro es de miles.
 *  - solo coma: coma = decimal.
 *  - solo punto: punto = decimal (como hasta ahora, ej. "29.16610").
 */
export function parsePrecio(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  let raw = String(value).replace(/[^\d.,-]/g, '').trim();
  if (!raw) return 0;
  const tienePunto = raw.includes('.');
  const tieneComa = raw.includes(',');
  if (tienePunto && tieneComa) {
    const sepDec = raw.lastIndexOf('.') > raw.lastIndexOf(',') ? '.' : ',';
    const sepMil = sepDec === '.' ? ',' : '.';
    raw = raw.split(sepMil).join('');
    if (sepDec === ',') raw = raw.replace(',', '.');
  } else if (tieneComa) {
    raw = raw.replace(/,/g, '.');
  }
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

export function excelButton(label, icon, onClick, cls = 'btn-outline-success') {
  return h('button', { class: `btn ${cls} btn-sm`, onClick }, [
    h('i', { class: `bi ${icon} me-1` }), label,
  ]);
}
