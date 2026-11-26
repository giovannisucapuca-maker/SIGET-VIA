// SIGET-VÍA — CAPA DE LÓGICA — Ruta HTTP — Autenticación (RF1)
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { iniciarSesion } from '../servicios/auth.service.js';

export function createAuthRouter({ auth, activeUser, asyncRoute }) {
  const router = Router();

  router.post('/login',
    rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false }),
    asyncRoute(async (req, res) => res.json(await iniciarSesion(req.body))));

  router.get('/me', auth, activeUser, (req, res) => {
    res.json({ usuario: req.currentUser });
  });

  return router;
}
