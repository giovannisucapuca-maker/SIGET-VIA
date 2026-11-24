
import { Router } from 'express';
import { z } from 'zod';
import { getPool, sql } from './db.js';

// ==========================================
// SIGET-VÍA - GESTIÓN DE CONDUCTORES RF9
// REGISTRO, CONSULTA, EDICIÓN Y ESTADO
// VALIDACIONES Y CONTROL DE DUPLICADOS
// ==========================================

// ==========================================
// FUNCIONES AUXILIARES
// ==========================================

function limpiarTexto(valor) {
  return valor.trim().replace(/\s+/g, ' ');
}

function normalizarCodigo(valor) {
  return valor.trim().toUpperCase().replace(/\s+/g, '');
}

function errorHttp(mensaje, statusCode = 400) {
  return Object.assign(new Error(mensaje), {
    statusCode
  });
}

function validarDocumento(tipo, numero) {
  switch (tipo) {
    case 'DNI':
      return /^\d{8}$/.test(numero);
    case 'CE':
      return /^[A-Z0-9]{9,12}$/.test(numero);
    case 'PASAPORTE':
      return /^[A-Z0-9]{6,20}$/.test(numero);
    default:
      return false;
  }
}

function mensajeDocumento(tipo) {
  if (tipo === 'DNI') {
    return 'El DNI debe contener exactamente 8 dígitos.';
  }

  if (tipo === 'CE') {
    return (
      'El carné de extranjería debe contener ' +
      'entre 9 y 12 caracteres alfanuméricos.'
    );
  }

  if (tipo === 'PASAPORTE') {
    return (
      'El pasaporte debe contener entre 6 y 20 ' +
      'caracteres alfanuméricos.'
    );
  }

  return 'Tipo de documento no permitido.';
}

// ==========================================
// ESQUEMAS
// ==========================================

const idSchema = z.coerce.number()
  .int()
  .positive()
  .max(2147483647);

const nombreSchema = z.string()
  .trim()
  .transform(limpiarTexto)
  .pipe(
    z.string()
      .min(2, 'Ingresa nombres válidos.')
      .max(100, 'Los nombres superan 100 caracteres.')
      .regex(
        /^[\p{L}\p{M}][\p{L}\p{M}'’.\- ]*$/u,
        'Los nombres solo permiten letras.'
      )
  );

const apellidoSchema = z.string()
  .trim()
  .transform(limpiarTexto)
  .pipe(
    z.string()
      .min(2, 'Ingresa apellidos válidos.')
      .max(120, 'Los apellidos superan 120 caracteres.')
      .regex(
        /^[\p{L}\p{M}][\p{L}\p{M}'’.\- ]*$/u,
        'Los apellidos solo permiten letras.'
      )
  );

const schema = z.object({
  tipoDocumento: z.enum([
    'DNI',
    'CE',
    'PASAPORTE'
  ]),

  numeroDocumento: z.string()
    .trim()
    .transform(normalizarCodigo)
    .pipe(
      z.string()
        .min(1, 'Ingresa el documento.')
        .max(20, 'El documento es demasiado largo.')
    ),

  nombres: nombreSchema,

  apellidos: apellidoSchema,

  numeroLicencia: z.string()
    .trim()
    .transform(normalizarCodigo)
    .pipe(
      z.string()
        .min(4, 'La licencia debe tener al menos 4 caracteres.')
        .max(30, 'La licencia no debe superar 30 caracteres.')
        .regex(
          /^[A-Z0-9-]+$/,
          'La licencia solo permite letras, números y guiones.'
        )
    ),

  estado: z.enum([
    'ACTIVO',
    'INACTIVO'
  ])
}).superRefine((datos, contexto) => {
  if (
    !validarDocumento(
      datos.tipoDocumento,
      datos.numeroDocumento
    )
  ) {
    contexto.addIssue({
      code: 'custom',
      path: ['numeroDocumento'],
      message: mensajeDocumento(datos.tipoDocumento)
    });
  }
});

function validarDatos(datos) {
  const resultado = schema.safeParse(datos);

  if (!resultado.success) {
    throw errorHttp(
      resultado.error.issues[0]?.message ||
      'Los datos del conductor no son válidos.'
    );
  }

  return resultado.data;
}

function obtenerId(valor) {
  const resultado = idSchema.safeParse(valor);

  if (!resultado.success) {
    throw errorHttp('Identificador de conductor inválido.');
  }

  return resultado.data;
}

// ==========================================
// PARÁMETROS SQL
// ==========================================

function inputs(request, datos) {
  return request
    .input(
      'tipo',
      sql.VarChar(12),
      datos.tipoDocumento
    )
    .input(
      'numero',
      sql.VarChar(20),
      datos.numeroDocumento
    )
    .input(
      'nombres',
      sql.NVarChar(100),
      datos.nombres
    )
    .input(
      'apellidos',
      sql.NVarChar(120),
      datos.apellidos
    )
    .input(
      'licencia',
      sql.VarChar(30),
      datos.numeroLicencia
    )
    .input(
      'estado',
      sql.VarChar(12),
      datos.estado
    );
}

const fields = `
  ConductorID,
  TipoDocumento,
  NumeroDocumento,
  Nombres,
  Apellidos,
  NumeroLicencia,
  Estado
`;

// ==========================================
// ROUTER PRINCIPAL
// ==========================================

export function createConductoresRouter({
  auth,
  activeUser,
  admin,
  asyncRoute
}) {
  const router = Router();

  router.use(auth, activeUser, admin);

  // ========================================
  // 1. LISTAR Y BUSCAR CONDUCTORES
  // ========================================

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
          SELECT ${fields}
          FROM dbo.Conductor
          WHERE Nombres LIKE @q
             OR Apellidos LIKE @q
             OR NumeroDocumento LIKE @q
             OR NumeroLicencia LIKE @q
          ORDER BY ConductorID DESC
        `);

      return res.json(resultado.recordset);
    })
  );

  // ========================================
  // 2. CONSULTAR DETALLE
  // ========================================

  router.get(
    '/:id',
    asyncRoute(async (req, res) => {
      const id = obtenerId(req.params.id);
      const pool = await getPool();

      const resultado = await pool.request()
        .input('id', sql.Int, id)
        .query(`
          SELECT ${fields}
          FROM dbo.Conductor
          WHERE ConductorID = @id
        `);

      if (!resultado.recordset.length) {
        return res.status(404).json({
          error: 'Conductor no encontrado'
        });
      }

      return res.json(resultado.recordset[0]);
    })
  );

  // ========================================
  // 3. REGISTRAR CONDUCTOR
  // ========================================

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
        // Comprobar documento o licencia duplicada.

        const duplicado = await inputs(
          new sql.Request(tx),
          datos
        ).query(`
          SELECT ConductorID
          FROM dbo.Conductor WITH (UPDLOCK, HOLDLOCK)
          WHERE
            (
              TipoDocumento = @tipo
              AND NumeroDocumento = @numero
            )
            OR NumeroLicencia = @licencia
        `);

        if (duplicado.recordset.length) {
          await tx.rollback();

          return res.status(409).json({
            error:
              'El documento o la licencia ya están registrados.'
          });
        }

        // Insertar conductor.

        const resultado = await inputs(
          new sql.Request(tx),
          datos
        ).query(`
          INSERT INTO dbo.Conductor (
            TipoDocumento,
            NumeroDocumento,
            Nombres,
            Apellidos,
            NumeroLicencia,
            Estado
          )

          OUTPUT INSERTED.ConductorID

          VALUES (
            @tipo,
            @numero,
            @nombres,
            @apellidos,
            @licencia,
            @estado
          )
        `);

        await tx.commit();

        return res.status(201).json({
          ConductorID:
            resultado.recordset[0].ConductorID,
          mensaje:
            'Conductor registrado correctamente'
        });
      } catch (error) {
        await tx.rollback().catch(() => {});
        throw error;
      }
    })
  );

  // ========================================
  // 4. EDITAR CONDUCTOR COMPLETO
  // ========================================

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
        // Verificar existencia del conductor.

        const actual = await new sql.Request(tx)
          .input('id', sql.Int, id)
          .query(`
            SELECT ConductorID
            FROM dbo.Conductor WITH (UPDLOCK, HOLDLOCK)
            WHERE ConductorID = @id
          `);

        if (!actual.recordset.length) {
          await tx.rollback();

          return res.status(404).json({
            error: 'Conductor no encontrado'
          });
        }

        // Verificar documento o licencia duplicados
        // excluyendo el registro actual.

        const duplicado = await inputs(
          new sql.Request(tx)
            .input('id', sql.Int, id),
          datos
        ).query(`
          SELECT ConductorID
          FROM dbo.Conductor WITH (UPDLOCK, HOLDLOCK)
          WHERE ConductorID <> @id
            AND (
              (
                TipoDocumento = @tipo
                AND NumeroDocumento = @numero
              )
              OR NumeroLicencia = @licencia
            )
        `);

        if (duplicado.recordset.length) {
          await tx.rollback();

          return res.status(409).json({
            error:
              'El documento o la licencia pertenecen a otro conductor.'
          });
        }

        // Actualizar todos los campos.

        const resultado = await inputs(
          new sql.Request(tx)
            .input('id', sql.Int, id),
          datos
        ).query(`
          UPDATE dbo.Conductor
          SET
            TipoDocumento = @tipo,
            NumeroDocumento = @numero,
            Nombres = @nombres,
            Apellidos = @apellidos,
            NumeroLicencia = @licencia,
            Estado = @estado
          WHERE ConductorID = @id
        `);

        if (!resultado.rowsAffected[0]) {
          await tx.rollback();

          return res.status(404).json({
            error: 'Conductor no encontrado'
          });
        }

        await tx.commit();

        return res.json({
          ConductorID: id,
          mensaje:
            'Conductor actualizado correctamente'
        });
      } catch (error) {
        await tx.rollback().catch(() => {});
        throw error;
      }
    })
  );

  // ========================================
  // 5. CAMBIAR ESTADO
  // ========================================

  router.patch(
    '/:id/estado',
    asyncRoute(async (req, res) => {
      const id = obtenerId(req.params.id);

      const resultadoValidacion = z.object({
        estado: z.enum([
          'ACTIVO',
          'INACTIVO'
        ])
      }).safeParse(req.body);

      if (!resultadoValidacion.success) {
        return res.status(400).json({
          error:
            'El estado debe ser ACTIVO o INACTIVO.'
        });
      }

      const { estado } = resultadoValidacion.data;

      const pool = await getPool();

      const resultado = await pool.request()
        .input('id', sql.Int, id)
        .input(
          'estado',
          sql.VarChar(12),
          estado
        )
        .query(`
          UPDATE dbo.Conductor
          SET Estado = @estado
          WHERE ConductorID = @id
        `);

      if (!resultado.rowsAffected[0]) {
        return res.status(404).json({
          error: 'Conductor no encontrado'
        });
      }

      return res.json({
        ConductorID: id,
        Estado: estado,
        mensaje:
          'Estado del conductor actualizado correctamente'
      });
    })
  );

  return router;
}
