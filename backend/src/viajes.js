
import { Router } from 'express';
import { z } from 'zod';
import { getPool, sql } from './db.js';

// =====================================================
// SIGET-VÍA — GESTIÓN DE VIAJES
// PASO 183 — AUDITORÍA DE CAMBIOS DE ESTADO
// =====================================================

const ESTADOS = [
  'PROGRAMADO',
  'EN_CURSO',
  'FINALIZADO',
  'CANCELADO'
];

const TRANSICIONES = {
  PROGRAMADO: ['EN_CURSO', 'CANCELADO'],
  EN_CURSO: ['PROGRAMADO', 'FINALIZADO'],
  FINALIZADO: [],
  CANCELADO: []
};

function errorHttp(mensaje, statusCode = 400) {
  return Object.assign(new Error(mensaje), {
    statusCode
  });
}

const idSchema = z.coerce.number()
  .int()
  .positive()
  .safe();

function obtenerId(valor) {
  const resultado = idSchema.safeParse(valor);
  if (!resultado.success) {
    throw errorHttp('Identificador de viaje inválido.');
  }
  return resultado.data;
}

// =====================================================
// VALIDACIONES DE FECHAS
// =====================================================

function fechaHoraValida(valor) {
  if (
    typeof valor !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valor)
  ) {
    return false;
  }

  const fecha = new Date(`${valor}:00Z`);

  return (
    !Number.isNaN(fecha.getTime()) &&
    fecha.toISOString().slice(0, 16) === valor
  );
}

const fechaSchema = z.string().refine(
  fechaHoraValida,
  'La fecha debe tener el formato AAAA-MM-DDTHH:mm y ser válida.'
);

const viajeSchema = z.object({
  rutaId: z.number().int().positive(),
  busId: z.number().int().positive(),
  conductorId: z.number().int().positive(),

  salida: fechaSchema,
  llegadaEstimada: fechaSchema,

  tarifa: z.number()
    .finite()
    .min(0)
    .max(9999999999.99)
    .refine(
      n =>
        Math.abs(
          n * 100 - Math.round(n * 100)
        ) < 0.00001,
      'La tarifa admite como máximo dos decimales.'
    ),

  estado: z.enum(ESTADOS)
}).refine(
  datos => datos.llegadaEstimada > datos.salida,
  {
    path: ['llegadaEstimada'],
    message:
      'La llegada estimada debe ser posterior a la salida.'
  }
);

function validarViaje(body) {
  const resultado = viajeSchema.safeParse(body);

  if (!resultado.success) {
    throw errorHttp(
      resultado.error.issues[0]?.message ||
      'Los datos del viaje son inválidos.'
    );
  }

  return resultado.data;
}

// =====================================================
// MANEJO DE FECHAS — HORARIO DE PERÚ
// =====================================================

function fechaSQL(valor) {
  return new Date(`${valor}:00Z`);
}

function fechaAlmacenada(valor) {
  if (valor instanceof Date) {
    return valor.toISOString().slice(0, 19);
  }

  return String(valor)
    .replace(' ', 'T')
    .replace(/Z$/, '')
    .slice(0, 19);
}

function ahoraPeru() {
  const partes = new Intl.DateTimeFormat(
    'en-US',
    {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    }
  ).formatToParts(new Date());

  const valores = Object.fromEntries(
    partes.map(parte => [
      parte.type,
      parte.value
    ])
  );

  return (
    `${valores.year}-${valores.month}-${valores.day}T` +
    `${valores.hour}:${valores.minute}:${valores.second}`
  );
}

function salidaFutura(salida) {
  return fechaAlmacenada(salida) > ahoraPeru();
}

function sumarMinutos(fecha, minutos) {
  const valor = fechaAlmacenada(fecha);
  const instante = new Date(`${valor}Z`);

  if (Number.isNaN(instante.getTime())) {
    throw errorHttp(
      'La fecha del viaje es inválida.',
      409
    );
  }

  return new Date(
    instante.getTime() + minutos * 60000
  ).toISOString().slice(0, 19);
}

// =====================================================
// PARÁMETROS SQL
// =====================================================

function crearInputs(request, datos) {
  return request
    .input('ruta', sql.Int, datos.rutaId)
    .input('bus', sql.Int, datos.busId)
    .input(
      'conductor',
      sql.Int,
      datos.conductorId
    )
    .input(
      'salida',
      sql.DateTime2,
      fechaSQL(datos.salida)
    )
    .input(
      'llegada',
      sql.DateTime2,
      fechaSQL(datos.llegadaEstimada)
    )
    .input(
      'tarifa',
      sql.Decimal(12, 2),
      datos.tarifa
    )
    .input(
      'estado',
      sql.VarChar(15),
      datos.estado
    );
}

// =====================================================
// CONSULTA GENERAL DE VIAJES
// =====================================================

const consulta = `
  SELECT
    v.ViajeID,
    v.RutaID,
    v.BusID,
    v.ConductorID,
    v.Salida,
    v.LlegadaEstimada,
    v.Tarifa,
    v.Estado,

    r.Origen,
    r.Destino,

    b.Placa AS BusPlaca,
    b.Modelo AS BusModelo,
    b.Capacidad AS BusCapacidad,

    b.TipoServicioID,
    ts.Nombre AS TipoServicio,

    c.Nombres AS ConductorNombres,
    c.Apellidos AS ConductorApellidos

  FROM dbo.Viaje v

  INNER JOIN dbo.Ruta r
    ON r.RutaID = v.RutaID

  INNER JOIN dbo.Bus b
    ON b.BusID = v.BusID

  LEFT JOIN dbo.TipoServicio ts
    ON ts.TipoServicioID = b.TipoServicioID

  INNER JOIN dbo.Conductor c
    ON c.ConductorID = v.ConductorID
`;

// =====================================================
// VALIDAR RUTA, BUS Y CONDUCTOR
// =====================================================

async function validarReferencias(tx, datos) {
  const resultado = await new sql.Request(tx)
    .input('ruta', sql.Int, datos.rutaId)
    .input('bus', sql.Int, datos.busId)
    .input(
      'conductor',
      sql.Int,
      datos.conductorId
    )
    .query(`
      SELECT
        (
          SELECT Estado
          FROM dbo.Ruta WITH (HOLDLOCK)
          WHERE RutaID = @ruta
        ) AS EstadoRuta,

        (
          SELECT Estado
          FROM dbo.Bus WITH (HOLDLOCK)
          WHERE BusID = @bus
        ) AS EstadoBus,

        (
          SELECT Estado
          FROM dbo.Conductor WITH (HOLDLOCK)
          WHERE ConductorID = @conductor
        ) AS EstadoConductor
    `);

  const referencias = resultado.recordset[0];

  if (!referencias) {
    throw errorHttp(
      'No se pudieron comprobar los catálogos.'
    );
  }

  if (referencias.EstadoRuta == null) {
    throw errorHttp(
      'La ruta seleccionada no existe.'
    );
  }

  if (referencias.EstadoBus == null) {
    throw errorHttp(
      'El bus seleccionado no existe.'
    );
  }

  if (referencias.EstadoConductor == null) {
    throw errorHttp(
      'El conductor seleccionado no existe.'
    );
  }

  if (referencias.EstadoRuta !== 'ACTIVA') {
    throw errorHttp(
      'La ruta debe estar ACTIVA.',
      409
    );
  }

  if (referencias.EstadoBus !== 'OPERATIVO') {
    throw errorHttp(
      'El bus debe estar OPERATIVO.',
      409
    );
  }

  if (referencias.EstadoConductor !== 'ACTIVO') {
    throw errorHttp(
      'El conductor debe estar ACTIVO.',
      409
    );
  }
}

// =====================================================
// VALIDAR CRUCES DE HORARIOS
// =====================================================

async function validarDisponibilidad(
  tx,
  datos,
  excluirId = null
) {
  if (
    datos.estado === 'CANCELADO' ||
    datos.estado === 'FINALIZADO'
  ) {
    return;
  }

  const resultado = await new sql.Request(tx)
    .input('id', sql.BigInt, excluirId)
    .input('bus', sql.Int, datos.busId)
    .input(
      'conductor',
      sql.Int,
      datos.conductorId
    )
    .input(
      'salida',
      sql.DateTime2,
      fechaSQL(datos.salida)
    )
    .input(
      'llegada',
      sql.DateTime2,
      fechaSQL(datos.llegadaEstimada)
    )
    .query(`
      SELECT TOP (1)
        ViajeID,
        BusID,
        ConductorID

      FROM dbo.Viaje WITH (
        UPDLOCK,
        HOLDLOCK
      )

      WHERE
        (@id IS NULL OR ViajeID <> @id)

        AND Estado IN (
          'PROGRAMADO',
          'EN_CURSO'
        )

        AND (
          BusID = @bus
          OR ConductorID = @conductor
        )

        AND Salida < @llegada
        AND LlegadaEstimada > @salida
    `);

  if (resultado.recordset.length > 0) {
    const conflicto = resultado.recordset[0];

    const recurso =
      Number(conflicto.BusID) === datos.busId
        ? 'bus'
        : 'conductor';

    throw errorHttp(
      `El ${recurso} ya está asignado al viaje ` +
      `#${conflicto.ViajeID} en ese horario.`,
      409
    );
  }
}

// =====================================================
// CONSULTAR VIAJE CON BLOQUEO
// =====================================================

async function obtenerViajeBloqueado(tx, id) {
  const resultado = await new sql.Request(tx)
    .input('id', sql.BigInt, id)
    .query(`
      SELECT
        ViajeID,
        RutaID,
        BusID,
        ConductorID,
        Salida,
        LlegadaEstimada,
        Tarifa,
        Estado

      FROM dbo.Viaje WITH (
        UPDLOCK,
        HOLDLOCK
      )

      WHERE ViajeID = @id
    `);

  const viaje = resultado.recordset[0];

  if (!viaje) {
    throw errorHttp(
      'Viaje no encontrado.',
      404
    );
  }

  return viaje;
}

// =====================================================
// CONTAR RESERVAS VIGENTES
// =====================================================

async function contarReservasVigentes(
  tx,
  viajeId
) {
  const resultado = await new sql.Request(tx)
    .input('viajeId', sql.BigInt, viajeId)
    .query(`
      SELECT
        COUNT_BIG(*) AS Cantidad

      FROM dbo.Reserva WITH (
        UPDLOCK,
        HOLDLOCK
      )

      WHERE ViajeID = @viajeId
        AND Estado <> 'CANCELADA'
    `);

  return Number(
    resultado.recordset[0]?.Cantidad || 0
  );
}

async function verificarCancelacion(
  tx,
  viajeId
) {
  const cantidad =
    await contarReservasVigentes(
      tx,
      viajeId
    );

  if (cantidad > 0) {
    throw errorHttp(
      'Este viaje tiene reservas vigentes. ' +
      'Primero debes gestionar las reservas ' +
      'antes de cancelar el viaje.',
      409
    );
  }
}

// =====================================================
// VALIDAR CAMBIO DE ESTADO
// =====================================================

function validarTransicion(
  viaje,
  nuevoEstado
) {
  const estadoActual = viaje.Estado;

  const permitidos =
    TRANSICIONES[estadoActual] || [];

  if (!permitidos.includes(nuevoEstado)) {
    throw errorHttp(
      `No se permite cambiar el viaje de ` +
      `${estadoActual} a ${nuevoEstado}.`,
      409
    );
  }

  const ahora = ahoraPeru();

  const salida =
    fechaAlmacenada(viaje.Salida);

  // Regresar a PROGRAMADO
  if (
    estadoActual === 'EN_CURSO' &&
    nuevoEstado === 'PROGRAMADO'
  ) {
    if (ahora >= salida) {
      throw errorHttp(
        'No puedes regresar a PROGRAMADO porque ' +
        'ya llegó la fecha y hora de salida.',
        409
      );
    }
  }

  // Finalizar después de la llegada + 15 min
  if (nuevoEstado === 'FINALIZADO') {
    const limite = sumarMinutos(
      viaje.LlegadaEstimada,
      15
    );

    if (ahora < limite) {
      const fecha = limite.slice(0, 10);
      const hora = limite.slice(11, 16);

      throw errorHttp(
        'Todavía no puedes finalizar el viaje. ' +
        'El estado FINALIZADO estará disponible ' +
        `desde ${fecha} a las ${hora}, ` +
        '15 minutos después de la llegada estimada.',
        409
      );
    }
  }

  // Cancelar antes de la salida
  if (nuevoEstado === 'CANCELADO') {
    if (ahora >= salida) {
      throw errorHttp(
        'No se permite cancelar el viaje ' +
        'después de la hora de salida.',
        409
      );
    }
  }

  // EN_CURSO se inicia manualmente.
}

// =====================================================
// ROUTER PRINCIPAL
// =====================================================

export function createViajesRouter({
  auth,
  activeUser,
  admin,
  asyncRoute
}) {
  const router = Router();

  router.use(auth, activeUser, admin);

  // ===================================================
  // GET /api/viajes/catalogos
  // ===================================================

  router.get(
    '/catalogos',
    asyncRoute(async (req, res) => {
      const pool = await getPool();

      const resultado =
        await pool.request().query(`
          SELECT
            RutaID,
            Origen,
            Destino,
            Estado

          FROM dbo.Ruta

          ORDER BY Origen, Destino;

          SELECT
            b.BusID,
            b.Placa,
            b.Modelo,
            b.Capacidad,
            b.Estado,
            b.TipoServicioID,
            ts.Nombre AS TipoServicio

          FROM dbo.Bus b

          LEFT JOIN dbo.TipoServicio ts
            ON ts.TipoServicioID =
               b.TipoServicioID

          ORDER BY b.Placa;

          SELECT
            ConductorID,
            Nombres,
            Apellidos,
            NumeroLicencia,
            Estado

          FROM dbo.Conductor

          ORDER BY Apellidos, Nombres;
        `);

      return res.json({
        rutas: resultado.recordsets[0],
        buses: resultado.recordsets[1],
        conductores: resultado.recordsets[2]
      });
    })
  );

  // ===================================================
  // GET /api/viajes
  // LISTAR Y BUSCAR VIAJES
  // ===================================================

  router.get(
    '/',
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
          ${consulta}

          WHERE
            r.Origen LIKE @q
            OR r.Destino LIKE @q
            OR b.Placa LIKE @q
            OR b.Modelo LIKE @q
            OR ts.Nombre LIKE @q
            OR c.Nombres LIKE @q
            OR c.Apellidos LIKE @q
            OR v.Estado LIKE @q

          ORDER BY
            v.Salida DESC,
            v.ViajeID DESC
        `);

      return res.json(
        resultado.recordset
      );
    })
  );

  // ===================================================
  // GET /api/viajes/:id
  // DETALLE DEL VIAJE
  // ===================================================

  router.get(
    '/:id',
    asyncRoute(async (req, res) => {
      const id = obtenerId(
        req.params.id
      );

      const pool = await getPool();

      const resultado = await pool.request()
        .input('id', sql.BigInt, id)
        .query(`
          ${consulta}

          WHERE v.ViajeID = @id
        `);

      if (!resultado.recordset.length) {
        return res.status(404).json({
          error: 'Viaje no encontrado.'
        });
      }

      return res.json(
        resultado.recordset[0]
      );
    })
  );

  // ===================================================
  // POST /api/viajes
  // REGISTRAR VIAJE
  // ===================================================

  router.post(
    '/',
    asyncRoute(async (req, res) => {
      const datos = validarViaje(
        req.body
      );

      if (datos.estado !== 'PROGRAMADO') {
        throw errorHttp(
          'Todo viaje nuevo debe registrarse ' +
          'en estado PROGRAMADO.'
        );
      }

      if (
        datos.salida + ':00' <= ahoraPeru()
      ) {
        throw errorHttp(
          'La salida del nuevo viaje debe ser futura.'
        );
      }

      const pool = await getPool();

      const tx =
        new sql.Transaction(pool);

      await tx.begin(
        sql.ISOLATION_LEVEL.SERIALIZABLE
      );

      try {
        await validarReferencias(
          tx,
          datos
        );

        await validarDisponibilidad(
          tx,
          datos
        );

        const resultado = await crearInputs(
          new sql.Request(tx),
          datos
        ).query(`
          INSERT INTO dbo.Viaje (
            RutaID,
            BusID,
            ConductorID,
            Salida,
            LlegadaEstimada,
            Tarifa,
            Estado
          )

          OUTPUT INSERTED.ViajeID

          VALUES (
            @ruta,
            @bus,
            @conductor,
            @salida,
            @llegada,
            @tarifa,
            @estado
          )
        `);

        await tx.commit();

        return res.status(201).json({
          ViajeID:
            resultado.recordset[0].ViajeID,
          mensaje:
            'Viaje programado correctamente.'
        });
      } catch (error) {
        await tx.rollback().catch(() => {});
        throw error;
      }
    })
  );

  // ===================================================
  // PUT /api/viajes/:id
  // EDITAR DATOS DEL VIAJE
  // ===================================================

  router.put(
    '/:id',
    asyncRoute(async (req, res) => {
      const id = obtenerId(
        req.params.id
      );

      const datos = validarViaje(
        req.body
      );

      const pool = await getPool();

      const tx =
        new sql.Transaction(pool);

      await tx.begin(
        sql.ISOLATION_LEVEL.SERIALIZABLE
      );

      try {
        const actual =
          await obtenerViajeBloqueado(
            tx,
            id
          );

        if (
          actual.Estado === 'FINALIZADO' ||
          actual.Estado === 'CANCELADO'
        ) {
          throw errorHttp(
            'No se puede editar un viaje ' +
            'finalizado o cancelado.',
            409
          );
        }

        if (!salidaFutura(actual.Salida)) {
          throw errorHttp(
            'La fecha y hora de salida ya llegó. ' +
            'No se pueden modificar los datos ' +
            'programados del viaje.',
            409
          );
        }

        // El estado se cambia solo con PATCH.
        if (datos.estado !== actual.Estado) {
          throw errorHttp(
            'Para modificar el estado utiliza ' +
            'el botón Cambiar estado.',
            409
          );
        }

        if (
          datos.salida + ':00' <= ahoraPeru()
        ) {
          throw errorHttp(
            'La nueva fecha de salida debe ser futura.'
          );
        }

        const reservas =
          await contarReservasVigentes(
            tx,
            id
          );

        if (reservas > 0) {
          const cambioRuta =
            Number(actual.RutaID) !==
            datos.rutaId;

          const cambioBus =
            Number(actual.BusID) !==
            datos.busId;

          const cambioTarifa =
            Math.abs(
              Number(actual.Tarifa) -
              datos.tarifa
            ) > 0.001;

          if (
            cambioRuta ||
            cambioBus ||
            cambioTarifa
          ) {
            throw errorHttp(
              'El viaje tiene reservas vigentes. ' +
              'No se puede cambiar ruta, bus ni tarifa.',
              409
            );
          }
        }

        await validarReferencias(
          tx,
          datos
        );

        await validarDisponibilidad(
          tx,
          datos,
          id
        );

        await crearInputs(
          new sql.Request(tx)
            .input('id', sql.BigInt, id),
          datos
        ).query(`
          UPDATE dbo.Viaje

          SET
            RutaID = @ruta,
            BusID = @bus,
            ConductorID = @conductor,
            Salida = @salida,
            LlegadaEstimada = @llegada,
            Tarifa = @tarifa

          WHERE ViajeID = @id
        `);

        await tx.commit();

        return res.json({
          ViajeID: id,
          Estado: actual.Estado,
          mensaje:
            'Datos del viaje actualizados correctamente.'
        });
      } catch (error) {
        await tx.rollback().catch(() => {});
        throw error;
      }
    })
  );

  // ===================================================
  // PATCH /api/viajes/:id/estado
  // CAMBIAR ESTADO DEL VIAJE
  // ===================================================

  router.patch(
    '/:id/estado',
    asyncRoute(async (req, res) => {
      const id = obtenerId(
        req.params.id
      );

      const validacion = z.object({
        estado: z.enum(ESTADOS)
      }).safeParse(req.body);

      if (!validacion.success) {
        throw errorHttp(
          'El estado enviado no es válido.'
        );
      }

      const nuevoEstado =
        validacion.data.estado;

      const pool = await getPool();

      const tx =
        new sql.Transaction(pool);

      await tx.begin(
        sql.ISOLATION_LEVEL.SERIALIZABLE
      );

      try {
        const viaje =
          await obtenerViajeBloqueado(
            tx,
            id
          );

        // 1. Validar transición y horario.
        validarTransicion(
          viaje,
          nuevoEstado
        );

        // 2. No cancelar si existen reservas.
        if (nuevoEstado === 'CANCELADO') {
          await verificarCancelacion(
            tx,
            id
          );
        }

        // 3. Al iniciar, validar recursos.
        if (nuevoEstado === 'EN_CURSO') {
          await validarReferencias(
            tx,
            {
              rutaId: Number(
                viaje.RutaID
              ),
              busId: Number(
                viaje.BusID
              ),
              conductorId: Number(
                viaje.ConductorID
              )
            }
          );

          await validarDisponibilidad(
            tx,
            {
              busId: Number(
                viaje.BusID
              ),
              conductorId: Number(
                viaje.ConductorID
              ),
              salida:
                fechaAlmacenada(
                  viaje.Salida
                ).slice(0, 16),
              llegadaEstimada:
                fechaAlmacenada(
                  viaje.LlegadaEstimada
                ).slice(0, 16),
              estado: 'EN_CURSO'
            },
            id
          );
        }

        // 4. Actualizar estado.
        const resultado =
          await new sql.Request(tx)
            .input(
              'id',
              sql.BigInt,
              id
            )
            .input(
              'estadoNuevo',
              sql.VarChar(15),
              nuevoEstado
            )
            .input(
              'estadoActual',
              sql.VarChar(15),
              viaje.Estado
            )
            .query(`
              UPDATE dbo.Viaje

              SET Estado = @estadoNuevo

              WHERE ViajeID = @id
                AND Estado = @estadoActual
            `);

        if (
          resultado.rowsAffected[0] !== 1
        ) {
          throw errorHttp(
            'El estado del viaje cambió ' +
            'durante la operación. ' +
            'Actualiza el listado.',
            409
          );
        }

        // =====================================================
        // PASO 183 — AUDITORÍA DEL CAMBIO DE ESTADO
        // MISMA TRANSACCIÓN SQL SERVER
        // =====================================================

        await new sql.Request(tx)
          .input(
            'usuarioId',
            sql.BigInt,
            req.currentUser.UsuarioID
          )
          .input(
            'viajeId',
            sql.BigInt,
            id
          )
          .input(
            'accion',
            sql.VarChar(30),
            'CAMBIO_ESTADO'
          )
          .input(
            'detalle',
            sql.NVarChar(500),
            `Cambio de estado del viaje #${id}: ` +
            `${viaje.Estado} → ${nuevoEstado}.`
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
              'Viaje',
              @viajeId,
              @accion,
              @detalle,
              SYSDATETIME()
            )
          `);

        // 5. Confirmar cambio y auditoría juntos.
        await tx.commit();

        return res.json({
          ViajeID: id,
          Estado: nuevoEstado,
          mensaje:
            `El viaje cambió correctamente ` +
            `a ${nuevoEstado}.`
        });
      } catch (error) {
        await tx.rollback().catch(() => {});
        throw error;
      }
    })
  );

  return router;
}
