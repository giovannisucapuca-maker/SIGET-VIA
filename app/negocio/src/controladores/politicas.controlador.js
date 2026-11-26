// SIGET-VÍA — CAPA DE LÓGICA — Ruta HTTP — Políticas del servicio (RF17)
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as servicio from '../servicios/politicas.service.js';

export function createPoliticasRouter({ auth, activeUser, admin, asyncRoute }) {
  const router = Router();
  router.use(auth, activeUser);

  router.get('/catalogos', (req, res) => res.json(servicio.catalogos()));

  // Cualquier usuario autenticado (no registra aceptaciones).
  router.get('/vigentes', asyncRoute(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    return res.json(await servicio.listarVigentes());
  }));

  router.use(admin);

  router.get('/', asyncRoute(async (req, res) => res.json(await servicio.listar(req.query.q))));

  router.post('/', asyncRoute(async (req, res) =>
    res.status(201).json(await servicio.registrar(req.body, req.currentUser.UsuarioID))));

  router.put('/:id', asyncRoute(async (req, res) =>
    res.json(await servicio.editar(req.params.id, req.body, req.currentUser.UsuarioID))));

  router.patch('/:id/estado', asyncRoute(async (req, res) =>
    res.json(await servicio.cambiarEstado(req.params.id, req.body, req.currentUser.UsuarioID))));

  return router;
}

// /api/publico/condiciones — condiciones y políticas vigentes, sin iniciar sesión (CU017).
export function createCondicionesPublicasRouter({ asyncRoute }) {
  const router = Router();
  router.use(rateLimit({ windowMs: 60 * 1000, limit: 40, standardHeaders: 'draft-7', legacyHeaders: false }));
  router.get('/', asyncRoute(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(await servicio.listarVigentes());
  }));
  return router;
}
