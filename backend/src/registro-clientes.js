
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

import { getPool, sql } from './db.js';

// =====================================================
// SIGET-VÍA — REGISTRO PÚBLICO DE CLIENTES
// PASO 172.7.3
// RF1 / RF2 / RF4
// RNF4 / RNF5 / RNF7 / RNF10
// =====================================================

const router = Router();

// =====================================================
// SEGURIDAD — LÍMITE DE SOLICITUDES
// =====================================================

router.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
      error:
        'Demasiados intentos de registro. ' +
        'Inténtalo nuevamente más tarde.'
    }
  })
);

// =====================================================
// VALIDACIONES
// =====================================================

const patronNombre =
  /^[\p{L}\p{M}][\p{L}\p{M}'’.\- ]*$/u;

function validarNombre(maximo) {
  return z.string()
    .trim()
    .min(2)
    .max(maximo)
    .regex(
      patronNombre,
      'Solo se permiten letras y separadores válidos.'
    )
    .transform(valor =>
      valor.replace(/\s+/g, ' ')
    );
}

const registroSchema = z.object({
  nombres: validarNombre(100),

  apellidos: validarNombre(120),

  correo: z.string()
    .trim()
    .email('Ingresa un correo válido.')
    .max(254)
    .transform(valor => valor.toLowerCase()),

  telefono: z.string()
    .trim()
    .regex(
      /^[0-9+()\s-]{6,20}$/,
      'El teléfono no tiene un formato válido.'
    )
    .nullable()
    .optional(),

  contrasena: z.string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres.')
    .max(72)
    .regex(
      /[A-Z]/,
      'La contraseña debe contener una mayúscula.'
    )
    .regex(
      /[a-z]/,
      'La contraseña debe contener una minúscula.'
    )
    .regex(
      /[0-9]/,
      'La contraseña debe contener un número.'
    ),

  confirmarContrasena: z.string(),

  aceptaPrivacidad: z.literal(true)
}).strict().refine(
  datos =>
    datos.contrasena === datos.confirmarContrasena,
  {
    path: ['confirmarContrasena'],
    message: 'Las contraseñas no coinciden.'
  }
);

// =====================================================
// REGISTRO — POST /api/publico/clientes/registro
// =====================================================

router.post('/registro', async (req, res, next) => {
  const validacion = registroSchema.safeParse(
    req.body
  );

  if (!validacion.success) {
    return res.status(400).json({
      error:
        validacion.error.issues[0]?.message ||
        'Los datos ingresados son inválidos.'
    });
  }

  const datos = validacion.data;

  try {
    const pool = await getPool();

    // =================================================
    // IDENTIFICAR EL ROL CLIENTE
    // =================================================

    const rolResultado = await pool.request()
      .query(`
        SELECT TOP (1)
          RolID
        FROM dbo.Rol
        WHERE Nombre = N'CLIENTE'
      `);

    if (!rolResultado.recordset.length) {
      return res.status(503).json({
        error:
          'El registro de clientes no está disponible.'
      });
    }

    const rolId =
      rolResultado.recordset[0].RolID;

    // =================================================
    // PREPARAR CONTRASEÑA SEGURA
    // =================================================

    const contrasenaHash = await bcrypt.hash(
      datos.contrasena,
      12
    );

    // =================================================
    // REGISTRAR CLIENTE
    // El rol se asigna exclusivamente en el servidor.
    // Nunca se acepta rolId del visitante.
    // =================================================

    const resultado = await pool.request()
      .input('rolId', sql.Int, rolId)
      .input(
        'nombres',
        sql.NVarChar(100),
        datos.nombres
      )
      .input(
        'apellidos',
        sql.NVarChar(120),
        datos.apellidos
      )
      .input(
        'correo',
        sql.NVarChar(254),
        datos.correo
      )
      .input(
        'telefono',
        sql.VarChar(20),
        datos.telefono || null
      )
      .input(
        'hash',
        sql.NVarChar(255),
        contrasenaHash
      )
      .query(`
        INSERT INTO dbo.Usuario (
          RolID,
          Nombres,
          Apellidos,
          Correo,
          ContrasenaHash,
          Telefono,
          Estado,
          FechaRegistro
        )
        OUTPUT
          INSERTED.UsuarioID,
          INSERTED.Nombres,
          INSERTED.Apellidos,
          INSERTED.Correo
        VALUES (
          @rolId,
          @nombres,
          @apellidos,
          @correo,
          @hash,
          @telefono,
          N'ACTIVO',
          SYSDATETIME()
        )
      `);

    const usuario = resultado.recordset[0];

    // =================================================
    // RESPUESTA SEGURA
    // No devolver el hash ni la contraseña.
    // =================================================

    res.set('Cache-Control', 'no-store');

    return res.status(201).json({
      mensaje:
        'Cuenta creada correctamente. ' +
        'Ya puedes iniciar sesión.',

      usuario: {
        UsuarioID: usuario.UsuarioID,
        Nombres: usuario.Nombres,
        Apellidos: usuario.Apellidos,
        Correo: usuario.Correo,
        Rol: 'CLIENTE'
      }
    });

  } catch (error) {
    const numero =
      error.number ??
      error.originalError?.info?.number;

    // Índice único de correo en SQL Server.
    if (numero === 2601 || numero === 2627) {
      return res.status(409).json({
        error:
          'Ya existe una cuenta con este correo.'
      });
    }

    next(error);
  }
});

// =====================================================
// EXPORTAR ROUTER
// =====================================================

export default router;
