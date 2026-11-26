import { Router } from 'express';
import {
  listarRutas, detalleRuta, crearRuta, editarRuta, cambiarEstadoRuta
} from '../servicios/rutas.service.js';

function enviarError(res, error) {
  // Errores de negocio: conservar códigos 400, 404 y 409.
  if (Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode < 500) {
    return res.status(error.statusCode).json({ error: error.message });
  }
  throw error;
}
export function createRutasRouter({ auth, activeUser, admin, asyncRoute }) {
  const router = Router();
  router.use(auth, activeUser, admin);
  router.get('/', asyncRoute(async (req, res) => {
    return res.json(await listarRutas(req.query.q));
  }));
  router.get('/:id', asyncRoute(async (req, res) => {
    try { return res.json(await detalleRuta(req.params.id)); }
    catch (error) { return enviarError(res, error); }
  }));
  router.post('/', asyncRoute(async (req, res) => {
    try { return res.status(201).json(await crearRuta(req.body)); }
    catch (error) { return enviarError(res, error); }
  }));
  router.put('/:id', asyncRoute(async (req, res) => {
    try { return res.json(await editarRuta(req.params.id, req.body)); }
    catch (error) { return enviarError(res, error); }
  }));
  router.patch('/:id/estado', asyncRoute(async (req, res) => {
    try { return res.json(await cambiarEstadoRuta(req.params.id, req.body)); }
    catch (error) { return enviarError(res, error); }
  }));
  return router;
}
