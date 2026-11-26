// =====================================================
// SIGET-VÍA — CONFIGURACIÓN DE LA API (Express)
//
// CAPA DE LÓGICA DE NEGOCIO (app/negocio)
//   controladores/ → endpoints HTTP (reciben req y responden JSON)
//   seguridad/     → JWT y control de acceso por rol
//   middlewares/   → manejo de errores
//   servicios/     → validaciones y reglas del sistema
//
// Arquitectura del proyecto:
//   app/presentacion (React) → app/negocio (Express) → app/datos (SQL Server)
// El negocio solo accede a la base de datos a través del paquete
// siget-via-datos (app/datos). Aquí no se escribe SQL.
// =====================================================
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import '../../../config/entorno.js';

import { asyncRoute } from './middlewares/async-route.js';
import { auth, activeUser, admin, personalVentas } from './seguridad/auth.middleware.js';
import { rutaNoEncontrada, manejadorErrores } from './middlewares/errores.middleware.js';
import { validarConfiguracion } from './servicios/auth.service.js';
import { verificarConexion } from './servicios/sistema.service.js';

import { createAuthRouter } from './controladores/auth.controlador.js';
import { createRolesRouter, createUsuariosRouter } from './controladores/usuarios.controlador.js';
import { createPasajerosRouter } from './controladores/pasajeros.controlador.js';
import { createConsultaDniClientesRouter } from './controladores/consulta-dni-clientes.controlador.js';
import { createRutasRouter } from './controladores/rutas.controlador.js';
import { createTerminalesRouter } from './controladores/terminales.controlador.js';
import { createBusesRouter } from './controladores/buses.controlador.js';
import { createConductoresRouter } from './controladores/conductores.controlador.js';
import { createViajesRouter } from './controladores/viajes.controlador.js';
import viajesPublicosRouter from './controladores/viajes-publicos.controlador.js';
import asientosPublicosRouter from './controladores/asientos-publicos.controlador.js';
import registroClientesRouter from './controladores/registro-clientes.controlador.js';
import { createReservasRouter } from './controladores/reservas.controlador.js';
import { createMisReservasRouter } from './controladores/mis-reservas.controlador.js';
import { createPerfilClienteRouter } from './controladores/perfil-cliente.controlador.js';
import { createVentasRouter } from './controladores/ventas.controlador.js';
import { createPagosRouter } from './controladores/pagos.controlador.js';
import { createAuditoriaRouter } from './controladores/auditoria.controlador.js';
import { createReclamacionesRouter, createMisReclamacionesRouter } from './controladores/reclamaciones.controlador.js';
import { createReportesRouter } from './controladores/reportes.controlador.js';
import { createManifiestosRouter } from './controladores/manifiestos.controlador.js';
import { createPoliticasRouter, createCondicionesPublicasRouter } from './controladores/politicas.controlador.js';

validarConfiguracion();

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json({ limit: '32kb' }));

// Dependencias comunes que reciben los routers.
const mw = { auth, activeUser, admin, personalVentas, asyncRoute };

// Estado de la API
app.get('/api/health', asyncRoute(async (req, res) => {
  await verificarConexion();
  res.json({ status: 'ok', database: 'connected' });
}));

// Autenticación y usuarios — RF1, RF2
app.use('/api/auth', createAuthRouter(mw));
app.use('/api/roles', createRolesRouter(mw));
app.use('/api/usuarios', createUsuariosRouter(mw));

// Gestión administrativa — RF6, RF7, RF8, RF9, RF15
app.use('/api/pasajeros', createPasajerosRouter(mw));
app.use('/api/rutas', createRutasRouter(mw));
app.use('/api/terminales', createTerminalesRouter(mw));
app.use('/api/buses', createBusesRouter(mw));
app.use('/api/conductores', createConductoresRouter(mw));
app.use('/api/viajes', createViajesRouter(mw));

// Portal público (sin sesión) — RF3, RF4, RF10
app.use('/api/publico', viajesPublicosRouter);
app.use('/api/publico/asientos', asientosPublicosRouter);
app.use('/api/publico/clientes', registroClientesRouter);
app.use('/api/publico/condiciones', createCondicionesPublicasRouter(mw));

// Portal del cliente
app.use('/api/cliente/consulta-dni', createConsultaDniClientesRouter(mw));
app.use('/api/cliente/mis-reservas', createMisReservasRouter(mw));
app.use('/api/cliente/perfil', createPerfilClienteRouter(mw));
app.use('/api/cliente/mis-reclamaciones', createMisReclamacionesRouter(mw));

// Reservas, ventas y pagos — RF4, RF5, RF10, RF18
app.use('/api/reservas', createReservasRouter(mw));
app.use('/api/ventas', createVentasRouter(mw));
app.use('/api/pagos', createPagosRouter(mw));

// Control y reportes — RF11..RF17
app.use('/api/auditoria', createAuditoriaRouter(mw));
app.use('/api/reclamaciones', createReclamacionesRouter(mw));
app.use('/api/reportes', createReportesRouter(mw));
app.use('/api/manifiestos', createManifiestosRouter(mw));
app.use('/api/politicas', createPoliticasRouter(mw));

app.use(rutaNoEncontrada);
app.use(manejadorErrores);

export default app;
