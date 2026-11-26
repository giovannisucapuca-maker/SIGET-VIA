// SIGET-VÍA — CAPA DE LÓGICA — Ruta HTTP — Reportes administrativos (RF14)
import { Router } from 'express';
import * as servicio from '../servicios/reportes.service.js';

export function createReportesRouter({ auth, activeUser, admin, asyncRoute }) {
  const router = Router();
  router.use(auth, activeUser, admin);
  router.get('/catalogos', (req, res) => res.json(servicio.obtenerCatalogosReportes()));
  router.get('/resumen', asyncRoute(async (req, res) => res.json(await servicio.resumen(req.query))));
  router.get('/dashboard-extra', asyncRoute(async (req, res) => res.json(await servicio.dashboardExtra())));
  router.get('/:tipo', asyncRoute(async (req, res) =>
    res.json(await servicio.reportePorTipo(req.params.tipo, req.query))));
  return router;
}
