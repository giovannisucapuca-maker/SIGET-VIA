
import {
  useState,
  type FormEvent
} from 'react';

import {
  Link
} from 'react-router-dom';

import {
  ArrowLeft,
  BusFront,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  Phone,
  ShieldCheck,
  UserRound,
  UserRoundPlus
} from 'lucide-react';

import './RegistroCliente.css';

// =====================================================
// SIGET-VÍA — REGISTRO PÚBLICO DE CLIENTES
// PASO 172.7.5
//
// RF1 — Autenticación
// RF2 — Usuarios y perfiles
// RF4 — Reserva de pasajes
//
// RNF1 — Usabilidad
// RNF3 — Diseño adaptable
// RNF4 — Protección de contraseñas
// RNF5 — Control de acceso
// RNF10 — Protección de datos personales
// =====================================================

const API =
  import.meta.env.VITE_API_URL ||
  'http://localhost:4000/api';

type Formulario = {
  nombres: string;
  apellidos: string;
  correo: string;
  telefono: string;
  contrasena: string;
  confirmarContrasena: string;
  aceptaPrivacidad: boolean;
};

const formularioInicial: Formulario = {
  nombres: '',
  apellidos: '',
  correo: '',
  telefono: '',
  contrasena: '',
  confirmarContrasena: '',
  aceptaPrivacidad: false
};

export default function RegistroCliente() {
  const [form, setForm] =
    useState<Formulario>(formularioInicial);

  const [mostrarClave, setMostrarClave] =
    useState(false);

  const [mostrarConfirmacion, setMostrarConfirmacion] =
    useState(false);

  const [cargando, setCargando] =
    useState(false);

  const [error, setError] =
    useState('');

  const [registrado, setRegistrado] =
    useState(false);

  // ===================================================
  // ACTUALIZAR CAMPOS
  // ===================================================

  function actualizar(
    campo: keyof Formulario,
    valor: string | boolean
  ) {
    setForm(actual => ({
      ...actual,
      [campo]: valor
    }));
  }

  // ===================================================
  // VALIDAR CONTRASEÑA
  // ===================================================

  function contrasenaValida(valor: string) {
    return (
      valor.length >= 8 &&
      valor.length <= 72 &&
      /[A-Z]/.test(valor) &&
      /[a-z]/.test(valor) &&
      /[0-9]/.test(valor)
    );
  }

  // ===================================================
  // REGISTRAR CLIENTE
  // ===================================================

  async function registrar(
    e: FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    if (cargando || registrado) return;

    setError('');

    if (!contrasenaValida(form.contrasena)) {
      setError(
        'La contraseña debe tener entre 8 y 72 ' +
        'caracteres, una mayúscula, una minúscula ' +
        'y un número.'
      );
      return;
    }

    if (
      form.contrasena !==
      form.confirmarContrasena
    ) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    if (!form.aceptaPrivacidad) {
      setError(
        'Debes aceptar el aviso de privacidad ' +
        'para continuar.'
      );
      return;
    }

    setCargando(true);

    try {
      const respuesta = await fetch(
        `${API}/publico/clientes/registro`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          body: JSON.stringify({
            nombres: form.nombres.trim(),
            apellidos: form.apellidos.trim(),
            correo: form.correo
              .trim()
              .toLowerCase(),
            telefono:
              form.telefono.trim() || null,
            contrasena: form.contrasena,
            confirmarContrasena:
              form.confirmarContrasena,
            aceptaPrivacidad: true
          })
        }
      );

      const datos = await respuesta
        .json()
        .catch(() => ({}));

      if (!respuesta.ok) {
        throw new Error(
          datos.error ||
          'No se pudo registrar la cuenta.'
        );
      }

      setRegistrado(true);

      // No conservar las contraseñas después
      // del registro satisfactorio.
      setForm(actual => ({
        ...actual,
        contrasena: '',
        confirmarContrasena: ''
      }));

    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Ocurrió un error al registrar.'
      );
    } finally {
      setCargando(false);
    }
  }

  // ===================================================
  // CONFIRMACIÓN
  // ===================================================

  if (registrado) {
    return (
      <div className="registro-pagina">
        <header className="registro-cabecera">
          <div className="registro-marca">
            <BusFront size={27} />

            <div>
              <strong>SIGET-VÍA</strong>
              <small>Transportes Vía S.A.C.</small>
            </div>
          </div>
        </header>

        <main className="registro-confirmacion">
          <CheckCircle2
            size={66}
            color="#238456"
          />

          <h1>¡Cuenta creada correctamente!</h1>

          <p>
            Tu cuenta de cliente ha sido registrada.
            Ahora puedes iniciar sesión para
            continuar con tus reservas.
          </p>

          <div className="registro-confirmacion-dato">
            <Mail size={17} />
            {form.correo}
          </div>

          <Link
            to="/"
            className="registro-boton"
          >
            Iniciar sesión
          </Link>

          <Link
            to="/viajes/publico"
            className="registro-enlace"
          >
            Consultar viajes disponibles
          </Link>
        </main>
      </div>
    );
  }

  // ===================================================
  // FORMULARIO DE REGISTRO
  // ===================================================

  return (
    <div className="registro-pagina">
      <header className="registro-cabecera">
        <div className="registro-marca">
          <BusFront size={27} />

          <div>
            <strong>SIGET-VÍA</strong>
            <small>Transportes Vía S.A.C.</small>
          </div>
        </div>

        <Link
          to="/viajes/publico"
          className="registro-volver"
        >
          <ArrowLeft size={17} />
          Volver a viajes
        </Link>
      </header>

      <main className="registro-contenedor">
        <section className="registro-introduccion">
          <div className="registro-icono">
            <UserRoundPlus size={29} />
          </div>

          <h1>Crea tu cuenta de cliente</h1>

          <p>
            Regístrate para gestionar tus reservas
            de pasajes de forma segura.
          </p>
        </section>

        <section className="registro-tarjeta">
          <div className="registro-tarjeta-cabecera">
            <h2>Datos personales</h2>

            <p>
              Completa la información solicitada
              para crear tu cuenta.
            </p>
          </div>

          <form onSubmit={registrar}>
            <div className="registro-campos">
              <label>
                Nombres *

                <div className="registro-input-icono">
                  <UserRound size={18} />

                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={100}
                    autoComplete="given-name"
                    placeholder="Ingresa tus nombres"
                    value={form.nombres}
                    onChange={e =>
                      actualizar(
                        'nombres',
                        e.target.value
                      )
                    }
                  />
                </div>
              </label>

              <label>
                Apellidos *

                <div className="registro-input-icono">
                  <UserRound size={18} />

                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={120}
                    autoComplete="family-name"
                    placeholder="Ingresa tus apellidos"
                    value={form.apellidos}
                    onChange={e =>
                      actualizar(
                        'apellidos',
                        e.target.value
                      )
                    }
                  />
                </div>
              </label>

              <label>
                Correo electrónico *

                <div className="registro-input-icono">
                  <Mail size={18} />

                  <input
                    type="email"
                    required
                    maxLength={254}
                    autoComplete="email"
                    placeholder="correo@ejemplo.com"
                    value={form.correo}
                    onChange={e =>
                      actualizar(
                        'correo',
                        e.target.value
                      )
                    }
                  />
                </div>
              </label>

              <label>
                Teléfono (opcional)

                <div className="registro-input-icono">
                  <Phone size={18} />

                  <input
                    type="tel"
                    maxLength={20}
                    autoComplete="tel"
                    placeholder="987654321"
                    value={form.telefono}
                    onChange={e =>
                      actualizar(
                        'telefono',
                        e.target.value
                      )
                    }
                  />
                </div>
              </label>

              <label>
                Contraseña *

                <div className="registro-input-icono">
                  <LockKeyhole size={18} />

                  <input
                    type={
                      mostrarClave
                        ? 'text'
                        : 'password'
                    }
                    required
                    minLength={8}
                    maxLength={72}
                    autoComplete="new-password"
                    placeholder="Crea una contraseña segura"
                    value={form.contrasena}
                    onChange={e =>
                      actualizar(
                        'contrasena',
                        e.target.value
                      )
                    }
                  />

                  <button
                    type="button"
                    className="registro-ver-clave"
                    onClick={() =>
                      setMostrarClave(v => !v)
                    }
                    aria-label={
                      mostrarClave
                        ? 'Ocultar contraseña'
                        : 'Mostrar contraseña'
                    }
                  >
                    {mostrarClave
                      ? <EyeOff size={18} />
                      : <Eye size={18} />}
                  </button>
                </div>
              </label>

              <label>
                Confirmar contraseña *

                <div className="registro-input-icono">
                  <LockKeyhole size={18} />

                  <input
                    type={
                      mostrarConfirmacion
                        ? 'text'
                        : 'password'
                    }
                    required
                    minLength={8}
                    maxLength={72}
                    autoComplete="new-password"
                    placeholder="Repite tu contraseña"
                    value={form.confirmarContrasena}
                    onChange={e =>
                      actualizar(
                        'confirmarContrasena',
                        e.target.value
                      )
                    }
                  />

                  <button
                    type="button"
                    className="registro-ver-clave"
                    onClick={() =>
                      setMostrarConfirmacion(v => !v)
                    }
                    aria-label={
                      mostrarConfirmacion
                        ? 'Ocultar confirmación'
                        : 'Mostrar confirmación'
                    }
                  >
                    {mostrarConfirmacion
                      ? <EyeOff size={18} />
                      : <Eye size={18} />}
                  </button>
                </div>
              </label>
            </div>

            <div className="registro-ayuda">
              <ShieldCheck size={17} />

              <span>
                Usa entre 8 y 72 caracteres, incluyendo
                al menos una mayúscula, una minúscula
                y un número.
              </span>
            </div>

            <div className="registro-privacidad">
              <h3>Información sobre tus datos</h3>

              <p>
                Este es un prototipo académico.
                Los datos de prueba registrados
                se utilizarán para crear la cuenta,
                autenticar al usuario y gestionar
                las reservas dentro de SIGET-VÍA.
                No utilices datos personales reales
                en las pruebas.
              </p>
            </div>

            <label className="registro-aceptacion">
              <input
                type="checkbox"
                checked={form.aceptaPrivacidad}
                onChange={e =>
                  actualizar(
                    'aceptaPrivacidad',
                    e.target.checked
                  )
                }
              />

              <span>
                He leído y acepto el aviso
                de tratamiento de datos mostrado
                para este prototipo académico.
              </span>
            </label>

            {error && (
              <div
                className="registro-error"
                role="alert"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              className="registro-boton"
              disabled={cargando}
            >
              <UserRoundPlus size={19} />

              {cargando
                ? 'Creando cuenta...'
                : 'Crear cuenta'}
            </button>

            <div className="registro-login">
              ¿Ya tienes una cuenta?

              <Link to="/">
                Iniciar sesión
              </Link>
            </div>
          </form>
        </section>

        <footer className="registro-pie">
          SIGET-VÍA · Prototipo académico de gestión
          de transporte interprovincial
        </footer>
      </main>
    </div>
  );
}
