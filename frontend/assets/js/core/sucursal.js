// Configuracion de la sucursal del usuario logueado (que apartados tiene habilitados).
// El dato no viaja en el JWT a proposito: si viniera en el token, un cambio del
// superadmin recien se veria al re-loguear. Aca se refresca en cada carga de la app.
import { api } from './api.js';
import { auth } from './auth.js';

const CACHE_KEY = 'stockify_sucursal';
const ACTIVA_KEY = 'stockify_sucursal_activa';

let actual = null;
let hermanas = null; // sucursales de la misma empresa

function leerCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function guardarCache(sucursal) {
  try {
    if (sucursal) localStorage.setItem(CACHE_KEY, JSON.stringify(sucursal));
    else localStorage.removeItem(CACHE_KEY);
  } catch { /* modo privado: se sigue con la copia en memoria */ }
}

/** Trae la sucursal del usuario y la cachea. Se llama al arrancar y al loguearse. */
export async function cargarSucursal() {
  const sucursalId = auth.getSucursalId();
  if (!sucursalId) { limpiarSucursal(); return null; }
  hermanas = null;
  try {
    actual = await api.get(`/sucursales/${sucursalId}`);
  } catch {
    // Sin conexion o sucursal inaccesible: se conserva lo ultimo conocido.
    actual = leerCache();
  }
  guardarCache(actual);
  return actual;
}

export function limpiarSucursal() {
  actual = null;
  hermanas = null;
  guardarCache(null);
  try { sessionStorage.removeItem(ACTIVA_KEY); } catch { /* ignore */ }
}

/**
 * Sucursales activas de la empresa del usuario. El admin puede iniciar conteos en
 * cualquiera de ellas; fuera de su empresa, no.
 */
export async function sucursalesDeMiEmpresa() {
  if (hermanas) return hermanas;
  const s = sucursalActual();
  if (!s?.empresaId) return s ? [s] : [];
  try {
    hermanas = await api.get(`/sucursales/empresa/${s.empresaId}`);
  } catch {
    hermanas = [s]; // sin conexion, al menos la propia
  }
  return hermanas;
}

/**
 * Sucursal que el admin esta mirando. Arranca en la suya y vive en sessionStorage:
 * es una vista, no un cambio de identidad (el token y resolveUsuarioId() siguen
 * apuntando a su sucursal real).
 */
export function sucursalActiva() {
  try {
    const guardada = sessionStorage.getItem(ACTIVA_KEY);
    if (guardada) return Number(guardada);
  } catch { /* ignore */ }
  return auth.getSucursalId();
}

export function setSucursalActiva(sucursalId) {
  try {
    if (sucursalId) sessionStorage.setItem(ACTIVA_KEY, String(sucursalId));
    else sessionStorage.removeItem(ACTIVA_KEY);
  } catch { /* ignore */ }
}

/** ¿La sucursal activa es la propia del usuario? */
export function esMiSucursal(sucursalId) {
  return Number(sucursalId) === Number(auth.getSucursalId());
}

/** Nombre para mostrar de una sucursal de mi empresa (si ya fue cargada). */
export function nombreSucursal(sucursalId) {
  const encontrada = (hermanas || []).find((s) => Number(s.id) === Number(sucursalId));
  if (encontrada) return encontrada.nombre;
  const s = sucursalActual();
  return s && Number(s.id) === Number(sucursalId) ? s.nombre : `Sucursal #${sucursalId}`;
}

export function sucursalActual() {
  if (!actual) actual = leerCache();
  return actual;
}

/**
 * ¿La sucursal tiene habilitado el apartado de Lotes?
 * Ante la duda (todavia sin cargar) devuelve true: el backend igual lo rechaza,
 * asi que nunca es un permiso de mas, solo evita esconder el menu de golpe.
 */
export function usaLotes() {
  const s = sucursalActual();
  return s ? s.usaLotes !== false : true;
}

/**
 * Paquetes contratados por la sucursal (los configura el superadmin).
 * usaStock: ante la duda devuelve true (como usaLotes); el backend igual rechaza
 * lo que no corresponda. usaFacturacion: por defecto false (no mostrar de mas).
 */
export function usaStock() {
  const s = sucursalActual();
  return s ? s.usaStock !== false : true;
}

export function usaFacturacion() {
  const s = sucursalActual();
  return s ? s.usaFacturacion === true : false;
}
