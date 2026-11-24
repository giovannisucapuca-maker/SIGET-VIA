
import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { getPool, sql } from './db.js';

// =====================================================
// SIGET-VÍA — ASIENTOS PÚBLICOS
// PASO 172.9.3.3.3.1
//
// RF3  — Consulta pública de viajes
// RF4  — Reserva de pasajes
// RF8  — Gestión de buses
// RF10 — Selección de asientos
//
// NUEVO:
// - TipoServicioID
// - TipoServicio
// - Placa del bus
// - Modelo del bus
// - BusID
//
// RELACIÓN:
// Viaje → Bus → TipoServicio
//
// SE CONSERVA:
// - Consulta pública sin iniciar sesión
// - Verificación de viaje disponible
// - Distribución por primer y segundo piso
// - Identificadores reales de asientos
// - Cálculo de ocupación por viaje
// - Restricción de buses operativos
// - Tarifas registradas en SQL Server
//
// No registra reservas.
// No modifica asientos.
// No procesa pagos.
// =====================================================

const router = Router();

// =====================================================
// LÍMITE DE CONSULTAS PÚBLICAS
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
// FECHA Y HORA ACTUAL DE PERÚ
//
// Conserva el mismo criterio temporal
// utilizado por el módulo público original.
// =====================================================

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

  const datos = Object.fromEntries(
    partes.map(parte => [
      parte.type,
      parte.value
    ])
  );

  return new Date(
    `${datos.year}-${datos.month}-${datos.day}` +
    `T${datos.hour}:${datos.minute}:${datos.second}Z`
  );
}

// =====================================================
// VALIDAR IDENTIFICADOR DEL VIAJE
// =====================================================

function validarViajeId(valor) {
  const texto = String(valor || '');

  if (!/^[1-9]\d*$/.test(texto)) {
    return null;
  }

  const numero = Number(texto);

  if (
    !Number.isSafeInteger(numero) ||
    numero <= 0
  ) {
    return null;
  }

  return numero;
}

// =====================================================
// NORMALIZAR NOMBRE DEL SERVICIO
//
// No asignar una categoría ficticia
// a buses sin TipoServicioID.
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
// GET /api/publico/asientos/:viajeId
//
// Consultar viaje y asientos disponibles.
// =====================================================

router.get(
  '/:viajeId',
  async (req, res, next) => {
    try {
      // ===============================================
      // 1. VALIDAR EL IDENTIFICADOR
      // ===============================================

      const viajeId = validarViajeId(
        req.params.viajeId
      );

      if (!viajeId) {
        return res.status(400).json({
          error:
            'Identificador de viaje inválido.'
        });
      }

      // Evitar almacenar respuestas desactualizadas.
      res.set(
        'Cache-Control',
        'no-store'
      );

      const pool = await getPool();

      // ===============================================
      // 2. CONSULTAR DATOS DEL VIAJE
      //
      // NUEVO:
      // Relación con dbo.TipoServicio.
      //
      // LEFT JOIN permite conservar buses
      // que todavía no tienen categoría.
      // ===============================================

      const viajeResult = await pool.request()
        .input(
          'viajeId',
          sql.BigInt,
          viajeId
        )
        .input(
          'ahora',
          sql.DateTime2,
          ahoraPeru()
        )
        .query(`
          SELECT
            -- VIAJE

            v.ViajeID,
            v.BusID,

            v.Salida,
            v.LlegadaEstimada,

            v.Tarifa,

            -- RUTA

            r.Origen,
            r.Destino,

            -- BUS

            b.Placa,
            b.Modelo,
            b.Capacidad,

            -- TIPO DE SERVICIO

            ts.TipoServicioID,
            ts.Nombre AS TipoServicio,
            ts.Descripcion AS DescripcionServicio

          FROM dbo.Viaje v

          INNER JOIN dbo.Ruta r
            ON r.RutaID = v.RutaID

          INNER JOIN dbo.Bus b
            ON b.BusID = v.BusID

          LEFT JOIN dbo.TipoServicio ts
            ON ts.TipoServicioID =
               b.TipoServicioID

          WHERE
            v.ViajeID = @viajeId

            AND v.Estado = N'PROGRAMADO'

            AND v.Salida > @ahora

            AND r.Estado = N'ACTIVA'

            AND b.Estado = N'OPERATIVO'
        `);

      const viaje =
        viajeResult.recordset[0];

      if (!viaje) {
        return res.status(404).json({
          error:
            'El viaje no existe o no está disponible.'
        });
      }

      // ===============================================
      // 3. CONSULTAR ASIENTOS DEL BUS
      //
      // Se conserva la consulta original.
      //
      // AsientoID, Numero y Nivel provienen
      // de dbo.Asiento.
      // ===============================================

      const asientosResult = await pool.request()
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
            a.Numero,
            a.Nivel,

            CAST(
              CASE

                WHEN EXISTS (
                  SELECT 1

                  FROM dbo.ReservaAsiento ra

                  INNER JOIN dbo.Reserva r
                    ON r.ReservaID =
                       ra.ReservaID

                  WHERE
                    ra.ViajeID = @viajeId

                    AND ra.AsientoID =
                        a.AsientoID

                    AND ra.Estado IN (
                      N'ACTIVA',
                      N'ACTIVO'
                    )

                    AND r.Estado <>
                        N'CANCELADA'
                )

                THEN 1
                ELSE 0

              END
            AS bit) AS Ocupado

          FROM dbo.Asiento a

          WHERE a.BusID = @busId

          ORDER BY
            a.Nivel ASC,
            a.Numero ASC
        `);

      // ===============================================
      // 4. NORMALIZAR ASIENTOS
      // ===============================================

      const asientos =
        asientosResult.recordset.map(
          asiento => ({
            AsientoID:
              Number(asiento.AsientoID),

            Numero:
              Number(asiento.Numero),

            Nivel:
              Number(asiento.Nivel),

            Ocupado:
              Boolean(asiento.Ocupado)
          })
        );

      // ===============================================
      // 5. CALCULAR DISPONIBILIDAD
      //
      // El total se obtiene de los asientos
      // realmente registrados en SQL Server.
      // ===============================================

      const totalAsientos =
        asientos.length;

      const asientosOcupados =
        asientos.filter(
          asiento => asiento.Ocupado
        ).length;

      const asientosDisponibles =
        totalAsientos - asientosOcupados;

      // ===============================================
      // 6. CONTAR ASIENTOS POR PISO
      //
      // Información complementaria.
      // No altera la numeración existente.
      // ===============================================

      const pisos = [
        ...new Set(
          asientos.map(
            asiento => asiento.Nivel
          )
        )
      ]
        .sort((a, b) => a - b)
        .map(nivel => {
          const asientosPiso =
            asientos.filter(
              asiento =>
                asiento.Nivel === nivel
            );

          return {
            Nivel: nivel,

            TotalAsientos:
              asientosPiso.length,

            AsientosDisponibles:
              asientosPiso.filter(
                asiento => !asiento.Ocupado
              ).length,

            AsientosOcupados:
              asientosPiso.filter(
                asiento => asiento.Ocupado
              ).length
          };
        });

      // ===============================================
      // 7. FORMATEAR RESPUESTA
      //
      // Conservamos todos los campos que utiliza
      // frontend/src/AsientosPublicos.tsx.
      //
      // Los campos nuevos son adicionales.
      // ===============================================

      return res.json({
        viaje: {
          // IDENTIFICACIÓN

          ViajeID:
            Number(viaje.ViajeID),

          // RUTA

          Origen:
            viaje.Origen,

          Destino:
            viaje.Destino,

          // HORARIOS

          Salida:
            viaje.Salida,

          LlegadaEstimada:
            viaje.LlegadaEstimada,

          // TARIFA

          Tarifa:
            viaje.Tarifa,

          // BUS

          BusID:
            Number(viaje.BusID),

          Placa:
            viaje.Placa,

          Modelo:
            viaje.Modelo,

          Capacidad:
            Number(viaje.Capacidad),

          // TIPO DE SERVICIO

          TipoServicioID:
            viaje.TipoServicioID == null
              ? null
              : Number(
                  viaje.TipoServicioID
                ),

          TipoServicio:
            normalizarServicio(
              viaje.TipoServicio
            ),

          DescripcionServicio:
            viaje.DescripcionServicio ?? null
        },

        // RESUMEN GENERAL

        totalAsientos,

        asientosDisponibles,

        asientosOcupados,

        // RESUMEN POR PISOS

        pisos,

        // LISTA REAL DE ASIENTOS

        asientos
      });

    } catch (error) {
      next(error);
    }
  }
);

// =====================================================
// EXPORTAR ROUTER
// =====================================================

export default router;
