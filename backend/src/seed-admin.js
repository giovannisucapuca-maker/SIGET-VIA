
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { getPool, sql } from './db.js';

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

    if (resultadoUsuario.recordset.length > 0) {
      console.log(
        'El correo ya está registrado. No se creó otra cuenta.'
      );
      return;
    }

    // Cifrar contraseña mediante bcrypt
    const contrasenaHash = await bcrypt.hash(password, 12);

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
