// Envuelve un controlador async para que sus errores lleguen al middleware de errores.
export const asyncRoute = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
