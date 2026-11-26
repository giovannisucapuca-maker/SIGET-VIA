// SIGET-VÍA — CAPA DE LÓGICA — Ruta HTTP — Consulta pública de viajes
// GET /api/publico/viajes (sin sesión)
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { buscarViajesPublicos } from '../servicios/viajes-publicos.service.js';
import { asyncRoute } from '../middlewares/async-route.js';

const router = Router();

router.use(rateLimit({ windowMs: 60 * 1000, limit: 40, standardHeaders: 'draft-7', legacyHeaders: false }));

router.get('/viajes', asyncRoute(async (req, res) => {
  const viajes = await buscarViajesPublicos(req.query);
  res.set('Cache-Control', 'no-store');
  return res.json(viajes);
}));

export default router;
