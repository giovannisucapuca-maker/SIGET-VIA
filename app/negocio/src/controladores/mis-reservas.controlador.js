// SIGET-VÍA — CAPA DE LÓGICA — Ruta HTTP — Mis reservas del cliente (PASO 174)
import { Router } from 'express';
import { listarMisReservas, obtenerMiReserva } from '../servicios/mis-reservas.service.js';
import { soloRol } from '../seguridad/auth.middleware.js';

export function createMisReservasRouter({ auth, activeUser, asyncRoute }) {
  const router = Router();
  router.use(auth, activeUser, soloRol('CLIENTE', 'Disponible únicamente para clientes.'));

  router.get('/', asyncRoute(async (req, res) => {
    const datos = await listarMisReservas(req.currentUser.UsuarioID);
    res.set('Cache-Control', 'no-store');
    res.json(datos);
  }));

  router.get('/:id', asyncRoute(async (req, res) => {
    const datos = await obtenerMiReserva(req.currentUser.UsuarioID, req.params.id);
    res.set('Cache-Control', 'no-store');
    res.json(datos);
  }));

  return router;
}
