// Helpers para construir SQL dinamico de forma segura (placeholders).

/**
 * Construye la parte SET de un UPDATE a partir de un objeto {columna: valor}.
 * Ignora valores undefined (no null: null se usa para "limpiar" un campo).
 * @returns {{ clause: string, params: any[] }}
 */
export function buildSet(assignments) {
  const cols = [];
  const params = [];
  for (const [col, value] of Object.entries(assignments)) {
    if (value === undefined) continue;
    cols.push(`\`${col}\` = ?`);
    params.push(value);
  }
  return { clause: cols.join(', '), params };
}

/** Convierte un valor a booleano 0/1 para MySQL, respetando null/undefined. */
export function toBool(value) {
  if (value === undefined || value === null) return value;
  return value ? 1 : 0;
}
