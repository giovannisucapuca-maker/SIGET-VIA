// Capa de acceso a datos: consulta pública de viajes.
// Consulta SQL original trasladada sin alterar filtros ni condiciones.
import { getPool, sql } from '../config/db.js';

export async function consultarViajesDisponibles({ origen, destino, fecha, ahora }) {
      const pool = await getPool();

      const resultado = await pool.request()
        .input(
          'origen',
          sql.NVarChar(120),
          origen
        )
        .input(
          'destino',
          sql.NVarChar(120),
          destino
        )
        .input(
          'fecha',
          sql.VarChar(10),
          fecha || null
        )
        .input(
          'ahora',
          sql.DateTime2,
          new Date(`${ahora}Z`)
        )
        .query(`
          SELECT TOP (100)

            -- IDENTIFICACIÓN DEL VIAJE

            v.ViajeID,

            -- INFORMACIÓN DE LA RUTA

            r.Origen,
            r.Destino,

            -- TERMINALES TERRESTRES

            tor.Nombre AS TerminalOrigen,
            tor.Direccion AS DireccionOrigen,
            tde.Nombre AS TerminalDestino,
            tde.Direccion AS DireccionDestino,

            -- HORARIOS

            v.Salida,
            v.LlegadaEstimada,

            -- TARIFA DEL VIAJE

            v.Tarifa,

            -- BUS ASIGNADO

            b.BusID,
            b.Placa,
            b.Modelo,
            b.Capacidad,

            -- TIPO DE SERVICIO

            ts.TipoServicioID,
            ts.Nombre AS TipoServicio,

            -- ASIENTOS REGISTRADOS

            CONVERT(
              int,
              COUNT(
                DISTINCT a.AsientoID
              )
            ) AS AsientosRegistrados,

            -- ASIENTOS OCUPADOS

            CONVERT(
              int,
              COUNT(
                DISTINCT CASE
                  WHEN ra.Estado IN (
                    N'ACTIVA',
                    N'ACTIVO'
                  )
                  AND rr.Estado <> N'CANCELADA'
                  THEN ra.AsientoID
                END
              )
            ) AS AsientosOcupados

          FROM dbo.Viaje v

          -- ===========================================
          -- RUTA
          -- ===========================================

          INNER JOIN dbo.Ruta r
            ON r.RutaID = v.RutaID

          LEFT JOIN dbo.Terminal tor
            ON tor.TerminalID = r.TerminalOrigenID

          LEFT JOIN dbo.Terminal tde
            ON tde.TerminalID = r.TerminalDestinoID

          -- ===========================================
          -- BUS
          -- ===========================================

          INNER JOIN dbo.Bus b
            ON b.BusID = v.BusID

          -- ===========================================
          -- TIPO DE SERVICIO
          --
          -- LEFT JOIN:
          -- Permite mostrar buses antiguos aunque
          -- aún no tengan un servicio asignado.
          -- ===========================================

          LEFT JOIN dbo.TipoServicio ts
            ON ts.TipoServicioID =
               b.TipoServicioID

          -- ===========================================
          -- ASIENTOS DEL BUS
          -- ===========================================

          LEFT JOIN dbo.Asiento a
            ON a.BusID = b.BusID

          -- ===========================================
          -- ASIENTOS RESERVADOS POR VIAJE
          -- ===========================================

          LEFT JOIN dbo.ReservaAsiento ra
            ON ra.ViajeID = v.ViajeID
            AND ra.AsientoID = a.AsientoID

          -- ===========================================
          -- RESERVAS
          -- ===========================================

          LEFT JOIN dbo.Reserva rr
            ON rr.ReservaID = ra.ReservaID

          -- ===========================================
          -- CONDICIONES DE DISPONIBILIDAD
          -- ===========================================

          WHERE
            v.Estado = N'PROGRAMADO'

            AND r.Estado = N'ACTIVA'

            AND b.Estado = N'OPERATIVO'

            AND v.Salida > @ahora

            -- FILTRO POR FECHA

            AND (
              @fecha IS NULL

              OR (
                v.Salida >=
                  CONVERT(date, @fecha, 23)

                AND v.Salida <
                  DATEADD(
                    day,
                    1,
                    CONVERT(date, @fecha, 23)
                  )
              )
            )

            -- FILTRO POR ORIGEN

            AND (
              @origen = N''

              OR r.Origen LIKE
                N'%' + @origen + N'%'
            )

            -- FILTRO POR DESTINO

            AND (
              @destino = N''

              OR r.Destino LIKE
                N'%' + @destino + N'%'
            )

          -- ===========================================
          -- AGRUPACIÓN
          -- ===========================================

          GROUP BY
            v.ViajeID,
            r.Origen,
            r.Destino,
            tor.Nombre,
            tor.Direccion,
            tde.Nombre,
            tde.Direccion,

            v.Salida,
            v.LlegadaEstimada,

            v.Tarifa,

            b.BusID,
            b.Placa,
            b.Modelo,
            b.Capacidad,

            ts.TipoServicioID,
            ts.Nombre

          -- ===========================================
          -- ORDENAMIENTO
          -- ===========================================

          ORDER BY

            v.Salida ASC,
            v.ViajeID ASC;
        `);

  return resultado.recordset;
}
