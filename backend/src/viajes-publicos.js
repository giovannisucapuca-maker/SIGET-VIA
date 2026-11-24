
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

import { getPool, sql } from './db.js';

// =====================================================
// SIGET-VÍA — CONSULTA PÚBLICA DE VIAJES
// PASO 172.9.3.3.1
//
// RF3  — Consultar viajes disponibles
// RF4  — Reserva de pasajes
// RF8  — Gestión de buses
// RF10 — Selección de asientos
//
// NUEVO:
// - TipoServicioID
// - TipoServicio
// - Relación Viaje → Bus → TipoServicio
//
// SE CONSERVA:
// - Consulta sin iniciar sesión
// - Filtro por origen
// - Filtro por destino
// - Filtro por fecha
// - Viajes programados y futuros
// - Validación de bus operativo
// - Conteo de asientos
// - Tarifas configuradas por viaje
//
// Este módulo NO registra reservas ni pagos.
// =====================================================

const router = Router();

// =====================================================
// PROTECCIÓN DE CONSULTAS PÚBLICAS
// =====================================================

router.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 40,
    standardHeaders: 'draft-7',
    legacyHeaders: false
  })
);

// =====================================================
// VALIDACIÓN DE FILTROS
// =====================================================

const filtrosSchema = z.object({
  origen: z.string()
    .trim()
    .max(120)
    .default(''),

  destino: z.string()
    .trim()
    .max(120)
    .default(''),

  fecha: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
}).strict();

// =====================================================
// VALIDAR FECHA
// =====================================================

function esFechaValida(fecha) {
  if (!fecha) {
    return true;
  }

  const d = new Date(
    `${fecha}T12:00:00Z`
  );

  return (
    !Number.isNaN(d.getTime()) &&
    d.toISOString().slice(0, 10) === fecha
  );
}

// =====================================================
// FECHA Y HORA ACTUAL DE PERÚ
// =====================================================

function ahoraPeru() {
  const parts = new Intl.DateTimeFormat(
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

  const v = Object.fromEntries(
    parts.map(p => [
      p.type,
      p.value
    ])
  );

  return (
    `${v.year}-${v.month}-${v.day}T` +
    `${v.hour}:${v.minute}:${v.second}`
  );
}

// =====================================================
// NOMBRE DEL TIPO DE SERVICIO
//
// Mantener los nombres oficiales del catálogo.
// No inventar categorías para buses sin asignación.
// =====================================================

function normalizarServicio(valor) {
  if (
    typeof valor !== 'string' ||
    !valor.trim()
  ) {
    return null;
  }

  return valor.trim();
}

// =====================================================
// GET /api/publico/viajes
//
// CONSULTAR VIAJES DISPONIBLES
// =====================================================

router.get(
  '/viajes',
  async (req, res, next) => {
    try {
      // ===============================================
      // VALIDAR FILTROS
      // ===============================================

      const validacion =
        filtrosSchema.safeParse(req.query);

      if (
        !validacion.success ||
        !esFechaValida(validacion.data?.fecha)
      ) {
        return res.status(400).json({
          error:
            'Filtros de búsqueda inválidos.'
        });
      }

      const {
        origen,
        destino,
        fecha
      } = validacion.data;

      // ===============================================
      // OBTENER FECHA ACTUAL EN PERÚ
      // ===============================================

      const ahora = ahoraPeru();

      res.set(
        'Cache-Control',
        'no-store'
      );

      // No mostrar viajes de fechas anteriores.
      if (
        fecha &&
        fecha < ahora.slice(0, 10)
      ) {
        return res.json([]);
      }

      // ===============================================
      // CONEXIÓN SQL SERVER
      // ===============================================

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

      // ===============================================
      // FORMATEAR RESULTADOS
      // ===============================================

      const viajes = resultado.recordset.map(
        v => {
          const registrados = Number(
            v.AsientosRegistrados
          );

          const ocupados = Number(
            v.AsientosOcupados
          );

          const disponibles = Math.max(
            0,
            registrados - ocupados
          );

          return {
            // VIAJE

            ViajeID: v.ViajeID,

            // RUTA

            Origen: v.Origen,
            Destino: v.Destino,

            // HORARIOS

            Salida: v.Salida,
            LlegadaEstimada:
              v.LlegadaEstimada,

            // TARIFA

            Tarifa: v.Tarifa,

            // BUS

            BusID: v.BusID,
            Placa: v.Placa,
            Modelo: v.Modelo,
            Capacidad: v.Capacidad,

            // TIPO DE SERVICIO

            TipoServicioID:
              v.TipoServicioID ?? null,

            TipoServicio:
              normalizarServicio(
                v.TipoServicio
              ),

            // DISPONIBILIDAD

            AsientosRegistrados:
              registrados,

            AsientosOcupados:
              ocupados,

            AsientosDisponibles:
              disponibles
          };
        }
      );

      // ===============================================
      // RESPUESTA
      // ===============================================

      return res.json(viajes);

    } catch (error) {
      next(error);
    }
  }
);

// =====================================================
// EXPORTAR ROUTER
// =====================================================

export default router;
