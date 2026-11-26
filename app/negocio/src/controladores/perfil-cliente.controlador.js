// SIGET-VÍA — CAPA DE LÓGICA — Ruta HTTP — Perfil del cliente (/api/cliente/perfil)
import express, { Router } from 'express';
import * as servicio from '../servicios/perfil-cliente.service.js';
import { soloRol } from '../seguridad/auth.middleware.js';

export function createPerfilClienteRouter({ auth, activeUser, asyncRoute }) {
  const router = Router();
  router.use(auth, activeUser, soloRol('CLIENTE', 'Acceso exclusivo para clientes.'));
  const id = req => req.currentUser.UsuarioID;

  router.get('/', asyncRoute(async (req, res) => res.json(await servicio.obtenerPerfil(id(req)))));

  router.put('/', asyncRoute(async (req, res) =>
    res.json(await servicio.actualizarPerfil(id(req), req.body))));

  router.get('/foto', asyncRoute(async (req, res) => {
    const foto = await servicio.obtenerFoto(id(req));
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'no-store');
    return res.send(foto);
  }));

  router.post('/foto',
    express.raw({ type: 'image/jpeg', limit: '1mb' }),
    asyncRoute(async (req, res) => res.json(await servicio.guardarFoto(id(req), req.body))));

  router.delete('/foto', asyncRoute(async (req, res) =>
    res.json(await servicio.eliminarFoto(id(req)))));

  return router;
}
