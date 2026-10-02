// Punto de entrada de la SPA: registra rutas y arranca el router.
import { router } from './core/router.js';
import { auth } from './core/auth.js';
import { runCleanups } from './core/lifecycle.js';
import { cargarSucursal, usaLotes } from './core/sucursal.js';
import { ui } from './core/ui.js';

import { loginPage } from './pages/login.js';
// Superadmin
import { superadminDashboard } from './pages/superadmin/dashboard.js';
import { verEmpresas, crearEmpresa, editarEmpresa } from './pages/superadmin/empresas.js';
import { verSucursales, agregarSucursal, editarSucursal } from './pages/superadmin/sucursales.js';
import { verUsuarios, crearUsuario, editarUsuario } from './pages/superadmin/usuarios.js';
// Admin
import { adminDashboard } from './pages/admin/dashboard.js';
import { gestionarCategorias } from './pages/admin/categorias.js';
import { gestionarProductos } from './pages/admin/productos.js';
import { gestionarPlantillas } from './pages/admin/plantillas.js';
import { gestionarLotes } from './pages/admin/lotes.js';
import { gestionarProveedores } from './pages/admin/proveedores.js';
import { gestionarEmpleados } from './pages/admin/empleados.js';
import { gestionarConteos } from './pages/admin/conteos.js';
import { conteosFinalizados } from './pages/admin/conteosFinalizados.js';
import { unirseConteoLibre, unirseConteoCategorias } from './pages/admin/unirseConteo.js';
import { reporteConteo } from './pages/admin/reporteConteo.js';
import { estadisticas } from './pages/admin/estadisticas.js';
// Empleado
import { empleadoDashboard } from './pages/empleado/dashboard.js';
import { conteoLibreEmpleado, conteoCategoriasEmpleado } from './pages/empleado/conteos.js';

const SA = 'SUPERADMINISTRADOR', AD = 'ADMINISTRADOR', EM = 'EMPLEADO';

// Envuelve cada handler para ejecutar limpiezas de la pagina anterior
// y capturar errores no controlados.
function page(handler) {
  return (ctx) => {
    runCleanups();
    Promise.resolve()
      .then(() => handler(ctx))
      .catch((err) => {
        console.error(err);
        ui.error(err.message || 'Ocurrió un error inesperado.');
      });
  };
}

router.add('/login', page(loginPage));

// ---- Superadmin ----
router.add('/superadmin/dashboard', page(superadminDashboard), { role: SA });
router.add('/superadmin/ver-empresas', page(verEmpresas), { role: SA });
router.add('/superadmin/crear-empresa', page(crearEmpresa), { role: SA });
router.add('/superadmin/editar-empresa/:id', page(editarEmpresa), { role: SA });
router.add('/superadmin/ver-sucursales', page(verSucursales), { role: SA });
router.add('/superadmin/agregar-sucursal', page(agregarSucursal), { role: SA });
router.add('/superadmin/editar-sucursal/:id', page(editarSucursal), { role: SA });
router.add('/superadmin/ver-usuarios', page(verUsuarios), { role: SA });
router.add('/superadmin/crear-usuario', page(crearUsuario), { role: SA });
router.add('/superadmin/editar-usuario/:id', page(editarUsuario), { role: SA });

// ---- Admin ----
router.add('/admin/dashboard', page(adminDashboard), { role: AD });
router.add('/admin/gestionar-categorias', page(gestionarCategorias), { role: AD });
router.add('/admin/gestionar-productos', page(gestionarProductos), { role: AD });
router.add('/admin/plantillas', page(gestionarPlantillas), { role: AD });
// El apartado de Lotes se habilita por sucursal desde el panel de superadmin.
router.add('/admin/gestionar-lotes', page(gestionarLotes), { role: AD, requiere: usaLotes });
router.add('/admin/gestionar-proveedores', page(gestionarProveedores), { role: AD });
router.add('/admin/gestionar-empleados', page(gestionarEmpleados), { role: AD });
router.add('/admin/gestionar-conteos', page(gestionarConteos), { role: AD });
router.add('/admin/conteos-finalizados', page(conteosFinalizados), { role: AD });
router.add('/admin/gestionar-conteos/unirse-conteo-libre/:id', page(unirseConteoLibre), { role: AD });
router.add('/admin/gestionar-conteos/unirse-conteo-categorias/:id', page(unirseConteoCategorias), { role: AD });
router.add('/admin/reporte-conteo/:id', page(reporteConteo), { role: AD });
router.add('/admin/estadisticas', page(estadisticas), { role: AD });

// ---- Empleado ----
router.add('/empleado/dashboard', page(empleadoDashboard), { role: EM });
router.add('/empleado/conteo-libre/:id', page(conteoLibreEmpleado), { role: EM });
router.add('/empleado/conteo-categorias/:id', page(conteoCategoriasEmpleado), { role: EM });

// ---- Raiz / no encontrado ----
router.add('/', () => {
  if (auth.isAuthenticated() && !auth.isExpired()) router.navigate(auth.homeRoute().replace('#', ''));
  else router.navigate('/login');
});
router.setNotFound(() => {
  if (auth.isAuthenticated() && !auth.isExpired()) router.navigate(auth.homeRoute().replace('#', ''));
  else router.navigate('/login');
});

// La config de la sucursal define que apartados opcionales estan habilitados
// (hoy, Lotes), asi que se carga antes de resolver la primera ruta.
if (auth.isAuthenticated() && !auth.isExpired()) cargarSucursal().finally(() => router.start());
else router.start();
