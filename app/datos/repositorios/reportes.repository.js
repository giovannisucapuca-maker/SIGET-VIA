import { getPool, sql } from '../config/db.js';

function crearRequest(pool, filtros) {

  return pool.request()

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

    .input(

      'q',

      sql.NVarChar(110),

      `%${filtros.q}%`

    );

}

// Se usan fechas de SQL Server sin cambiar

// el huso horario de los registros.

//

// "hasta" incluye todo el día seleccionado.

function condicionFecha(campo) {

  return `

    (

      @desde IS NULL

      OR ${campo} >=

        CONVERT(date, @desde, 23)

    )

    AND

    (

      @hasta IS NULL

      OR ${campo} <

        DATEADD(

          DAY,

          1,

          CONVERT(date, @hasta, 23)

        )

    )

  `;

}

// =====================================================

// REPORTE 1 - RESERVAS

// =====================================================

const SQL_RESERVAS = `

  SELECT TOP (500)

    r.ReservaID,

    r.Codigo,

    r.FechaReserva,

    r.Estado,

    r.Total,

    r.UsuarioID,

    r.ViajeID,

    v.Salida,

    ru.Origen,

    ru.Destino,

    u.Nombres AS ClienteNombres,

    u.Apellidos AS ClienteApellidos,

    (

      SELECT COUNT_BIG(*)

      FROM dbo.ReservaAsiento ra

      WHERE ra.ReservaID = r.ReservaID

        AND ra.Estado = 'ACTIVA'

    ) AS AsientosActivos

  FROM dbo.Reserva r

  INNER JOIN dbo.Usuario u

    ON u.UsuarioID = r.UsuarioID

  INNER JOIN dbo.Viaje v

    ON v.ViajeID = r.ViajeID

  INNER JOIN dbo.Ruta ru

    ON ru.RutaID = v.RutaID

  WHERE

    ${condicionFecha('r.FechaReserva')}

    AND (

      r.Codigo LIKE @q

      OR r.Estado LIKE @q

      OR u.Nombres LIKE @q

      OR u.Apellidos LIKE @q

      OR ru.Origen LIKE @q

      OR ru.Destino LIKE @q

      OR CONVERT(

        VARCHAR(30),

        r.ReservaID

      ) LIKE @q

    )

  ORDER BY

    r.FechaReserva DESC,

    r.ReservaID DESC

`;

// =====================================================

// REPORTE 2 - VENTAS

// =====================================================

const SQL_VENTAS = `

  SELECT TOP (500)

    ve.VentaID,

    ve.CodigoComprobante,

    ve.ReservaID,

    re.Codigo AS CodigoReserva,

    ve.VendedorID,

    ve.FechaVenta,

    ve.Total,

    ve.Estado,

    u.Nombres AS VendedorNombres,

    u.Apellidos AS VendedorApellidos,

    p.PagoID,

    p.Metodo,

    p.Monto AS MontoPago,

    p.Estado AS EstadoPago,

    p.EsSimulado,

    p.FechaPago

  FROM dbo.Venta ve

  INNER JOIN dbo.Reserva re

    ON re.ReservaID = ve.ReservaID

  INNER JOIN dbo.Usuario u

    ON u.UsuarioID = ve.VendedorID

  OUTER APPLY (

    SELECT TOP (1)

      pg.PagoID,

      pg.Metodo,

      pg.Monto,

      pg.Estado,

      pg.EsSimulado,

      pg.FechaPago

    FROM dbo.Pago pg

    WHERE pg.VentaID = ve.VentaID

    ORDER BY pg.PagoID DESC

  ) p

  WHERE

    ${condicionFecha('ve.FechaVenta')}

    AND (

      ve.CodigoComprobante LIKE @q

      OR re.Codigo LIKE @q

      OR ve.Estado LIKE @q

      OR u.Nombres LIKE @q

      OR u.Apellidos LIKE @q

      OR CONVERT(

        VARCHAR(30),

        ve.VentaID

      ) LIKE @q

    )

  ORDER BY

    ve.FechaVenta DESC,

    ve.VentaID DESC

`;

// =====================================================

// REPORTE 3 - VIAJES PROGRAMADOS

// =====================================================

const SQL_VIAJES = `

  SELECT TOP (500)

    v.ViajeID,

    v.RutaID,

    v.BusID,

    v.ConductorID,

    v.Salida,

    v.LlegadaEstimada,

    v.Tarifa,

    v.Estado,

    ru.Origen,

    ru.Destino,

    b.Placa,

    b.Modelo,

    b.Capacidad,

    c.Nombres AS ConductorNombres,

    c.Apellidos AS ConductorApellidos

  FROM dbo.Viaje v

  INNER JOIN dbo.Ruta ru

    ON ru.RutaID = v.RutaID

  INNER JOIN dbo.Bus b

    ON b.BusID = v.BusID

  INNER JOIN dbo.Conductor c

    ON c.ConductorID = v.ConductorID

  WHERE

    ${condicionFecha('v.Salida')}

    AND (

      ru.Origen LIKE @q

      OR ru.Destino LIKE @q

      OR b.Placa LIKE @q

      OR v.Estado LIKE @q

      OR c.Nombres LIKE @q

      OR c.Apellidos LIKE @q

      OR CONVERT(

        VARCHAR(30),

        v.ViajeID

      ) LIKE @q

    )

  ORDER BY

    v.Salida DESC,

    v.ViajeID DESC

`;

// =====================================================

// REPORTE 4 - OCUPACIÓN DE BUSES

// =====================================================

//

// Se cuentan los asientos físicos de cada bus.

// La ocupación corresponde a asientos ACTIVOS

// de una reserva que sigue vigente.

//

// Las subconsultas evitan duplicar asientos

// al unir varias reservas con un mismo viaje.

// =====================================================

const SQL_OCUPACION = `

  SELECT TOP (500)

    v.ViajeID,

    v.Salida,

    v.Estado AS EstadoViaje,

    ru.Origen,

    ru.Destino,

    b.BusID,

    b.Placa,

    b.Modelo,

    b.Capacidad,

    COALESCE(

      asientos.TotalAsientos,

      0

    ) AS TotalAsientos,

    COALESCE(

      ocupados.AsientosOcupados,

      0

    ) AS AsientosOcupados,

    CASE

      WHEN COALESCE(

        asientos.TotalAsientos,

        0

      ) > COALESCE(

        ocupados.AsientosOcupados,

        0

      )

      THEN

        asientos.TotalAsientos

        - COALESCE(

          ocupados.AsientosOcupados,

          0

        )

      ELSE 0

    END AS AsientosDisponibles,

    CAST(

      CASE

        WHEN COALESCE(

          asientos.TotalAsientos,

          0

        ) = 0

        THEN 0

        ELSE

          100.0 *

          COALESCE(

            ocupados.AsientosOcupados,

            0

          ) /

          asientos.TotalAsientos

      END

      AS DECIMAL(6,2)

    ) AS PorcentajeOcupacion

  FROM dbo.Viaje v

  INNER JOIN dbo.Ruta ru

    ON ru.RutaID = v.RutaID

  INNER JOIN dbo.Bus b

    ON b.BusID = v.BusID

  OUTER APPLY (

    SELECT

      COUNT_BIG(*) AS TotalAsientos

    FROM dbo.Asiento a

    WHERE a.BusID = v.BusID

  ) asientos

  OUTER APPLY (

    SELECT

      COUNT_BIG(*) AS AsientosOcupados

    FROM dbo.Asiento a

    WHERE a.BusID = v.BusID

      AND EXISTS (

        SELECT 1

        FROM dbo.ReservaAsiento ra

        INNER JOIN dbo.Reserva r

          ON r.ReservaID = ra.ReservaID

        WHERE

          ra.AsientoID = a.AsientoID

          AND ra.ViajeID = v.ViajeID

          AND ra.BusID = v.BusID

          AND ra.Estado = 'ACTIVA'

          AND r.Estado IN (

            'CONFIRMADA',

            'COMPLETADA',

            'REPROGRAMADA'

          )

      )

  ) ocupados

  WHERE

    ${condicionFecha('v.Salida')}

    AND (

      ru.Origen LIKE @q

      OR ru.Destino LIKE @q

      OR b.Placa LIKE @q

      OR v.Estado LIKE @q

      OR CONVERT(

        VARCHAR(30),

        v.ViajeID

      ) LIKE @q

    )

  ORDER BY

    v.Salida DESC,

    v.ViajeID DESC

`;

// =====================================================

// REPORTE 5 - RECLAMACIONES

// =====================================================

const SQL_RECLAMACIONES = `

  SELECT TOP (500)

    r.ReclamacionID,

    r.NumeroCorrelativo,

    r.TipoSolicitud,

    r.NombreReclamante,

    r.TipoDocumento,

    r.NumeroDocumento,

    r.CorreoReclamante,

    r.FechaRegistro,

    r.Estado,

    r.ReservaID,

    (

      SELECT COUNT_BIG(*)

      FROM dbo.RespuestaReclamacion rr

      WHERE rr.ReclamacionID =

        r.ReclamacionID

    ) AS TotalRespuestas,

    (

      SELECT MAX(rr.FechaRespuesta)

      FROM dbo.RespuestaReclamacion rr

      WHERE rr.ReclamacionID =

        r.ReclamacionID

    ) AS UltimaRespuesta

  FROM dbo.Reclamacion r

  WHERE

    ${condicionFecha('r.FechaRegistro')}

    AND (

      r.NumeroCorrelativo LIKE @q

      OR r.NombreReclamante LIKE @q

      OR r.NumeroDocumento LIKE @q

      OR r.TipoSolicitud LIKE @q

      OR r.Estado LIKE @q

      OR CONVERT(

        VARCHAR(30),

        r.ReclamacionID

      ) LIKE @q

    )

  ORDER BY

    r.FechaRegistro DESC,

    r.ReclamacionID DESC

`;

// =====================================================

// CONSULTAS POR TIPO

// =====================================================

const CONSULTAS = {

  reservas: SQL_RESERVAS,

  ventas: SQL_VENTAS,

  viajes: SQL_VIAJES,

  ocupacion: SQL_OCUPACION,

  reclamaciones: SQL_RECLAMACIONES

};

// =====================================================

// RESUMEN GENERAL DE INDICADORES

// =====================================================

const SQL_RESUMEN = `

  SELECT

    (

      SELECT COUNT_BIG(*)

      FROM dbo.Reserva r

      WHERE ${condicionFecha('r.FechaReserva')}

    ) AS TotalReservas,

    (

      SELECT COUNT_BIG(*)

      FROM dbo.Reserva r

      WHERE

        ${condicionFecha('r.FechaReserva')}

        AND r.Estado = 'CANCELADA'

    ) AS ReservasCanceladas,

    (

      SELECT COUNT_BIG(*)

      FROM dbo.Venta ve

      WHERE ${condicionFecha('ve.FechaVenta')}

    ) AS TotalVentas,

    (

      SELECT COUNT_BIG(*)

      FROM dbo.Venta ve

      WHERE

        ${condicionFecha('ve.FechaVenta')}

        AND ve.Estado = 'REGISTRADA'

    ) AS VentasRegistradas,

    (

      SELECT COUNT_BIG(*)

      FROM dbo.Venta ve

      WHERE

        ${condicionFecha('ve.FechaVenta')}

        AND ve.Estado = 'ANULADA'

    ) AS VentasAnuladas,

    (

      SELECT

        COALESCE(SUM(ve.Total), 0)

      FROM dbo.Venta ve

      WHERE

        ${condicionFecha('ve.FechaVenta')}

        AND ve.Estado = 'REGISTRADA'

    ) AS TotalVentasVigentes,

    (

      SELECT COUNT_BIG(*)

      FROM dbo.Viaje v

      WHERE ${condicionFecha('v.Salida')}

    ) AS TotalViajes,

    (

      SELECT COUNT_BIG(*)

      FROM dbo.Viaje v

      WHERE

        ${condicionFecha('v.Salida')}

        AND v.Estado = 'PROGRAMADO'

    ) AS ViajesProgramados,

    (

      SELECT COUNT_BIG(*)

      FROM dbo.Reclamacion r

      WHERE ${condicionFecha('r.FechaRegistro')}

    ) AS TotalReclamaciones,

    (

      SELECT COUNT_BIG(*)

      FROM dbo.Reclamacion r

      WHERE

        ${condicionFecha('r.FechaRegistro')}

        AND r.Estado = 'CERRADO'

    ) AS ReclamacionesCerradas,

    (

      SELECT COUNT_BIG(*)

      FROM dbo.Reclamacion r

      WHERE

        ${condicionFecha('r.FechaRegistro')}

        AND r.Estado IN (

          'REGISTRADO',

          'EN_ATENCION'

        )

    ) AS ReclamacionesPendientes

`;

// =====================================================

// ROUTER

// =====================================================

const SQL_DASHBOARD_EXTRA = `

        SELECT

          (

            SELECT COUNT_BIG(*)

            FROM dbo.Pasajero

          ) AS TotalPasajeros,

          (

            SELECT COUNT_BIG(*)

            FROM dbo.Bus

          ) AS TotalBuses,

          (

            SELECT COUNT_BIG(*)

            FROM dbo.Bus

            WHERE Estado = 'OPERATIVO'

          ) AS BusesActivos,

          (

            SELECT COUNT_BIG(*)

            FROM dbo.Bus

            WHERE Estado = 'INACTIVO'

          ) AS BusesInactivos,

          (

            SELECT COUNT_BIG(*)

            FROM dbo.Bus

            WHERE Estado = 'MANTENIMIENTO'

          ) AS BusesMantenimiento,

          (

            SELECT COUNT_BIG(*)

            FROM dbo.Conductor

          ) AS TotalConductores,

          (

            SELECT COUNT_BIG(*)

            FROM dbo.Conductor

            WHERE Estado = 'ACTIVO'

          ) AS ConductoresActivos

      `;

export async function consultarResumenReportes(filtros) {
  const pool = await getPool();
  const resultado = await crearRequest(pool, filtros).query(SQL_RESUMEN);
  return resultado.recordset[0];
}

export async function consultarDashboardExtra() {
  const pool = await getPool();
  const resultado = await pool.request().query(SQL_DASHBOARD_EXTRA);
  return resultado.recordset[0];
}

export async function consultarReportePorTipo(tipo, filtros) {
  const pool = await getPool();
  const resultado = await crearRequest(pool, filtros).query(CONSULTAS[tipo]);
  return resultado.recordset;
}
