// SIGET-VÍA — CAPA DE LÓGICA — Ruta HTTP — Usuarios y roles (RF2)
import { Router } from 'express';
import * as servicio from '../servicios/usuarios.service.js';

export function createRolesRouter({ auth, activeUser, admin, asyncRoute }) {
  const router = Router();
  router.get('/', auth, activeUser, admin,
    asyncRoute(async (req, res) => res.json(await servicio.listarRoles())));
  return router;
}

export function createUsuariosRouter({ auth, activeUser, admin, asyncRoute }) {
  const router = Router();
  router.use(auth, activeUser, admin);

  router.get('/', asyncRoute(async (req, res) =>
    res.json(await servicio.listarUsuarios(req.query.q))));

  router.post('/', asyncRoute(async (req, res) =>
    res.status(201).json(await servicio.registrarUsuario(req.body, req.currentUser))));

  router.put('/:id', asyncRoute(async (req, res) =>
    res.json(await servicio.editarUsuario(req.params.id, req.body, req.currentUser))));

  router.patch('/:id/estado', asyncRoute(async (req, res) =>
    res.json(await servicio.cambiarEstadoUsuario(req.params.id, req.body, req.currentUser))));

  return router;
}
