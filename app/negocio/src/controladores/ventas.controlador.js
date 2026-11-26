// SIGET-VÍA — CAPA DE LÓGICA — Ruta HTTP — Ventas (RF5, administrador y personal de ventas)
import { Router } from 'express';
import * as servicio from '../servicios/ventas.service.js';

export function createVentasRouter({ auth, activeUser, personalVentas, asyncRoute }) {
  const router = Router();
  router.use(auth, activeUser, personalVentas);

  router.get('/catalogos', asyncRoute(async (req, res) => res.json(await servicio.catalogos())));

  router.get('/', asyncRoute(async (req, res) => res.json(await servicio.listar(req.query.q))));

  router.get('/:id', asyncRoute(async (req, res) => res.json(await servicio.detalle(req.params.id))));

  router.post('/', asyncRoute(async (req, res) =>
    res.status(201).json(await servicio.registrarVenta(req.body, req.currentUser.UsuarioID))));

  router.patch('/:id/anular', asyncRoute(async (req, res) =>
    res.json(await servicio.anularVenta(req.params.id, req.currentUser.UsuarioID))));

  return router;
}
