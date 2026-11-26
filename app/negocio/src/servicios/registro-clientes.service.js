// SIGET-VÍA — CAPA DE LÓGICA — Registro público de clientes (RF1, RF2, RNF4)
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import * as repo from 'siget-via-datos/repositorios/usuarios.repository.js';
import { errorHttp } from '../utils/errores.js';

const patronNombre = /^[\p{L}\p{M}][\p{L}\p{M}'’.\- ]*$/u;

function validarNombre(maximo) {
  return z.string().trim().min(2).max(maximo)
    .regex(patronNombre, 'Solo se permiten letras y separadores válidos.')
    .transform(valor => valor.replace(/\s+/g, ' '));
}

const registroSchema = z.object({
  nombres: validarNombre(100),
  apellidos: validarNombre(120),
  correo: z.string().trim().email('Ingresa un correo válido.').max(254)
    .transform(valor => valor.toLowerCase()),
  telefono: z.string().trim()
    .regex(/^[0-9+()\s-]{6,20}$/, 'El teléfono no tiene un formato válido.')
    .nullable().optional(),
  contrasena: z.string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres.')
    .max(72)
    .regex(/[A-Z]/, 'La contraseña debe contener una mayúscula.')
    .regex(/[a-z]/, 'La contraseña debe contener una minúscula.')
    .regex(/[0-9]/, 'La contraseña debe contener un número.'),
  confirmarContrasena: z.string(),
  aceptaPrivacidad: z.literal(true)
}).strict().refine(
  datos => datos.contrasena === datos.confirmarContrasena,
  { path: ['confirmarContrasena'], message: 'Las contraseñas no coinciden.' }
);

export async function registrarCliente(body) {
  const validacion = registroSchema.safeParse(body);
  if (!validacion.success) {
    throw errorHttp(validacion.error.issues[0]?.message || 'Los datos ingresados son inválidos.');
  }
  const datos = validacion.data;

  // El rol se asigna exclusivamente en el servidor; nunca se acepta rolId del visitante.
  const rolId = await repo.obtenerRolIdPorNombre('CLIENTE');
  if (rolId === null) throw errorHttp('El registro de clientes no está disponible.', 503);

  const hash = await bcrypt.hash(datos.contrasena, 12);

  try {
    const usuario = await repo.insertarCliente(rolId, datos, hash);
    return {
      mensaje: 'Cuenta creada correctamente. Ya puedes iniciar sesión.',
      usuario: {
        UsuarioID: usuario.UsuarioID,
        Nombres: usuario.Nombres,
        Apellidos: usuario.Apellidos,
        Correo: usuario.Correo,
        Rol: 'CLIENTE'
      }
    };
  } catch (error) {
    if (repo.esDuplicado(error)) throw errorHttp('Ya existe una cuenta con este correo.', 409);
    throw error;
  }
}
