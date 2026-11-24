import { Router } from 'express';
import { z } from 'zod';
import { getPool, sql } from './db.js';
// =====================================================
// SIGET-VÍA — GESTIÓN DE RESERVAS
// PASO 170.7.7.12.12.6
// DNI / CE / PASAPORTE
// CREACIÓN / CONSULTA / EDICIÓN
// CANCELACIÓN / REPROGRAMACIÓN
// HISTORIAL / ACEPTACIÓN DE POLÍTICAS
// =====================================================
const idSchema = z.coerce.number()
  .int().positive().safe();
const patronNombre =
  /^[\p{L}\p{M}][\p{L}\p{M}'’.\- ]*$/u;
const nombre = maximo =>
  z.string().trim()
    .transform(valor => valor.replace(/\s+/g, ' '))
    .pipe(
      z.string()
        .min(2, 'El nombre debe tener al menos 2 caracteres.')
        .max(maximo)
        .regex(
          patronNombre,
          'Solo se permiten letras y separadores válidos.'
        )
    );
function errorHttp(mensaje, statusCode = 400) {
  return Object.assign(new Error(mensaje), {
    statusCode
  });
}
function obtenerId(valor) {
  const resultado = idSchema.safeParse(valor);
  if (!resultado.success) {
    throw errorHttp('Identificador inválido.');
  }
  return resultado.data;
}
function fechaValida(valor) {
  if (valor == null) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    return false;
  }
  const [anio, mes, dia] = valor.split('-').map(Number);
  const fecha = new Date(
    Date.UTC(anio, mes - 1, dia, 12)
  );
  return (
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia &&
    fecha <= new Date()
  );
}
// =====================================================
// VALIDACIÓN DE DOCUMENTOS
// =====================================================
const reglasDocumento = {
  DNI: /^\d{8}$/,
  CE: /^[A-Z0-9]{9,12}$/,
  PASAPORTE: /^[A-Z0-9]{6,20}$/
};
const mensajesDocumento = {
  DNI: 'El DNI debe tener exactamente 8 números.',
  CE: 'El CE debe tener entre 9 y 12 caracteres alfanuméricos.',
  PASAPORTE: 'El pasaporte debe tener entre 6 y 20 caracteres alfanuméricos.'
};
function normalizarDocumento(tipo, numero) {
  const tipoNormalizado = String(tipo || 'DNI')
    .trim()
    .toUpperCase();
  const numeroNormalizado = String(numero || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
  if (!reglasDocumento[tipoNormalizado]) {
    throw errorHttp('Tipo de documento no permitido.');
  }
  if (!reglasDocumento[tipoNormalizado].test(numeroNormalizado)) {
    throw errorHttp(
      mensajesDocumento[tipoNormalizado]
    );
  }
  return {
    tipoDocumento: tipoNormalizado,
    numeroDocumento: numeroNormalizado
  };
}
// =====================================================
// ESQUEMAS ZOD
// =====================================================
const itemBaseSchema = z.object({
  asientoId: z.number()
    .int()
    .positive()
    .max(2147483647),
  tipoDocumento: z.enum([
    'DNI',
    'CE',
    'PASAPORTE'
  ]).optional().default('DNI'),
  numeroDocumento: z.string()
    .trim()
    .max(20)
    .optional(),
  // Compatibilidad con el frontend anterior.
  dni: z.string()
    .trim()
    .optional(),
  nombres: nombre(100),
  apellidos: nombre(120),
  fechaNacimiento: z.string()
    .nullable()
    .optional()
    .refine(
      fechaValida,
      'La fecha de nacimiento no es válida.'
    )
});
function normalizarItem(item) {
  const documento = normalizarDocumento(
    item.tipoDocumento,
    item.numeroDocumento || item.dni
  );
  return {
    ...item,
    ...documento
  };
}
const itemSchema = itemBaseSchema.transform(
  normalizarItem
);
function validarUnicos(items, contexto) {
  const asientos = items.map(
    item => item.asientoId
  );
  const documentos = items.map(
    item =>
      `${item.tipoDocumento}:${item.numeroDocumento}`
  );
  if (
    new Set(asientos).size !== asientos.length
  ) {
    contexto.addIssue({
      code: 'custom',
      path: ['items'],
      message: 'No se permiten asientos repetidos.'
    });
  }
  if (
    new Set(documentos).size !== documentos.length
  ) {
    contexto.addIssue({
      code: 'custom',
      path: ['items'],
      message: 'No se permiten documentos repetidos.'
    });
  }
}
const reservaSchema = z.object({
  viajeId: z.number()
    .int()
    .positive()
    .safe(),
  politicaIds: z.array(
    z.number().int().positive()
  ).length(5),
  aceptacionConfirmada: z.literal(true),
  items: z.array(itemSchema)
    .min(1)
    .max(200)
}).superRefine((datos, contexto) => {
  validarUnicos(datos.items, contexto);
});
const edicionSchema = z.object({
  items: z.array(
    itemBaseSchema.extend({
      reservaAsientoId: z.number()
        .int()
        .positive()
        .safe()
    })
  ).min(1).max(200)
}).superRefine((datos, contexto) => {
  try {
    validarUnicos(
      datos.items.map(normalizarItem),
      contexto
    );
  } catch (error) {
    contexto.addIssue({
      code: 'custom',
      message: error.message
    });
  }
  const ids = datos.items.map(
    item => item.reservaAsientoId
  );
  if (new Set(ids).size !== ids.length) {
    contexto.addIssue({
      code: 'custom',
      path: ['items'],
      message: 'El detalle de reserva está duplicado.'
    });
  }
});
const reprogramacionSchema = z.object({
  viajeNuevoId: z.number()
    .int()
    .positive()
    .safe(),
  items: z.array(
    z.object({
      reservaAsientoId: z.number()
        .int()
        .positive()
        .safe(),
      asientoId: z.number()
        .int()
        .positive()
        .max(2147483647)
    }).strict()
  ).min(1).max(200)
}).strict().superRefine((datos, contexto) => {
  for (const campo of [
    'reservaAsientoId',
    'asientoId'
  ]) {
    const valores = datos.items.map(
      item => item[campo]
    );
    if (
      new Set(valores).size !== valores.length
    ) {
      contexto.addIssue({
        code: 'custom',
        path: ['items'],
        message: `No se permiten ${campo} repetidos.`
      });
    }
  }
});
function validarEsquema(esquema, body) {
  const resultado = esquema.safeParse(body);
  if (!resultado.success) {
    throw errorHttp(
      resultado.error.issues[0]?.message ||
      'La información enviada es inválida.'
    );
  }
  if (esquema === edicionSchema) {
    return {
      ...resultado.data,
      items: resultado.data.items.map(
        normalizarItem
      )
    };
  }
  return resultado.data;
}
// =====================================================
// PARÁMETROS SQL DINÁMICOS
// =====================================================
function agregarLista(
  request,
  prefijo,
  valores,
  tipo
) {
  const seguro = `siget_${prefijo}_`;
  valores.forEach((valor, indice) => {
    request.input(
      `${seguro}${indice}`,
      tipo,
      valor
    );
  });
  return valores.map(
    (_, indice) => `@${seguro}${indice}`
  ).join(', ');
}
// =====================================================
// RECUPERAR O REGISTRAR PASAJERO
// =====================================================
async function obtenerORegistrarPasajero(tx, item) {
  const resultado = await new sql.Request(tx)
    .input(
      'tipo',
      sql.VarChar(12),
      item.tipoDocumento
    )
    .input(
      'numero',
      sql.VarChar(20),
      item.numeroDocumento
    )
    .query(`
      SELECT
        PasajeroID,
        Nombres,
        Apellidos,
        FechaNacimiento,
        Estado
      FROM dbo.Pasajero WITH (UPDLOCK, HOLDLOCK)
      WHERE TipoDocumento = @tipo
        AND NumeroDocumento = @numero
    `);
  if (resultado.recordset.length) {
    const pasajero = resultado.recordset[0];
    if (pasajero.Estado !== 'ACTIVO') {
      throw errorHttp(
        'El pasajero consultado está INACTIVO.',
        409
      );
    }
    return pasajero.PasajeroID;
  }
  if (!item.fechaNacimiento) {
    throw errorHttp(
      'Ingresa la fecha de nacimiento del pasajero nuevo.'
    );
  }
  const registro = await new sql.Request(tx)
    .input(
      'tipo',
      sql.VarChar(12),
      item.tipoDocumento
    )
    .input(
      'numero',
      sql.VarChar(20),
      item.numeroDocumento
    )
    .input(
      'nombres',
      sql.NVarChar(100),
      item.nombres
    )
    .input(
      'apellidos',
      sql.NVarChar(120),
      item.apellidos
    )
    .input(
      'fecha',
      sql.Date,
      new Date(
        `${item.fechaNacimiento}T12:00:00Z`
      )
    )
    .input(
      'estado',
      sql.VarChar(12),
      'ACTIVO'
    )
    .query(`
      INSERT INTO dbo.Pasajero (
        UsuarioID,
        TipoDocumento,
        NumeroDocumento,
        Nombres,
        Apellidos,
        FechaNacimiento,
        Telefono,
        Estado
      )
      OUTPUT INSERTED.PasajeroID
      VALUES (
        NULL,
        @tipo,
        @numero,
        @nombres,
        @apellidos,
        @fecha,
        NULL,
        @estado
      )
    `);
  return registro.recordset[0].PasajeroID;
}
// =====================================================
// COMPROBAR ASIENTOS
// =====================================================
async function comprobarAsientos(
  tx,
  viajeId,
  busId,
  asientoIds,
  excluirReservaId = null
) {
  const solicitud = new sql.Request(tx)
    .input(
      'busId',
      sql.Int,
      busId
    );
  const lista = agregarLista(
    solicitud,
    'asiento',
    asientoIds,
    sql.Int
  );
  const disponibles = await solicitud.query(`
    SELECT AsientoID
    FROM dbo.Asiento WITH (HOLDLOCK)
    WHERE BusID = @busId
      AND AsientoID IN (${lista})
  `);
  if (
    disponibles.recordset.length !==
    asientoIds.length
  ) {
    throw errorHttp(
      'Uno o más asientos no pertenecen al bus.'
    );
  }
  const solicitudOcupados = new sql.Request(tx)
    .input(
      'viajeId',
      sql.BigInt,
      viajeId
    )
    .input(
      'excluirReservaId',
      sql.BigInt,
      excluirReservaId
    );
  const listaOcupados = agregarLista(
    solicitudOcupados,
    'ocupado',
    asientoIds,
    sql.Int
  );
  const ocupados = await solicitudOcupados.query(`
    SELECT AsientoID
    FROM dbo.ReservaAsiento WITH (UPDLOCK, HOLDLOCK)
    WHERE ViajeID = @viajeId
      AND Estado = 'ACTIVA'
      AND (
        @excluirReservaId IS NULL
        OR ReservaID <> @excluirReservaId
      )
      AND AsientoID IN (${listaOcupados})
  `);
  if (ocupados.recordset.length) {
    throw errorHttp(
      'Uno o más asientos ya están reservados.',
      409
    );
  }
}
// =====================================================
// COMPROBAR PASAJEROS
// =====================================================
async function comprobarPasajeros(
  tx,
  viajeId,
  pasajeroIds,
  excluirReservaId = null
) {
  if (
    new Set(pasajeroIds.map(Number)).size !==
    pasajeroIds.length
  ) {
    throw errorHttp(
      'Un pasajero no puede ocupar dos asientos.',
      409
    );
  }
  const solicitud = new sql.Request(tx)
    .input(
      'viajeId',
      sql.BigInt,
      viajeId
    )
    .input(
      'excluirReservaId',
      sql.BigInt,
      excluirReservaId
    );
  const lista = agregarLista(
    solicitud,
    'pasajero',
    pasajeroIds,
    sql.BigInt
  );
  const existentes = await solicitud.query(`
    SELECT PasajeroID
    FROM dbo.ReservaAsiento WITH (UPDLOCK, HOLDLOCK)
    WHERE ViajeID = @viajeId
      AND Estado = 'ACTIVA'
      AND (
        @excluirReservaId IS NULL
        OR ReservaID <> @excluirReservaId
      )
      AND PasajeroID IN (${lista})
  `);
  if (existentes.recordset.length) {
    throw errorHttp(
      'Un pasajero ya tiene un asiento en este viaje.',
      409
    );
  }
}
// =====================================================
// CONTROL DE ERRORES SQL
// =====================================================
async function revertir(tx, error, operacion) {
  await tx.rollback().catch(() => {});
  console.error(`ERROR AL ${operacion}:`, {
    mensaje: error.message,
    numero:
      error.number ??
      error.originalError?.info?.number
  });
}
function responderErrorSQL(error, res) {
  const numero =
    error.number ??
    error.originalError?.info?.number;
  if (
    numero === 2601 ||
    numero === 2627
  ) {
    res.status(409).json({
      error:
        'Existe un documento, asiento o pasajero duplicado.'
    });
    return true;
  }
  if (numero === 547) {
    res.status(409).json({
      error:
        'La operación incumple una restricción de SQL Server.'
    });
    return true;
  }
  return false;
}
// =====================================================
// HISTORIAL DE RESERVAS
// =====================================================
async function registrarHistorialReserva({
  tx,
  reservaId,
  usuarioResponsableId,
  accion,
  viajeAnteriorId = null,
  viajeNuevoId = null,
  detalle
}) {
  await new sql.Request(tx)
    .input(
      'reservaId',
      sql.BigInt,
      reservaId
    )
    .input(
      'usuarioId',
      sql.BigInt,
      usuarioResponsableId
    )
    .input(
      'accion',
      sql.VarChar(15),
      accion
    )
    .input(
      'viajeAnteriorId',
      sql.BigInt,
      viajeAnteriorId
    )
    .input(
      'viajeNuevoId',
      sql.BigInt,
      viajeNuevoId
    )
    .input(
      'detalle',
      sql.NVarChar(1000),
      detalle
    )
    .query(`
      INSERT INTO dbo.HistorialReserva (
        ReservaID,
        UsuarioResponsableID,
        Accion,
        ViajeAnteriorID,
        ViajeNuevoID,
        Detalle,
        FechaCambio
      )
      VALUES (
        @reservaId,
        @usuarioId,
        @accion,
        @viajeAnteriorId,
        @viajeNuevoId,
        @detalle,
        SYSDATETIME()
      )
    `);
}
// =====================================================
// POLÍTICAS VIGENTES
// =====================================================
const TIPOS_OBLIGATORIOS = [
  'RESERVA',
  'CANCELACION',
  'REPROGRAMACION',
  'CONTRATACION',
  'PRIVACIDAD'
];
async function obtenerPoliticasVigentes(request) {
  const resultado = await request.query(`
    SELECT
      PoliticaID,
      Tipo,
      Titulo,
      Contenido,
      Version,
      VigenteDesde,
      VigenteHasta
    FROM dbo.PoliticaServicio
    WHERE Activa = 1
      AND VigenteDesde <= CONVERT(
        date,
        SYSDATETIME()
      )
      AND (
        VigenteHasta IS NULL
        OR VigenteHasta >= CONVERT(
          date,
          SYSDATETIME()
        )
      )
      AND Tipo IN (
        'RESERVA',
        'CANCELACION',
        'REPROGRAMACION',
        'CONTRATACION',
        'PRIVACIDAD'
      )
    ORDER BY Tipo, PoliticaID DESC
  `);
  const politicas = TIPOS_OBLIGATORIOS.map(
    tipo => resultado.recordset.find(
      politica => politica.Tipo === tipo
    )
  );
  if (
    politicas.some(politica => !politica)
  ) {
    throw errorHttp(
      'Faltan políticas obligatorias activas y vigentes.',
      409
    );
  }
  return politicas;
}
// =====================================================
// REGISTRAR ACEPTACIONES
// =====================================================
async function registrarAceptacionesReserva(
  tx,
  reservaId,
  usuarioId,
  politicas
) {
  for (const politica of politicas) {
    await new sql.Request(tx)
      .input(
        'reservaId',
        sql.BigInt,
        reservaId
      )
      .input(
        'politicaId',
        sql.Int,
        politica.PoliticaID
      )
      .input(
        'usuarioId',
        sql.BigInt,
        usuarioId
      )
      .input(
        'tipo',
        sql.VarChar(25),
        politica.Tipo
      )
      .input(
        'version',
        sql.VarChar(20),
        politica.Version
      )
      .input(
        'titulo',
        sql.NVarChar(300),
        politica.Titulo
      )
      .input(
        'contenido',
        sql.NVarChar(sql.MAX),
        politica.Contenido
      )
      .query(`
        INSERT INTO dbo.ReservaPoliticaAceptacion (
          ReservaID,
          PoliticaID,
          UsuarioID,
          Tipo,
          Version,
          Titulo,
          ContenidoAceptado,
          FechaAceptacion
        )
        VALUES (
          @reservaId,
          @politicaId,
          @usuarioId,
          @tipo,
          @version,
          @titulo,
          @contenido,
          SYSDATETIME()
        )
      `);
  }
}
// =====================================================
// ROUTER PRINCIPAL
// =====================================================
export function createReservasRouter({
  auth,
  activeUser,
  admin,
  asyncRoute
}) {
  const router = Router();
  router.use(auth, activeUser);
  // ===================================================
  // GET /api/reservas/politicas-vigentes
  // ===================================================
  router.get(
    '/politicas-vigentes',
    asyncRoute(async (req, res) => {
      const pool = await getPool();
      const politicas =
        await obtenerPoliticasVigentes(
          pool.request()
        );
      return res.json(politicas);
    })
  );
  // POST /api/reservas: clientes autenticados.
  router.post(
    '/',
    asyncRoute(async (req, res) => {
      // Alta pública: solo clientes activos y administradores.
      // El middleware auth + activeUser ya validó la sesión.
      const rol = String(req.currentUser?.Rol || '').toUpperCase();
      if (!['CLIENTE', 'ADMINISTRADOR'].includes(rol)) {
        throw errorHttp('Tu cuenta no puede crear reservas.', 403);
      }
      const datos = validarEsquema(
        reservaSchema,
        req.body
      );
      const pool = await getPool();
      const tx = new sql.Transaction(pool);
      await tx.begin(
        sql.ISOLATION_LEVEL.SERIALIZABLE
      );
      try {
        // Verificar políticas vigentes.
        const politicas =
          await obtenerPoliticasVigentes(
            new sql.Request(tx)
          );
        const solicitadas = [
          ...new Set(datos.politicaIds)
        ].sort((a, b) => a - b);
        const esperadas = politicas
          .map(
            politica =>
              Number(politica.PoliticaID)
          )
          .sort((a, b) => a - b);
        if (
          solicitadas.length !== esperadas.length ||
          solicitadas.some(
            (id, indice) =>
              id !== esperadas[indice]
          )
        ) {
          throw errorHttp(
            'Las políticas cambiaron. Revísalas y confirma nuevamente.',
            409
          );
        }
        // Verificar viaje.
        const viajeResult = await new sql.Request(tx)
          .input(
            'viajeId',
            sql.BigInt,
            datos.viajeId
          )
          .query(`
            SELECT
              ViajeID,
              BusID,
              Tarifa,
              Estado,
              Salida
            FROM dbo.Viaje WITH (UPDLOCK, HOLDLOCK)
            WHERE ViajeID = @viajeId
          `);
        const viaje = viajeResult.recordset[0];
        if (!viaje) {
          throw errorHttp(
            'Viaje no encontrado.',
            404
          );
        }
        if (viaje.Estado !== 'PROGRAMADO') {
          throw errorHttp(
            'El viaje no admite nuevas reservas.',
            409
          );
        }
        // Validar la salida con fecha de SQL Server.
        const fechaResult = await new sql.Request(tx)
          .input(
            'viajeId',
            sql.BigInt,
            datos.viajeId
          )
          .query(`
            SELECT
              CASE
                WHEN Salida > SYSDATETIME()
                THEN 1
                ELSE 0
              END AS Futura
            FROM dbo.Viaje
            WHERE ViajeID = @viajeId
          `);
        if (
          Number(
            fechaResult.recordset[0]?.Futura
          ) !== 1
        ) {
          throw errorHttp(
            'La fecha de salida del viaje ya venció.',
            409
          );
        }
        // Validar asientos.
        const asientoIds = datos.items.map(
          item => item.asientoId
        );
        await comprobarAsientos(
          tx,
          datos.viajeId,
          viaje.BusID,
          asientoIds
        );
        // Registrar o recuperar pasajeros.
        const resueltos = [];
        for (const item of datos.items) {
          const pasajeroId =
            await obtenerORegistrarPasajero(
              tx,
              item
            );
          resueltos.push({
            asientoId: item.asientoId,
            pasajeroId
          });
        }
        await comprobarPasajeros(
          tx,
          datos.viajeId,
          resueltos.map(
            item => item.pasajeroId
          )
        );
        // Calcular importe.
        const precio = Number(
          viaje.Tarifa
        );
        const total = Number(
          (
            precio * resueltos.length
          ).toFixed(2)
        );
        if (
          !Number.isFinite(precio) ||
          precio < 0 ||
          !Number.isFinite(total) ||
          total < 0 ||
          total > 9999999999.99
        ) {
          throw errorHttp(
            'El importe total de la reserva es inválido.'
          );
        }
        // Seleccionar política principal.
        const politicaReserva = politicas.find(
          politica =>
            politica.Tipo === 'RESERVA'
        );
        // Crear cabecera.
        const resultado = await new sql.Request(tx)
          .input(
            'usuario',
            sql.BigInt,
            req.currentUser.UsuarioID
          )
          .input(
            'viaje',
            sql.BigInt,
            datos.viajeId
          )
          .input(
            'estado',
            sql.VarChar(15),
            'COMPLETADA'
          )
          .input(
            'total',
            sql.Decimal(12, 2),
            total
          )
          .input(
            'politicaId',
            sql.Int,
            politicaReserva.PoliticaID
          )
          .query(`
            INSERT INTO dbo.Reserva (
              UsuarioID,
              ViajeID,
              FechaReserva,
              Estado,
              Total,
              PoliticaID
            )
            OUTPUT INSERTED.ReservaID
            VALUES (
              @usuario,
              @viaje,
              SYSDATETIME(),
              @estado,
              @total,
              @politicaId
            )
          `);
        const reservaId =
          resultado.recordset[0].ReservaID;
        // Insertar asientos.
        for (const item of resueltos) {
          await new sql.Request(tx)
            .input(
              'reservaId',
              sql.BigInt,
              reservaId
            )
            .input(
              'viajeId',
              sql.BigInt,
              datos.viajeId
            )
            .input(
              'busId',
              sql.Int,
              viaje.BusID
            )
            .input(
              'asientoId',
              sql.Int,
              item.asientoId
            )
            .input(
              'pasajeroId',
              sql.BigInt,
              item.pasajeroId
            )
            .input(
              'precio',
              sql.Decimal(12, 2),
              precio
            )
            .input(
              'estado',
              sql.VarChar(10),
              'ACTIVA'
            )
            .query(`
              INSERT INTO dbo.ReservaAsiento (
                ReservaID,
                ViajeID,
                BusID,
                AsientoID,
                PasajeroID,
                Precio,
                Estado
              )
              VALUES (
                @reservaId,
                @viajeId,
                @busId,
                @asientoId,
                @pasajeroId,
                @precio,
                @estado
              )
            `);
        }
        // Obtener código.
        const codigoResult = await new sql.Request(tx)
          .input(
            'reservaId',
            sql.BigInt,
            reservaId
          )
          .query(`
            SELECT Codigo
            FROM dbo.Reserva
            WHERE ReservaID = @reservaId
          `);
        const codigo =
          codigoResult.recordset[0]?.Codigo;
        if (!codigo) {
          throw errorHttp(
            'No se pudo recuperar el código de reserva.',
            500
          );
        }
        // Registrar historial.
        await registrarHistorialReserva({
          tx,
          reservaId,
          usuarioResponsableId:
            req.currentUser.UsuarioID,
          accion: 'CREACION',
          viajeAnteriorId: null,
          viajeNuevoId: datos.viajeId,
          detalle:
            `Reserva ${codigo} creada con ` +
            `${resueltos.length} asiento(s).`
        });
        // Registrar las cinco aceptaciones.
        await registrarAceptacionesReserva(
          tx,
          reservaId,
          req.currentUser.UsuarioID,
          politicas
        );
        await tx.commit();
        return res.status(201).json({
          ReservaID: reservaId,
          Codigo: codigo,
          Total: total,
          CantidadAsientos:
            resueltos.length,
          PoliticaID:
            politicaReserva.PoliticaID,
          TotalAceptaciones:
            politicas.length,
          mensaje:
            'Reserva registrada correctamente.'
        });
      } catch (error) {
        await revertir(
          tx,
          error,
          'REGISTRAR RESERVA'
        );
        if (responderErrorSQL(error, res)) {
          return;
        }
        throw error;
      }
    })
  );
  // Resto de rutas: uso exclusivo del administrador.
  router.use(admin);
  // ===================================================
  // GET /api/reservas/catalogos
  // ===================================================
  router.get(
    '/catalogos',
    asyncRoute(async (req, res) => {
      const pool = await getPool();
      const resultado = await pool.request().query(`
        SELECT
          v.ViajeID,
          v.BusID,
          v.Salida,
          v.LlegadaEstimada,
          v.Tarifa,
          v.Estado,
          r.Origen,
          r.Destino,
          b.Placa,
          b.Modelo,
          b.Capacidad
        FROM dbo.Viaje v
        INNER JOIN dbo.Ruta r
          ON r.RutaID = v.RutaID
        INNER JOIN dbo.Bus b
          ON b.BusID = v.BusID
        WHERE v.Estado = 'PROGRAMADO'
          AND v.Salida > SYSDATETIME()
        ORDER BY v.Salida ASC;
        SELECT
          PasajeroID,
          TipoDocumento,
          NumeroDocumento,
          Nombres,
          Apellidos,
          Estado
        FROM dbo.Pasajero
        WHERE Estado = 'ACTIVO'
        ORDER BY Apellidos, Nombres;
      `);
      return res.json({
        viajes: resultado.recordsets[0],
        pasajeros: resultado.recordsets[1]
      });
    })
  );
  // ===================================================
  // GET /api/reservas/asientos/:viajeId
  // ===================================================
  router.get(
    '/asientos/:viajeId',
    asyncRoute(async (req, res) => {
      const viajeId = obtenerId(
        req.params.viajeId
      );
      const pool = await getPool();
      const viajeResult = await pool.request()
        .input(
          'viajeId',
          sql.BigInt,
          viajeId
        )
        .query(`
          SELECT
            v.ViajeID,
            v.BusID,
            v.Salida,
            v.LlegadaEstimada,
            v.Tarifa,
            v.Estado,
            r.Origen,
            r.Destino,
            b.Placa,
            b.Modelo,
            b.Capacidad
          FROM dbo.Viaje v
          INNER JOIN dbo.Ruta r
            ON r.RutaID = v.RutaID
          INNER JOIN dbo.Bus b
            ON b.BusID = v.BusID
          WHERE v.ViajeID = @viajeId
        `);
      const viaje = viajeResult.recordset[0];
      if (!viaje) {
        return res.status(404).json({
          error: 'Viaje no encontrado.'
        });
      }
      const resultado = await pool.request()
        .input(
          'viajeId',
          sql.BigInt,
          viajeId
        )
        .input(
          'busId',
          sql.Int,
          viaje.BusID
        )
        .query(`
          SELECT
            a.AsientoID,
            a.BusID,
            a.Numero,
            a.Nivel,
            CAST(
              CASE
                WHEN EXISTS (
                  SELECT 1
                  FROM dbo.ReservaAsiento ra
                  WHERE ra.ViajeID = @viajeId
                    AND ra.AsientoID = a.AsientoID
                    AND ra.Estado = 'ACTIVA'
                )
                THEN 1
                ELSE 0
              END
            AS bit) AS Ocupado
          FROM dbo.Asiento a
          WHERE a.BusID = @busId
          ORDER BY a.Nivel, a.Numero
        `);
      return res.json({
        viaje,
        asientos: resultado.recordset
      });
    })
  );
  // ===================================================
  // GET /api/reservas
  // ===================================================
  router.get(
    '/',
    asyncRoute(async (req, res) => {
      const q = String(
        req.query.q || ''
      ).trim().slice(0, 100);
      const pool = await getPool();
      const resultado = await pool.request()
        .input(
          'q',
          sql.NVarChar(110),
          `%${q}%`
        )
        .query(`
          SELECT
            r.ReservaID,
            r.Codigo,
            r.FechaReserva,
            r.Estado,
            r.Total,
            r.ViajeID,
            CONCAT(
              ru.Origen,
              ' - ',
              ru.Destino
            ) AS Ruta,
            v.Salida,
            b.Placa,
            COUNT(
              ra.ReservaAsientoID
            ) AS CantidadAsientos
          FROM dbo.Reserva r
          INNER JOIN dbo.Viaje v
            ON v.ViajeID = r.ViajeID
          INNER JOIN dbo.Ruta ru
            ON ru.RutaID = v.RutaID
          INNER JOIN dbo.Bus b
            ON b.BusID = v.BusID
          LEFT JOIN dbo.ReservaAsiento ra
            ON ra.ReservaID = r.ReservaID
          WHERE
            r.Codigo LIKE @q
            OR ru.Origen LIKE @q
            OR ru.Destino LIKE @q
            OR b.Placa LIKE @q
            OR r.Estado LIKE @q
          GROUP BY
            r.ReservaID,
            r.Codigo,
            r.FechaReserva,
            r.Estado,
            r.Total,
            r.ViajeID,
            ru.Origen,
            ru.Destino,
            v.Salida,
            b.Placa
          ORDER BY r.ReservaID DESC
        `);
      return res.json(
        resultado.recordset
      );
    })
  );
  // ===================================================
  // PASO 170.7.7.12.12.9
  // GET /api/reservas/:id/historial
  // CONSULTAR HISTORIAL COMPLETO DE UNA RESERVA
  // ===================================================
  router.get(
    '/:id/historial',
    asyncRoute(async (req, res) => {
      const reservaId = obtenerId(req.params.id);
      const pool = await getPool();
      // Comprobar que la reserva existe.
      const reservaResult = await pool.request()
        .input('reservaId', sql.BigInt, reservaId)
        .query(`
          SELECT
            ReservaID,
            Codigo,
            Estado
          FROM dbo.Reserva
          WHERE ReservaID = @reservaId
        `);
      const reserva = reservaResult.recordset[0];
      if (!reserva) {
        return res.status(404).json({
          error: 'Reserva no encontrada.'
        });
      }
      // Consultar movimientos registrados.
      const historialResult = await pool.request()
        .input('reservaId', sql.BigInt, reservaId)
        .query(`
          SELECT
            h.ReservaID,
            h.UsuarioResponsableID,
            h.Accion,
            h.ViajeAnteriorID,
            h.ViajeNuevoID,
            h.Detalle,
            h.FechaCambio,
            u.Nombres AS ResponsableNombres,
            u.Apellidos AS ResponsableApellidos
          FROM dbo.HistorialReserva h
          LEFT JOIN dbo.Usuario u
            ON u.UsuarioID = h.UsuarioResponsableID
          WHERE h.ReservaID = @reservaId
          ORDER BY h.FechaCambio ASC
        `);
      const historial = historialResult.recordset.map(
        movimiento => ({
          ReservaID: movimiento.ReservaID,
          Accion: movimiento.Accion,
          FechaCambio: movimiento.FechaCambio,
          ViajeAnteriorID: movimiento.ViajeAnteriorID,
          ViajeNuevoID: movimiento.ViajeNuevoID,
          Detalle: movimiento.Detalle,
          UsuarioResponsableID:
            movimiento.UsuarioResponsableID,
          Responsable:
            [
              movimiento.ResponsableNombres,
              movimiento.ResponsableApellidos
            ].filter(Boolean).join(' ') ||
            `Usuario ${movimiento.UsuarioResponsableID}`
        })
      );
      return res.status(200).json({
        ReservaID: reserva.ReservaID,
        Codigo: reserva.Codigo,
        Estado: reserva.Estado,
        TotalMovimientos: historial.length,
        historial
      });
    })
  );
  // ===================================================
  // FIN DEL ENDPOINT DE HISTORIAL
  // ===================================================
  // ===================================================
  // GET /api/reservas/:id
  // ===================================================
  router.get(
    '/:id',
    asyncRoute(async (req, res) => {
      const id = obtenerId(
        req.params.id
      );
      const pool = await getPool();
      const cabecera = await pool.request()
        .input(
          'id',
          sql.BigInt,
          id
        )
        .query(`
          SELECT
            r.ReservaID,
            r.Codigo,
            r.FechaReserva,
            r.Estado,
            r.Total,
            r.PoliticaID,
            u.UsuarioID,
            u.Nombres AS UsuarioNombres,
            u.Apellidos AS UsuarioApellidos,
            v.ViajeID,
            v.Salida,
            v.LlegadaEstimada,
            v.Tarifa,
            ru.Origen,
            ru.Destino,
            b.Placa,
            b.Modelo
          FROM dbo.Reserva r
          INNER JOIN dbo.Usuario u
            ON u.UsuarioID = r.UsuarioID
          INNER JOIN dbo.Viaje v
            ON v.ViajeID = r.ViajeID
          INNER JOIN dbo.Ruta ru
            ON ru.RutaID = v.RutaID
          INNER JOIN dbo.Bus b
            ON b.BusID = v.BusID
          WHERE r.ReservaID = @id
        `);
      const reserva = cabecera.recordset[0];
      if (!reserva) {
        return res.status(404).json({
          error: 'Reserva no encontrada.'
        });
      }
      const detalle = await pool.request()
        .input(
          'id',
          sql.BigInt,
          id
        )
        .query(`
          SELECT
            ra.ReservaAsientoID,
            ra.AsientoID,
            a.Numero,
            a.Nivel,
            ra.PasajeroID,
            p.TipoDocumento,
            p.NumeroDocumento,
            p.Nombres,
            p.Apellidos,
            p.FechaNacimiento,
            ra.Precio,
            ra.Estado
          FROM dbo.ReservaAsiento ra
          INNER JOIN dbo.Asiento a
            ON a.AsientoID = ra.AsientoID
          INNER JOIN dbo.Pasajero p
            ON p.PasajeroID = ra.PasajeroID
          WHERE ra.ReservaID = @id
          ORDER BY a.Nivel, a.Numero
        `);
      return res.json({
        ...reserva,
        items: detalle.recordset
      });
    })
  );
  // ===================================================
  // POST /api/reservas
  // CREAR RESERVA
  // ===================================================
  // CONTINÚA EN EL BLOQUE 2
  // ===================================================
  // PATCH /api/reservas/:id/cancelar
  // ===================================================
  router.patch(
    '/:id/cancelar',
    asyncRoute(async (req, res) => {
      const id = obtenerId(
        req.params.id
      );
      const pool = await getPool();
      const tx = new sql.Transaction(pool);
      await tx.begin(
        sql.ISOLATION_LEVEL.SERIALIZABLE
      );
      try {
        const consulta = await new sql.Request(tx)
          .input(
            'id',
            sql.BigInt,
            id
          )
          .query(`
            SELECT
              r.ReservaID,
              r.ViajeID,
              r.Estado,
              v.Estado AS EstadoViaje,
              CASE WHEN v.Salida > SYSDATETIME()
                THEN 1 ELSE 0 END AS SalidaFutura
            FROM dbo.Reserva r WITH (UPDLOCK, HOLDLOCK)
            INNER JOIN dbo.Viaje v
              ON v.ViajeID = r.ViajeID
            WHERE r.ReservaID = @id
          `);
        const reserva =
          consulta.recordset[0];
        if (!reserva) {
          throw errorHttp(
            'Reserva no encontrada.',
            404
          );
        }
        if (reserva.Estado === 'CANCELADA') {
          throw errorHttp(
            'Esta reserva ya está cancelada.',
            409
          );
        }
        if (![
          'COMPLETADA',
          'CONFIRMADA',
          'REPROGRAMADA'
        ].includes(reserva.Estado)) {
          throw errorHttp(
            'El estado no permite cancelar esta reserva.',
            409
          );
        }
        // Cancelación ordinaria solo antes de la salida.
        if (
          reserva.EstadoViaje !== 'PROGRAMADO' ||
          Number(reserva.SalidaFutura) !== 1
        ) {
          throw errorHttp(
            'El viaje ya salió o no está programado. ' +
            'Requiere revisión administrativa.',
            409
          );
        }
        // Bloquear ventas asociadas.
        const ventas = await new sql.Request(tx)
          .input(
            'id',
            sql.BigInt,
            id
          )
          .query(`
            SELECT
              v.VentaID,
              v.Estado AS EstadoVenta,
              p.PagoID,
              p.Estado AS EstadoPago,
              p.EsSimulado
            FROM dbo.Venta v WITH (UPDLOCK, HOLDLOCK)
            LEFT JOIN dbo.Pago p WITH (UPDLOCK, HOLDLOCK)
              ON p.VentaID = v.VentaID
            WHERE v.ReservaID = @id
          `);
        if (ventas.recordset.some(
          fila => fila.EstadoVenta !== 'ANULADA'
        )) {
          throw errorHttp(
            'La reserva tiene una venta vigente. ' +
            'Anúlala primero desde Ventas.',
            409
          );
        }
        if (ventas.recordset.some(
          fila => fila.PagoID == null ||
            fila.EstadoPago !== 'ANULADO' ||
            Number(fila.EsSimulado) !== 1
        )) {
          throw errorHttp(
            'La venta anulada tiene pagos pendientes o inconsistentes.',
            409
          );
        }
        // Bloquear asientos.
        await new sql.Request(tx)
          .input(
            'id',
            sql.BigInt,
            id
          )
          .query(`
            SELECT ReservaAsientoID
            FROM dbo.ReservaAsiento
              WITH (UPDLOCK, HOLDLOCK)
            WHERE ReservaID = @id
          `);
        // Liberar asientos.
        const liberacion = await new sql.Request(tx)
          .input(
            'id',
            sql.BigInt,
            id
          )
          .query(`
            UPDATE dbo.ReservaAsiento
            SET Estado = 'LIBERADA'
            WHERE ReservaID = @id
              AND Estado = 'ACTIVA'
          `);
        // Cambiar estado de reserva.
        const cancelacion = await new sql.Request(tx)
          .input(
            'id',
            sql.BigInt,
            id
          )
          .query(`
            UPDATE dbo.Reserva
            SET Estado = 'CANCELADA'
            WHERE ReservaID = @id
          `);
        if (
          cancelacion.rowsAffected[0] !== 1
        ) {
          throw errorHttp(
            'No se pudo cancelar la reserva.',
            409
          );
        }
        await registrarHistorialReserva({
          tx,
          reservaId: id,
          usuarioResponsableId:
            req.currentUser.UsuarioID,
          accion: 'CANCELACION',
          viajeAnteriorId:
            reserva.ViajeID,
          viajeNuevoId: null,
          detalle:
            `Reserva ${id} cancelada; ` +
            `${liberacion.rowsAffected[0] || 0} ` +
            'asiento(s) liberado(s).'
        });
        await tx.commit();
        return res.json({
          ReservaID: id,
          Estado: 'CANCELADA',
          AsientosLiberados:
            liberacion.rowsAffected[0] || 0,
          mensaje:
            'Reserva cancelada correctamente.'
        });
      } catch (error) {
        await revertir(
          tx,
          error,
          'CANCELAR RESERVA'
        );
        if (responderErrorSQL(error, res)) {
          return;
        }
        throw error;
      }
    })
  );
  // ===================================================
  // PUT /api/reservas/:id
  // EDITAR RESERVA
  // ===================================================
  router.put(
    '/:id',
    asyncRoute(async (req, res) => {
      const id = obtenerId(
        req.params.id
      );
      const datos = validarEsquema(
        edicionSchema,
        req.body
      );
      const pool = await getPool();
      const tx = new sql.Transaction(pool);
      await tx.begin(
        sql.ISOLATION_LEVEL.SERIALIZABLE
      );
      try {
        const reservaResult = await new sql.Request(tx)
          .input(
            'rid',
            sql.BigInt,
            id
          )
          .query(`
            SELECT
              r.ReservaID,
              r.ViajeID,
              r.Estado,
              v.BusID,
              v.Tarifa,
              v.Salida,
              v.Estado AS EstadoViaje,
              CASE WHEN v.Salida > SYSDATETIME()
                THEN 1 ELSE 0 END AS SalidaFutura
            FROM dbo.Reserva r WITH (UPDLOCK, HOLDLOCK)
            INNER JOIN dbo.Viaje v
              ON v.ViajeID = r.ViajeID
            WHERE r.ReservaID = @rid
          `);
        const reserva =
          reservaResult.recordset[0];
        if (!reserva) {
          throw errorHttp(
            'Reserva no encontrada.',
            404
          );
        }
        if (![
          'COMPLETADA',
          'CONFIRMADA',
          'REPROGRAMADA'
        ].includes(reserva.Estado)) {
          throw errorHttp(
            'La reserva no admite edición.',
            409
          );
        }
        if (reserva.EstadoViaje !== 'PROGRAMADO') {
          throw errorHttp(
            'El viaje no admite modificaciones.',
            409
          );
        }
        if (Number(reserva.SalidaFutura) !== 1) {
          throw errorHttp(
            'La fecha de salida del viaje ya venció.',
            409
          );
        }
        // No editar reservas con ventas.
        const venta = await new sql.Request(tx)
          .input(
            'rid',
            sql.BigInt,
            id
          )
          .query(`
            SELECT VentaID
            FROM dbo.Venta WITH (UPDLOCK, HOLDLOCK)
            WHERE ReservaID = @rid
          `);
        if (venta.recordset.length) {
          throw errorHttp(
            'Esta reserva tiene una venta asociada.',
            409
          );
        }
        // Recuperar asignaciones originales.
        const originales = await new sql.Request(tx)
          .input(
            'rid',
            sql.BigInt,
            id
          )
          .query(`
            SELECT
              ReservaAsientoID,
              AsientoID,
              PasajeroID,
              Estado
            FROM dbo.ReservaAsiento
              WITH (UPDLOCK, HOLDLOCK)
            WHERE ReservaID = @rid
            ORDER BY ReservaAsientoID
          `);
        const activos =
          originales.recordset.filter(
            item => item.Estado === 'ACTIVA'
          );
        if (
          activos.length !==
          datos.items.length
        ) {
          throw errorHttp(
            'Debe conservarse la cantidad original de asientos.',
            409
          );
        }
        const originalesMap = new Map(
          activos.map(item => [
            Number(item.ReservaAsientoID),
            item
          ])
        );
        if (
          datos.items.some(
            item =>
              !originalesMap.has(
                item.reservaAsientoId
              )
          )
        ) {
          throw errorHttp(
            'Un detalle no pertenece a esta reserva.',
            409
          );
        }
        // Evitar intercambios entre asientos
        // ocupados por la misma reserva.
        for (const item of datos.items) {
          const propio = originalesMap.get(
            item.reservaAsientoId
          );
          if (
            Number(propio.AsientoID) !==
              item.asientoId &&
            activos.some(
              otro =>
                Number(otro.AsientoID) ===
                item.asientoId
            )
          ) {
            throw errorHttp(
              'Selecciona un asiento libre.',
              409
            );
          }
        }
        // Validar asientos.
        await comprobarAsientos(
          tx,
          reserva.ViajeID,
          reserva.BusID,
          datos.items.map(
            item => item.asientoId
          ),
          id
        );
        // Recuperar o registrar pasajeros.
        const resueltos = [];
        for (const item of datos.items) {
          const pasajeroId =
            await obtenerORegistrarPasajero(
              tx,
              item
            );
          resueltos.push({
            ...item,
            pasajeroId
          });
        }
        await comprobarPasajeros(
          tx,
          reserva.ViajeID,
          resueltos.map(
            item => item.pasajeroId
          ),
          id
        );
        // Actualizar asignaciones.
        for (const item of resueltos) {
          const resultado = await new sql.Request(tx)
            .input(
              'reservaAsientoId',
              sql.BigInt,
              item.reservaAsientoId
            )
            .input(
              'reservaId',
              sql.BigInt,
              id
            )
            .input(
              'asientoId',
              sql.Int,
              item.asientoId
            )
            .input(
              'pasajeroId',
              sql.BigInt,
              item.pasajeroId
            )
            .query(`
              UPDATE dbo.ReservaAsiento
              SET
                AsientoID = @asientoId,
                PasajeroID = @pasajeroId
              WHERE
                ReservaAsientoID = @reservaAsientoId
                AND ReservaID = @reservaId
                AND Estado = 'ACTIVA'
            `);
          if (
            resultado.rowsAffected[0] !== 1
          ) {
            throw errorHttp(
              'No se pudo actualizar un asiento.',
              409
            );
          }
        }
        await tx.commit();
        return res.json({
          ReservaID: id,
          mensaje:
            'Reserva actualizada correctamente.'
        });
      } catch (error) {
        await revertir(
          tx,
          error,
          'EDITAR RESERVA'
        );
        if (responderErrorSQL(error, res)) {
          return;
        }
        throw error;
      }
    })
  );
  // ===================================================
  // PATCH /api/reservas/:id/reprogramar
  // ===================================================
  router.patch(
    '/:id/reprogramar',
    asyncRoute(async (req, res) => {
      const reservaId = obtenerId(
        req.params.id
      );
      const datos = validarEsquema(
        reprogramacionSchema,
        req.body
      );
      const pool = await getPool();
      const tx = new sql.Transaction(pool);
      await tx.begin(
        sql.ISOLATION_LEVEL.SERIALIZABLE
      );
      try {
        // Bloquear reserva.
        const cabecera = await new sql.Request(tx)
          .input(
            'id',
            sql.BigInt,
            reservaId
          )
          .query(`
            SELECT
              r.ReservaID,
              r.Codigo,
              r.ViajeID,
              r.Estado,
              r.Total,
              v.RutaID,
              v.BusID,
              v.Tarifa,
              v.Estado AS EstadoViaje,
              CASE
                WHEN v.Salida > SYSDATETIME()
                THEN 1
                ELSE 0
              END AS SalidaFutura
            FROM dbo.Reserva r WITH (UPDLOCK, HOLDLOCK)
            INNER JOIN dbo.Viaje v
              ON v.ViajeID = r.ViajeID
            WHERE r.ReservaID = @id
          `);
        const actual =
          cabecera.recordset[0];
        if (!actual) {
          throw errorHttp(
            'Reserva no encontrada.',
            404
          );
        }
        if (![
          'CONFIRMADA',
          'COMPLETADA',
          'REPROGRAMADA'
        ].includes(actual.Estado)) {
          throw errorHttp(
            'La reserva no admite reprogramación.',
            409
          );
        }
        if (
          Number(actual.ViajeID) ===
          datos.viajeNuevoId
        ) {
          throw errorHttp(
            'Selecciona un viaje diferente.',
            409
          );
        }
        if (
          actual.EstadoViaje !== 'PROGRAMADO' ||
          Number(actual.SalidaFutura) !== 1
        ) {
          throw errorHttp(
            'El viaje original debe tener salida futura.',
            409
          );
        }
        // No permitir ventas asociadas.
        const venta = await new sql.Request(tx)
          .input(
            'id',
            sql.BigInt,
            reservaId
          )
          .query(`
            SELECT TOP (1)
              VentaID
            FROM dbo.Venta WITH (UPDLOCK, HOLDLOCK)
            WHERE ReservaID = @id
          `);
        if (venta.recordset.length) {
          throw errorHttp(
            'La reserva tiene una venta asociada.',
            409
          );
        }
        // Validar viaje destino.
        const destinoResult = await new sql.Request(tx)
          .input(
            'viajeNuevoId',
            sql.BigInt,
            datos.viajeNuevoId
          )
          .query(`
            SELECT
              ViajeID,
              RutaID,
              BusID,
              Tarifa,
              Estado,
              CASE
                WHEN Salida > SYSDATETIME()
                THEN 1
                ELSE 0
              END AS SalidaFutura
            FROM dbo.Viaje WITH (UPDLOCK, HOLDLOCK)
            WHERE ViajeID = @viajeNuevoId
          `);
        const destino =
          destinoResult.recordset[0];
        if (!destino) {
          throw errorHttp(
            'Viaje destino no encontrado.',
            404
          );
        }
        if (
          destino.Estado !== 'PROGRAMADO' ||
          Number(destino.SalidaFutura) !== 1
        ) {
          throw errorHttp(
            'El viaje destino no está disponible.',
            409
          );
        }
        if (
          Number(destino.RutaID) !==
          Number(actual.RutaID)
        ) {
          throw errorHttp(
            'La reprogramación requiere la misma ruta.',
            409
          );
        }
        if (
          Math.round(
            Number(destino.Tarifa) * 100
          ) !==
          Math.round(
            Number(actual.Tarifa) * 100
          )
        ) {
          throw errorHttp(
            'La tarifa del viaje debe ser igual.',
            409
          );
        }
        // Obtener asignaciones.
        const asignaciones = await new sql.Request(tx)
          .input(
            'id',
            sql.BigInt,
            reservaId
          )
          .query(`
            SELECT
              ReservaAsientoID,
              AsientoID,
              PasajeroID,
              Estado
            FROM dbo.ReservaAsiento
              WITH (UPDLOCK, HOLDLOCK)
            WHERE ReservaID = @id
            ORDER BY ReservaAsientoID
          `);
        const activos =
          asignaciones.recordset.filter(
            item => item.Estado === 'ACTIVA'
          );
        if (
          !activos.length ||
          activos.length !==
            datos.items.length
        ) {
          throw errorHttp(
            'La cantidad de asientos no coincide.',
            409
          );
        }
        const mapa = new Map(
          activos.map(item => [
            Number(item.ReservaAsientoID),
            item
          ])
        );
        if (
          datos.items.some(
            item =>
              !mapa.has(
                item.reservaAsientoId
              )
          )
        ) {
          throw errorHttp(
            'Un detalle no pertenece a la reserva.',
            409
          );
        }
        // Validar nuevos asientos.
        await comprobarAsientos(
          tx,
          datos.viajeNuevoId,
          destino.BusID,
          datos.items.map(
            item => item.asientoId
          )
        );
        await comprobarPasajeros(
          tx,
          datos.viajeNuevoId,
          activos.map(
            item => item.PasajeroID
          )
        );
        // Evitar eliminar asientos con referencias
        // en otras tablas.
        const referencias = await new sql.Request(tx)
          .query(`
            SELECT COUNT(*) AS Total
            FROM sys.foreign_keys
            WHERE referenced_object_id =
              OBJECT_ID('dbo.ReservaAsiento')
          `);
        if (
          Number(
            referencias.recordset[0].Total
          ) > 0
        ) {
          throw errorHttp(
            'Existen referencias a ReservaAsiento. Se requiere revisar sus vínculos.',
            409
          );
        }
        // Eliminar asignaciones activas anteriores.
        const borrado = await new sql.Request(tx)
          .input(
            'id',
            sql.BigInt,
            reservaId
          )
          .query(`
            DELETE FROM dbo.ReservaAsiento
            WHERE ReservaID = @id
              AND Estado = 'ACTIVA'
          `);
        if (
          borrado.rowsAffected[0] !==
          activos.length
        ) {
          throw errorHttp(
            'No se pudieron trasladar todos los asientos.',
            409
          );
        }
        // Cambiar viaje en la reserva.
        const cambio = await new sql.Request(tx)
          .input(
            'id',
            sql.BigInt,
            reservaId
          )
          .input(
            'nuevo',
            sql.BigInt,
            datos.viajeNuevoId
          )
          .query(`
            UPDATE dbo.Reserva
            SET
              ViajeID = @nuevo,
              Estado = 'REPROGRAMADA'
            WHERE ReservaID = @id
          `);
        if (
          cambio.rowsAffected[0] !== 1
        ) {
          throw errorHttp(
            'No se pudo actualizar el viaje de la reserva.',
            409
          );
        }
        // Crear nuevas asignaciones,
        // conservando los pasajeros.
        for (const item of datos.items) {
          const anterior = mapa.get(
            item.reservaAsientoId
          );
          await new sql.Request(tx)
            .input(
              'id',
              sql.BigInt,
              reservaId
            )
            .input(
              'viajeNuevoId',
              sql.BigInt,
              datos.viajeNuevoId
            )
            .input(
              'busId',
              sql.Int,
              destino.BusID
            )
            .input(
              'asientoId',
              sql.Int,
              item.asientoId
            )
            .input(
              'pasajeroId',
              sql.BigInt,
              anterior.PasajeroID
            )
            .input(
              'precio',
              sql.Decimal(12, 2),
              Number(destino.Tarifa)
            )
            .query(`
              INSERT INTO dbo.ReservaAsiento (
                ReservaID,
                ViajeID,
                BusID,
                AsientoID,
                PasajeroID,
                Precio,
                Estado
              )
              VALUES (
                @id,
                @viajeNuevoId,
                @busId,
                @asientoId,
                @pasajeroId,
                @precio,
                'ACTIVA'
              )
            `);
        }
        // Registrar historial.
        await registrarHistorialReserva({
          tx,
          reservaId,
          usuarioResponsableId:
            req.currentUser.UsuarioID,
          accion: 'REPROGRAMACION',
          viajeAnteriorId:
            actual.ViajeID,
          viajeNuevoId:
            datos.viajeNuevoId,
          detalle:
            `Reserva ${actual.Codigo} reprogramada ` +
            `del viaje ${actual.ViajeID} al ` +
            `${datos.viajeNuevoId}; ` +
            `${activos.length} asiento(s).`
        });
        await tx.commit();
        return res.json({
          ReservaID: reservaId,
          Codigo: actual.Codigo,
          ViajeAnteriorID:
            actual.ViajeID,
          ViajeNuevoID:
            datos.viajeNuevoId,
          Estado: 'REPROGRAMADA',
          CantidadAsientos:
            activos.length,
          mensaje:
            'Reserva reprogramada correctamente.'
        });
      } catch (error) {
        await revertir(
          tx,
          error,
          'REPROGRAMAR RESERVA'
        );
        if (responderErrorSQL(error, res)) {
          return;
        }
        throw error;
      }
    })
  );
  return router;
}
