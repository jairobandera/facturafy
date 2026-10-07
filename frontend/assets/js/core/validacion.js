// Validadores de documentos uruguayos (cedula de identidad y RUT/RUC de DGI).
// Se usan al dar de alta un cliente: el dato (RUT o CI) va a la columna `rut` de
// cliente y el tipo queda en `tipo_documento`. La validacion solo corre si el
// usuario cargo un documento (es opcional).

/** Quita todo lo que no sea digito. */
function soloDigitos(valor) {
  return String(valor ?? '').replace(/\D/g, '');
}

/**
 * Cedula de identidad uruguaya. 7 u 8 digitos, el ultimo es verificador.
 * Algoritmo clasico con pesos "2987634" sobre los primeros 7 digitos.
 */
export function validarCedulaUy(ci) {
  let limpio = soloDigitos(ci);
  if (limpio.length < 7 || limpio.length > 8) return false;
  limpio = limpio.padStart(8, '0');
  const cuerpo = limpio.slice(0, 7);
  const verificador = Number(limpio[7]);
  const pesos = '2987634';
  let suma = 0;
  for (let i = 0; i < 7; i++) suma += (Number(pesos[i]) * Number(cuerpo[i])) % 10;
  const dv = suma % 10 === 0 ? 0 : 10 - (suma % 10);
  return dv === verificador;
}

/**
 * RUT (RUC) uruguayo de DGI. 12 digitos, el ultimo es verificador (modulo 11
 * con pesos 4,3,2,9,8,7,6,5,4,3,2 sobre los primeros 11).
 */
export function validarRutUy(rut) {
  const limpio = soloDigitos(rut);
  if (limpio.length !== 12) return false;
  const pesos = [4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let suma = 0;
  for (let i = 0; i < 11; i++) suma += Number(limpio[i]) * pesos[i];
  let dv = 11 - (suma % 11);
  if (dv === 11) dv = 0;
  if (dv === 10) return false; // combinacion invalida
  return dv === Number(limpio[11]);
}

/**
 * Valida un documento segun su tipo. Devuelve null si es valido (o esta vacio,
 * porque el documento es opcional) o un mensaje de error si no lo es.
 */
export function validarDocumento(tipo, valor) {
  const limpio = soloDigitos(valor);
  if (!limpio) return null; // opcional
  if (tipo === 'CI') return validarCedulaUy(limpio) ? null : 'La cédula no es válida (dígito verificador incorrecto).';
  if (tipo === 'RUT') return validarRutUy(limpio) ? null : 'El RUT no es válido (debe tener 12 dígitos y dígito verificador correcto).';
  return null;
}
