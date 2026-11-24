
import { Router } from 'express';
import { z } from 'zod';
import { getPool, sql } from './db.js';

// ========================================
// SIGET-VÍA - GESTIÓN DE RUTAS RF6
// REGISTRAR, BUSCAR, CONSULTAR, EDITAR
// CAMBIAR ESTADO Y VALIDAR DATOS
// ========================================

// ========================================
// 1. FUNCIONES AUXILIARES
// ========================================

function limpiarTexto(valor) {
  return valor.trim().replace(/\s+/g, ' ');
}

function normalizarCiudad(valor) {
  return limpiarTexto(valor).toLocaleUpperCase('es-PE');
}

function compararCiudad(valor) {
  return normalizarCiudad(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function errorHttp(mensaje, statusCode = 400) {
  return Object.assign(new Error(mensaje), {
    statusCode
  });
}

// ========================================
// 2. VALIDACIONES
// ========================================

const estadoSchema = z.enum([
  'ACTIVA',
  'INACTIVA'
]);

const ciudadSchema = z.string()
  .trim()
  .transform(normalizarCiudad)
  .pipe(
    z.string()
      .min(2, 'La ciudad debe tener al menos 2 caracteres.')
      .max(120, 'La ciudad no puede superar 120 caracteres.')
      .regex(
        /^[\p{L}\p{M}0-9][\p{L}\p{M}0-9 .,'’()/-]*$/u,
        'El nombre de la ciudad contiene caracteres no permitidos.'
      )
  );

const rutaSchema = z.object({
  origen: ciudadSchema,
  destino: ciudadSchema,

  distanciaKm: z.number()
    .positive('La distancia debe ser mayor que cero.')
    .max(
      99999999,
      'La distancia supera el límite permitido.'
    )
    .nullable(),

  estado: estadoSchema
}).superRefine((datos, ctx) => {
  if (
    compararCiudad(datos.origen) ===
    compararCiudad(datos.destino)
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['destino'],
      message: 'El origen y el destino deben ser diferentes.'
    });
  }

  if (datos.distanciaKm !== null) {
    const distancia = datos.distanciaKm;

    if (
      Math.abs(
        distancia * 100 - Math.round(distancia * 100)
      ) > 0.00001
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['distanciaKm'],
        message:
          'La distancia debe tener como máximo dos decimales.'
      });
    }
  }
});

const idSchema = z.coerce.number()
  .int()
  .positive()
  .max(2147483647);

function validarDatos(body) {
  const resultado = rutaSchema.safeParse(body);

  if (!resultado.success) {
    throw errorHttp(
      resultado.error.issues[0]?.message ||
      'Los datos de la ruta son inválidos.'
    );
  }

  return resultado.data;
}

function obtenerId(valor) {
  const resultado = idSchema.safeParse(valor);

  if (!resultado.success) {
    throw errorHttp('El identificador de la ruta es inválido.');
  }

  return resultado.data;
}

// ========================================
// 3. PARÁMETROS SQL
// ========================================

function campos(request, datos) {
  return request
    .input(
      'origen',
      sql.NVarChar(120),
      datos.origen
    )
    .input(
      'destino',
      sql.NVarChar(120),
      datos.destino
    )
    .input(
      'distancia',
      sql.Decimal(10, 2),
      datos.distanciaKm
    )
    .input(
      'estado',
      sql.VarChar(12),
      datos.estado
    );
}

// ========================================
// 4. COMPROBAR RUTAS DUPLICADAS
// ========================================

async function buscarDuplicado(
  transaccion,
  datos,
  excluirId = null
) {
  const resultado = await new sql.Request(transaccion)
    .input(
      'origen',
      sql.NVarChar(120),
      datos.origen
    )
    .input(
      'destino',
      sql.NVarChar(120),
      datos.destino
    )
    .input(
      'id',
      sql.Int,
      excluirId
    )
    .query(`
      SELECT RutaID, Origen, Destino
      FROM dbo.Ruta WITH (UPDLOCK, HOLDLOCK)
      WHERE
        (@id IS NULL OR RutaID <> @id)
    `);

  return resultado.recordset.find(r =>
    compararCiudad(r.Origen) ===
      compararCiudad(datos.origen) &&
    compararCiudad(r.Destino) ===
      compararCiudad(datos.destino)
  ) || null;
}

// ========================================
// 5. ROUTER PRINCIPAL
// ========================================

export function createRutasRouter({
  auth,
  activeUser,
  admin,
  asyncRoute
}) {
  const router = Router();

  router.use(auth, activeUser, admin);

  // ======================================
  // LISTAR Y BUSCAR
  // GET /api/rutas
  // ======================================

  router.get(
    '/',
    asyncRoute(async (req, res) => {
      const q = String(req.query.q || '')
        .trim()
        .slice(0, 120);

      const pool = await getPool();

      const resultado = await pool.request()
        .input(
          'q',
          sql.NVarChar(130),
          `%${q}%`
        )
        .query(`
          SELECT
            RutaID,
            Origen,
            Destino,
            DistanciaKm,
            Estado

          FROM dbo.Ruta

          WHERE Origen LIKE @q
             OR Destino LIKE @q

          ORDER BY RutaID DESC
        `);

      return res.json(resultado.recordset);
    })
  );

  // ======================================
  // CONSULTAR DETALLE
  // GET /api/rutas/:id
  // ======================================

  router.get(
    '/:id',
    asyncRoute(async (req, res) => {
      const id = obtenerId(req.params.id);

      const pool = await getPool();

      const resultado = await pool.request()
        .input('id', sql.Int, id)
        .query(`
          SELECT
            RutaID,
            Origen,
            Destino,
            DistanciaKm,
            Estado

          FROM dbo.Ruta

          WHERE RutaID = @id
        `);

      if (!resultado.recordset.length) {
        return res.status(404).json({
          error: 'Ruta no encontrada.'
        });
      }

      return res.json(resultado.recordset[0]);
    })
  );

  // ======================================
  // REGISTRAR RUTA
  // POST /api/rutas
  // ======================================

  router.post(
    '/',
    asyncRoute(async (req, res) => {
      const datos = validarDatos(req.body);

      const pool = await getPool();
      const tx = new sql.Transaction(pool);

      await tx.begin(
        sql.ISOLATION_LEVEL.SERIALIZABLE
      );

      try {
        // Evitar rutas duplicadas.

        const duplicado = await buscarDuplicado(
          tx,
          datos
        );

        if (duplicado) {
          await tx.rollback();

          return res.status(409).json({
            error:
              'Ya existe una ruta registrada con ese origen y destino.'
          });
        }

        // Registrar ruta.

        const resultado = await campos(
          new sql.Request(tx),
          datos
        ).query(`
          INSERT INTO dbo.Ruta (
            Origen,
            Destino,
            DistanciaKm,
            Estado
          )

          OUTPUT INSERTED.RutaID

          VALUES (
            @origen,
            @destino,
            @distancia,
            @estado
          )
        `);

        await tx.commit();

        return res.status(201).json({
          RutaID: resultado.recordset[0].RutaID,
          mensaje: 'Ruta registrada correctamente.'
        });
      } catch (error) {
        await tx.rollback().catch(() => {});
        throw error;
      }
    })
  );

  // ======================================
  // EDITAR TODOS LOS DATOS DE LA RUTA
  // PUT /api/rutas/:id
  // ======================================

  router.put(
    '/:id',
    asyncRoute(async (req, res) => {
      const id = obtenerId(req.params.id);
      const datos = validarDatos(req.body);

      const pool = await getPool();
      const tx = new sql.Transaction(pool);

      await tx.begin(
        sql.ISOLATION_LEVEL.SERIALIZABLE
      );

      try {
        // Verificar existencia.

        const actual = await new sql.Request(tx)
          .input('id', sql.Int, id)
          .query(`
            SELECT
              RutaID,
              Origen,
              Destino,
              DistanciaKm,
              Estado

            FROM dbo.Ruta WITH (UPDLOCK, HOLDLOCK)

            WHERE RutaID = @id
          `);

        if (!actual.recordset.length) {
          await tx.rollback();

          return res.status(404).json({
            error: 'Ruta no encontrada.'
          });
        }

        // Evitar duplicados.

        const duplicado = await buscarDuplicado(
          tx,
          datos,
          id
        );

        if (duplicado) {
          await tx.rollback();

          return res.status(409).json({
            error:
              'Otra ruta ya tiene ese origen y destino.'
          });
        }

        // Editar origen, destino,
        // distancia y estado.

        const resultado = await campos(
          new sql.Request(tx)
            .input('id', sql.Int, id),
          datos
        ).query(`
          UPDATE dbo.Ruta

          SET
            Origen = @origen,
            Destino = @destino,
            DistanciaKm = @distancia,
            Estado = @estado

          WHERE RutaID = @id
        `);

        if (!resultado.rowsAffected[0]) {
          await tx.rollback();

          return res.status(404).json({
            error: 'Ruta no encontrada.'
          });
        }

        await tx.commit();

        return res.json({
          RutaID: id,
          mensaje: 'Ruta actualizada correctamente.'
        });
      } catch (error) {
        await tx.rollback().catch(() => {});
        throw error;
      }
    })
  );

  // ======================================
  // CAMBIAR ESTADO
  // PATCH /api/rutas/:id/estado
  // ======================================

  router.patch(
    '/:id/estado',
    asyncRoute(async (req, res) => {
      const id = obtenerId(req.params.id);

      const validacion = z.object({
        estado: estadoSchema
      }).safeParse(req.body);

      if (!validacion.success) {
        return res.status(400).json({
          error:
            'El estado debe ser ACTIVA o INACTIVA.'
        });
      }

      const { estado } = validacion.data;
      const pool = await getPool();

      const resultado = await pool.request()
        .input('id', sql.Int, id)
        .input(
          'estado',
          sql.VarChar(12),
          estado
        )
        .query(`
          UPDATE dbo.Ruta

          SET Estado = @estado

          WHERE RutaID = @id
        `);

      if (!resultado.rowsAffected[0]) {
        return res.status(404).json({
          error: 'Ruta no encontrada.'
        });
      }

      return res.json({
        RutaID: id,
        Estado: estado,
        mensaje:
          'Estado de la ruta actualizado correctamente.'
      });
    })
  );

  return router;
}
