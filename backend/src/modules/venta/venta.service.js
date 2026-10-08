import { query, transaction } from '../../config/db.js';
import { badRequest, notFound, forbidden } from '../../core/httpError.js';
import { assertUsaFacturacion } from '../sucursal/paquetes.js';
import { emitirCFE } from '../facturacion/cfe.js';
import { ventaRepository } from './venta.repository.js';
import { saldoConConn, cargarVenta, revertirVenta } from '../cliente/cuenta.js';
import { cotizacionService } from '../cotizacion/cotizacion.module.js';

function money(n) {
  return Number(n || 0).toLocaleString('es-UY', { style: 'currency', currency: 'UYU', minimumFractionDigits: 2 });
}

const FORMAS_PAGO = ['CONTADO', 'CREDITO'];

/** Fecha y hora LOCAL del servidor en formato MySQL (igual criterio que conteo.module.js). */
function nowDateTime() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 19).replace('T', ' ');
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * Resuelve el cliente de la venta. Sin clienteId es consumidor final (cliente_id NULL).
 * El cliente debe pertenecer a la sucursal de la venta.
 */
async function resolverCliente(conn, dto, sucursalId) {
  if (!dto.clienteId) return { clienteId: null, consumidorFinal: true, limiteCredito: 0 };
  const [rows] = await conn.execute(
    `SELECT id, limite_credito AS limiteCredito FROM cliente WHERE id = ? AND sucursal_id = ? AND activo = 1`,
    [dto.clienteId, sucursalId]
  );
  if (!rows.length) throw badRequest('El cliente no pertenece a esta sucursal o no existe');
  return { clienteId: Number(dto.clienteId), consumidorFinal: false, limiteCredito: Number(rows[0].limiteCredito || 0) };
}

/**
 * Resuelve el turno de la venta. El POS siempre manda el turno abierto; el turno
 * debe estar ABIERTO y pertenecer a la sucursal de la venta.
 */
async function resolverTurno(conn, dto, sucursalId) {
  if (!dto.turnoId) return null;
  const [rows] = await conn.execute(
    `SELECT id, estado FROM turno WHERE id = ? AND sucursal_id = ?`,
    [dto.turnoId, sucursalId]
  );
  if (!rows.length) throw badRequest('El turno no pertenece a esta sucursal o no existe');
  if (rows[0].estado !== 'ABIERTO') throw badRequest('El turno está cerrado: no se pueden registrar ventas');
  return Number(dto.turnoId);
}

export const ventaService = {
  getById: (id) => ventaRepository.findById(id),
  getBySucursal: (sucursalId, filtros) => ventaRepository.findBySucursal(sucursalId, filtros),
  getByTurno: (turnoId) => ventaRepository.findByTurno(turnoId),
  getByCliente: (clienteId) => ventaRepository.findByCliente(clienteId),

  /**
   * Registra una venta: valida el paquete, recalcula los totales en el servidor
   * desde los renglones, inserta venta + venta_detalle y DESCUENTA el stock de cada
   * producto. El precio/nombre se guardan como snapshot.
   */
  async crear(dto) {
    const sucursalId = Number(dto.sucursalId);
    if (!sucursalId) throw badRequest('sucursalId es requerido');
    await assertUsaFacturacion(sucursalId);

    const items = Array.isArray(dto.items) ? dto.items : [];
    if (!items.length) throw badRequest('La venta debe tener al menos un producto');

    const formaPago = dto.formaPago || 'CONTADO';
    if (!FORMAS_PAGO.includes(formaPago)) throw badRequest(`Forma de pago invalida: ${formaPago}`);

    // Moneda de cobro. El credito siempre se registra en UYU (la deuda es en pesos).
    // Se resuelve la cotizacion (UYU por 1 unidad): la del admin y, si falta, la de la API.
    const monedaPago = formaPago === 'CREDITO' ? 'UYU' : String(dto.monedaPago || 'UYU').toUpperCase();
    let cotizacion = 1;
    if (monedaPago !== 'UYU') {
      const empRows = await query(`SELECT empresa_id AS empresaId FROM sucursal WHERE id = ?`, [sucursalId]);
      const empresaId = empRows[0]?.empresaId;
      ({ cotizacion } = await cotizacionService.paraVenta(empresaId, monedaPago));
    }
    const comentario = dto.comentario ? String(dto.comentario).trim().slice(0, 500) : null;
    const efectivoRecibido = (dto.efectivoRecibido != null && dto.efectivoRecibido !== '')
      ? round2(dto.efectivoRecibido) : null;

    const id = await transaction(async (conn) => {
      const { clienteId, consumidorFinal, limiteCredito } = await resolverCliente(conn, dto, sucursalId);
      // Una venta a credito exige un cliente registrado (a quien cobrarle despues).
      if (formaPago === 'CREDITO' && !clienteId) {
        throw badRequest('Una venta a crédito requiere un cliente registrado');
      }
      const turnoId = await resolverTurno(conn, dto, sucursalId);

      // Unifica por producto por las dudas (el carrito ya unifica en el front).
      const porProducto = new Map();
      for (const it of items) {
        const productoId = Number(it.productoId);
        const cantidad = Number(it.cantidad);
        if (!productoId || !Number.isFinite(cantidad) || cantidad <= 0) {
          throw badRequest('Cada renglon necesita productoId y una cantidad mayor a 0');
        }
        porProducto.set(productoId, (porProducto.get(productoId) || 0) + cantidad);
      }

      const renglones = [];
      let subtotal = 0;
      for (const [productoId, cantidad] of porProducto) {
        // El producto tiene que ser de la sucursal de la venta.
        const [rows] = await conn.execute(
          `SELECT id, codigo_producto AS codigoProducto, nombre, precio, cantidad_stock AS cantidadStock
             FROM producto WHERE id = ? AND sucursal_id = ? AND activo = 1`,
          [productoId, sucursalId]
        );
        if (!rows.length) throw badRequest(`Producto ${productoId} no pertenece a esta sucursal o no esta activo`);
        const p = rows[0];
        const precioUnitario = Number(p.precio);
        const subtotalRenglon = round2(precioUnitario * cantidad);
        subtotal += subtotalRenglon;
        renglones.push({
          productoId, codigoProducto: p.codigoProducto, nombre: p.nombre,
          precioUnitario, cantidad, subtotal: subtotalRenglon,
        });
      }

      const descuento = round2(dto.descuento || 0);
      subtotal = round2(subtotal);
      const total = round2(subtotal - descuento);
      if (total < 0) throw badRequest('El descuento no puede ser mayor al subtotal');

      // Limite de credito: una venta a credito no puede dejar el saldo del cliente por
      // encima de su limite. 0 = sin limite.
      if (formaPago === 'CREDITO' && clienteId && limiteCredito > 0) {
        const saldo = await saldoConConn(conn, clienteId);
        if (saldo + total > limiteCredito) {
          const disponible = Math.max(0, round2(limiteCredito - saldo));
          throw badRequest(
            `No se puede facturar a crédito: supera el límite del cliente. ` +
            `Límite ${money(limiteCredito)}, deuda actual ${money(saldo)}, disponible ${money(disponible)}; ` +
            `esta venta es ${money(total)}.`
          );
        }
      }

      // Total convertido a la moneda de cobro y, si es contado con efectivo, el vuelto.
      const totalMoneda = round2(total / cotizacion);
      let vuelto = null;
      if (efectivoRecibido != null) {
        if (efectivoRecibido < totalMoneda) {
          throw badRequest(`El efectivo recibido (${efectivoRecibido}) es menor al total a pagar (${totalMoneda} ${monedaPago}).`);
        }
        vuelto = round2(efectivoRecibido - totalMoneda);
      }

      const [res] = await conn.execute(
        `INSERT INTO venta
           (fecha_hora, sucursal_id, turno_id, usuario_id, cliente_id, consumidor_final,
            subtotal, descuento, total, forma_pago,
            moneda_pago, cotizacion, total_moneda, efectivo_recibido, vuelto, comentario,
            estado, activo, cfe_estado)
         VALUES (?,?,?,?,?,?,?,?,?,?, ?,?,?,?,?,?, 'EMITIDA', 1, 'INTERNO')`,
        [nowDateTime(), sucursalId, turnoId, dto.usuarioId ?? null, clienteId, consumidorFinal ? 1 : 0,
         subtotal, descuento, total, formaPago,
         monedaPago, cotizacion, totalMoneda, efectivoRecibido, vuelto, comentario]
      );
      const ventaId = res.insertId;

      for (const r of renglones) {
        await conn.execute(
          `INSERT INTO venta_detalle
             (venta_id, producto_id, codigo_producto, nombre, precio_unitario, cantidad, subtotal)
           VALUES (?,?,?,?,?,?,?)`,
          [ventaId, r.productoId, r.codigoProducto, r.nombre, r.precioUnitario, r.cantidad, r.subtotal]
        );
        // Descuenta el stock del producto (puede quedar negativo si se vendio de mas:
        // el modelo de stock del sistema ya admite negativos).
        await conn.execute(
          `UPDATE producto SET cantidad_stock = cantidad_stock - ? WHERE id = ?`,
          [r.cantidad, r.productoId]
        );
      }

      // Venta a credito: carga la deuda en la cuenta corriente del cliente.
      if (formaPago === 'CREDITO' && clienteId) {
        await cargarVenta(conn, { clienteId, ventaId, monto: total, descripcion: `Venta #${ventaId}`, usuarioId: dto.usuarioId });
      }
      return ventaId;
    });

    // Fuera de la transaccion: emision del comprobante fiscal (hoy no-op INTERNO).
    const venta = await ventaRepository.findById(id);
    try {
      const cfe = await emitirCFE(venta);
      await aplicarResultadoCFE(id, cfe);
    } catch (err) {
      // La venta ya quedo registrada; el CFE se puede reintentar luego.
      console.error('[CFE] No se pudo emitir el comprobante de la venta', id, err?.message);
    }
    return ventaRepository.findById(id);
  },

  /**
   * Anula una venta EMITIDA: exige motivo, marca ANULADA y DEVUELVE el stock de
   * cada renglon al producto. No se puede anular dos veces.
   */
  async anular(id, { motivo, usuarioId, pin, requierePin } = {}) {
    const limpio = String(motivo ?? '').trim();
    if (!limpio) throw badRequest('El motivo de anulacion es obligatorio');

    await transaction(async (conn) => {
      const [ventas] = await conn.execute(
        `SELECT id, estado, sucursal_id AS sucursalId FROM venta WHERE id = ? FOR UPDATE`, [id]
      );
      if (!ventas.length) throw notFound(`Venta no encontrada con id: ${id}`);
      if (ventas[0].estado === 'ANULADA') throw badRequest('La venta ya estaba anulada');

      // Cuando la anulacion la pide un cajero (no un admin), exige uno de los PINes
      // de autorizacion activos de la sucursal.
      if (requierePin) {
        const ingresado = String(pin ?? '').trim();
        const [cfg] = await conn.execute(
          `SELECT COUNT(*) AS n FROM sucursal_pin WHERE sucursal_id = ? AND activo = 1`,
          [ventas[0].sucursalId]
        );
        if (Number(cfg[0].n) === 0) {
          throw badRequest('La sucursal no tiene configurado un PIN de autorización. Pedíselo al administrador.');
        }
        if (!ingresado) throw badRequest('Ingresá el PIN de autorización');
        const [match] = await conn.execute(
          `SELECT id FROM sucursal_pin WHERE sucursal_id = ? AND activo = 1 AND pin = ? LIMIT 1`,
          [ventas[0].sucursalId, ingresado]
        );
        if (!match.length) throw forbidden('PIN de autorización incorrecto');
      }

      const [detalles] = await conn.execute(
        `SELECT producto_id AS productoId, cantidad FROM venta_detalle WHERE venta_id = ?`, [id]
      );
      for (const d of detalles) {
        if (d.productoId == null) continue;
        await conn.execute(
          `UPDATE producto SET cantidad_stock = cantidad_stock + ? WHERE id = ?`,
          [d.cantidad, d.productoId]
        );
      }
      await conn.execute(
        `UPDATE venta SET estado = 'ANULADA', motivo_anulacion = ?, fecha_anulacion = ?,
                          usuario_anulacion_id = ? WHERE id = ?`,
        [limpio, nowDateTime(), usuarioId ?? null, id]
      );
      // Si era una venta a credito, saca su cargo de la cuenta corriente del cliente.
      await revertirVenta(conn, id);
    });
    return ventaRepository.findById(id);
  },
};

async function aplicarResultadoCFE(ventaId, cfe) {
  if (!cfe) return;
  const sets = [];
  const params = [];
  const map = {
    cfeTipo: 'cfe_tipo', cfeSerie: 'cfe_serie', cfeNumero: 'cfe_numero',
    cfeEstado: 'cfe_estado', cfeUuid: 'cfe_uuid', cfeCae: 'cfe_cae',
    cfeQrUrl: 'cfe_qr_url', cfeHash: 'cfe_hash',
  };
  for (const [field, col] of Object.entries(map)) {
    if (cfe[field] !== undefined) { sets.push(`${col} = ?`); params.push(cfe[field]); }
  }
  if (!sets.length) return;
  await query(`UPDATE venta SET ${sets.join(', ')} WHERE id = ?`, [...params, ventaId]);
}
