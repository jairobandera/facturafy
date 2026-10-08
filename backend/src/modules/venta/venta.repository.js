import { query } from '../../config/db.js';

const SELECT = `
  SELECT v.id, v.fecha_hora AS fechaHora, v.sucursal_id AS sucursalId,
         v.turno_id AS turnoId,
         v.usuario_id AS usuarioId, v.cliente_id AS clienteId,
         v.consumidor_final AS consumidorFinal, v.subtotal, v.descuento, v.total,
         v.forma_pago AS formaPago, v.moneda_pago AS monedaPago, v.cotizacion,
         v.total_moneda AS totalMoneda, v.efectivo_recibido AS efectivoRecibido,
         v.vuelto, v.comentario,
         v.estado, v.motivo_anulacion AS motivoAnulacion,
         v.fecha_anulacion AS fechaAnulacion, v.usuario_anulacion_id AS usuarioAnulacionId,
         v.activo, v.cfe_tipo AS cfeTipo, v.cfe_serie AS cfeSerie, v.cfe_numero AS cfeNumero,
         v.cfe_estado AS cfeEstado, v.cfe_uuid AS cfeUuid, v.cfe_cae AS cfeCae,
         v.cfe_qr_url AS cfeQrUrl, v.cfe_hash AS cfeHash,
         c.razon_social AS clienteRazonSocial, c.rut AS clienteRut,
         c.tipo_documento AS clienteTipoDocumento,
         u.nombre AS usuarioNombre, u.apellido AS usuarioApellido
  FROM venta v
  LEFT JOIN cliente c ON c.id = v.cliente_id
  LEFT JOIN usuario u ON u.id = v.usuario_id`;

export function normalizeVenta(row, detalles = []) {
  if (!row) return row;
  return {
    ...row,
    consumidorFinal: !!row.consumidorFinal,
    activo: !!row.activo,
    subtotal: Number(row.subtotal),
    descuento: Number(row.descuento),
    total: Number(row.total),
    cotizacion: Number(row.cotizacion),
    totalMoneda: Number(row.totalMoneda),
    efectivoRecibido: row.efectivoRecibido == null ? null : Number(row.efectivoRecibido),
    vuelto: row.vuelto == null ? null : Number(row.vuelto),
    detalles: detalles.map((d) => ({
      ...d,
      precioUnitario: Number(d.precioUnitario),
      cantidad: Number(d.cantidad),
      subtotal: Number(d.subtotal),
    })),
  };
}

async function hydrate(rows) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const inClause = ids.map(() => '?').join(',');
  const detalles = await query(
    `SELECT id, venta_id AS ventaId, producto_id AS productoId,
            codigo_producto AS codigoProducto, nombre, precio_unitario AS precioUnitario,
            cantidad, subtotal
       FROM venta_detalle WHERE venta_id IN (${inClause}) ORDER BY id`,
    ids
  );
  const porVenta = new Map();
  for (const d of detalles) {
    if (!porVenta.has(d.ventaId)) porVenta.set(d.ventaId, []);
    porVenta.get(d.ventaId).push(d);
  }
  return rows.map((r) => normalizeVenta(r, porVenta.get(r.id) || []));
}

export const ventaRepository = {
  async findById(id) {
    return (await hydrate(await query(`${SELECT} WHERE v.id = ?`, [id])))[0] || null;
  },
  // Lista de una sucursal con filtros opcionales por rango de fecha y estado.
  async findBySucursal(sucursalId, { desde, hasta, estado } = {}) {
    const params = [sucursalId];
    let where = 'WHERE v.sucursal_id = ?';
    if (desde) { where += ' AND v.fecha_hora >= ?'; params.push(`${desde} 00:00:00`); }
    if (hasta) { where += ' AND v.fecha_hora <= ?'; params.push(`${hasta} 23:59:59`); }
    if (estado) { where += ' AND v.estado = ?'; params.push(estado); }
    return hydrate(await query(`${SELECT} ${where} ORDER BY v.fecha_hora DESC, v.id DESC`, params));
  },
  // Ventas de un turno (las controla/anula el cajero durante su turno).
  async findByTurno(turnoId) {
    return hydrate(await query(`${SELECT} WHERE v.turno_id = ? ORDER BY v.fecha_hora DESC, v.id DESC`, [turnoId]));
  },
  // Ventas de un cliente (historial para la cuenta corriente del administrador).
  async findByCliente(clienteId) {
    return hydrate(await query(`${SELECT} WHERE v.cliente_id = ? ORDER BY v.fecha_hora DESC, v.id DESC`, [clienteId]));
  },
};
