// SIGET-VÍA — CAPA DE LÓGICA — Ruta HTTP — Pagos (consulta administrativa)
import { Router } from 'express';
import * as servicio from '../servicios/pagos.service.js';

export function createPagosRouter({ auth, activeUser, personalVentas, asyncRoute }) {
  const router = Router();
  router.use(auth, activeUser, personalVentas);
  router.get('/resumen', asyncRoute(async (req, res) => res.json(await servicio.resumen())));
  router.get('/', asyncRoute(async (req, res) => res.json(await servicio.listar(req.query))));
  router.get('/:id', asyncRoute(async (req, res) => res.json(await servicio.detalle(req.params.id))));
  // Sin POST/PUT/PATCH/DELETE: las altas y anulaciones se hacen desde Ventas.
  return router;
}
