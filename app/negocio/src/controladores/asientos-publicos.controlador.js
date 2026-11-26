// SIGET-VÍA — CAPA DE LÓGICA — Ruta HTTP — Asientos públicos
// GET /api/publico/asientos/:viajeId (sin sesión)
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { consultarAsientosPublicos } from '../servicios/asientos-publicos.service.js';
import { asyncRoute } from '../middlewares/async-route.js';

const router = Router();

router.use(rateLimit({ windowMs: 60 * 1000, limit: 40, standardHeaders: 'draft-7', legacyHeaders: false }));

router.get('/:viajeId', asyncRoute(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  return res.json(await consultarAsientosPublicos(req.params.viajeId));
}));

export default router;
