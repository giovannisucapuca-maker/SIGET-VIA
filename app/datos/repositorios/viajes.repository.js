// SIGET-VÍA — CAPA DATOS — VIAJES (RF7)
// Todas las consultas SQL y transacciones de Viajes se encuentran aquí.
import { getPool, sql } from '../config/db.js';

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

function fechaSQL(valor) {
  return new Date(`${valor}:00Z`);
}

function crearInputs(request, datos) {
  return request
    .input('ruta', sql.Int, datos.rutaId)
    .input('bus', sql.Int, datos.busId)
    .input('conductor', sql.Int, datos.conductorId)
    .input('salida', sql.DateTime2, fechaSQL(datos.salida))
    .input('llegada', sql.DateTime2, fechaSQL(datos.llegadaEstimada))
    .input('tarifa', sql.Decimal(12, 2), datos.tarifa)
    .input('estado', sql.VarChar(15), datos.estado);
}

export async function enTransaccion(operacion) {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const valor = await operacion(tx);
    await tx.commit();
    return valor;
  } catch (e) {
    await tx.rollback().catch(() => {});
    throw e;
  }
}

export async function consultarReferencias(tx, datos) {
  const request = new sql.Request(tx)
    .input('ruta', sql.Int, datos.rutaId)
    .input('bus', sql.Int, datos.busId)
    .input('conductor', sql.Int, datos.conductorId);
  const resultado = await request.query(`
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
        ) AS EstadoConductor,

        (
          SELECT CONVERT(VARCHAR(10), FechaVencimientoLicencia, 23)
          FROM dbo.Conductor WITH (HOLDLOCK)
          WHERE ConductorID = @conductor
        ) AS VenceLicencia
    `);
  return resultado.recordset[0];
}

export async function buscarCruceHorario(tx, datos, excluirId = null) {
  const request = new sql.Request(tx)
    .input('id', sql.BigInt, excluirId)
    .input('bus', sql.Int, datos.busId)
    .input('conductor', sql.Int, datos.conductorId)
    .input('salida', sql.DateTime2, fechaSQL(datos.salida))
    .input('llegada', sql.DateTime2, fechaSQL(datos.llegadaEstimada));
  const resultado = await request.query(`
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
  return resultado.recordset[0] || null;
}

export async function buscarViajeBloqueado(tx, id) {
  const request = new sql.Request(tx)
    .input('id', sql.BigInt, id);
  const resultado = await request.query(`
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
  return resultado.recordset[0] || null;
}

export async function contarReservas(tx, viajeId) {
  const request = new sql.Request(tx)
    .input('viajeId', sql.BigInt, viajeId);
  const resultado = await request.query(`
      SELECT
        COUNT_BIG(*) AS Cantidad

      FROM dbo.Reserva WITH (
        UPDLOCK,
        HOLDLOCK
      )

      WHERE ViajeID = @viajeId
        AND Estado <> 'CANCELADA'
    `);
  return Number(resultado.recordset[0]?.Cantidad || 0);
}

export async function consultarCatalogos() {
  const pool = await getPool();
  const request = pool.request();
  const resultado = await request.query(`
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
            CONVERT(VARCHAR(10), FechaVencimientoLicencia, 23) AS FechaVencimientoLicencia,
            Estado

          FROM dbo.Conductor

          ORDER BY Apellidos, Nombres;
        `);
  return { rutas: resultado.recordsets[0], buses: resultado.recordsets[1], conductores: resultado.recordsets[2] };
}

export async function listarViajes(q) {
  const pool = await getPool();
  const request = pool.request().input('q', sql.NVarChar(110), `%${q}%`);
  const resultado = await request.query(`
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
  return resultado.recordset;
}

export async function consultarViaje(id) {
  const pool = await getPool();
  const request = pool.request().input('id', sql.BigInt, id);
  const resultado = await request.query(`
          ${consulta}

          WHERE v.ViajeID = @id
        `);
  return resultado.recordset[0] || null;
}

export async function insertarViaje(tx, datos) {
  const request = crearInputs(new sql.Request(tx), datos);
  const resultado = await request.query(`
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
  return resultado.recordset[0].ViajeID;
}

export async function actualizarViaje(tx, id, datos) {
  const request = crearInputs(new sql.Request(tx).input('id', sql.BigInt, id), datos);
  const resultado = await request.query(`
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
  return resultado.rowsAffected[0];
}

export async function actualizarEstado(tx, id, nuevoEstado, estadoActual) {
  const request = new sql.Request(tx)
    .input('id', sql.BigInt, id)
    .input('estadoNuevo', sql.VarChar(15), nuevoEstado)
    .input('estadoActual', sql.VarChar(15), estadoActual);
  const resultado = await request.query(`
              UPDATE dbo.Viaje

              SET Estado = @estadoNuevo

              WHERE ViajeID = @id
                AND Estado = @estadoActual
            `);
  return resultado.rowsAffected[0];
}

export async function auditarEstado(tx, usuarioId, viajeId, estadoAnterior, nuevoEstado) {
  const request = new sql.Request(tx)
    .input('usuarioId', sql.BigInt, usuarioId)
    .input('viajeId', sql.BigInt, viajeId)
    .input('accion', sql.VarChar(30), 'CAMBIO_ESTADO')
    .input('detalle', sql.NVarChar(500), `Cambio de estado del viaje #${viajeId}: ${estadoAnterior} → ${nuevoEstado}.`);
  const resultado = await request.query(`
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
  return resultado.rowsAffected[0];
}
