// SIGET-VÍA — CAPA DE LÓGICA — API
// Traduce errores de negocio y de datos a respuestas HTTP.
import { ZodError } from 'zod';

export function rutaNoEncontrada(req, res) {
  res.status(404).json({ error: 'Ruta no encontrada' });
}

// eslint-disable-next-line no-unused-vars
export function manejadorErrores(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Datos inválidos', details: err.issues });
  }

  // Errores de negocio: errorHttp() o cualquier error con código 4xx.
  if (Number.isInteger(err.statusCode) &&
      ((err.statusCode >= 400 && err.statusCode < 500) || err.esNegocio)) {
    const cuerpo = { error: err.message };
    if (err.details !== undefined) cuerpo.details = err.details;
    return res.status(err.statusCode).json(cuerpo);
  }

  // Códigos de SQL Server: 2627/2601 clave única, 547 clave foránea.
  const numero = err.number ?? err.originalError?.info?.number;
  if (numero === 2627 || numero === 2601) {
    return res.status(409).json({ error: 'Ya existe un registro con esos datos únicos' });
  }
  if (numero === 547) {
    return res.status(400).json({ error: 'La operación incumple una relación de la base de datos' });
  }

  console.error('Error del servidor:', err);
  return res.status(500).json({ error: 'Error interno del servidor' });
}
