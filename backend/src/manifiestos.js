
import { Router } from 'express';
import { z } from 'zod';

import { getPool, sql } from './db.js';

// ======================================================
// SIGET-VÍA — MANIFIESTO DE PASAJEROS
// PASO 167 — RF16
// ======================================================
// Consulta pasajeros, reservas y asientos por viaje.
// Acceso: ADMINISTRADOR y OPERADOR.
// No modifica información de SQL Server.
// ======================================================

const idSchema = z.coerce
  .number()
  .int()
  .positive()
  .safe();

function errorHttp(mensaje, statusCode = 400) {
  return Object.assign(
    new Error(mensaje),
    { statusCode }
  );
}

function obtenerId(valor) {
  const resultado = idSchema.safeParse(valor);

  if (!resultado.success) {
    throw errorHttp(
      'El identificador del viaje no es válido.'
    );
  }

  return resultado.data;
}

function permisoManifiestos(req, res, next) {
  const rol = req.currentUser?.Rol;

  if (
    rol !== 'ADMINISTRADOR' &&
    rol !== 'OPERADOR'
  ) {
    return res.status(403).json({
      error:
        'No tienes permisos para consultar manifiestos.'
    });
  }

  next();
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

// ======================================================
// ROUTER
// ======================================================

export function createManifiestosRouter({
  auth,
  activeUser,
  asyncRoute
}) {
  const router = Router();

  router.use(
    auth,
    activeUser,
    permisoManifiestos
  );

  // ====================================================
  // GET /api/manifiestos/viajes
  // LISTADO PARA SELECCIONAR UN VIAJE
  // ====================================================

  router.get(
    '/viajes',
    asyncRoute(async (req, res) => {
      const q = String(req.query.q || '')
        .trim()
        .slice(0, 100);

      const fecha = String(
        req.query.fecha || ''
      ).trim();

      if (!fechaValida(fecha)) {
        throw errorHttp(
          'La fecha de consulta no es válida.'
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
          'fecha',
          sql.VarChar(10),
          fecha
        )
        .query(`
          SELECT TOP (300)
            v.ViajeID,
            v.RutaID,
            v.BusID,
            v.ConductorID,
            v.Salida,
            v.LlegadaEstimada,
            v.Estado,

            ru.Origen,
            ru.Destino,

            b.Placa,
            b.Modelo,

            (
              SELECT COUNT_BIG(*)
              FROM dbo.ReservaAsiento ra
              INNER JOIN dbo.Reserva r
                ON r.ReservaID = ra.ReservaID
              WHERE
                ra.ViajeID = v.ViajeID
                AND ra.Estado = 'ACTIVA'
                AND r.Estado IN (
                  'CONFIRMADA',
                  'COMPLETADA',
                  'REPROGRAMADA'
                )
            ) AS TotalPasajeros

          FROM dbo.Viaje v

          INNER JOIN dbo.Ruta ru
            ON ru.RutaID = v.RutaID

          INNER JOIN dbo.Bus b
            ON b.BusID = v.BusID

          WHERE
            (
              @fecha = ''
              OR (
                v.Salida >= CONVERT(
                  date,
                  @fecha,
                  23
                )
                AND v.Salida <
                  DATEADD(
                    DAY,
                    1,
                    CONVERT(date, @fecha, 23)
                  )
              )
            )
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
        `);

      res.json(resultado.recordset);
    })
  );

  // ====================================================
  // GET /api/manifiestos/:id
  // DATOS GENERALES Y LISTADO DE PASAJEROS
  // ====================================================

  router.get(
    '/:id',
    asyncRoute(async (req, res) => {
      const id = obtenerId(req.params.id);

      const pool = await getPool();

      const resultado = await pool.request()
        .input(
          'viajeId',
          sql.BigInt,
          id
        )
        .query(`
          -- DATOS DEL VIAJE

          SELECT
            v.ViajeID,
            v.RutaID,
            v.BusID,
            v.ConductorID,
            v.Salida,
            v.LlegadaEstimada,
            v.Estado,
            v.Tarifa,

            ru.Origen,
            ru.Destino,

            b.Placa,
            b.Modelo,
            b.Capacidad

          FROM dbo.Viaje v

          INNER JOIN dbo.Ruta ru
            ON ru.RutaID = v.RutaID

          INNER JOIN dbo.Bus b
            ON b.BusID = v.BusID

          WHERE v.ViajeID = @viajeId;

          -- PASAJEROS Y ASIENTOS

          SELECT
            ra.ReservaAsientoID,
            ra.ReservaID,
            ra.ViajeID,
            ra.AsientoID,
            ra.PasajeroID,

            r.Codigo AS CodigoReserva,
            r.Estado AS EstadoReserva,

            a.Numero AS NumeroAsiento,

            p.TipoDocumento,
            p.NumeroDocumento,
            p.Nombres,
            p.Apellidos,

            ra.Estado AS EstadoAsiento

          FROM dbo.ReservaAsiento ra

          INNER JOIN dbo.Reserva r
            ON r.ReservaID = ra.ReservaID

          INNER JOIN dbo.Asiento a
            ON a.AsientoID = ra.AsientoID
            AND a.BusID = ra.BusID

          INNER JOIN dbo.Pasajero p
            ON p.PasajeroID = ra.PasajeroID

          WHERE
            ra.ViajeID = @viajeId
            AND ra.Estado = 'ACTIVA'
            AND r.Estado IN (
              'CONFIRMADA',
              'COMPLETADA',
              'REPROGRAMADA'
            )

          ORDER BY
            TRY_CONVERT(INT, a.Numero),
            a.Numero,
            p.Apellidos,
            p.Nombres;
        `);

      const viaje =
        resultado.recordsets[0]?.[0];

      if (!viaje) {
        return res.status(404).json({
          error: 'El viaje no existe.'
        });
      }

      const pasajeros =
        resultado.recordsets[1] || [];

      res.json({
        viaje,
        pasajeros,
        resumen: {
          totalPasajeros: pasajeros.length,
          totalAsientos:
            Number(viaje.Capacidad || 0),
          asientosDisponibles: Math.max(
            0,
            Number(viaje.Capacidad || 0) -
              pasajeros.length
          )
        }
      });
    })
  );

  return router;
}
