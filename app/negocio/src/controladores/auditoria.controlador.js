// SIGET-VÍA — CAPA DE LÓGICA — Ruta HTTP — Auditoría (solo lectura, administrador)
import { Router } from 'express';
import * as servicio from '../servicios/auditoria.service.js';

export function createAuditoriaRouter({ auth, activeUser, admin, asyncRoute }) {
  const router = Router();
  router.use(auth, activeUser, admin);
  router.get('/catalogos', asyncRoute(async (req, res) => res.json(await servicio.catalogos())));
  router.get('/resumen', asyncRoute(async (req, res) => res.json(await servicio.resumen())));
  router.get('/', asyncRoute(async (req, res) => res.json(await servicio.listar(req.query))));
  router.get('/:id', asyncRoute(async (req, res) => res.json(await servicio.detalle(req.params.id))));
  return router;
}
