// SIGET-VÍA — CAPA DE LÓGICA — Ruta HTTP — Manifiestos (ADMINISTRADOR y OPERADOR)
import { Router } from 'express';
import * as servicio from '../servicios/manifiestos.service.js';

export function createManifiestosRouter({ auth, activeUser, asyncRoute }) {
  const router = Router();

  router.use(auth, activeUser, (req, res, next) => {
    if (!servicio.puedeConsultarManifiestos(req.currentUser)) {
      return res.status(403).json({ error: 'No tienes permisos para consultar manifiestos.' });
    }
    next();
  });

  router.get('/viajes', asyncRoute(async (req, res) =>
    res.json(await servicio.listarViajes(req.query))));

  router.get('/:id', asyncRoute(async (req, res) =>
    res.json(await servicio.obtenerManifiesto(req.params.id))));

  return router;
}
