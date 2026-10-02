import { createCrud } from '../../core/crud.js';
import { query } from '../../config/db.js';
import { sendJson } from '../../core/http.js';
import { badRequest } from '../../core/httpError.js';

export const categoriaCrud = createCrud({
  table: 'categoria',
  entityLabel: 'Categoria',
  fields: [
    { col: 'nombre', field: 'nombre' },
    { col: 'descripcion', field: 'descripcion' },
    { col: 'codigo_categoria', field: 'codigoCategoria' },
    { col: 'sucursal_id', field: 'sucursalId' },
  ],
});

const SELECT = `
  SELECT id, nombre, descripcion, codigo_categoria AS codigoCategoria,
         sucursal_id AS sucursalId, activo
  FROM categoria`;

export const categoriaService = categoriaCrud.service;

/** Crea categorias en lote (import Excel), omitiendo duplicadas dentro de la sucursal. */
async function crearLote(categorias, sucursalId) {
  if (!sucursalId) throw badRequest('sucursalId es requerido');
  if (!Array.isArray(categorias)) throw badRequest('Se espera un arreglo de categorias');
  const creadas = [];
  const duplicadas = [];
  const errores = [];
  for (const dto of categorias) {
    const nombre = (dto.nombre ?? '').toString().trim();
    const codigo = (dto.codigoCategoria ?? '').toString().trim() || null;
    if (!nombre) { errores.push('Categoria sin nombre'); continue; }
    try {
      let existentes;
      if (codigo) {
        existentes = await query(
          `SELECT id FROM categoria WHERE codigo_categoria = ? AND sucursal_id = ?`,
          [codigo, sucursalId]
        );
      } else {
        existentes = await query(
          `SELECT id FROM categoria WHERE LOWER(nombre) = LOWER(?) AND sucursal_id = ?`,
          [nombre, sucursalId]
        );
      }
      if (existentes.length) { duplicadas.push(codigo || nombre); continue; }
      await query(
        `INSERT INTO categoria (nombre, descripcion, codigo_categoria, sucursal_id, activo)
         VALUES (?,?,?,?,1)`,
        [nombre, dto.descripcion ?? null, codigo, sucursalId]
      );
      creadas.push(codigo || nombre);
    } catch (e) {
      errores.push(`${codigo || nombre} - ${e.message}`);
    }
  }
  return { mensaje: 'Carga finalizada', creadas, duplicadas, errores };
}

export const categoriaRoutes = categoriaCrud.buildRoutes((routes, { normalize }) => {
  // POST /categorias/crear-lote?sucursalId=...  (import masivo)
  routes.post('/crear-lote', async (ctx, res) =>
    sendJson(res, 200, await crearLote(ctx.body, ctx.query.sucursalId)));

  // GET /categorias/codigo/:codigoCategoria/sucursal/:sucursalId
  routes.get('/codigo/:codigoCategoria/sucursal/:sucursalId', async (ctx, res) => {
    const rows = await query(
      `${SELECT} WHERE codigo_categoria = ? AND sucursal_id = ? AND activo = 1`,
      [ctx.params.codigoCategoria, ctx.params.sucursalId]
    );
    rows[0] ? sendJson(res, 200, normalize(rows[0])) : sendJson(res, 404, null);
  });

  // GET /categorias/codigo/:codigoCategoria
  routes.get('/codigo/:codigoCategoria', async (ctx, res) => {
    const rows = await query(`${SELECT} WHERE codigo_categoria = ? AND activo = 1`, [ctx.params.codigoCategoria]);
    rows[0] ? sendJson(res, 200, normalize(rows[0])) : sendJson(res, 404, null);
  });

  // GET /categorias/sucursal/:sucursalId  (categorias activas de la sucursal)
  routes.get('/sucursal/:sucursalId', async (ctx, res) => {
    const rows = await query(`${SELECT} WHERE sucursal_id = ? AND activo = 1`, [ctx.params.sucursalId]);
    sendJson(res, 200, rows.map(normalize));
  });
});
