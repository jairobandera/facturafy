// Configuracion de la aplicacion. Deriva las URLs del origen actual,
// ya que el backend Node sirve el frontend en el mismo host/puerto.
const origin = window.location.origin;

export const config = {
  apiBase: `${origin}/Stockify/api/v1`,
  wsUrl: `${origin.replace(/^http/, 'ws')}/ws`,
};
