// SIGET-VÍA — VISTA — SERVICIO API — Almacenamiento local de la sesión (JWT)
// El token se guarda en sessionStorage: se borra al cerrar la pestaña.
const CLAVE_TOKEN = 'siget-token';

export function leerToken(): string {
  return sessionStorage.getItem(CLAVE_TOKEN) || '';
}

export function guardarToken(token: string) {
  sessionStorage.setItem(CLAVE_TOKEN, token);
}

export function borrarToken() {
  sessionStorage.removeItem(CLAVE_TOKEN);
}

// Página a la que debe volver el cliente después de iniciar sesión
// (la guarda la selección pública de asientos antes de pedir el login).
const CLAVE_RETORNO = 'siget-cliente-retorno-reserva';

export function tomarRetorno(): string {
  try {
    const ruta = sessionStorage.getItem(CLAVE_RETORNO) || '';
    sessionStorage.removeItem(CLAVE_RETORNO);
    return ruta;
  } catch {
    return '';
  }
}