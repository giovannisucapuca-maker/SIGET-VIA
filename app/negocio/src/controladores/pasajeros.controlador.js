import { Router } from 'express';
import {
  consultarPorDni, consultarPorDocumento, listarPasajeros,
  obtenerPasajero, registrarPasajero, actualizarPasajero,
  cambiarEstadoPasajero
} from '../servicios/pasajeros.service.js';

function responderError(res, error) {
  const numero = error?.number ?? error?.originalError?.info?.number;
  if (numero === 2601 || numero === 2627) {
    return res.status(409).json({ error: 'Ya existe un pasajero con este tipo y número de documento.' });
  }
  if (numero === 547) {
    return res.status(409).json({ error: 'La operación incumple una restricción de SQL Server.' });
  }
  if (Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode < 600) {
    return res.status(error.statusCode).json({ error: error.message });
  }
  throw error;
}

export function createPasajerosRouter({ auth, activeUser, admin, personalVentas, asyncRoute }) {
  const router = Router();
  router.use(auth, activeUser);

  // Búsqueda por documento: también la usa el personal de ventas al reservar.

  router.get('/dni/:dni', personalVentas, asyncRoute(async (req, res) => {
    try { return res.json(await consultarPorDni(req.params.dni)); }
    catch (error) { return responderError(res, error); }
  }));

  router.get('/documento/:tipo/:numero', personalVentas, asyncRoute(async (req, res) => {
    try { return res.json(await consultarPorDocumento(req.params.tipo, req.params.numero)); }
    catch (error) { return responderError(res, error); }
  }));

  // Resto del módulo: solo administrador (CU015).
  router.use(admin);

  router.get('/', asyncRoute(async (req, res) => {
    try { return res.json(await listarPasajeros(req.query.q)); }
    catch (error) { return responderError(res, error); }
  }));

  router.get('/:id', asyncRoute(async (req, res) => {
    try { return res.json(await obtenerPasajero(req.params.id)); }
    catch (error) { return responderError(res, error); }
  }));

  router.post('/', asyncRoute(async (req, res) => {
    try { return res.status(201).json(await registrarPasajero(req.body)); }
    catch (error) { return responderError(res, error); }
  }));

  router.put('/:id', asyncRoute(async (req, res) => {
    try { return res.json(await actualizarPasajero(req.params.id, req.body)); }
    catch (error) { return responderError(res, error); }
  }));

  router.patch('/:id/estado', asyncRoute(async (req, res) => {
    try { return res.json(await cambiarEstadoPasajero(req.params.id, req.body)); }
    catch (error) { return responderError(res, error); }
  }));

  return router;
}
