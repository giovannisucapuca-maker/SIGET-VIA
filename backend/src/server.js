
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z, ZodError } from 'zod';
import 'dotenv/config';

import { getPool, sql } from './db.js';

import { createPasajerosRouter } from './pasajeros.js';
import { createConsultaDniClientesRouter } from './consulta-dni-clientes.js';
import { createRutasRouter } from './rutas.js';
import { createBusesRouter } from './buses.js';
import { createConductoresRouter } from './conductores.js';
import { createViajesRouter } from './viajes.js';
import viajesPublicosRouter from './viajes-publicos.js';
import asientosPublicosRouter from './asientos-publicos.js';
import registroClientesRouter from './registro-clientes.js';
import { createReservasRouter } from './reservas.js';
import { createMisReservasRouter } from './mis-reservas.js';
import { createVentasRouter } from './ventas.js';
import { createPagosRouter } from './pagos.js';
import { createAuditoriaRouter } from './auditoria.js';
import { createReclamacionesRouter } from './reclamaciones.js';
import { createReportesRouter } from './reportes.js';
import { createManifiestosRouter } from './manifiestos.js';
import { createPoliticasRouter } from './politicas.js';
import { createPerfilClienteRouter } from './perfil-cliente.js';

// =================================================
// SIGET-VÍA — SERVIDOR PRINCIPAL
// PASO 168.3 — POLÍTICAS DEL SERVICIO
// =================================================

const PORT = Number(process.env.PORT || 4000);

if (
  !process.env.JWT_SECRET ||
  process.env.JWT_SECRET.length < 32
) {
  throw new Error(
    'Configura JWT_SECRET de al menos 32 caracteres en .env'
  );
}

const app = express();

app.disable('x-powered-by');
app.use(helmet());

app.use(cors({
  origin:
    process.env.FRONTEND_URL ||
    'http://localhost:5173'
}));

app.use(express.json({ limit: '32kb' }));

const asyncRoute = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// =================================================
// VALIDACIONES
// =================================================

const clean = z.string().trim().min(1);

const loginSchema = z.object({
  correo: z.string().trim().email().max(254),
  contrasena: z.string().min(1)
});

const userSchema = z.object({
  nombres: clean.max(100),
  apellidos: clean.max(120),
  correo: z.string().trim().email().max(254),
  telefono: z.string()
    .trim()
    .max(20)
    .nullable()
    .optional(),
  rolId: z.number().int().positive(),
  contrasena: z.string().min(8).max(72),
  estado: z.enum([
    'ACTIVO',
    'INACTIVO'
  ]).default('ACTIVO')
});

const editSchema = userSchema
  .omit({ contrasena: true })
  .extend({
    contrasena: z.union([
      z.string().min(8).max(72),
      z.literal('')
    ]).optional()
  });

const idSchema = z.coerce
  .number()
  .int()
  .positive();

// =================================================
// AUTENTICACIÓN JWT
// =================================================

function issueToken(usuario) {
  return jwt.sign(
    {
      sub: String(usuario.UsuarioID),
      rol: usuario.Rol,
      rolId: usuario.RolID
    },
    process.env.JWT_SECRET,
    {
      expiresIn: '8h',
      issuer: 'siget-via',
      algorithm: 'HS256'
    }
  );
}

function auth(req, res, next) {
  const token = /^Bearer (.+)$/.exec(
    req.headers.authorization || ''
  )?.[1];

  if (!token) {
    return res.status(401).json({
      error: 'Autenticación requerida'
    });
  }

  try {
    req.session = jwt.verify(
      token,
      process.env.JWT_SECRET,
      {
        issuer: 'siget-via',
        algorithms: ['HS256']
      }
    );

    next();
  } catch {
    return res.status(401).json({
      error: 'Sesión inválida o vencida'
    });
  }
}

// =================================================
// AUTORIZACIÓN
// =================================================

function admin(req, res, next) {
  if (req.session?.rol !== 'ADMINISTRADOR') {
    return res.status(403).json({
      error: 'No autorizado'
    });
  }

  next();
}

// =================================================
// VALIDAR USUARIO ACTIVO
// =================================================

async function activeUser(req, res, next) {
  try {
    const pool = await getPool();

    const resultado = await pool.request()
      .input('id', sql.BigInt, req.session.sub)
      .query(`
        SELECT
          u.UsuarioID,
          u.RolID,
          u.Nombres,
          u.Apellidos,
          u.Correo,
          u.Estado,
          r.Nombre AS Rol
        FROM dbo.Usuario u
        INNER JOIN dbo.Rol r
          ON r.RolID = u.RolID
        WHERE u.UsuarioID = @id
      `);

    const usuario = resultado.recordset[0];

    if (
      !usuario ||
      usuario.Estado !== 'ACTIVO' ||
      usuario.Rol !== req.session.rol ||
      Number(usuario.RolID) !==
        Number(req.session.rolId)
    ) {
      return res.status(401).json({
        error: 'Usuario deshabilitado o sesión inválida'
      });
    }

    req.currentUser = usuario;
    next();
  } catch (error) {
    next(error);
  }
}

// =================================================
// AUDITORÍA AUTOMÁTICA DE USUARIOS
// =================================================

async function audit(
  tx,
  userId,
  action,
  recordId,
  detail
) {
  const accionesValidas = [
    'INSERT',
    'UPDATE',
    'DELETE',
    'CAMBIO_ESTADO',
    'LOGIN',
    'OTRO'
  ];

  if (!accionesValidas.includes(action)) {
    throw new Error(
      `Acción de auditoría no permitida: ${action}`
    );
  }

  await new sql.Request(tx)
    .input('userId', sql.BigInt, userId)
    .input('action', sql.VarChar(20), action)
    .input('recordId', sql.BigInt, recordId)
    .input('detail', sql.NVarChar(1000), detail)
    .query(`
      INSERT INTO dbo.Auditoria (
        UsuarioID,
        Entidad,
        RegistroID,
        Accion,
        Detalle,
        Fecha
      )
      VALUES (
        @userId,
        'Usuario',
        @recordId,
        @action,
        @detail,
        SYSDATETIME()
      )
    `);
}

// =================================================
// ESTADO DE LA API
// =================================================

app.get(
  '/api/health',
  asyncRoute(async (req, res) => {
    await getPool();

    res.json({
      status: 'ok',
      database: 'connected'
    });
  })
);

// =================================================
// INICIO DE SESIÓN
// =================================================

app.post(
  '/api/auth/login',

  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false
  }),

  asyncRoute(async (req, res) => {
    const datos = loginSchema.parse(req.body);
    const pool = await getPool();

    const resultado = await pool.request()
      .input(
        'correo',
        sql.NVarChar(254),
        datos.correo
      )
      .query(`
        SELECT
          u.UsuarioID,
          u.RolID,
          u.Nombres,
          u.Apellidos,
          u.Correo,
          u.ContrasenaHash,
          u.Estado,
          r.Nombre AS Rol
        FROM dbo.Usuario u
        INNER JOIN dbo.Rol r
          ON r.RolID = u.RolID
        WHERE u.Correo = @correo
      `);

    const usuario = resultado.recordset[0];

    if (
      !usuario ||
      usuario.Estado !== 'ACTIVO' ||
      !(await bcrypt.compare(
        datos.contrasena,
        usuario.ContrasenaHash
      ))
    ) {
      return res.status(401).json({
        error: 'Credenciales inválidas'
      });
    }

    const {
      ContrasenaHash,
      Estado,
      ...usuarioSeguro
    } = usuario;

    res.json({
      token: issueToken(usuario),
      usuario: usuarioSeguro
    });
  })
);

// =================================================
// CONSULTAR SESIÓN
// =================================================

app.get(
  '/api/auth/me',
  auth,
  activeUser,
  (req, res) => {
    res.json({
      usuario: req.currentUser
    });
  }
);

// =================================================
// ROLES
// =================================================

app.get(
  '/api/roles',
  auth,
  activeUser,
  admin,

  asyncRoute(async (req, res) => {
    const pool = await getPool();

    const resultado = await pool.request().query(`
      SELECT RolID, Nombre
      FROM dbo.Rol
      ORDER BY RolID
    `);

    res.json(resultado.recordset);
  })
);

// =================================================
// LISTAR USUARIOS
// =================================================

app.get(
  '/api/usuarios',
  auth,
  activeUser,
  admin,

  asyncRoute(async (req, res) => {
    const q = String(req.query.q || '')
      .trim()
      .slice(0, 100);

    const pool = await getPool();

    const resultado = await pool.request()
      .input(
        'q',
        sql.NVarChar(110),
        `%${q}%`
      )
      .query(`
        SELECT
          u.UsuarioID,
          u.Nombres,
          u.Apellidos,
          u.Correo,
          u.Telefono,
          u.Estado,
          u.RolID,
          r.Nombre AS Rol
        FROM dbo.Usuario u
        INNER JOIN dbo.Rol r
          ON r.RolID = u.RolID
        WHERE
          u.Nombres LIKE @q
          OR u.Apellidos LIKE @q
          OR u.Correo LIKE @q
        ORDER BY u.UsuarioID DESC
      `);

    res.json(resultado.recordset);
  })
);

// =================================================
// REGISTRAR USUARIO — RF2
// =================================================

app.post(
  '/api/usuarios',
  auth,
  activeUser,
  admin,

  asyncRoute(async (req, res) => {
    const d = userSchema.parse(req.body);
    const hash = await bcrypt.hash(d.contrasena, 12);

    const pool = await getPool();
    const tx = new sql.Transaction(pool);

    await tx.begin();

    try {
      const rol = await new sql.Request(tx)
        .input('rol', sql.Int, d.rolId)
        .query(`
          SELECT RolID
          FROM dbo.Rol
          WHERE RolID = @rol
        `);

      if (!rol.recordset.length) {
        await tx.rollback();

        return res.status(400).json({
          error: 'Rol no válido'
        });
      }

      const resultado = await new sql.Request(tx)
        .input('rol', sql.Int, d.rolId)
        .input(
          'n',
          sql.NVarChar(100),
          d.nombres
        )
        .input(
          'a',
          sql.NVarChar(120),
          d.apellidos
        )
        .input(
          'c',
          sql.NVarChar(254),
          d.correo
        )
        .input(
          'h',
          sql.NVarChar(255),
          hash
        )
        .input(
          't',
          sql.VarChar(20),
          d.telefono || null
        )
        .input(
          'e',
          sql.VarChar(12),
          d.estado
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
          OUTPUT INSERTED.UsuarioID
          VALUES (
            @rol,
            @n,
            @a,
            @c,
            @h,
            @t,
            @e,
            SYSDATETIME()
          )
        `);

      const id = resultado.recordset[0].UsuarioID;

      await audit(
        tx,
        req.currentUser.UsuarioID,
        'INSERT',
        id,
        `Registro de usuario #${id}. ` +
          `Correo: ${d.correo}. ` +
          `RolID: ${d.rolId}. ` +
          `Estado: ${d.estado}.`
      );

      await tx.commit();

      res.status(201).json({
        UsuarioID: id,
        mensaje: 'Usuario registrado correctamente'
      });
    } catch (error) {
      await tx.rollback().catch(() => {});
      throw error;
    }
  })
);

// =================================================
// EDITAR USUARIO — RF2
// =================================================

app.put(
  '/api/usuarios/:id',
  auth,
  activeUser,
  admin,

  asyncRoute(async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const d = editSchema.parse(req.body);

    if (
      id === Number(req.currentUser.UsuarioID) &&
      (
        d.estado !== 'ACTIVO' ||
        d.rolId !== req.currentUser.RolID
      )
    ) {
      return res.status(400).json({
        error:
          'No puedes desactivar tu cuenta ni cambiar tu rol'
      });
    }

    const pool = await getPool();
    const tx = new sql.Transaction(pool);

    await tx.begin();

    try {
      const rol = await new sql.Request(tx)
        .input('rol', sql.Int, d.rolId)
        .query(`
          SELECT RolID
          FROM dbo.Rol
          WHERE RolID = @rol
        `);

      if (!rol.recordset.length) {
        await tx.rollback();

        return res.status(400).json({
          error: 'Rol no válido'
        });
      }

      const request = new sql.Request(tx)
        .input('id', sql.BigInt, id)
        .input(
          'n',
          sql.NVarChar(100),
          d.nombres
        )
        .input(
          'a',
          sql.NVarChar(120),
          d.apellidos
        )
        .input(
          'c',
          sql.NVarChar(254),
          d.correo
        )
        .input(
          't',
          sql.VarChar(20),
          d.telefono || null
        )
        .input('rol', sql.Int, d.rolId)
        .input(
          'e',
          sql.VarChar(12),
          d.estado
        );

      const cambiarClave = Boolean(d.contrasena);

      if (cambiarClave) {
        request.input(
          'h',
          sql.NVarChar(255),
          await bcrypt.hash(d.contrasena, 12)
        );
      }

      const resultado = await request.query(`
        UPDATE dbo.Usuario
        SET
          Nombres = @n,
          Apellidos = @a,
          Correo = @c,
          Telefono = @t,
          RolID = @rol,
          Estado = @e
          ${
            cambiarClave
              ? ', ContrasenaHash = @h'
              : ''
          }
        WHERE UsuarioID = @id
      `);

      if (!resultado.rowsAffected[0]) {
        await tx.rollback();

        return res.status(404).json({
          error: 'Usuario no encontrado'
        });
      }

      await audit(
        tx,
        req.currentUser.UsuarioID,
        'UPDATE',
        id,
        `Actualización del usuario #${id}. ` +
          `Correo: ${d.correo}. ` +
          `RolID: ${d.rolId}. ` +
          `Estado: ${d.estado}. ` +
          `Contraseña modificada: ${
            cambiarClave ? 'Sí' : 'No'
          }.`
      );

      await tx.commit();

      res.json({
        ok: true,
        mensaje: 'Usuario actualizado correctamente'
      });
    } catch (error) {
      await tx.rollback().catch(() => {});
      throw error;
    }
  })
);

// =================================================
// CAMBIAR ESTADO DE USUARIO — RF2
// =================================================

app.patch(
  '/api/usuarios/:id/estado',
  auth,
  activeUser,
  admin,

  asyncRoute(async (req, res) => {
    const id = idSchema.parse(req.params.id);

    const { estado } = z.object({
      estado: z.enum([
        'ACTIVO',
        'INACTIVO'
      ])
    }).parse(req.body);

    if (
      id === Number(req.currentUser.UsuarioID)
    ) {
      return res.status(400).json({
        error:
          'No puedes cambiar el estado de tu propia cuenta'
      });
    }

    const pool = await getPool();
    const tx = new sql.Transaction(pool);

    await tx.begin();

    try {
      const actual = await new sql.Request(tx)
        .input('id', sql.BigInt, id)
        .query(`
          SELECT Estado
          FROM dbo.Usuario WITH (
            UPDLOCK,
            HOLDLOCK
          )
          WHERE UsuarioID = @id
        `);

      if (!actual.recordset.length) {
        await tx.rollback();

        return res.status(404).json({
          error: 'Usuario no encontrado'
        });
      }

      const estadoAnterior =
        actual.recordset[0].Estado;

      if (estadoAnterior === estado) {
        await tx.rollback();

        return res.status(400).json({
          error:
            'El usuario ya tiene el estado seleccionado'
        });
      }

      const resultado = await new sql.Request(tx)
        .input('id', sql.BigInt, id)
        .input(
          'estado',
          sql.VarChar(12),
          estado
        )
        .query(`
          UPDATE dbo.Usuario
          SET Estado = @estado
          WHERE UsuarioID = @id
        `);

      if (!resultado.rowsAffected[0]) {
        await tx.rollback();

        return res.status(404).json({
          error: 'Usuario no encontrado'
        });
      }

      await audit(
        tx,
        req.currentUser.UsuarioID,
        'CAMBIO_ESTADO',
        id,
        `Cambio de estado del usuario #${id}. ` +
          `Estado anterior: ${estadoAnterior}. ` +
          `Estado nuevo: ${estado}.`
      );

      await tx.commit();

      res.json({
        ok: true,
        mensaje: 'Estado actualizado correctamente'
      });
    } catch (error) {
      await tx.rollback().catch(() => {});
      throw error;
    }
  })
);

// =================================================
// MÓDULOS DEL SISTEMA
// =================================================

// PASAJEROS — RF15

app.use(
  '/api/pasajeros',
  createPasajerosRouter({
    auth,
    activeUser,
    admin,
    asyncRoute
  })
);


/* =====================================================
   SIGET-VÍA — PASO 172.8.5.2

   CONSULTA DE DNI PARA CLIENTES

   RF4  — Reserva de pasajes
   RF15 — Gestión de pasajeros

   Seguridad:
   - Autenticación JWT
   - Usuario activo
   - Rol CLIENTE obligatorio
   - Control de consultas

   No modifica el módulo administrativo.
   ===================================================== */

app.use(
  '/api/cliente/consulta-dni',
  createConsultaDniClientesRouter({
    auth,
    activeUser,
    asyncRoute
  })
);


// RUTAS — RF6

app.use(
  '/api/rutas',
  createRutasRouter({
    auth,
    activeUser,
    admin,
    asyncRoute
  })
);

// BUSES — RF8

app.use(
  '/api/buses',
  createBusesRouter({
    auth,
    activeUser,
    admin,
    asyncRoute
  })
);

// CONDUCTORES — RF9

app.use(
  '/api/conductores',
  createConductoresRouter({
    auth,
    activeUser,
    admin,
    asyncRoute
  })
);


 // =====================================================
 // PASO 171 — CONSULTA PÚBLICA DE VIAJES
 // RF3 / CU003
 // =====================================================

 // Permite consultar viajes sin iniciar sesión.
 // No modifica reservas ni datos administrativos.

 app.use(
   '/api/publico',
   viajesPublicosRouter
 );
 

/* =====================================================
   PASO 172.2 — CONSULTA PÚBLICA DE ASIENTOS
   RF4 / RF10 — CU004 / CU010
   ===================================================== */

app.use(
  '/api/publico/asientos',
  asientosPublicosRouter
);


/* =====================================================
   SIGET-VÍA
   PASO 172.7.4 — REGISTRO PÚBLICO DE CLIENTES

   RF1 — Autenticación
   RF2 — Usuarios y perfiles
   RF4 — Reservas de clientes

   RNF4 — Seguridad de contraseñas
   RNF5 — Control de accesos
   RNF7 — Integridad de datos
   ===================================================== */

app.use(
  '/api/publico/clientes',
  registroClientesRouter
);


 // =====================================================
 // GESTIÓN ADMINISTRATIVA DE VIAJES
 // RF7 / CU007
 // =====================================================

 app.use(
   '/api/viajes',
   createViajesRouter({
     auth,
     activeUser,
     admin,
     asyncRoute
   })
 );


// RESERVAS — RF4, RF10 Y RF18

app.use(
  '/api/reservas',
  createReservasRouter({
    auth,
    activeUser,
    admin,
    asyncRoute
  })
);

// =====================================================
// PASO 174 — MIS RESERVAS DEL CLIENTE
// =====================================================
app.use(
  '/api/cliente/mis-reservas',
  createMisReservasRouter({
    auth,
    activeUser,
    asyncRoute
  })
);

// =====================================================
// PASO 174.5 — PERFIL EDITABLE DEL CLIENTE
// =====================================================
app.use(
  '/api/cliente/perfil',
  createPerfilClienteRouter({
    auth,
    activeUser,
    asyncRoute
  })
);

// VENTAS — RF5

app.use(
  '/api/ventas',
  createVentasRouter({
    auth,
    activeUser,
    admin,
    asyncRoute
  })
);

// PAGOS SIMULADOS

app.use(
  '/api/pagos',
  createPagosRouter({
    auth,
    activeUser,
    admin,
    asyncRoute
  })
);

// AUDITORÍA

app.use(
  '/api/auditoria',
  createAuditoriaRouter({
    auth,
    activeUser,
    admin,
    asyncRoute
  })
);

// RECLAMACIONES — RF11, RF12 Y RF13

app.use(
  '/api/reclamaciones',
  createReclamacionesRouter({
    auth,
    activeUser,
    admin,
    asyncRoute
  })
);

// REPORTES ADMINISTRATIVOS — RF14

app.use(
  '/api/reportes',
  createReportesRouter({
    auth,
    activeUser,
    admin,
    asyncRoute
  })
);

// MANIFIESTOS DE PASAJEROS — RF16

app.use(
  '/api/manifiestos',
  createManifiestosRouter({
    auth,
    activeUser,
    asyncRoute
  })
);

// =================================================
// POLÍTICAS DEL SERVICIO — RF17
// PASO 168.3
// =================================================

app.use(
  '/api/politicas',
  createPoliticasRouter({
    auth,
    activeUser,
    admin,
    asyncRoute
  })
);

// =================================================
// RUTAS NO ENCONTRADAS
// =================================================

app.use((req, res) => {
  res.status(404).json({
    error: 'Ruta no encontrada'
  });
});

// =================================================
// MANEJO GLOBAL DE ERRORES
// =================================================

app.use((err, req, res, next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Datos inválidos',
      details: err.issues
    });
  }

  if (
    err.statusCode === 400 ||
    err.statusCode === 404 ||
    err.statusCode === 409
  ) {
    return res.status(err.statusCode).json({
      error: err.message
    });
  }

  const numero =
    err.number ??
    err.originalError?.info?.number;

  if (
    numero === 2627 ||
    numero === 2601
  ) {
    return res.status(409).json({
      error:
        'Ya existe un registro con esos datos únicos'
    });
  }

  if (numero === 547) {
    return res.status(400).json({
      error:
        'La operación incumple una relación de la base de datos'
    });
  }

  console.error(
    'Error del servidor:',
    err
  );

  return res.status(500).json({
    error: 'Error interno del servidor'
  });
});

// =================================================
// INICIAR EXPRESS
// =================================================

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log('====================================');
    console.log('SIGET-VÍA - SERVIDOR BACKEND');
    console.log(`API: http://localhost:${PORT}`);
    console.log('Base de datos: SIGET_VIA_DB');
    console.log(
      'Módulos: Usuarios, Pasajeros, Rutas, ' +
      'Buses, Conductores, Viajes, Reservas, ' +
      'Ventas, Pagos, Auditoría, Reclamaciones, ' +
      'Reportes, Manifiestos y Políticas'
    );
    console.log('====================================');
  });
}

export default app;
