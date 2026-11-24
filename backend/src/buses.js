
import { Router } from 'express';
import { z } from 'zod';

import { getPool, sql } from './db.js';

// =====================================================
// SIGET-VÍA — GESTIÓN DE BUSES
// PASO 172.9.3.1
//
// RF8 — Gestión de buses
//
// NUEVO:
// - Catálogo de tipos de servicio
// - ECONOMICO, EJECUTIVO, CAMA, SUITE
// - TipoServicioID asociado al bus
// - Consulta y búsqueda por categoría
// - Validación de servicios activos
//
// SE CONSERVA:
// - Registro de buses
// - Edición completa
// - Validación de placas duplicadas
// - Estados operativos
// - Distribución de asientos por pisos
// - Protección de viajes y reservas
// - Generación de numeración de asientos
// =====================================================

// =====================================================
// VALIDACIONES
// =====================================================

const estadoSchema = z.enum([
  'OPERATIVO',
  'MANTENIMIENTO',
  'INACTIVO'
]);

// Es opcional temporalmente para mantener
// compatibilidad con el frontend existente.
//
// Si el frontend envía null en una edición,
// se interpreta como una solicitud explícita
// para quitar la categoría del bus.
//
// Si no envía la propiedad, se conserva
// la categoría ya asignada.

const tipoServicioSchema = z
  .number()
  .int('El tipo de servicio debe ser un entero')
  .positive('Selecciona un tipo de servicio válido')
  .max(2147483647)
  .nullable()
  .optional();

const busSchema = z.object({
  placa: z.string()
    .trim()
    .min(
      5,
      'La placa debe tener al menos 5 caracteres'
    )
    .max(
      12,
      'La placa no puede superar 12 caracteres'
    )
    .regex(
      /^[A-Za-z0-9-]+$/,
      'La placa solo admite letras, números y guiones'
    )
    .transform(v => v.toUpperCase()),

  modelo: z.string()
    .trim()
    .min(
      2,
      'El modelo debe tener al menos 2 caracteres'
    )
    .max(
      100,
      'El modelo no puede superar 100 caracteres'
    ),

  capacidad: z.number()
    .int(
      'La capacidad debe ser un número entero'
    )
    .min(
      1,
      'La capacidad mínima es 1'
    )
    .max(
      200,
      'La capacidad máxima es 200'
    ),

  asientosPrimerPiso: z.number()
    .int()
    .min(
      1,
      'Debe existir al menos un asiento en el primer nivel'
    )
    .max(200),

  asientosSegundoPiso: z.number()
    .int()
    .min(0)
    .max(200),

  estado: estadoSchema,

  tipoServicioId: tipoServicioSchema
}).refine(
  datos =>
    datos.asientosPrimerPiso +
      datos.asientosSegundoPiso ===
    datos.capacidad,
  {
    path: ['capacidad'],
    message:
      'La suma de asientos por nivel debe ser igual a la capacidad'
  }
);

const idSchema = z.coerce
  .number()
  .int()
  .positive()
  .max(2147483647);

// =====================================================
// ERRORES CONTROLADOS
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

// =====================================================
// VALIDAR DATOS DEL BUS
// =====================================================

function validarBus(body) {
  const resultado = busSchema.safeParse(body);

  if (!resultado.success) {
    throw errorHttp(
      resultado.error.issues[0]?.message ||
      'Los datos del bus no son válidos'
    );
  }

  return resultado.data;
}

// =====================================================
// VALIDAR IDENTIFICADOR
// =====================================================

function obtenerId(valor) {
  const resultado = idSchema.safeParse(valor);

  if (!resultado.success) {
    throw errorHttp(
      'El identificador del bus es inválido'
    );
  }

  return resultado.data;
}

// =====================================================
// CONSULTA GENERAL DE BUSES
//
// Mantiene los campos que consume el frontend.
// Agrega TipoServicioID y TipoServicio.
// =====================================================

const consulta = `
  SELECT
    b.BusID,
    b.Placa,
    b.Modelo,
    b.Capacidad,
    b.Estado,
    b.TipoServicioID,

    ts.Nombre AS TipoServicio,
    ts.Descripcion AS DescripcionServicio,
    ts.Estado AS EstadoTipoServicio,

    (
      SELECT COUNT(*)
      FROM dbo.Asiento a
      WHERE a.BusID = b.BusID
    ) AS AsientosRegistrados,

    (
      SELECT COUNT(*)
      FROM dbo.Asiento a
      WHERE a.BusID = b.BusID
        AND a.Nivel = 1
    ) AS AsientosPrimerPiso,

    (
      SELECT COUNT(*)
      FROM dbo.Asiento a
      WHERE a.BusID = b.BusID
        AND a.Nivel = 2
    ) AS AsientosSegundoPiso

  FROM dbo.Bus b

  LEFT JOIN dbo.TipoServicio ts
    ON ts.TipoServicioID = b.TipoServicioID
`;

// =====================================================
// PARÁMETROS SQL DEL BUS
// =====================================================

function campos(request, datos) {
  return request
    .input(
      'placa',
      sql.VarChar(12),
      datos.placa
    )
    .input(
      'modelo',
      sql.NVarChar(100),
      datos.modelo
    )
    .input(
      'capacidad',
      sql.SmallInt,
      datos.capacidad
    )
    .input(
      'estado',
      sql.VarChar(20),
      datos.estado
    )
    .input(
      'tipoServicioId',
      sql.Int,
      datos.tipoServicioId ?? null
    );
}

// =====================================================
// VALIDAR TIPO DE SERVICIO
//
// - NULL: permitido por compatibilidad.
// - ID existente: obligatorio.
// - Nuevas asignaciones: servicio ACTIVO.
// - Un servicio INACTIVO previamente asignado
//   puede conservarse sin cambiarlo.
// =====================================================

async function validarTipoServicio(
  tx,
  tipoServicioId,
  tipoServicioAnterior = null
) {
  if (
    tipoServicioId === null ||
    tipoServicioId === undefined
  ) {
    return;
  }

  const resultado = await new sql.Request(tx)
    .input(
      'tipoServicioId',
      sql.Int,
      tipoServicioId
    )
    .query(`
      SELECT
        TipoServicioID,
        Nombre,
        Estado
      FROM dbo.TipoServicio WITH (HOLDLOCK)
      WHERE TipoServicioID = @tipoServicioId
    `);

  if (!resultado.recordset.length) {
    throw errorHttp(
      'El tipo de servicio seleccionado no existe'
    );
  }

  const servicio = resultado.recordset[0];

  if (
    servicio.Estado !== 'ACTIVO' &&
    Number(tipoServicioAnterior) !==
      Number(tipoServicioId)
  ) {
    throw errorHttp(
      'El tipo de servicio seleccionado no está activo'
    );
  }
}

// =====================================================
// GENERAR ASIENTOS POR NIVEL
//
// Se conserva la numeración existente:
// - Segundo piso: números iniciales
// - Primer piso: números finales
//
// Ejemplo de 50 asientos:
// - Segundo piso: 01 al 40
// - Primer piso: 41 al 50
// =====================================================

async function generarAsientos(
  tx,
  busId,
  primerPiso,
  segundoPiso
) {
  const total = primerPiso + segundoPiso;

  const resultado = await new sql.Request(tx)
    .input(
      'busId',
      sql.Int,
      busId
    )
    .input(
      'total',
      sql.Int,
      total
    )
    .input(
      'segundo',
      sql.Int,
      segundoPiso
    )
    .query(`
      ;WITH Numeros AS (
        SELECT 1 AS Numero

        UNION ALL

        SELECT Numero + 1
        FROM Numeros
        WHERE Numero < @total
      )

      INSERT INTO dbo.Asiento (
        BusID,
        Numero,
        Nivel
      )

      SELECT
        @busId,
        Numero,
        CASE
          WHEN Numero <= @segundo THEN 2
          ELSE 1
        END

      FROM Numeros

      OPTION (MAXRECURSION 0);
    `);

  if (resultado.rowsAffected[0] !== total) {
    throw errorHttp(
      'No se generó la cantidad esperada de asientos'
    );
  }
}

// =====================================================
// CONSULTAR DISTRIBUCIÓN EXISTENTE
// =====================================================

async function consultarDistribucion(
  tx,
  busId
) {
  const resultado = await new sql.Request(tx)
    .input(
      'busId',
      sql.Int,
      busId
    )
    .query(`
      SELECT
        COUNT(*) AS Total,

        COUNT(
          CASE
            WHEN Nivel = 1 THEN 1
          END
        ) AS PrimerPiso,

        COUNT(
          CASE
            WHEN Nivel = 2 THEN 1
          END
        ) AS SegundoPiso

      FROM dbo.Asiento WITH (
        UPDLOCK,
        HOLDLOCK
      )

      WHERE BusID = @busId
    `);

  return resultado.recordset[0];
}

// =====================================================
// VALIDAR DEPENDENCIAS
//
// Evita modificar los identificadores de asientos
// cuando existen viajes o reservas relacionados.
// =====================================================

async function consultarDependencias(
  tx,
  busId
) {
  const resultado = await new sql.Request(tx)
    .input(
      'busId',
      sql.Int,
      busId
    )
    .query(`
      SELECT
        (
          SELECT COUNT_BIG(*)
          FROM dbo.Viaje WITH (
            UPDLOCK,
            HOLDLOCK
          )
          WHERE BusID = @busId
        ) AS TotalViajes,

        (
          SELECT COUNT_BIG(*)
          FROM dbo.ReservaAsiento WITH (
            UPDLOCK,
            HOLDLOCK
          )
          WHERE BusID = @busId
        ) AS TotalReservas
    `);

  return resultado.recordset[0];
}

// =====================================================
// ROUTER DE BUSES
// =====================================================

export function createBusesRouter({
  auth,
  activeUser,
  admin,
  asyncRoute
}) {
  const router = Router();

  // Módulo exclusivamente administrativo.
  router.use(
    auth,
    activeUser,
    admin
  );

  // ===================================================
  // NUEVO — LISTAR TIPOS DE SERVICIO
  //
  // GET /api/buses/tipos-servicio
  //
  // Respuesta:
  // [
  //   {
  //     TipoServicioID: 1,
  //     Nombre: 'ECONOMICO',
  //     Descripcion: '...',
  //     Estado: 'ACTIVO'
  //   }
  // ]
  //
  // Esta ruta debe estar ANTES de /:id.
  // ===================================================

  router.get(
    '/tipos-servicio',
    asyncRoute(async (req, res) => {
      const pool = await getPool();

      const resultado = await pool.request()
        .query(`
          SELECT
            TipoServicioID,
            Nombre,
            Descripcion,
            Estado

          FROM dbo.TipoServicio

          ORDER BY TipoServicioID
        `);

      return res.json(
        resultado.recordset
      );
    })
  );

  // ===================================================
  // LISTAR Y BUSCAR BUSES
  //
  // GET /api/buses
  // GET /api/buses?q=ABC
  // GET /api/buses?q=ECONOMICO
  // ===================================================

  router.get(
    '/',
    asyncRoute(async (req, res) => {
      const q = String(
        req.query.q || ''
      )
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
          ${consulta}

          WHERE
            b.Placa LIKE @q

            OR b.Modelo LIKE @q

            OR ts.Nombre LIKE @q

          ORDER BY b.BusID DESC
        `);

      return res.json(
        resultado.recordset
      );
    })
  );

  // ===================================================
  // CONSULTAR ASIENTOS DE UN BUS
  //
  // GET /api/buses/:id/asientos
  // ===================================================

  router.get(
    '/:id/asientos',
    asyncRoute(async (req, res) => {
      const id = obtenerId(
        req.params.id
      );

      const pool = await getPool();

      const bus = await pool.request()
        .input(
          'id',
          sql.Int,
          id
        )
        .query(`
          ${consulta}
          WHERE b.BusID = @id
        `);

      if (!bus.recordset.length) {
        return res.status(404).json({
          error: 'Bus no encontrado'
        });
      }

      const resultado = await pool.request()
        .input(
          'id',
          sql.Int,
          id
        )
        .query(`
          SELECT
            AsientoID,
            BusID,
            Numero,
            Nivel

          FROM dbo.Asiento

          WHERE BusID = @id

          ORDER BY Nivel, Numero
        `);

      return res.json({
        bus: bus.recordset[0],
        asientos: resultado.recordset
      });
    })
  );

  // ===================================================
  // CONSULTAR DETALLE DE BUS
  //
  // GET /api/buses/:id
  // ===================================================

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
          sql.Int,
          id
        )
        .query(`
          ${consulta}
          WHERE b.BusID = @id
        `);

      if (!resultado.recordset.length) {
        return res.status(404).json({
          error: 'Bus no encontrado'
        });
      }

      return res.json(
        resultado.recordset[0]
      );
    })
  );

  // ===================================================
  // REGISTRAR BUS Y ASIENTOS
  //
  // POST /api/buses
  //
  // NUEVO:
  // tipoServicioId puede enviarse junto
  // con el resto de los datos.
  //
  // Si todavía no se envía, se guarda NULL.
  // ===================================================

  router.post(
    '/',
    asyncRoute(async (req, res) => {
      const datos = validarBus(
        req.body
      );

      const pool = await getPool();

      const tx = new sql.Transaction(pool);

      await tx.begin(
        sql.ISOLATION_LEVEL.SERIALIZABLE
      );

      try {
        // =========================================
        // VALIDAR PLACA DUPLICADA
        // =========================================

        const duplicado = await new sql.Request(tx)
          .input(
            'placa',
            sql.VarChar(12),
            datos.placa
          )
          .query(`
            SELECT BusID

            FROM dbo.Bus WITH (
              UPDLOCK,
              HOLDLOCK
            )

            WHERE Placa = @placa
          `);

        if (duplicado.recordset.length) {
          await tx.rollback();

          return res.status(409).json({
            error:
              'La placa ya está registrada'
          });
        }

        // =========================================
        // VALIDAR TIPO DE SERVICIO
        // =========================================

        await validarTipoServicio(
          tx,
          datos.tipoServicioId ?? null
        );

        // =========================================
        // REGISTRAR BUS
        // =========================================

        const registro = await campos(
          new sql.Request(tx),
          datos
        ).query(`
          INSERT INTO dbo.Bus (
            Placa,
            Modelo,
            Capacidad,
            Estado,
            TipoServicioID
          )

          OUTPUT INSERTED.BusID

          VALUES (
            @placa,
            @modelo,
            @capacidad,
            @estado,
            @tipoServicioId
          )
        `);

        const busId =
          registro.recordset[0].BusID;

        // =========================================
        // GENERAR ASIENTOS POR NIVEL
        // =========================================

        await generarAsientos(
          tx,
          busId,
          datos.asientosPrimerPiso,
          datos.asientosSegundoPiso
        );

        await tx.commit();

        return res.status(201).json({
          BusID: busId,
          TipoServicioID:
            datos.tipoServicioId ?? null,
          mensaje:
            'Bus y asientos registrados correctamente'
        });
      } catch (error) {
        await tx.rollback()
          .catch(() => {});

        throw error;
      }
    })
  );

  // ===================================================
  // EDITAR BUS COMPLETO
  //
  // PUT /api/buses/:id
  //
  // Permite modificar:
  // - Placa
  // - Modelo
  // - Capacidad
  // - Estado
  // - Tipo de servicio
  // - Distribución por pisos
  //
  // Si hay viajes o reservas, protege la
  // capacidad y distribución existentes.
  //
  // El cambio de tipo de servicio NO elimina
  // ni regenera los asientos.
  // ===================================================

  router.put(
    '/:id',
    asyncRoute(async (req, res) => {
      const id = obtenerId(
        req.params.id
      );

      const datos = validarBus(
        req.body
      );

      const pool = await getPool();

      const tx = new sql.Transaction(pool);

      await tx.begin(
        sql.ISOLATION_LEVEL.SERIALIZABLE
      );

      try {
        // =========================================
        // OBTENER BUS ACTUAL
        // =========================================

        const actual = await new sql.Request(tx)
          .input(
            'id',
            sql.Int,
            id
          )
          .query(`
            SELECT
              BusID,
              Placa,
              Modelo,
              Capacidad,
              Estado,
              TipoServicioID

            FROM dbo.Bus WITH (
              UPDLOCK,
              HOLDLOCK
            )

            WHERE BusID = @id
          `);

        if (!actual.recordset.length) {
          await tx.rollback();

          return res.status(404).json({
            error: 'Bus no encontrado'
          });
        }

        const busActual =
          actual.recordset[0];

        // =========================================
        // VALIDAR PLACA DUPLICADA
        // =========================================

        const duplicado = await new sql.Request(tx)
          .input(
            'id',
            sql.Int,
            id
          )
          .input(
            'placa',
            sql.VarChar(12),
            datos.placa
          )
          .query(`
            SELECT BusID

            FROM dbo.Bus WITH (
              UPDLOCK,
              HOLDLOCK
            )

            WHERE Placa = @placa
              AND BusID <> @id
          `);

        if (duplicado.recordset.length) {
          await tx.rollback();

          return res.status(409).json({
            error:
              'La placa pertenece a otro bus'
          });
        }

        // =========================================
        // RESOLVER TIPO DE SERVICIO
        //
        // undefined: conservar el anterior
        // null: quitar asignación
        // número: asignar ese servicio
        // =========================================

        const tipoServicioAnterior =
          busActual.TipoServicioID ?? null;

        const tipoServicioId =
          datos.tipoServicioId === undefined
            ? tipoServicioAnterior
            : datos.tipoServicioId;

        await validarTipoServicio(
          tx,
          tipoServicioId,
          tipoServicioAnterior
        );

        // =========================================
        // REVISAR DISTRIBUCIÓN EXISTENTE
        // =========================================

        const anterior =
          await consultarDistribucion(
            tx,
            id
          );

        const cambioDistribucion =
          Number(busActual.Capacidad) !==
            datos.capacidad ||

          Number(anterior.Total) !==
            datos.capacidad ||

          Number(anterior.PrimerPiso) !==
            datos.asientosPrimerPiso ||

          Number(anterior.SegundoPiso) !==
            datos.asientosSegundoPiso;

        // =========================================
        // PROTEGER VIAJES Y RESERVAS
        // =========================================

        if (cambioDistribucion) {
          const dependencias =
            await consultarDependencias(
              tx,
              id
            );

          if (
            Number(dependencias.TotalViajes) > 0 ||
            Number(dependencias.TotalReservas) > 0
          ) {
            await tx.rollback();

            return res.status(409).json({
              error:
                'No se puede cambiar la capacidad ' +
                'ni la distribución de asientos porque ' +
                'este bus tiene viajes o reservas ' +
                'relacionados. Puedes editar la placa, ' +
                'el modelo, el estado operativo ' +
                'y el tipo de servicio.'
            });
          }
        }

        // =========================================
        // ACTUALIZAR DATOS DEL BUS
        // =========================================

        const datosActualizacion = {
          ...datos,
          tipoServicioId
        };

        await campos(
          new sql.Request(tx)
            .input(
              'id',
              sql.Int,
              id
            ),
          datosActualizacion
        ).query(`
          UPDATE dbo.Bus

          SET
            Placa = @placa,
            Modelo = @modelo,
            Capacidad = @capacidad,
            Estado = @estado,
            TipoServicioID = @tipoServicioId

          WHERE BusID = @id
        `);

        // =========================================
        // REGENERAR ASIENTOS ÚNICAMENTE CUANDO
        // SE PERMITE CAMBIAR LA DISTRIBUCIÓN
        // =========================================

        if (cambioDistribucion) {
          await new sql.Request(tx)
            .input(
              'id',
              sql.Int,
              id
            )
            .query(`
              DELETE FROM dbo.Asiento
              WHERE BusID = @id
            `);

          await generarAsientos(
            tx,
            id,
            datos.asientosPrimerPiso,
            datos.asientosSegundoPiso
          );
        }

        await tx.commit();

        return res.json({
          BusID: id,
          TipoServicioID: tipoServicioId,
          mensaje: cambioDistribucion
            ? 'Bus y distribución actualizados correctamente'
            : 'Datos generales del bus actualizados correctamente'
        });
      } catch (error) {
        await tx.rollback()
          .catch(() => {});

        throw error;
      }
    })
  );

  // ===================================================
  // CAMBIAR ESTADO OPERATIVO
  //
  // PATCH /api/buses/:id/estado
  //
  // Se conserva el funcionamiento original.
  // No modifica TipoServicioID.
  // ===================================================

  router.patch(
    '/:id/estado',
    asyncRoute(async (req, res) => {
      const id = obtenerId(
        req.params.id
      );

      const resultadoValidacion = z.object({
        estado: estadoSchema
      }).safeParse(req.body);

      if (!resultadoValidacion.success) {
        return res.status(400).json({
          error:
            'Selecciona OPERATIVO, MANTENIMIENTO o INACTIVO.'
        });
      }

      const { estado } =
        resultadoValidacion.data;

      const pool = await getPool();

      const resultado = await pool.request()
        .input(
          'id',
          sql.Int,
          id
        )
        .input(
          'estado',
          sql.VarChar(20),
          estado
        )
        .query(`
          UPDATE dbo.Bus

          SET Estado = @estado

          WHERE BusID = @id
        `);

      if (!resultado.rowsAffected[0]) {
        return res.status(404).json({
          error: 'Bus no encontrado'
        });
      }

      return res.json({
        BusID: id,
        Estado: estado,
        mensaje:
          'Estado del bus actualizado correctamente'
      });
    })
  );

  return router;
}
