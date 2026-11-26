// SIGET-VÍA — CAPA DE LÓGICA — Ruta HTTP — Consulta de DNI para clientes
// GET /api/cliente/consulta-dni/:dni  (JWT, rol CLIENTE, límite por cuenta)
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { consultarDniCliente, puedeConsultar } from '../servicios/consulta-dni.service.js';

export function createConsultaDniClientesRouter({ auth, activeUser, asyncRoute }) {
  const router = Router();
  router.use(auth, activeUser);

  router.use((req, res, next) => {
    if (!puedeConsultar(req.currentUser)) {
      return res.status(403).json({
        error: 'Solo los clientes activos pueden utilizar esta consulta.'
      });
    }
    next();
  });

  const limitarConsultas = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: req => String(req.currentUser.UsuarioID),
    message: {
      error: 'Alcanzaste el límite de consultas de DNI. Puedes completar los datos manualmente.'
    }
  });

  router.get('/:dni', limitarConsultas, asyncRoute(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const resultado = await consultarDniCliente(
      req.params.dni,
      req.get('X-Consulta-Autorizada') === 'si'
    );
    return res.status(200).json(resultado);
  }));

  return router;
}
