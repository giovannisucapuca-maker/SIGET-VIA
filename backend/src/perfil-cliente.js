
import express, { Router } from 'express';
import { z } from 'zod';
import { getPool, sql } from './db.js';
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  unlink,
  stat
} from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
// =====================================================
// SIGET-VÍA — PASO 174.5
// PERFIL EDITABLE DEL CLIENTE Y FOTOGRAFÍA
// =====================================================
const schema = z.object({
  nombres: z.string().trim().min(2).max(100),
  apellidos: z.string().trim().min(2).max(120),
  correo: z.string().trim().email().max(254)
    .transform(v => v.toLowerCase()),
  telefono: z.union([
    z.string().trim().max(20),
    z.null()
  ]).optional()
});
const rutaFotos = join(
  process.cwd(),
  'uploads',
  'perfiles'
);
const fotoPath = id =>
  join(rutaFotos, `${id}.jpg`);
// =====================================================
// AUTORIZACIÓN
// =====================================================
function validarCliente(req, res, next) {
  if (req.currentUser?.Rol !== 'CLIENTE') {
    return res.status(403).json({
      error: 'Acceso exclusivo para clientes.'
    });
  }
  next();
}
// =====================================================
// ROUTER DEL PERFIL
// =====================================================
export function createPerfilClienteRouter({
  auth,
  activeUser,
  asyncRoute
}) {
  const router = Router();
  router.use(auth, activeUser, validarCliente);
  // ===================================================
  // GET /api/cliente/perfil
  // CONSULTAR DATOS PERSONALES
  // ===================================================
  router.get('/', asyncRoute(async (req, res) => {
    const usuario = req.currentUser;
    const pool = await getPool();
    const datos = await pool.request()
      .input('id', sql.BigInt, usuario.UsuarioID)
      .query(`
        SELECT
          UsuarioID,
          Nombres,
          Apellidos,
          Correo,
          Telefono,
          Estado
        FROM dbo.Usuario
        WHERE UsuarioID = @id
      `);
    const perfil = datos.recordset[0];
    if (!perfil) {
      return res.status(404).json({
        error: 'Perfil no encontrado.'
      });
    }
    let tieneFoto = false;
    try {
      await stat(fotoPath(usuario.UsuarioID));
      tieneFoto = true;
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
    return res.json({
      ...perfil,
      tieneFoto
    });
  }));
  // ===================================================
  // PUT /api/cliente/perfil
  // ACTUALIZAR DATOS PERSONALES
  // ===================================================
  router.put('/', asyncRoute(async (req, res) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error:
          parsed.error.issues[0]?.message ||
          'Datos inválidos.'
      });
    }
    const d = parsed.data;
    const usuarioId = req.currentUser.UsuarioID;
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const duplicado = await new sql.Request(tx)
        .input('id', sql.BigInt, usuarioId)
        .input(
          'correo',
          sql.NVarChar(254),
          d.correo
        )
        .query(`
          SELECT UsuarioID
          FROM dbo.Usuario WITH (UPDLOCK, HOLDLOCK)
          WHERE Correo = @correo
            AND UsuarioID <> @id
        `);
      if (duplicado.recordset.length) {
        await tx.rollback();
        return res.status(409).json({
          error:
            'El correo ya está registrado por otra cuenta.'
        });
      }
      const actualizado = await new sql.Request(tx)
        .input('id', sql.BigInt, usuarioId)
        .input(
          'nombres',
          sql.NVarChar(100),
          d.nombres
        )
        .input(
          'apellidos',
          sql.NVarChar(120),
          d.apellidos
        )
        .input(
          'correo',
          sql.NVarChar(254),
          d.correo
        )
        .input(
          'telefono',
          sql.VarChar(20),
          d.telefono || null
        )
        .query(`
          UPDATE dbo.Usuario
          SET
            Nombres = @nombres,
            Apellidos = @apellidos,
            Correo = @correo,
            Telefono = @telefono
          OUTPUT
            INSERTED.UsuarioID,
            INSERTED.Nombres,
            INSERTED.Apellidos,
            INSERTED.Correo,
            INSERTED.Telefono
          WHERE UsuarioID = @id
            AND Estado = 'ACTIVO'
        `);
      if (!actualizado.recordset.length) {
        await tx.rollback();
        return res.status(404).json({
          error: 'Usuario no encontrado o inactivo.'
        });
      }
      await new sql.Request(tx)
        .input(
          'usuarioId',
          sql.BigInt,
          usuarioId
        )
        .input(
          'detalle',
          sql.NVarChar(1000),
          `Actualización de perfil propio. Correo: ${d.correo}.`
        )
        .query(`
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
            'Usuario',
            @usuarioId,
            'UPDATE',
            @detalle,
            SYSDATETIME()
          )
        `);
      await tx.commit();
      return res.json({
        usuario: actualizado.recordset[0],
        mensaje: 'Perfil actualizado correctamente.'
      });
    } catch (err) {
      await tx.rollback().catch(() => {});
      const numero =
        err.number ??
        err.originalError?.info?.number;
      if (numero === 2601 || numero === 2627) {
        return res.status(409).json({
          error: 'El correo ya existe.'
        });
      }
      throw err;
    }
  }));
  // ===================================================
  // GET /api/cliente/perfil/foto
  // CONSULTAR FOTOGRAFÍA
  // ===================================================
  router.get('/foto', asyncRoute(async (req, res) => {
    try {
      const buffer = await readFile(
        fotoPath(req.currentUser.UsuarioID)
      );
      res.set('Content-Type', 'image/jpeg');
      res.set('Cache-Control', 'no-store');
      return res.send(buffer);
    } catch (err) {
      if (err.code === 'ENOENT') {
        return res.status(404).json({
          error: 'No hay foto guardada.'
        });
      }
      throw err;
    }
  }));
  // ===================================================
  // POST /api/cliente/perfil/foto
  // SUBIR O REEMPLAZAR FOTOGRAFÍA
  // ===================================================
  router.post(
    '/foto',
    express.raw({
      type: 'image/jpeg',
      limit: '1mb'
    }),
    asyncRoute(async (req, res) => {
      if (
        !Buffer.isBuffer(req.body) ||
        !req.body.length ||
        req.body.length > 1024 * 1024
      ) {
        return res.status(400).json({
          error:
            'La foto debe ser JPG y pesar máximo 1 MB.'
        });
      }
      const imagen = req.body;
      const esJpg =
        imagen.length > 4 &&
        imagen[0] === 0xff &&
        imagen[1] === 0xd8 &&
        imagen[imagen.length - 2] === 0xff &&
        imagen[imagen.length - 1] === 0xd9;
      if (!esJpg) {
        return res.status(400).json({
          error:
            'Archivo inválido. Debe ser una imagen JPG.'
        });
      }
      await mkdir(rutaFotos, {
        recursive: true
      });
      const temporal = join(
        rutaFotos,
        `${req.currentUser.UsuarioID}-${randomUUID()}.tmp`
      );
      try {
        await writeFile(temporal, imagen, {
          flag: 'wx',
          mode: 0o600
        });
        await rename(
          temporal,
          fotoPath(req.currentUser.UsuarioID)
        );
      } catch (err) {
        await unlink(temporal).catch(() => {});
        throw err;
      }
      return res.json({
        mensaje: 'Foto actualizada correctamente.'
      });
    })
  );
  // ===================================================
  // DELETE /api/cliente/perfil/foto
  // ELIMINAR FOTOGRAFÍA
  // ===================================================
  router.delete(
    '/foto',
    asyncRoute(async (req, res) => {
      try {
        await unlink(
          fotoPath(req.currentUser.UsuarioID)
        );
      } catch (err) {
        if (err.code !== 'ENOENT') {
          throw err;
        }
      }
      return res.json({
        mensaje: 'Foto eliminada correctamente.'
      });
    })
  );
  return router;
}
