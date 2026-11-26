// =====================================================
// SIGET-VÍA — CAPA DE ACCESO A DATOS — Administrador inicial
// Uso: npm run seed   (lee ADMIN_EMAIL y ADMIN_PASSWORD de config/.env)
//
// - Si el administrador no existe, lo crea.
// - Si ya existe, actualiza su contraseña con la de config/.env,
//   lo deja ACTIVO y con el rol ADMINISTRADOR.
// La API nunca lee ADMIN_PASSWORD: la contraseña válida es la
// guardada (cifrada) en la base de datos.
// =====================================================
import bcrypt from 'bcryptjs';
import { getPool, sql } from '../config/db.js';

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;

async function crearAdministrador() {
  let pool;

  try {
    if (
      !email ||
      !password ||
      password.length < 12 ||
      password.startsWith('REEMPLAZAR')
    ) {
      throw new Error(
        'Configura ADMIN_EMAIL y ADMIN_PASSWORD en .env. ' +
        'La contraseña debe tener al menos 12 caracteres.'
      );
    }

    pool = await getPool();

    // Verificar que exista el rol administrador
    const resultadoRol = await pool
      .request()
      .query(`
        SELECT RolID
        FROM dbo.Rol
        WHERE Nombre = 'ADMINISTRADOR'
      `);

    if (resultadoRol.recordset.length === 0) {
      throw new Error(
        'No existe el rol ADMINISTRADOR en la base de datos.'
      );
    }

    const rolID = resultadoRol.recordset[0].RolID;

    // Verificar si el correo ya está registrado
    const resultadoUsuario = await pool
      .request()
      .input('correo', sql.NVarChar(254), email)
      .query(`
        SELECT UsuarioID
        FROM dbo.Usuario
        WHERE Correo = @correo
      `);

    // Cifrar contraseña mediante bcrypt
    const contrasenaHash = await bcrypt.hash(password, 12);

    if (resultadoUsuario.recordset.length > 0) {
      const usuarioId = resultadoUsuario.recordset[0].UsuarioID;

      await pool
        .request()
        .input('id', sql.BigInt, usuarioId)
        .input('rol', sql.Int, rolID)
        .input('hash', sql.NVarChar(255), contrasenaHash)
        .query(`
          UPDATE dbo.Usuario
          SET ContrasenaHash = @hash,
              RolID = @rol,
              Estado = 'ACTIVO'
          WHERE UsuarioID = @id
        `);

      await pool
        .request()
        .input('id', sql.BigInt, usuarioId)
        .query(`
          INSERT INTO dbo.Auditoria (UsuarioID, Entidad, RegistroID, Accion, Detalle, Fecha)
          VALUES (@id, 'Usuario', @id, 'UPDATE',
                  N'Contraseña del administrador actualizada desde config/.env (npm run seed).',
                  SYSDATETIME())
        `);

      console.log('El administrador ya existía: contraseña actualizada con la de config/.env.');
      console.log('Correo:', email);
      return;
    }

    // Registrar administrador
    await pool
      .request()
      .input('rol', sql.Int, rolID)
      .input('correo', sql.NVarChar(254), email)
      .input('hash', sql.NVarChar(255), contrasenaHash)
      .query(`
        INSERT INTO dbo.Usuario (
          RolID,
          Nombres,
          Apellidos,
          Correo,
          ContrasenaHash,
          Estado,
          FechaRegistro
        )
        VALUES (
          @rol,
          N'Administrador',
          N'SIGET-VÍA',
          @correo,
          @hash,
          'ACTIVO',
          SYSDATETIME()
        )
      `);

    console.log('Administrador creado correctamente.');
    console.log('Correo:', email);

  } catch (error) {
    console.error(
      'Error al crear administrador:',
      error.message
    );
    process.exitCode = 1;

  } finally {
    if (pool) {
      await pool.close();
    }
  }
}

await crearAdministrador();