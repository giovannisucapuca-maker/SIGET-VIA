// SIGET-VÍA — CAPA DE LÓGICA — Ruta HTTP — Terminales terrestres (administrador)
import { Router } from 'express';
import * as servicio from '../servicios/terminales.service.js';

export function createTerminalesRouter({ auth, activeUser, admin, asyncRoute }) {
  const router = Router();
  router.use(auth, activeUser, admin);

  router.get('/', asyncRoute(async (req, res) => res.json(await servicio.listar(req.query.q))));
  router.get('/:id', asyncRoute(async (req, res) => res.json(await servicio.detalle(req.params.id))));
  router.post('/', asyncRoute(async (req, res) => res.status(201).json(await servicio.crear(req.body))));
  router.put('/:id', asyncRoute(async (req, res) => res.json(await servicio.editar(req.params.id, req.body))));
  router.patch('/:id/estado', asyncRoute(async (req, res) =>
    res.json(await servicio.cambiarEstado(req.params.id, req.body))));

  return router;
}
