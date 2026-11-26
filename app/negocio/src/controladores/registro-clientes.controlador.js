// SIGET-VÍA — CAPA DE LÓGICA — Ruta HTTP — Registro público de clientes
// POST /api/publico/clientes/registro
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { registrarCliente } from '../servicios/registro-clientes.service.js';
import { asyncRoute } from '../middlewares/async-route.js';

const router = Router();

router.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de registro. Inténtalo nuevamente más tarde.' }
}));

router.post('/registro', asyncRoute(async (req, res) => {
  const resultado = await registrarCliente(req.body);
  res.set('Cache-Control', 'no-store');
  return res.status(201).json(resultado);
}));

export default router;
