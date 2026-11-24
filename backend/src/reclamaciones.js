
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { randomInt, createHash } from 'node:crypto';
import { z } from 'zod';

import { getPool, sql } from './db.js';

// =====================================================
// SIGET-VÍA — LIBRO DE RECLAMACIONES
// PASO 170.7.6.19
//
// RF11 - Registrar reclamaciones
// RF12 - Consultar reclamaciones
// RF13 - Gestionar reclamaciones
//
// CU011 - Registrar reclamación
// CU012 - Consultar reclamación
// CU013 - Gestionar reclamación
//
// CÓDIGO PRIVADO DE 8 CARACTERES
// RESPUESTAS VISIBLES EN CONSULTA PÚBLICA
// =====================================================

// =====================================================
// CONSTANTES
// =====================================================

const ESTADOS = [
  'REGISTRADO',
  'EN_ATENCION',
  'RESPONDIDO',
  'CERRADO'
];

const TIPOS = ['RECLAMO', 'QUEJA'];

const ALFABETO =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

// =====================================================
// ESQUEMAS DE VALIDACIÓN
// =====================================================

const idSchema = z.coerce
  .number()
  .int()
  .positive()
  .safe();

const reclamacionSchema = z.object({
  usuarioId: idSchema.nullable().optional(),
  reservaId: idSchema.nullable().optional(),

  tipoDocumento: z.string()
    .trim()
    .min(1)
    .max(12),

  numeroDocumento: z.string()
    .trim()
    .min(4)
    .max(20),

  nombreReclamante: z.string()
    .trim()
    .min(3)
    .max(220),

  correoReclamante: z.string()
    .trim()
    .email()
    .max(254),

  telefonoReclamante: z.string()
    .trim()
    .max(20)
    .nullable()
    .optional(),

  tipoSolicitud: z.enum(TIPOS),

  descripcion: z.string()
    .trim()
    .min(10)
    .max(5000),

  pedido: z.string()
    .trim()
    .min(5)
    .max(5000)
});

const estadoSchema = z.object({
  estado: z.enum(ESTADOS),

  observacion: z.string()
    .trim()
    .max(500)
    .optional()
    .default('')
});

const respuestaSchema = z.object({
  contenido: z.string()
    .trim()
    .min(10)
    .max(5000)
});

// =====================================================
// UTILIDADES
// =====================================================

function errorHttp(
  mensaje,
  statusCode = 400
) {
  return Object.assign(
    new Error(mensaje),
    { statusCode }
  );
}

function obtenerId(valor) {
  const resultado = idSchema.safeParse(valor);

  if (!resultado.success) {
    throw errorHttp(
      'El identificador no es válido.'
    );
  }

  return resultado.data;
}

async function rollbackSeguro(tx) {
  try {
    await tx.rollback();
  } catch {
    // La transacción puede haberse revertido.
  }
}

// =====================================================
// GENERAR CÓDIGO PRIVADO
// EXACTAMENTE 8 CARACTERES
// LETRAS MAYÚSCULAS Y NÚMEROS
// =====================================================

function generarCodigoPrivado() {
  let codigo = '';

  // Se exige al menos una letra y un número.

  do {
    codigo = '';

    for (let i = 0; i < 8; i++) {
      codigo += ALFABETO[
        randomInt(ALFABETO.length)
      ];
    }

  } while (
    !/[A-Z]/.test(codigo) ||
    !/[0-9]/.test(codigo)
  );

  return codigo;
}

// =====================================================
// HASH SHA-256
// =====================================================

function calcularHash(codigo) {
  return createHash('sha256')
    .update(codigo, 'utf8')
    .digest();
}

// =====================================================
// AUDITORÍA ADMINISTRATIVA
// =====================================================

async function registrarAuditoria({
  tx,
  usuarioId,
  entidad,
  registroId,
  accion,
  detalle
}) {
  await new sql.Request(tx)
    .input(
      'usuarioId',
      sql.BigInt,
      usuarioId
    )
    .input(
      'entidad',
      sql.VarChar(70),
      entidad
    )
    .input(
      'registroId',
      sql.BigInt,
      registroId
    )
    .input(
      'accion',
      sql.VarChar(20),
      accion
    )
    .input(
      'detalle',
      sql.NVarChar(1000),
      detalle
    )
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
        @usuarioId,
        @entidad,
        @registroId,
        @accion,
        @detalle,
        SYSDATETIME()
      )
    `);
}

// =====================================================
// CONSULTA BASE ADMINISTRATIVA
// =====================================================

const consultaBase = `
  SELECT
    r.ReclamacionID,
    r.NumeroCorrelativo,
    r.UsuarioID,
    r.ReservaID,
    r.TipoDocumento,
    r.NumeroDocumento,
    r.NombreReclamante,
    r.CorreoReclamante,
    r.TelefonoReclamante,
    r.TipoSolicitud,
    r.Descripcion,
    r.Pedido,
    r.FechaRegistro,
    r.Estado
  FROM dbo.Reclamacion r
`;

// =====================================================
// ROUTER PRINCIPAL
// =====================================================

export function createReclamacionesRouter({
  auth,
  activeUser,
  admin,
  asyncRoute
}) {
  const router = Router();

  // ===================================================
  // LIMITADORES DEL CANAL PÚBLICO
  // ===================================================

  const limitadorRegistro = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,

    message: {
      error:
        'Demasiados intentos. Inténtalo más tarde.'
    }
  });

  const limitadorConsulta = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,

    message: {
      error:
        'Demasiadas consultas. Inténtalo más tarde.'
    }
  });

  // ===================================================
  // ESQUEMA DEL REGISTRO PÚBLICO
  //
  // No permite enviar UsuarioID ni ReservaID.
  // ===================================================

  const solicitudPublicaSchema =
    reclamacionSchema
      .omit({
        usuarioId: true,
        reservaId: true
      })
      .strict();

  // ===================================================
  // ESQUEMA DE CONSULTA PÚBLICA
  //
  // Código nuevo: 8 caracteres alfanuméricos.
  // Código anterior: 64 caracteres hexadecimales.
  // ===================================================

  const consultaPublicaSchema = z.object({
    numeroCorrelativo: z.string()
      .trim()
      .regex(
        /^REC-\d{10}$/,
        'Número correlativo inválido.'
      ),

    codigoPrivado: z.string()
      .trim()
      .regex(
        /^(?:[A-Za-z0-9]{8}|[A-Fa-f0-9]{64})$/,
        'El código privado no tiene un formato válido.'
      )
  }).strict();

  // ===================================================
  // CU011 — REGISTRAR RECLAMACIÓN PÚBLICA
  //
  // POST /api/reclamaciones/publicas
  // ===================================================

  router.post(
    '/publicas',
    limitadorRegistro,
    asyncRoute(async (req, res) => {
      const d = solicitudPublicaSchema.parse(
        req.body
      );

      // Generar código privado.
      const codigoPrivado =
        generarCodigoPrivado();

      // Guardar únicamente su hash.
      const tokenHash =
        calcularHash(codigoPrivado);

      const pool = await getPool();

      const tx = new sql.Transaction(pool);

      await tx.begin(
        sql.ISOLATION_LEVEL.SERIALIZABLE
      );

      try {
        // =============================================
        // INSERTAR RECLAMACIÓN
        //
        // NumeroCorrelativo es calculado por SQL Server.
        // =============================================

        const resultado = await new sql.Request(tx)
          .input(
            'tipoDocumento',
            sql.VarChar(12),
            d.tipoDocumento
          )
          .input(
            'numeroDocumento',
            sql.VarChar(20),
            d.numeroDocumento
          )
          .input(
            'nombre',
            sql.NVarChar(220),
            d.nombreReclamante
          )
          .input(
            'correo',
            sql.NVarChar(254),
            d.correoReclamante
          )
          .input(
            'telefono',
            sql.VarChar(20),
            d.telefonoReclamante || null
          )
          .input(
            'tipoSolicitud',
            sql.VarChar(10),
            d.tipoSolicitud
          )
          .input(
            'descripcion',
            sql.NVarChar(sql.MAX),
            d.descripcion
          )
          .input(
            'pedido',
            sql.NVarChar(sql.MAX),
            d.pedido
          )
          .input(
            'hash',
            sql.VarBinary(32),
            tokenHash
          )
          .query(`
            INSERT INTO dbo.Reclamacion (
              UsuarioID,
              ReservaID,
              TipoDocumento,
              NumeroDocumento,
              NombreReclamante,
              CorreoReclamante,
              TelefonoReclamante,
              TipoSolicitud,
              Descripcion,
              Pedido,
              FechaRegistro,
              Estado,
              TokenConsultaHash,
              FechaTokenConsulta
            )
            OUTPUT INSERTED.ReclamacionID
            VALUES (
              NULL,
              NULL,
              @tipoDocumento,
              @numeroDocumento,
              @nombre,
              @correo,
              @telefono,
              @tipoSolicitud,
              @descripcion,
              @pedido,
              SYSDATETIME(),
              'REGISTRADO',
              @hash,
              SYSDATETIME()
            )
          `);

        const id =
          resultado.recordset[0].ReclamacionID;

        // =============================================
        // REGISTRAR HISTORIAL INICIAL
        //
        // ResponsableID NULL:
        // registro público sin sesión.
        // =============================================

        await new sql.Request(tx)
          .input(
            'id',
            sql.BigInt,
            id
          )
          .query(`
            INSERT INTO dbo.HistorialReclamacion (
              ReclamacionID,
              ResponsableID,
              EstadoAnterior,
              EstadoNuevo,
              Observacion,
              FechaCambio
            )
            VALUES (
              @id,
              NULL,
              NULL,
              'REGISTRADO',
              N'Reclamación recibida por el canal público.',
              SYSDATETIME()
            )
          `);

        // =============================================
        // OBTENER CORRELATIVO
        // =============================================

        const consulta = await new sql.Request(tx)
          .input(
            'id',
            sql.BigInt,
            id
          )
          .query(`
            SELECT
              ReclamacionID,
              NumeroCorrelativo,
              TipoSolicitud,
              FechaRegistro,
              Estado
            FROM dbo.Reclamacion
            WHERE ReclamacionID = @id
          `);

        await tx.commit();

        // El código original solo se entrega
        // en la respuesta de este registro.

        return res.status(201).json({
          ...consulta.recordset[0],

          codigoPrivado,

          mensaje:
            'Reclamación registrada correctamente. ' +
            'Guarde su código privado de consulta.'
        });

      } catch (error) {
        await rollbackSeguro(tx);
        throw error;
      }
    })
  );

  // ===================================================
  // CU012 — CONSULTAR RECLAMACIÓN PÚBLICA
  //
  // POST /api/reclamaciones/consulta
  //
  // NUEVA MEJORA:
  // Mostrar la respuesta administrativa al consumidor
  // después de verificar sus credenciales.
  // ===================================================

  router.post(
    '/consulta',
    limitadorConsulta,
    asyncRoute(async (req, res) => {
      const d = consultaPublicaSchema.parse(
        req.body
      );

      // =============================================
      // NORMALIZAR CÓDIGO
      //
      // 64 caracteres: formato anterior minúsculas.
      // 8 caracteres: formato nuevo mayúsculas.
      // =============================================

      const codigoIngresado =
        d.codigoPrivado.trim();

      const codigoNormalizado =
        codigoIngresado.length === 64
          ? codigoIngresado.toLowerCase()
          : codigoIngresado.toUpperCase();

      const hash =
        calcularHash(codigoNormalizado);

      const pool = await getPool();

      // =============================================
      // VALIDAR RECLAMACIÓN Y HASH
      //
      // No devuelve datos personales.
      // =============================================

      const resultado = await pool.request()
        .input(
          'numero',
          sql.VarChar(14),
          d.numeroCorrelativo
        )
        .input(
          'hash',
          sql.VarBinary(32),
          hash
        )
        .query(`
          SELECT
            ReclamacionID,
            NumeroCorrelativo,
            TipoSolicitud,
            FechaRegistro,
            Estado
          FROM dbo.Reclamacion
          WHERE NumeroCorrelativo = @numero
            AND TokenConsultaHash = @hash
        `);

      const reclamacion =
        resultado.recordset[0];

      if (!reclamacion) {
        return res.status(404).json({
          error:
            'No se encontró una reclamación ' +
            'con esas credenciales.'
        });
      }

      // =============================================
      // CONSULTAR HISTORIAL
      // =============================================

      const historial = await pool.request()
        .input(
          'id',
          sql.BigInt,
          reclamacion.ReclamacionID
        )
        .query(`
          SELECT
            EstadoNuevo,
            FechaCambio
          FROM dbo.HistorialReclamacion
          WHERE ReclamacionID = @id
          ORDER BY
            FechaCambio,
            HistorialID
        `);

      // =============================================
      // NUEVO — CONSULTAR RESPUESTAS ADMINISTRATIVAS
      //
      // Solo se ejecuta tras validar el código privado.
      // No devuelve identidad ni datos del responsable.
      // =============================================

      const respuestas = await pool.request()
        .input(
          'id',
          sql.BigInt,
          reclamacion.ReclamacionID
        )
        .query(`
          SELECT
            Contenido,
            FechaRespuesta
          FROM dbo.RespuestaReclamacion
          WHERE ReclamacionID = @id
          ORDER BY
            FechaRespuesta,
            RespuestaID
        `);

      // =============================================
      // DEVOLVER SEGUIMIENTO Y RESPUESTAS
      // =============================================

      return res.json({
        reclamacion,
        historial: historial.recordset,
        respuestas: respuestas.recordset
      });
    })
  );

  // ===================================================
  // CU013 — ACCESO ADMINISTRATIVO
  //
  // Todas las rutas siguientes requieren
  // autenticación, usuario activo y administrador.
  // ===================================================

  router.use(auth, activeUser, admin);

  // ===================================================
  // CATÁLOGOS
  //
  // GET /api/reclamaciones/catalogos
  // ===================================================

  router.get(
    '/catalogos',
    (req, res) => {
      res.json({
        estados: ESTADOS,
        tipos: TIPOS
      });
    }
  );

  // ===================================================
  // RESUMEN ADMINISTRATIVO
  //
  // GET /api/reclamaciones/resumen
  // ===================================================

  router.get(
    '/resumen',
    asyncRoute(async (req, res) => {
      const pool = await getPool();

      const resultado =
        await pool.request().query(`
          SELECT
            COUNT_BIG(*) AS Total,

            COALESCE(SUM(
              CASE
                WHEN Estado = 'REGISTRADO'
                THEN 1 ELSE 0
              END
            ), 0) AS Registrados,

            COALESCE(SUM(
              CASE
                WHEN Estado = 'EN_ATENCION'
                THEN 1 ELSE 0
              END
            ), 0) AS EnAtencion,

            COALESCE(SUM(
              CASE
                WHEN Estado = 'RESPONDIDO'
                THEN 1 ELSE 0
              END
            ), 0) AS Respondidos,

            COALESCE(SUM(
              CASE
                WHEN Estado = 'CERRADO'
                THEN 1 ELSE 0
              END
            ), 0) AS Cerrados

          FROM dbo.Reclamacion
        `);

      res.json(resultado.recordset[0]);
    })
  );

  // ===================================================
  // LISTAR RECLAMACIONES
  //
  // GET /api/reclamaciones
  // ===================================================

  router.get(
    '/',
    asyncRoute(async (req, res) => {
      const q = String(
        req.query.q || ''
      )
        .trim()
        .slice(0, 100);

      const estado = String(
        req.query.estado || ''
      )
        .trim()
        .toUpperCase();

      const tipo = String(
        req.query.tipo || ''
      )
        .trim()
        .toUpperCase();

      if (
        estado &&
        !ESTADOS.includes(estado)
      ) {
        throw errorHttp(
          'Estado de reclamación inválido.'
        );
      }

      if (
        tipo &&
        !TIPOS.includes(tipo)
      ) {
        throw errorHttp(
          'Tipo de solicitud inválido.'
        );
      }

      const pool = await getPool();

      const resultado = await pool.request()
        .input(
          'q',
          sql.NVarChar(110),
          `%${q}%`
        )
        .input(
          'estado',
          sql.NVarChar(15),
          estado
        )
        .input(
          'tipo',
          sql.NVarChar(10),
          tipo
        )
        .query(`
          SELECT TOP (500)
            r.ReclamacionID,
            r.NumeroCorrelativo,
            r.UsuarioID,
            r.ReservaID,
            r.TipoDocumento,
            r.NumeroDocumento,
            r.NombreReclamante,
            r.CorreoReclamante,
            r.TelefonoReclamante,
            r.TipoSolicitud,
            r.Descripcion,
            r.Pedido,
            r.FechaRegistro,
            r.Estado
          FROM dbo.Reclamacion r
          WHERE
            (@estado = '' OR r.Estado = @estado)
            AND
            (@tipo = '' OR r.TipoSolicitud = @tipo)
            AND (
              r.NumeroCorrelativo LIKE @q
              OR r.NombreReclamante LIKE @q
              OR r.NumeroDocumento LIKE @q
              OR r.CorreoReclamante LIKE @q
              OR r.Descripcion LIKE @q
              OR CONVERT(
                VARCHAR(30),
                r.ReclamacionID
              ) LIKE @q
            )
          ORDER BY
            r.FechaRegistro DESC,
            r.ReclamacionID DESC
        `);

      res.json(resultado.recordset);
    })
  );

  // ===================================================
  // DETALLE ADMINISTRATIVO
  //
  // GET /api/reclamaciones/:id
  // ===================================================

  router.get(
    '/:id',
    asyncRoute(async (req, res) => {
      const id = obtenerId(req.params.id);

      const pool = await getPool();

      const resultado = await pool.request()
        .input(
          'id',
          sql.BigInt,
          id
        )
        .query(`
          ${consultaBase}
          WHERE r.ReclamacionID = @id;

          SELECT
            rr.RespuestaID,
            rr.ReclamacionID,
            rr.ResponsableID,
            rr.Contenido,
            rr.FechaRespuesta,
            u.Nombres AS ResponsableNombres,
            u.Apellidos AS ResponsableApellidos
          FROM dbo.RespuestaReclamacion rr
          LEFT JOIN dbo.Usuario u
            ON u.UsuarioID = rr.ResponsableID
          WHERE rr.ReclamacionID = @id
          ORDER BY
            rr.FechaRespuesta,
            rr.RespuestaID;

          SELECT
            h.HistorialID,
            h.ReclamacionID,
            h.ResponsableID,
            h.EstadoAnterior,
            h.EstadoNuevo,
            h.Observacion,
            h.FechaCambio,
            u.Nombres AS ResponsableNombres,
            u.Apellidos AS ResponsableApellidos
          FROM dbo.HistorialReclamacion h
          LEFT JOIN dbo.Usuario u
            ON u.UsuarioID = h.ResponsableID
          WHERE h.ReclamacionID = @id
          ORDER BY
            h.FechaCambio,
            h.HistorialID;
        `);

      const reclamacion =
        resultado.recordsets[0][0];

      if (!reclamacion) {
        return res.status(404).json({
          error:
            'Reclamación no encontrada.'
        });
      }

      return res.json({
        reclamacion,
        respuestas: resultado.recordsets[1],
        historial: resultado.recordsets[2]
      });
    })
  );

  // ===================================================
  // REGISTRAR RECLAMACIÓN ADMINISTRATIVA
  //
  // POST /api/reclamaciones
  // ===================================================

  router.post(
    '/',
    asyncRoute(async (req, res) => {
      const d = reclamacionSchema.parse(
        req.body
      );

      const pool = await getPool();

      const tx = new sql.Transaction(pool);

      await tx.begin(
        sql.ISOLATION_LEVEL.SERIALIZABLE
      );

      try {
        // =============================================
        // VALIDAR USUARIO VINCULADO
        // =============================================

        if (d.usuarioId != null) {
          const usuario =
            await new sql.Request(tx)
              .input(
                'usuarioId',
                sql.BigInt,
                d.usuarioId
              )
              .query(`
                SELECT UsuarioID
                FROM dbo.Usuario
                WHERE UsuarioID = @usuarioId
              `);

          if (!usuario.recordset.length) {
            throw errorHttp(
              'El usuario vinculado no existe.'
            );
          }
        }

        // =============================================
        // VALIDAR RESERVA VINCULADA
        // =============================================

        if (d.reservaId != null) {
          const reserva =
            await new sql.Request(tx)
              .input(
                'reservaId',
                sql.BigInt,
                d.reservaId
              )
              .query(`
                SELECT
                  ReservaID,
                  UsuarioID
                FROM dbo.Reserva
                WHERE ReservaID = @reservaId
              `);

          if (!reserva.recordset.length) {
            throw errorHttp(
              'La reserva vinculada no existe.'
            );
          }

          if (
            d.usuarioId != null &&
            Number(
              reserva.recordset[0].UsuarioID
            ) !== Number(d.usuarioId)
          ) {
            throw errorHttp(
              'La reserva no pertenece al ' +
              'usuario indicado.'
            );
          }
        }

        // =============================================
        // INSERTAR RECLAMACIÓN
        // =============================================

        const resultado =
          await new sql.Request(tx)
            .input(
              'usuarioId',
              sql.BigInt,
              d.usuarioId ?? null
            )
            .input(
              'reservaId',
              sql.BigInt,
              d.reservaId ?? null
            )
            .input(
              'tipoDocumento',
              sql.VarChar(12),
              d.tipoDocumento
            )
            .input(
              'numeroDocumento',
              sql.VarChar(20),
              d.numeroDocumento
            )
            .input(
              'nombre',
              sql.NVarChar(220),
              d.nombreReclamante
            )
            .input(
              'correo',
              sql.NVarChar(254),
              d.correoReclamante
            )
            .input(
              'telefono',
              sql.VarChar(20),
              d.telefonoReclamante || null
            )
            .input(
              'tipoSolicitud',
              sql.VarChar(10),
              d.tipoSolicitud
            )
            .input(
              'descripcion',
              sql.NVarChar(sql.MAX),
              d.descripcion
            )
            .input(
              'pedido',
              sql.NVarChar(sql.MAX),
              d.pedido
            )
            .query(`
              INSERT INTO dbo.Reclamacion (
                UsuarioID,
                ReservaID,
                TipoDocumento,
                NumeroDocumento,
                NombreReclamante,
                CorreoReclamante,
                TelefonoReclamante,
                TipoSolicitud,
                Descripcion,
                Pedido,
                FechaRegistro,
                Estado
              )
              OUTPUT INSERTED.ReclamacionID
              VALUES (
                @usuarioId,
                @reservaId,
                @tipoDocumento,
                @numeroDocumento,
                @nombre,
                @correo,
                @telefono,
                @tipoSolicitud,
                @descripcion,
                @pedido,
                SYSDATETIME(),
                'REGISTRADO'
              )
            `);

        const id =
          resultado.recordset[0].ReclamacionID;

        // =============================================
        // HISTORIAL INICIAL
        // =============================================

        await new sql.Request(tx)
          .input(
            'id',
            sql.BigInt,
            id
          )
          .input(
            'responsableId',
            sql.BigInt,
            req.currentUser.UsuarioID
          )
          .query(`
            INSERT INTO dbo.HistorialReclamacion (
              ReclamacionID,
              ResponsableID,
              EstadoAnterior,
              EstadoNuevo,
              Observacion,
              FechaCambio
            )
            VALUES (
              @id,
              @responsableId,
              NULL,
              'REGISTRADO',
              N'Reclamación recibida y registrada.',
              SYSDATETIME()
            )
          `);

        // =============================================
        // AUDITORÍA
        // =============================================

        await registrarAuditoria({
          tx,
          usuarioId:
            req.currentUser.UsuarioID,
          entidad: 'Reclamacion',
          registroId: id,
          accion: 'INSERT',
          detalle:
            `Registro de ${d.tipoSolicitud} ` +
            `#${id}. Estado REGISTRADO.`
        });

        // =============================================
        // OBTENER CORRELATIVO
        // =============================================

        const consulta =
          await new sql.Request(tx)
            .input(
              'id',
              sql.BigInt,
              id
            )
            .query(`
              SELECT
                ReclamacionID,
                NumeroCorrelativo,
                FechaRegistro,
                Estado
              FROM dbo.Reclamacion
              WHERE ReclamacionID = @id
            `);

        await tx.commit();

        return res.status(201).json({
          ...consulta.recordset[0],

          mensaje:
            'Reclamación registrada correctamente.'
        });

      } catch (error) {
        await rollbackSeguro(tx);
        throw error;
      }
    })
  );

  // ===================================================
  // CAMBIAR ESTADO ADMINISTRATIVO
  //
  // PATCH /api/reclamaciones/:id/estado
  // ===================================================

  router.patch(
    '/:id/estado',
    asyncRoute(async (req, res) => {
      const id = obtenerId(req.params.id);

      const d = estadoSchema.parse(
        req.body
      );

      const pool = await getPool();

      const tx = new sql.Transaction(pool);

      await tx.begin(
        sql.ISOLATION_LEVEL.SERIALIZABLE
      );

      try {
        // =============================================
        // BLOQUEAR RECLAMACIÓN
        // =============================================

        const consulta =
          await new sql.Request(tx)
            .input(
              'id',
              sql.BigInt,
              id
            )
            .query(`
              SELECT
                ReclamacionID,
                Estado
              FROM dbo.Reclamacion WITH (
                UPDLOCK,
                HOLDLOCK
              )
              WHERE ReclamacionID = @id
            `);

        const actual =
          consulta.recordset[0];

        if (!actual) {
          throw errorHttp(
            'Reclamación no encontrada.',
            404
          );
        }

        const anterior = actual.Estado;

        const nuevo = d.estado;

        if (anterior === nuevo) {
          throw errorHttp(
            'La reclamación ya tiene ese estado.'
          );
        }

        // =============================================
        // VALIDAR TRANSICIONES
        // =============================================

        const transiciones = {
          REGISTRADO: ['EN_ATENCION'],
          EN_ATENCION: ['RESPONDIDO'],
          RESPONDIDO: ['CERRADO'],
          CERRADO: []
        };

        if (
          !(transiciones[anterior] || [])
            .includes(nuevo)
        ) {
          throw errorHttp(
            `No se permite cambiar de ` +
            `${anterior} a ${nuevo}.`,
            409
          );
        }

        // =============================================
        // NO RESPONDER SIN RESPUESTA REGISTRADA
        // =============================================

        if (nuevo === 'RESPONDIDO') {
          const respuestas =
            await new sql.Request(tx)
              .input(
                'id',
                sql.BigInt,
                id
              )
              .query(`
                SELECT
                  COUNT_BIG(*) AS Total
                FROM dbo.RespuestaReclamacion
                WHERE ReclamacionID = @id
              `);

          if (
            Number(
              respuestas.recordset[0].Total
            ) === 0
          ) {
            throw errorHttp(
              'Primero registra una respuesta.'
            );
          }
        }

        // =============================================
        // ACTUALIZAR ESTADO
        // =============================================

        await new sql.Request(tx)
          .input(
            'id',
            sql.BigInt,
            id
          )
          .input(
            'estado',
            sql.VarChar(15),
            nuevo
          )
          .query(`
            UPDATE dbo.Reclamacion
            SET Estado = @estado
            WHERE ReclamacionID = @id
          `);

        // =============================================
        // REGISTRAR HISTORIAL
        // =============================================

        await new sql.Request(tx)
          .input(
            'id',
            sql.BigInt,
            id
          )
          .input(
            'responsable',
            sql.BigInt,
            req.currentUser.UsuarioID
          )
          .input(
            'anterior',
            sql.VarChar(15),
            anterior
          )
          .input(
            'nuevo',
            sql.VarChar(15),
            nuevo
          )
          .input(
            'observacion',
            sql.NVarChar(500),
            d.observacion ||
              `Cambio de estado a ${nuevo}.`
          )
          .query(`
            INSERT INTO dbo.HistorialReclamacion (
              ReclamacionID,
              ResponsableID,
              EstadoAnterior,
              EstadoNuevo,
              Observacion,
              FechaCambio
            )
            VALUES (
              @id,
              @responsable,
              @anterior,
              @nuevo,
              @observacion,
              SYSDATETIME()
            )
          `);

        // =============================================
        // AUDITORÍA
        // =============================================

        await registrarAuditoria({
          tx,
          usuarioId:
            req.currentUser.UsuarioID,
          entidad: 'Reclamacion',
          registroId: id,
          accion: 'CAMBIO_ESTADO',
          detalle:
            `Reclamación #${id}. ` +
            `${anterior} -> ${nuevo}. ` +
            `${d.observacion || ''}`
        });

        await tx.commit();

        return res.json({
          ok: true,
          ReclamacionID: id,
          EstadoAnterior: anterior,
          EstadoNuevo: nuevo,

          mensaje:
            'Estado actualizado correctamente.'
        });

      } catch (error) {
        await rollbackSeguro(tx);
        throw error;
      }
    })
  );

  // ===================================================
  // REGISTRAR RESPUESTA ADMINISTRATIVA
  //
  // POST /api/reclamaciones/:id/respuestas
  // ===================================================

  router.post(
    '/:id/respuestas',
    asyncRoute(async (req, res) => {
      const id = obtenerId(
        req.params.id
      );

      const d = respuestaSchema.parse(
        req.body
      );

      const pool = await getPool();

      const tx = new sql.Transaction(pool);

      await tx.begin(
        sql.ISOLATION_LEVEL.SERIALIZABLE
      );

      try {
        // =============================================
        // CONSULTAR ESTADO Y BLOQUEAR REGISTRO
        // =============================================

        const consulta =
          await new sql.Request(tx)
            .input(
              'id',
              sql.BigInt,
              id
            )
            .query(`
              SELECT
                Estado
              FROM dbo.Reclamacion WITH (
                UPDLOCK,
                HOLDLOCK
              )
              WHERE ReclamacionID = @id
            `);

        const actual =
          consulta.recordset[0];

        if (!actual) {
          throw errorHttp(
            'Reclamación no encontrada.',
            404
          );
        }

        if (
          actual.Estado !== 'EN_ATENCION'
        ) {
          throw errorHttp(
            'La reclamación debe estar ' +
            'EN_ATENCION para registrar ' +
            'una respuesta.',
            409
          );
        }

        // =============================================
        // REGISTRAR RESPUESTA
        // =============================================

        const resultado =
          await new sql.Request(tx)
            .input(
              'id',
              sql.BigInt,
              id
            )
            .input(
              'responsableId',
              sql.BigInt,
              req.currentUser.UsuarioID
            )
            .input(
              'contenido',
              sql.NVarChar(sql.MAX),
              d.contenido
            )
            .query(`
              INSERT INTO dbo.RespuestaReclamacion (
                ReclamacionID,
                ResponsableID,
                Contenido,
                FechaRespuesta
              )
              OUTPUT INSERTED.RespuestaID
              VALUES (
                @id,
                @responsableId,
                @contenido,
                SYSDATETIME()
              )
            `);

        const respuestaId =
          resultado.recordset[0].RespuestaID;

        // =============================================
        // CAMBIAR ESTADO A RESPONDIDO
        // =============================================

        await new sql.Request(tx)
          .input(
            'id',
            sql.BigInt,
            id
          )
          .query(`
            UPDATE dbo.Reclamacion
            SET Estado = 'RESPONDIDO'
            WHERE ReclamacionID = @id
          `);

        // =============================================
        // REGISTRAR HISTORIAL DE RESPUESTA
        // =============================================

        await new sql.Request(tx)
          .input(
            'id',
            sql.BigInt,
            id
          )
          .input(
            'responsableId',
            sql.BigInt,
            req.currentUser.UsuarioID
          )
          .query(`
            INSERT INTO dbo.HistorialReclamacion (
              ReclamacionID,
              ResponsableID,
              EstadoAnterior,
              EstadoNuevo,
              Observacion,
              FechaCambio
            )
            VALUES (
              @id,
              @responsableId,
              'EN_ATENCION',
              'RESPONDIDO',
              N'Respuesta registrada por personal autorizado.',
              SYSDATETIME()
            )
          `);

        // =============================================
        // AUDITORÍA DE RESPUESTA
        // =============================================

        await registrarAuditoria({
          tx,
          usuarioId:
            req.currentUser.UsuarioID,
          entidad: 'RespuestaReclamacion',
          registroId: respuestaId,
          accion: 'INSERT',
          detalle:
            `Respuesta #${respuestaId} ` +
            `registrada para reclamación #${id}.`
        });

        // =============================================
        // AUDITORÍA DEL CAMBIO DE ESTADO
        // =============================================

        await registrarAuditoria({
          tx,
          usuarioId:
            req.currentUser.UsuarioID,
          entidad: 'Reclamacion',
          registroId: id,
          accion: 'CAMBIO_ESTADO',
          detalle:
            `Reclamación #${id}. ` +
            'EN_ATENCION -> RESPONDIDO.'
        });

        await tx.commit();

        return res.status(201).json({
          RespuestaID: respuestaId,
          ReclamacionID: id,
          Estado: 'RESPONDIDO',

          mensaje:
            'Respuesta registrada correctamente.'
        });

      } catch (error) {
        await rollbackSeguro(tx);
        throw error;
      }
    })
  );

  return router;
}
