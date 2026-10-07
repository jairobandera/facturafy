// Clientes de facturacion. CRUD con soft-delete, scoped por sucursal. Ademas:
// cuenta corriente (saldo/pagos/mora), limite de credito y envio del estado de cuenta
// de la quincena por correo. El alta y la gestion son SOLO del administrador; el
// cajero solo busca clientes para facturar (email es obligatorio al crear).
import { createCrud } from '../../core/crud.js';
import { query } from '../../config/db.js';
import { sendJson } from '../../core/http.js';
import { badRequest } from '../../core/httpError.js';
import { assertUsaFacturacion } from '../sucursal/paquetes.js';
import { cuentaService } from './cuenta.js';
import { statement, enviarQuincena } from './quincena.js';

export const clienteCrud = createCrud({
  table: 'cliente',
  entityLabel: 'Cliente',
  fields: [
    { col: 'rut', field: 'rut' },
    { col: 'razon_social', field: 'razonSocial' },
    { col: 'nombre_fantasia', field: 'nombreFantasia' },
    { col: 'direccion', field: 'direccion' },
    { col: 'telefono', field: 'telefono' },
    { col: 'email', field: 'email' },
    { col: 'tipo_documento', field: 'tipoDocumento', default: 'RUT' },
    { col: 'limite_credito', field: 'limiteCredito', default: 0 },
    { col: 'sucursal_id', field: 'sucursalId' },
  ],
});

export const clienteService = clienteCrud.service;

const SELECT = `
  SELECT id, rut, razon_social AS razonSocial, nombre_fantasia AS nombreFantasia,
         direccion, telefono, email, tipo_documento AS tipoDocumento,
         limite_credito AS limiteCredito, sucursal_id AS sucursalId, activo
  FROM cliente`;

function normalize(row) {
  return row ? { ...row, activo: !!row.activo, limiteCredito: Number(row.limiteCredito || 0) } : row;
}

async function limiteDefaultDeSucursal(sucursalId) {
  const rows = await query(`SELECT limite_credito_default AS lim FROM sucursal WHERE id = ?`, [sucursalId]);
  return Number(rows[0]?.lim || 0);
}

// Las rutas literales van ANTES de /:id para no colisionar con el parametro.
export const clienteRoutes = clienteCrud.buildRoutes((routes) => {
  // Alta de cliente (solo administrador): email obligatorio y, si no viene limite,
  // se toma el limite_credito_default de la sucursal.
  routes.post('/', async (ctx, res) => {
    const dto = ctx.body || {};
    if (!dto.sucursalId) throw badRequest('sucursalId es requerido');
    await assertUsaFacturacion(dto.sucursalId);
    if (!dto.email || !String(dto.email).trim()) {
      throw badRequest('El email del cliente es obligatorio (se usa para enviarle el estado de cuenta)');
    }
    if (dto.limiteCredito == null || dto.limiteCredito === '') {
      dto.limiteCredito = await limiteDefaultDeSucursal(dto.sucursalId);
    }
    sendJson(res, 201, await clienteService.create(dto));
  });

  // Clientes activos de una sucursal (los lista el POS y la pantalla de clientes).
  routes.get('/sucursal/:sucursalId', async (ctx, res) => {
    await assertUsaFacturacion(ctx.params.sucursalId);
    const rows = await query(
      `${SELECT} WHERE sucursal_id = ? AND activo = 1 ORDER BY razon_social`,
      [ctx.params.sucursalId]
    );
    sendJson(res, 200, rows.map(normalize));
  });

  // Busqueda exacta por RUT dentro de la sucursal (el POS la usa al tipear el RUT).
  routes.get('/sucursal/:sucursalId/rut/:rut', async (ctx, res) => {
    const rows = await query(
      `${SELECT} WHERE sucursal_id = ? AND rut = ? AND activo = 1 LIMIT 1`,
      [ctx.params.sucursalId, String(ctx.params.rut).trim()]
    );
    rows.length ? sendJson(res, 200, normalize(rows[0])) : sendJson(res, 404, null);
  });

  // Enviar estado de cuenta de la quincena (a uno, varios o todos). Debe ir antes de
  // /:id para que "quincena" no se interprete como un id.
  routes.post('/quincena/enviar', async (ctx, res) => {
    const { sucursalId, desde, hasta, clienteIds, usuarioId } = ctx.body || {};
    await assertUsaFacturacion(sucursalId);
    sendJson(res, 200, await enviarQuincena({ sucursalId, desde, hasta, clienteIds, usuarioId }));
  });

  // ---- Cuenta corriente de un cliente ----
  routes.get('/:id/cuenta', async (ctx, res) => {
    sendJson(res, 200, await cuentaService.resumen(ctx.params.id));
  });

  routes.get('/:id/quincena', async (ctx, res) => {
    sendJson(res, 200, await statement(ctx.params.id, { desde: ctx.query.desde, hasta: ctx.query.hasta }));
  });

  routes.post('/:id/pagos', async (ctx, res) => {
    const { monto, nota, usuarioId } = ctx.body || {};
    sendJson(res, 200, await cuentaService.registrarPago(ctx.params.id, { monto, nota, usuarioId }));
  });

  routes.post('/:id/mora', async (ctx, res) => {
    const { modo, valor, nota, usuarioId } = ctx.body || {};
    sendJson(res, 200, await cuentaService.aplicarMora(ctx.params.id, { modo, valor, nota, usuarioId }));
  });

  routes.put('/:id/limite', async (ctx, res) => {
    const { limiteCredito } = ctx.body || {};
    sendJson(res, 200, await cuentaService.setLimite(ctx.params.id, limiteCredito));
  });
});
