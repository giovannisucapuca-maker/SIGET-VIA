import { Router } from 'express';
import {
  listarConductores,
  obtenerConductor,
  registrarConductor,
  actualizarConductor,
  cambiarEstadoConductor
} from '../servicios/conductores.service.js';

function responderError(res, error) {
  if (Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode < 500) {
    return res.status(error.statusCode).json({ error: error.message });
  }
  throw error;
}

// Mantiene las mismas rutas y middlewares que el módulo original.
export function createConductoresRouter({ auth, activeUser, admin, asyncRoute }) {
  const router = Router();
  router.use(auth, activeUser, admin);

  router.get('/', asyncRoute(async (req, res) => {
    return res.json(await listarConductores(req.query.q));
  }));

  router.get('/:id', asyncRoute(async (req, res) => {
    try { return res.json(await obtenerConductor(req.params.id)); }
    catch (error) { return responderError(res, error); }
  }));

  router.post('/', asyncRoute(async (req, res) => {
    try { return res.status(201).json(await registrarConductor(req.body)); }
    catch (error) { return responderError(res, error); }
  }));

  router.put('/:id', asyncRoute(async (req, res) => {
    try { return res.json(await actualizarConductor(req.params.id, req.body)); }
    catch (error) { return responderError(res, error); }
  }));

  router.patch('/:id/estado', asyncRoute(async (req, res) => {
    try { return res.json(await cambiarEstadoConductor(req.params.id, req.body)); }
    catch (error) { return responderError(res, error); }
  }));
  return router;
}
