
import { Router } from 'express';
import { z } from 'zod';
import { getPool, sql } from './db.js';

// ==================================================
// SIGET-VÍA — GESTIÓN DE AUDITORÍA
// PASO 162
// ==================================================
// Consulta histórica y trazabilidad.
// Acceso exclusivo para administradores.
// No permite insertar, editar ni eliminar eventos.
// ==================================================

const accionesPermitidas = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'CAMBIO_ESTADO',
  'LOGIN',
  'OTRO'
];

function errorHttp(mensaje, statusCode = 400) {
  return Object.assign(
    new Error(mensaje),
    { statusCode }
  );
}

const idSchema = z.coerce
  .number()
  .int()
  .positive()
  .safe();

function obtenerId(valor) {
  const resultado = idSchema.safeParse(valor);

  if (!resultado.success) {
    throw errorHttp(
      'El identificador de auditoría no es válido.'
    );
  }

  return resultado.data;
}

function fechaValida(valor) {
  if (!valor) return true;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    return false;
  }

  const [anio, mes, dia] = valor
    .split('-')
    .map(Number);

  const fecha = new Date(
    Date.UTC(anio, mes - 1, dia)
  );

  return (
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia
  );
}

function validarFiltros(query) {
  const esquema = z.object({
    q: z.string()
      .trim()
      .max(100)
      .optional()
      .default(''),

    accion: z.string()
      .trim()
      .optional()
      .default(''),

    entidad: z.string()
      .trim()
      .max(70)
      .optional()
      .default(''),

    usuarioId: z.string()
      .trim()
      .optional()
      .default(''),

    desde: z.string()
      .trim()
      .optional()
      .default(''),

    hasta: z.string()
      .trim()
      .optional()
      .default('')
  });

  const resultado = esquema.safeParse(query);

  if (!resultado.success) {
    throw errorHttp(
      'Los filtros de auditoría son inválidos.'
    );
  }

  const filtros = resultado.data;

  if (
    filtros.accion &&
    !accionesPermitidas.includes(filtros.accion)
  ) {
    throw errorHttp(
      'La acción seleccionada no es válida.'
    );
  }

  if (
    !fechaValida(filtros.desde) ||
    !fechaValida(filtros.hasta)
  ) {
    throw errorHttp(
      'El rango de fechas no es válido.'
    );
  }

  if (
    filtros.desde &&
    filtros.hasta &&
    filtros.desde > filtros.hasta
  ) {
    throw errorHttp(
      'La fecha inicial no puede superar la final.'
    );
  }

  let usuarioId = null;

  if (filtros.usuarioId) {
    const usuario = idSchema.safeParse(
      filtros.usuarioId
    );

    if (!usuario.success) {
      throw errorHttp(
        'El usuario seleccionado no es válido.'
      );
    }

    usuarioId = usuario.data;
  }

  return {
    ...filtros,
    usuarioId
  };
}

// ==================================================
// CONSULTA BASE
// ==================================================

const consultaBase = `
  FROM dbo.Auditoria a
  LEFT JOIN dbo.Usuario u
    ON u.UsuarioID = a.UsuarioID
`;

// ==================================================
// ROUTER
// ==================================================

export function createAuditoriaRouter({
  auth,
  activeUser,
  admin,
  asyncRoute
}) {
  const router = Router();

  router.use(
    auth,
    activeUser,
    admin
  );

  // ===============================================
  // GET /api/auditoria/catalogos
  // ===============================================

  router.get(
    '/catalogos',
    asyncRoute(async (req, res) => {
      const pool = await getPool();

      const resultado = await pool.request().query(`
        SELECT DISTINCT Entidad
        FROM dbo.Auditoria
        WHERE Entidad IS NOT NULL
        ORDER BY Entidad;

        SELECT
          UsuarioID,
          Nombres,
          Apellidos,
          Estado
        FROM dbo.Usuario
        ORDER BY Apellidos, Nombres;
      `);

      return res.json({
        acciones: accionesPermitidas,
        entidades: resultado.recordsets[0],
        usuarios: resultado.recordsets[1]
      });
    })
  );

  // ===============================================
  // GET /api/auditoria/resumen
  // ===============================================

  router.get(
    '/resumen',
    asyncRoute(async (req, res) => {
      const pool = await getPool();

      const resultado = await pool.request().query(`
        SELECT
          COUNT_BIG(*) AS TotalEventos,

          COALESCE(
            SUM(
              CASE
                WHEN Accion = 'INSERT'
                THEN 1
                ELSE 0
              END
            ),
            0
          ) AS Inserciones,

          COALESCE(
            SUM(
              CASE
                WHEN Accion = 'CAMBIO_ESTADO'
                THEN 1
                ELSE 0
              END
            ),
            0
          ) AS CambiosEstado,

          COALESCE(
            SUM(
              CASE
                WHEN Accion = 'UPDATE'
                THEN 1
                ELSE 0
              END
            ),
            0
          ) AS Actualizaciones,

          COALESCE(
            SUM(
              CASE
                WHEN Accion = 'LOGIN'
                THEN 1
                ELSE 0
              END
            ),
            0
          ) AS IniciosSesion,

          COUNT(DISTINCT UsuarioID)
            AS UsuariosInvolucrados

        FROM dbo.Auditoria
      `);

      return res.json(
        resultado.recordset[0]
      );
    })
  );

  // ===============================================
  // GET /api/auditoria
  // CONSULTA CON FILTROS
  // ===============================================

  router.get(
    '/',
    asyncRoute(async (req, res) => {
      const filtros = validarFiltros(
        req.query
      );

      const pool = await getPool();

      const resultado = await pool.request()
        .input(
          'q',
          sql.NVarChar(110),
          `%${filtros.q}%`
        )
        .input(
          'accion',
          sql.VarChar(20),
          filtros.accion
        )
        .input(
          'entidad',
          sql.VarChar(70),
          filtros.entidad
        )
        .input(
          'usuarioId',
          sql.BigInt,
          filtros.usuarioId
        )
        .input(
          'desde',
          sql.VarChar(10),
          filtros.desde
        )
        .input(
          'hasta',
          sql.VarChar(10),
          filtros.hasta
        )
        .query(`
          SELECT TOP (500)
            a.AuditoriaID,
            a.UsuarioID,
            a.Entidad,
            a.RegistroID,
            a.Accion,
            a.Detalle,
            a.Fecha,

            u.Nombres AS UsuarioNombres,
            u.Apellidos AS UsuarioApellidos,
            u.Correo AS UsuarioCorreo

          ${consultaBase}

          WHERE
            (
              @accion = ''
              OR a.Accion = @accion
            )

            AND (
              @entidad = ''
              OR a.Entidad = @entidad
            )

            AND (
              @usuarioId IS NULL
              OR a.UsuarioID = @usuarioId
            )

            AND (
              @desde = ''
              OR a.Fecha >=
                TRY_CONVERT(date, @desde, 23)
            )

            AND (
              @hasta = ''
              OR a.Fecha <
                DATEADD(
                  DAY,
                  1,
                  TRY_CONVERT(date, @hasta, 23)
                )
            )

            AND (
              a.Entidad LIKE @q
              OR a.Accion LIKE @q
              OR a.Detalle LIKE @q
              OR u.Nombres LIKE @q
              OR u.Apellidos LIKE @q
              OR u.Correo LIKE @q
              OR CONVERT(
                VARCHAR(30),
                a.AuditoriaID
              ) LIKE @q
            )

          ORDER BY
            a.Fecha DESC,
            a.AuditoriaID DESC
        `);

      return res.json(
        resultado.recordset
      );
    })
  );

  // ===============================================
  // GET /api/auditoria/:id
  // DETALLE INDIVIDUAL
  // ===============================================

  router.get(
    '/:id',
    asyncRoute(async (req, res) => {
      const id = obtenerId(
        req.params.id
      );

      const pool = await getPool();

      const resultado = await pool.request()
        .input(
          'id',
          sql.BigInt,
          id
        )
        .query(`
          SELECT
            a.AuditoriaID,
            a.UsuarioID,
            a.Entidad,
            a.RegistroID,
            a.Accion,
            a.Detalle,
            a.Fecha,

            u.Nombres AS UsuarioNombres,
            u.Apellidos AS UsuarioApellidos,
            u.Correo AS UsuarioCorreo,
            u.RolID

          ${consultaBase}

          WHERE
            a.AuditoriaID = @id
        `);

      if (!resultado.recordset.length) {
        return res.status(404).json({
          error:
            'Registro de auditoría no encontrado.'
        });
      }

      return res.json(
        resultado.recordset[0]
      );
    })
  );

  // =================================================
  // PROTECCIÓN DEL HISTORIAL
  // =================================================
  //
  // No se implementan:
  //
  // POST /api/auditoria
  // PUT /api/auditoria/:id
  // PATCH /api/auditoria/:id
  // DELETE /api/auditoria/:id
  //
  // Los eventos son generados exclusivamente
  // por las operaciones auditadas del backend.
  //
  // No se modifican los registros históricos.
  // =================================================

  return router;
}
