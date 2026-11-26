// SIGET-VÍA / RF8 — Enrutamiento HTTP; no contiene consultas SQL.
import { Router } from 'express';
import * as buses from '../servicios/buses.service.js';

function responderError(res, error) {
  const numero = error?.number ?? error?.originalError?.info?.number;
  if (numero === 2601 || numero === 2627) {
    return res.status(409).json({ error: 'La placa ya está registrada' });
  }
  if (Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode < 600) {
    return res.status(error.statusCode).json({ error: error.message });
  }
  throw error;
}
export function createBusesRouter({ auth, activeUser, admin, asyncRoute }) {
  const router = Router();
  router.use(auth, activeUser, admin);
  const ejecutar = (fn) => asyncRoute(async (req, res) => {
    try { return await fn(req, res); }
    catch (e) { return responderError(res, e); }
  });
  // Importante: /tipos-servicio y /:id/asientos van antes de /:id.
  router.get('/tipos-servicio', ejecutar(async (_req, res) => res.json(await buses.listarTiposServicio())));
  router.get('/', ejecutar(async (req, res) => res.json(await buses.listarBuses(req.query.q))));
  router.get('/:id/asientos', ejecutar(async (req, res) => res.json(await buses.obtenerAsientosBus(req.params.id))));
  router.get('/:id', ejecutar(async (req, res) => res.json(await buses.obtenerBus(req.params.id))));
  router.post('/', ejecutar(async (req, res) => res.status(201).json(await buses.registrarBus(req.body))));
  router.put('/:id', ejecutar(async (req, res) => res.json(await buses.actualizarBus(req.params.id, req.body))));
  router.patch('/:id/estado', ejecutar(async (req, res) => res.json(await buses.cambiarEstadoBus(req.params.id, req.body))));
  return router;
}
