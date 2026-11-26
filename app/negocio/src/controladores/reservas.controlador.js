// SIGET-VÍA — CAPA DE LÓGICA — Ruta HTTP — Reservas (RF4, RF10, RF18)
import { Router } from 'express';
import * as servicio from '../servicios/reservas.service.js';

export function createReservasRouter({ auth, activeUser, personalVentas, asyncRoute }) {
  const router = Router();
  router.use(auth, activeUser);

  // Usuarios autenticados.
  router.get('/politicas-vigentes', asyncRoute(async (req, res) =>
    res.json(await servicio.politicasVigentes())));

  // Clientes, personal de ventas y administradores (regla validada en negocio).
  router.post('/', asyncRoute(async (req, res) =>
    res.status(201).json(await servicio.crearReserva(req.body, req.currentUser))));

  // Resto: administrador y personal de ventas (CU010, CU018).
  router.use(personalVentas);

  router.get('/catalogos', asyncRoute(async (req, res) => res.json(await servicio.catalogos())));

  router.get('/asientos/:viajeId', asyncRoute(async (req, res) =>
    res.json(await servicio.asientosDeViaje(req.params.viajeId))));

  router.get('/', asyncRoute(async (req, res) => res.json(await servicio.listar(req.query.q))));

  router.get('/:id/historial', asyncRoute(async (req, res) =>
    res.status(200).json(await servicio.historial(req.params.id))));

  router.get('/:id', asyncRoute(async (req, res) => res.json(await servicio.detalle(req.params.id))));

  router.patch('/:id/cancelar', asyncRoute(async (req, res) =>
    res.json(await servicio.cancelar(req.params.id, req.currentUser))));

  router.put('/:id', asyncRoute(async (req, res) =>
    res.json(await servicio.editar(req.params.id, req.body))));

  router.patch('/:id/reprogramar', asyncRoute(async (req, res) =>
    res.json(await servicio.reprogramar(req.params.id, req.body, req.currentUser))));

  return router;
}
