// Factory de CRUD generico para entidades simples con soft-delete (columna "activo").
// Genera repositorio, servicio y rutas estandar a partir de una configuracion.
import { query } from '../config/db.js';
import { Router } from './router.js';
import { sendJson, sendNoContent } from './http.js';
import { buildSet, toBool } from './sql.js';
import { notFound } from './httpError.js';

/**
 * @param {object} cfg
 * @param {string} cfg.table            Nombre de la tabla.
 * @param {string} cfg.entityLabel      Nombre legible para mensajes de error.
 * @param {Array<{col:string, field:string, bool?:boolean, default?:any}>} cfg.fields
 *        Campos mapeables (columna <-> propiedad DTO). No incluir id ni activo.
 *        `default` se usa en el alta cuando el DTO no trae el campo (columnas NOT NULL).
 */
export function createCrud(cfg) {
  const { table, entityLabel, fields } = cfg;

  const selectCols = [
    'id',
    ...fields.map((f) => (f.col === f.field ? `\`${f.col}\`` : `\`${f.col}\` AS \`${f.field}\``)),
    'activo',
  ].join(', ');
  const SELECT = `SELECT ${selectCols} FROM \`${table}\``;

  function normalize(row) {
    if (!row) return row;
    const out = { ...row, activo: !!row.activo };
    for (const f of fields) if (f.bool) out[f.field] = out[f.field] === null ? null : !!out[f.field];
    return out;
  }

  const repository = {
    async findAllActive() { return query(`${SELECT} WHERE activo = 1`); },
    async findAll() { return query(SELECT); },
    async findByIdActive(id) {
      const rows = await query(`${SELECT} WHERE id = ? AND activo = 1`, [id]);
      return rows[0] || null;
    },
    async findById(id) {
      const rows = await query(`${SELECT} WHERE id = ?`, [id]);
      return rows[0] || null;
    },
    async insert(dto) {
      const cols = fields.map((f) => `\`${f.col}\``).join(', ');
      const placeholders = fields.map(() => '?').join(', ');
      const values = fields.map((f) => coerce(f, dto[f.field] ?? f.default));
      const res = await query(
        `INSERT INTO \`${table}\` (${cols}, activo) VALUES (${placeholders}, 1)`,
        values
      );
      return this.findById(res.insertId);
    },
    async updateFields(id, assignments) {
      const { clause, params } = buildSet(assignments);
      if (!clause) return this.findById(id);
      await query(`UPDATE \`${table}\` SET ${clause} WHERE id = ?`, [...params, id]);
      return this.findById(id);
    },
  };

  function coerce(f, value) {
    if (value === undefined) value = null;
    if (f.bool) return toBool(value);
    return value;
  }

  const service = {
    async getAllActive() { return (await repository.findAllActive()).map(normalize); },
    async getAllIncludingInactive() { return (await repository.findAll()).map(normalize); },
    async getById(id) { return normalize(await repository.findByIdActive(id)); },
    async create(dto) { return normalize(await repository.insert(dto)); },
    async update(id, dto) {
      const existing = await repository.findById(id);
      if (!existing) return null;
      const assignments = {};
      for (const f of fields) {
        if (dto[f.field] !== undefined) assignments[f.col] = coerce(f, dto[f.field]);
      }
      if (dto.activo !== undefined && dto.activo !== null) assignments.activo = toBool(dto.activo);
      return normalize(await repository.updateFields(id, assignments));
    },
    async deactivate(id) {
      const existing = await repository.findById(id);
      if (!existing) throw notFound(`${entityLabel} no encontrado con id: ${id}`);
      await repository.updateFields(id, { activo: 0 });
    },
  };

  function buildRoutes(extend) {
    const routes = new Router();
    routes.get('/', async (ctx, res) => sendJson(res, 200, await service.getAllActive()));
    routes.get('/all', async (ctx, res) => sendJson(res, 200, await service.getAllIncludingInactive()));
    // Permite que el modulo agregue rutas ANTES de /:id (para evitar colisiones).
    if (extend) extend(routes, { repository, service, normalize });
    routes.get('/:id', async (ctx, res) => {
      const item = await service.getById(ctx.params.id);
      item ? sendJson(res, 200, item) : sendJson(res, 404, null);
    });
    routes.post('/', async (ctx, res) => sendJson(res, 201, await service.create(ctx.body)));
    routes.put('/:id', async (ctx, res) => {
      const updated = await service.update(ctx.params.id, ctx.body);
      updated ? sendJson(res, 200, updated) : sendJson(res, 404, null);
    });
    routes.delete('/:id', async (ctx, res) => {
      await service.deactivate(ctx.params.id);
      sendNoContent(res);
    });
    return routes;
  }

  return { repository, service, normalize, buildRoutes };
}
