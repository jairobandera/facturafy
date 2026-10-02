// Agrega todas las rutas de los modulos bajo la base de la API.
import { Router } from './core/router.js';

import { seguridadRoutes } from './modules/seguridad/seguridad.routes.js';
import { usuarioRoutes } from './modules/usuario/usuario.routes.js';
import { empresaRoutes } from './modules/empresa/empresa.module.js';
import { sucursalRoutes } from './modules/sucursal/sucursal.module.js';
import { categoriaRoutes } from './modules/categoria/categoria.module.js';
import { proveedorRoutes } from './modules/proveedor/proveedor.module.js';
import { productoRoutes } from './modules/producto/producto.routes.js';
import { loteRoutes } from './modules/lote/lote.module.js';
import { conteoRoutes } from './modules/conteo/conteo.module.js';
import { conteoProductoRoutes } from './modules/conteoProducto/conteoProducto.module.js';
import { conteoUsuarioRoutes } from './modules/conteoUsuario/conteoUsuario.module.js';
import { sucursalProveedorRoutes } from './modules/sucursalProveedor/sucursalProveedor.module.js';
import { reporteRoutes } from './modules/reporte/reporte.module.js';
import { estadisticaRoutes } from './modules/estadistica/estadistica.module.js';

export function buildApiRouter() {
  const api = new Router();
  api.use('/seguridad', seguridadRoutes);
  api.use('/usuarios', usuarioRoutes);
  api.use('/empresas', empresaRoutes);
  api.use('/sucursales', sucursalRoutes);
  api.use('/categorias', categoriaRoutes);
  api.use('/proveedores', proveedorRoutes);
  api.use('/productos', productoRoutes);
  api.use('/lotes', loteRoutes);
  api.use('/conteos', conteoRoutes);
  api.use('/conteoproducto', conteoProductoRoutes);
  api.use('/conteo-usuarios', conteoUsuarioRoutes);
  api.use('/sucursal-proveedor', sucursalProveedorRoutes);
  api.use('/reportes', reporteRoutes);
  api.use('/estadisticas', estadisticaRoutes);
  return api;
}
