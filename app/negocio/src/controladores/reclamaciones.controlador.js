// SIGET-VÍA — CAPA DE LÓGICA — Ruta HTTP — Libro de reclamaciones
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as servicio from '../servicios/reclamaciones.service.js';
import { sesionOpcional, soloRol } from '../seguridad/auth.middleware.js';

export function createReclamacionesRouter({ auth, activeUser, admin, asyncRoute }) {
  const router = Router();

  const limitadorRegistro = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false,
    message: { error: 'Demasiados intentos. Inténtalo más tarde.' }
  });
  const limitadorConsulta = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false,
    message: { error: 'Demasiadas consultas. Inténtalo más tarde.' }
  });

  // ----- Canal público (sin sesión) -----
  // Si el cliente tiene sesión, la reclamación se vincula a su cuenta.
  router.post('/publicas', limitadorRegistro, sesionOpcional, asyncRoute(async (req, res) =>
    res.status(201).json(await servicio.registrarPublica(req.body, req.currentUser))));

  router.post('/consulta', limitadorConsulta, asyncRoute(async (req, res) =>
    res.json(await servicio.consultarPublica(req.body))));

  // ----- Administración -----
  router.use(auth, activeUser, admin);
  const usuarioId = req => req.currentUser.UsuarioID;

  router.get('/catalogos', (req, res) => res.json(servicio.catalogos()));

  router.get('/resumen', asyncRoute(async (req, res) => res.json(await servicio.resumen())));

  router.get('/', asyncRoute(async (req, res) => res.json(await servicio.listar(req.query))));

  router.get('/:id', asyncRoute(async (req, res) => res.json(await servicio.detalle(req.params.id))));

  router.post('/', asyncRoute(async (req, res) =>
    res.status(201).json(await servicio.registrarAdministrativa(req.body, usuarioId(req)))));

  router.patch('/:id/estado', asyncRoute(async (req, res) =>
    res.json(await servicio.cambiarEstado(req.params.id, req.body, usuarioId(req)))));

  router.post('/:id/respuestas', asyncRoute(async (req, res) =>
    res.status(201).json(await servicio.registrarRespuesta(req.params.id, req.body, usuarioId(req)))));

  return router;
}

// /api/cliente/mis-reclamaciones — solo el cliente autenticado (CU012)
export function createMisReclamacionesRouter({ auth, activeUser, asyncRoute }) {
  const router = Router();
  router.use(auth, activeUser, soloRol('CLIENTE', 'Disponible únicamente para clientes.'));

  router.get('/', asyncRoute(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(await servicio.listarMisReclamaciones(req.currentUser.UsuarioID));
  }));

  router.get('/:id', asyncRoute(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(await servicio.detalleMiReclamacion(req.currentUser.UsuarioID, req.params.id));
  }));

  return router;
}
