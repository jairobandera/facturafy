import { createCrud } from '../../core/crud.js';
import { query } from '../../config/db.js';
import { sendJson } from '../../core/http.js';
import { badRequest } from '../../core/httpError.js';
import { smtpConfigurado } from '../../core/mailer.js';

export const sucursalCrud = createCrud({
  table: 'sucursal',
  entityLabel: 'Sucursal',
  fields: [
    { col: 'nombre', field: 'nombre' },
    { col: 'direccion', field: 'direccion' },
    { col: 'telefono', field: 'telefono' },
    { col: 'empresa_id', field: 'empresaId' },
    // Habilita el apartado de Lotes para los administradores de la sucursal.
    { col: 'usa_lotes', field: 'usaLotes', bool: true, default: true },
    // Paquetes contratados por la sucursal (los configura el superadmin):
    //   usaStock -> control de stock (conteos), usaFacturacion -> facturacion.
    { col: 'usa_stock', field: 'usaStock', bool: true, default: true },
    { col: 'usa_facturacion', field: 'usaFacturacion', bool: true, default: false },
    // Habilita la consulta de precios (kiosko) para el cliente. Requiere facturacion.
    { col: 'usa_consulta_precio', field: 'usaConsultaPrecio', bool: true, default: false },
    // Paquete "Solo envio de correos" (automatizacion de quincenas por Excel).
    { col: 'usa_envio_correos', field: 'usaEnvioCorreos', bool: true, default: false },
    // Limite de credito por defecto para cuentas nuevas (lo fija el administrador).
    { col: 'limite_credito_default', field: 'limiteCreditoDefault', default: 0 },
  ],
});

const MAX_PINES = 3;

export const sucursalService = sucursalCrud.service;

// Sucursales activas de una empresa: alimenta los selectores del admin (elegir en
// que sucursal iniciar un conteo). El extend corre antes de /:id.
export const sucursalRoutes = sucursalCrud.buildRoutes((routes, { normalize }) => {
  routes.get('/empresa/:empresaId', async (ctx, res) => {
    const rows = await query(
      `SELECT id, nombre, direccion, telefono, empresa_id AS empresaId,
              usa_lotes AS usaLotes, usa_stock AS usaStock, usa_facturacion AS usaFacturacion,
              usa_consulta_precio AS usaConsultaPrecio, usa_envio_correos AS usaEnvioCorreos, activo
         FROM sucursal
        WHERE empresa_id = ? AND activo = 1
        ORDER BY nombre`,
      [ctx.params.empresaId]
    );
    sendJson(res, 200, rows.map(normalize));
  });

  // ---- PINes de anulacion (hasta 3 por sucursal, los gestiona el administrador) ----
  // El listado NUNCA devuelve el valor del PIN, solo id, etiqueta y activo.
  routes.get('/:id/pines', async (ctx, res) => {
    const rows = await query(
      `SELECT id, etiqueta, activo FROM sucursal_pin WHERE sucursal_id = ? ORDER BY id`,
      [ctx.params.id]
    );
    sendJson(res, 200, rows.map((r) => ({ ...r, activo: !!r.activo })));
  });

  // Alta de un PIN. Maximo 3 activos por sucursal.
  routes.post('/:id/pines', async (ctx, res) => {
    const pin = String(ctx.body?.pin ?? '').trim();
    const etiqueta = ctx.body?.etiqueta ? String(ctx.body.etiqueta).trim() : null;
    if (!pin) throw badRequest('El PIN es obligatorio');
    const [{ n }] = await query(
      `SELECT COUNT(*) AS n FROM sucursal_pin WHERE sucursal_id = ? AND activo = 1`, [ctx.params.id]
    );
    if (Number(n) >= MAX_PINES) throw badRequest(`Máximo ${MAX_PINES} PINes de anulación por sucursal`);
    const r = await query(
      `INSERT INTO sucursal_pin (sucursal_id, pin, etiqueta, activo) VALUES (?,?,?,1)`,
      [ctx.params.id, pin, etiqueta]
    );
    sendJson(res, 201, { id: r.insertId, etiqueta, activo: true });
  });

  // Modifica un PIN (valor y/o etiqueta y/o activo).
  routes.put('/:id/pines/:pinId', async (ctx, res) => {
    const sets = [];
    const params = [];
    if (ctx.body?.pin != null && String(ctx.body.pin).trim()) { sets.push('pin = ?'); params.push(String(ctx.body.pin).trim()); }
    if (ctx.body?.etiqueta !== undefined) { sets.push('etiqueta = ?'); params.push(ctx.body.etiqueta ? String(ctx.body.etiqueta).trim() : null); }
    if (ctx.body?.activo !== undefined) { sets.push('activo = ?'); params.push(ctx.body.activo ? 1 : 0); }
    if (!sets.length) throw badRequest('Nada para actualizar');
    // Si se reactiva, respeta el maximo de 3 activos.
    if (ctx.body?.activo === true) {
      const [{ n }] = await query(
        `SELECT COUNT(*) AS n FROM sucursal_pin WHERE sucursal_id = ? AND activo = 1 AND id <> ?`,
        [ctx.params.id, ctx.params.pinId]
      );
      if (Number(n) >= MAX_PINES) throw badRequest(`Máximo ${MAX_PINES} PINes de anulación por sucursal`);
    }
    await query(
      `UPDATE sucursal_pin SET ${sets.join(', ')} WHERE id = ? AND sucursal_id = ?`,
      [...params, ctx.params.pinId, ctx.params.id]
    );
    sendJson(res, 200, { ok: true });
  });

  // Borra un PIN (libera un cupo).
  routes.delete('/:id/pines/:pinId', async (ctx, res) => {
    await query(`DELETE FROM sucursal_pin WHERE id = ? AND sucursal_id = ?`, [ctx.params.pinId, ctx.params.id]);
    sendJson(res, 200, { ok: true });
  });

  // ---- Credenciales de correo (SMTP) de la sucursal ----
  // Devuelve la config SIN la contrasena. `configurado` considera tambien el .env global.
  routes.get('/:id/smtp', async (ctx, res) => {
    const rows = await query(
      `SELECT nombre, smtp_user AS smtpUser, smtp_pass AS smtpPass, smtp_host AS smtpHost,
              smtp_port AS smtpPort, smtp_secure AS smtpSecure, smtp_from AS smtpFrom
         FROM sucursal WHERE id = ?`,
      [ctx.params.id]
    );
    if (!rows.length) { sendJson(res, 404, null); return; }
    const s = rows[0];
    sendJson(res, 200, {
      configurado: smtpConfigurado(s),              // propia o global
      propia: !!(s.smtpUser && s.smtpPass),          // tiene credenciales propias
      user: s.smtpUser || '',
      // Se devuelve para que el superadmin pueda verla con el ícono de ojo al editar.
      pass: s.smtpPass || '',
      host: s.smtpHost || 'smtp.gmail.com',
      port: s.smtpPort || 465,
      secure: s.smtpSecure == null ? true : !!s.smtpSecure,
      from: s.smtpFrom || '',
    });
  });

  // Guarda/actualiza las credenciales de correo de la sucursal. La contrasena solo se
  // escribe si viene en el body (vacia = no se cambia). Vaciar el usuario borra ambas.
  routes.put('/:id/smtp', async (ctx, res) => {
    const b = ctx.body || {};
    const user = b.user != null ? String(b.user).trim() : undefined;
    const sets = [];
    const params = [];
    if (user !== undefined) {
      sets.push('smtp_user = ?'); params.push(user || null);
      if (!user) { sets.push('smtp_pass = ?'); params.push(null); } // sin correo, no hay clave
    }
    if (b.pass != null && String(b.pass).trim()) { sets.push('smtp_pass = ?'); params.push(String(b.pass).trim()); }
    if (b.host !== undefined) { sets.push('smtp_host = ?'); params.push(b.host ? String(b.host).trim() : 'smtp.gmail.com'); }
    if (b.port !== undefined) { sets.push('smtp_port = ?'); params.push(Number(b.port) || 465); }
    if (b.secure !== undefined) { sets.push('smtp_secure = ?'); params.push(b.secure ? 1 : 0); }
    if (b.from !== undefined) { sets.push('smtp_from = ?'); params.push(b.from ? String(b.from).trim() : null); }
    if (!sets.length) { sendJson(res, 200, { ok: true }); return; }
    await query(`UPDATE sucursal SET ${sets.join(', ')} WHERE id = ?`, [...params, ctx.params.id]);
    sendJson(res, 200, { ok: true });
  });
});
