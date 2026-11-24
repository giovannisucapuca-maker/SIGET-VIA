
import { Router } from 'express';
import rateLimit from 'express-rate-limit';

// =====================================================
// SIGET-VÍA — CONSULTA DE DNI PARA CLIENTES
// PASO 172.8.5.1
//
// RF4  — Reserva de pasajes
// RF10 — Selección de asientos
// RF15 — Datos de pasajeros
//
// SEGURIDAD:
// - Requiere JWT.
// - Solo permite rol CLIENTE.
// - Verifica que el usuario esté activo.
// - Limita las consultas por usuario.
// - No consulta registros de otros pasajeros
//   almacenados en SQL Server.
// - No registra DNI ni respuestas en logs.
// - No devuelve claves de servicios externos.
// =====================================================

// =====================================================
// FUNCIONES AUXILIARES
// =====================================================

function limpiarTexto(valor) {
  return String(valor || '')
    .trim()
    .replace(/\s+/g, ' ');
}

const patronNombre =
  /^[\p{L}\p{M}][\p{L}\p{M}'’.\- ]*$/u;

function nombreValido(valor, maximo) {
  return (
    typeof valor === 'string' &&
    valor.length >= 2 &&
    valor.length <= maximo &&
    patronNombre.test(valor)
  );
}

// =====================================================
// CONSULTA AL SERVICIO APIINTI
// =====================================================

async function consultarApiInti(dni) {
  const apiKey = process.env.APIINTI_API_KEY;

  if (!apiKey) {
    const error = new Error(
      'El servicio de consulta de DNI no está configurado.'
    );

    error.statusCode = 503;
    throw error;
  }

  let respuesta;

  try {
    respuesta = await fetch(
      `https://app.apiinti.dev/api/v1/dni/${dni}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json'
        },
        signal: AbortSignal.timeout(10000)
      }
    );
  } catch {
    const error = new Error(
      'No se pudo conectar con el servicio de consulta.'
    );

    error.statusCode = 502;
    throw error;
  }

  if (
    respuesta.status === 401 ||
    respuesta.status === 403
  ) {
    const error = new Error(
      'El servicio de consulta no está autorizado.'
    );

    error.statusCode = 503;
    throw error;
  }

  if (respuesta.status === 429) {
    const error = new Error(
      'El servicio alcanzó su límite de consultas.'
    );

    error.statusCode = 429;
    throw error;
  }

  if (respuesta.status === 404) {
    return {
      encontrado: false,
      fuente: 'APIINTI',
      nombres: null,
      apellidos: null
    };
  }

  if (!respuesta.ok) {
    const error = new Error(
      'El servicio no pudo completar la consulta.'
    );

    error.statusCode = 502;
    throw error;
  }

  const resultado = await respuesta
    .json()
    .catch(() => null);

  const persona = resultado?.data;

  if (
    resultado?.success === false ||
    !persona ||
    typeof persona.nombres !== 'string' ||
    typeof persona.apellidoPaterno !== 'string'
  ) {
    const error = new Error(
      'El servicio devolvió información inválida.'
    );

    error.statusCode = 502;
    throw error;
  }

  const nombres = limpiarTexto(
    persona.nombres
  );

  const apellidos = limpiarTexto(
    [
      persona.apellidoPaterno,
      persona.apellidoMaterno
    ]
      .filter(
        valor =>
          typeof valor === 'string' &&
          valor.trim()
      )
      .join(' ')
  );

  if (
    !nombreValido(nombres, 100) ||
    !nombreValido(apellidos, 120)
  ) {
    const error = new Error(
      'Los datos recibidos no tienen un formato válido.'
    );

    error.statusCode = 502;
    throw error;
  }

  return {
    encontrado: true,
    fuente: 'APIINTI',
    nombres,
    apellidos
  };
}

// =====================================================
// CREAR ROUTER
//
// Recibe los middlewares existentes de server.js.
// Evita duplicar la validación de JWT y de usuarios.
// =====================================================

export function createConsultaDniClientesRouter({
  auth,
  activeUser,
  asyncRoute
}) {
  const router = Router();

  // ===================================================
  // AUTENTICACIÓN OBLIGATORIA
  // ===================================================

  router.use(
    auth,
    activeUser
  );

  // ===================================================
  // AUTORIZACIÓN: SOLO CLIENTE
  // ===================================================

  router.use((req, res, next) => {
    if (
      req.currentUser?.Rol !== 'CLIENTE' ||
      req.currentUser?.Estado !== 'ACTIVO'
    ) {
      return res.status(403).json({
        error:
          'Solo los clientes activos pueden ' +
          'utilizar esta consulta.'
      });
    }

    next();
  });

  // ===================================================
  // LIMITAR CONSULTAS POR CUENTA
  // ===================================================

  const limitarConsultas = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,

    keyGenerator: req =>
      String(req.currentUser.UsuarioID),

    message: {
      error:
        'Alcanzaste el límite de consultas de DNI. ' +
        'Puedes completar los datos manualmente.'
    }
  });

  // ===================================================
  // GET /api/cliente/consulta-dni/:dni
  //
  // El cliente debe confirmar previamente que tiene
  // autorización del titular para consultar sus datos.
  //
  // No expone registros almacenados en SQL Server.
  // ===================================================

  router.get(
    '/:dni',
    limitarConsultas,
    asyncRoute(async (req, res) => {
      res.set('Cache-Control', 'no-store');

      // Comprobación de autorización declarada
      // para esta consulta concreta.
      if (
        req.get('X-Consulta-Autorizada') !== 'si'
      ) {
        return res.status(400).json({
          error:
            'Debes confirmar que cuentas con ' +
            'autorización del titular del documento.'
        });
      }

      const dni = String(
        req.params.dni || ''
      ).trim();

      if (!/^\d{8}$/.test(dni)) {
        return res.status(400).json({
          error:
            'El DNI debe tener exactamente 8 dígitos.'
        });
      }

      try {
        const resultado =
          await consultarApiInti(dni);

        return res.status(200).json({
          encontrado: resultado.encontrado,
          fuente: resultado.fuente,
          tipoDocumento: 'DNI',
          nombres: resultado.nombres,
          apellidos: resultado.apellidos
        });
      } catch (error) {
        const statusCode =
          Number(error.statusCode) || 502;

        // No exponer mensajes internos del proveedor.
        return res.status(statusCode).json({
          error:
            error.message ||
            'No fue posible consultar el DNI.'
        });
      }
    })
  );

  return router;
}
