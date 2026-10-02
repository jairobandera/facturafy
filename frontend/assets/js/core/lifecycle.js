// Gestiona funciones de limpieza que se ejecutan al abandonar una pagina
// (por ejemplo, desuscribir WebSockets o detener timers de polling).
let cleanups = [];

export function onCleanup(fn) { cleanups.push(fn); }

export function runCleanups() {
  for (const fn of cleanups) { try { fn(); } catch (e) { console.error(e); } }
  cleanups = [];
  cerrarDialogosHuerfanos();
}

// Si se navega mientras un dialogo de SweetAlert se esta cerrando, su contenedor
// puede quedar en el DOM tapando toda la pagina y bloqueando los clics.
function cerrarDialogosHuerfanos() {
  try { window.Swal?.close(); } catch { /* ignore */ }
  document.querySelectorAll('.swal2-container').forEach((el) => el.remove());
  document.body.classList.remove('swal2-shown', 'swal2-height-auto');
}
