// Adaptador de factura electronica de Uruguay (DGI/CFE).
//
// Hoy esta DESACTIVADO (config.cfe.enabled = false): cada venta se registra
// internamente y nace con cfe_estado = 'INTERNO'. Toda la informacion fiscal ya
// se guarda en la venta (columnas cfe_*), asi que activar la factura electronica
// es un cambio minimo:
//   1. Completar las credenciales en .env (CFE_ENABLED=true, CFE_PROVIDER, etc.).
//   2. Implementar el envio al proveedor dentro del switch de abajo.
// El resto del sistema (venta.service) ya llama a emitirCFE() y guarda el resultado.
import { config } from '../../config/env.js';

/**
 * Emite (o simula) el comprobante fiscal de una venta ya registrada.
 * @param {object} venta  Venta con sus renglones (id, total, cliente, etc.).
 * @returns {Promise<{cfeTipo?:string, cfeSerie?:string, cfeNumero?:number,
 *                     cfeEstado:string, cfeUuid?:string, cfeCae?:string,
 *                     cfeQrUrl?:string, cfeHash?:string}>}
 */
export async function emitirCFE(venta) {
  if (!config.cfe.enabled) {
    // Registro interno: sin comprobante electronico.
    return { cfeEstado: 'INTERNO' };
  }

  // Consumidor final sin RUT -> e-Ticket; con RUT -> e-Factura.
  const cfeTipo = venta.consumidorFinal || !venta.clienteId ? 'E_TICKET' : 'E_FACTURA';

  switch (config.cfe.provider) {
    // case 'mi-proveedor': {
    //   const resp = await fetch(config.cfe.apiUrl, { ... });
    //   const data = await resp.json();
    //   return { cfeTipo, cfeSerie: data.serie, cfeNumero: data.numero,
    //            cfeEstado: 'AUTORIZADO', cfeUuid: data.uuid, cfeCae: data.cae,
    //            cfeQrUrl: data.qr, cfeHash: data.hash };
    // }
    default:
      // CFE habilitado pero sin proveedor implementado: queda pendiente de envio
      // para no bloquear la venta (se puede reintentar luego).
      return { cfeTipo, cfeEstado: 'PENDIENTE' };
  }
}
