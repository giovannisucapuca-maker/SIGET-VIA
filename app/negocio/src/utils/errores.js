// SIGET-VÍA — CAPA DE LÓGICA
// Error de negocio con código HTTP. La capa de presentación lo
// convierte en respuesta JSON (ver middlewares/errores.middleware.js).
export function errorHttp(mensaje, statusCode = 400, extra = {}) {
  return Object.assign(new Error(mensaje), { statusCode, esNegocio: true, ...extra });
}
