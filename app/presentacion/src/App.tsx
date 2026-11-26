
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode
} from 'react';

import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate
} from 'react-router-dom';

import {
  LayoutDashboard,
  Users,
  UserRound,
  Map,
  MapPin,
  BusFront,
  CalendarClock,
  UserRoundCog,
  Ticket,
  Receipt,
  CreditCard,
  ShieldCheck,
  MessageSquareWarning,
  ChartColumn,
  ClipboardList,
  BookOpen,
  LogOut,
  Plus,
  Search,
  Pencil,
  Eye,
  CheckCircle2,
  X,
  UserRoundPlus,
  House,
  ArrowLeft
} from 'lucide-react';

import Pasajeros from './paginas/Pasajeros';
import Rutas from './paginas/Rutas';
import Terminales from './paginas/Terminales';
import Buses from './paginas/Buses';
import Conductores from './paginas/Conductores';
import Viajes from './paginas/Viajes';
import Reservas from './paginas/Reservas';
import Ventas from './paginas/Ventas';
import Pagos from './paginas/Pagos';
import Auditoria from './paginas/Auditoria';
import Reclamaciones from './paginas/Reclamaciones';
import ReclamacionesPublicas from './paginas/ReclamacionesPublicas';
import ViajesPublicos from './paginas/ViajesPublicos';
import AsientosPublicos from './paginas/AsientosPublicos';
import RegistroCliente from './paginas/RegistroCliente';
import ClienteInicio from './paginas/ClienteInicio';
import MisReservas from './paginas/MisReservas';
import MisReclamaciones from './paginas/MisReclamaciones';
import CondicionesServicio from './paginas/CondicionesServicio';
import Reportes from './paginas/Reportes';
import Manifiestos from './paginas/Manifiestos';
import Politicas from './paginas/Politicas';
import DashboardAdmin from './paginas/DashboardAdmin';

import {
  iniciarSesion,
  obtenerSesion,
  listarRoles,
  listarUsuarios,
  crearUsuario,
  editarUsuario,
  cambiarEstadoUsuario,
  leerToken,
  guardarToken,
  borrarToken,
  rutaInicial,
  rutaDespuesDeIniciarSesion,
  puedeAcceder,
  esPersonal,
  nombrePerfil
} from './reglas/sesion';
import CampoContrasena from './componentes/CampoContrasena';

// =====================================================
// SIGET-VÍA — APLICACIÓN PRINCIPAL
// PASO 188 — INICIO DESDE LA PÁGINA PÚBLICA
// =====================================================
//
// OBJETIVOS:
//
// 1. El sistema arranca en la página pública.
// 2. El login funciona desde /login.
// 3. El administrador ingresa a /panel.
// 4. El cliente ingresa a /cliente.
// 5. Se conservan las rutas existentes.
// 6. Se conserva la autenticación JWT.
// 7. Se mantienen los permisos por rol.
// 8. No se modifica el backend.
//
// =====================================================

// =====================================================
// TIPOS
// =====================================================

type Estado = 'ACTIVO' | 'INACTIVO';

type User = {
  UsuarioID: number;
  Nombres: string;
  Apellidos: string;
  Correo: string;
  Telefono?: string | null;
  Estado: Estado;
  RolID: number;
  Rol: string;
};

type Role = {
  RolID: number;
  Nombre: string;
};

type LoginResponse = {
  token: string;
  usuario: User;
};

type UserForm = {
  nombres: string;
  apellidos: string;
  correo: string;
  telefono: string;
  contrasena: string;
  rolId: number;
  estado: Estado;
};

type Modal = 'new' | 'edit' | 'view' | null;

// =====================================================
// FORMULARIO INICIAL
// =====================================================

const emptyForm = (): UserForm => ({
  nombres: '',
  apellidos: '',
  correo: '',
  telefono: '',
  contrasena: '',
  rolId: 0,
  estado: 'ACTIVO'
});

// =====================================================
// RUTAS DE INICIO SEGÚN ROL
// =====================================================

// =====================================================
// MENÚ DEL ADMINISTRADOR Y OPERADOR
// =====================================================

const items = [
  ['/panel', 'Inicio', LayoutDashboard],
  ['/usuarios', 'Usuarios', Users],
  ['/pasajeros', 'Pasajeros', UserRound],
  ['/rutas', 'Rutas', Map],
  ['/terminales', 'Terminales', MapPin],
  ['/viajes', 'Viajes', CalendarClock],
  ['/buses', 'Buses', BusFront],
  ['/conductores', 'Conductores', UserRoundCog],
  ['/reservas', 'Reservas', Ticket],
  ['/ventas', 'Ventas', Receipt],
  ['/pagos', 'Pagos', CreditCard],
  ['/auditoria', 'Auditoría', ShieldCheck],
  [
    '/reclamaciones',
    'Reclamaciones',
    MessageSquareWarning
  ],
  ['/reportes', 'Reportes', ChartColumn],
  ['/manifiestos', 'Manifiestos', ClipboardList],
  ['/politicas', 'Políticas del servicio', BookOpen],
  ['/', 'Página pública', House]
] as const;


// =====================================================
// MENÚ EXCLUSIVO DEL CLIENTE
// =====================================================

const itemsCliente = [
  ['/cliente', 'Inicio', House],
  ['/viajes/publico', 'Buscar viajes', Search],
  ['/mis-reservas', 'Mis reservas', Ticket],
  ['/mis-reclamaciones', 'Mis reclamaciones', MessageSquareWarning],
  ['/politicas', 'Políticas del servicio', BookOpen],
  [
    '/reclamaciones/publico',
    'Libro de reclamaciones',
    MessageSquareWarning
  ],
  ['/', 'Página pública', BusFront]
] as const;

// =====================================================
// INICIO DE SESIÓN
// =====================================================

function Login({
  onLogin
}: {
  onLogin: (data: LoginResponse) => void;
}) {
  // Si viene del registro, el correo llega en el estado de navegación.
  const estadoNavegacion = useLocation().state as
    { correo?: string; registrado?: boolean } | null;

  const [correo, setCorreo] = useState(estadoNavegacion?.correo || '');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // ---------------------------------------------------
  // AUTENTICAR
  // ---------------------------------------------------

  async function submit(
    e: FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    if (busy) return;

    setError('');
    setBusy(true);

    try {
      const data = await iniciarSesion<LoginResponse>(correo.trim(), contrasena);

      onLogin(data);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'No se pudo iniciar sesión.'
      );
    } finally {
      setBusy(false);
    }
  }

  // ---------------------------------------------------
  // INTERFAZ
  // ---------------------------------------------------

  return (
    <div className="login">

      <section className="login-brand">
        <h1>SIGET-VÍA</h1>

        <p>
          Sistema Informático Integrado
          <br />
          de Gestión de Transporte
          <br />
          Interprovincial
        </p>

        <strong>
          Transportes Vía S.A.C.
        </strong>

        <div style={{ marginTop: 28 }}>
          <Link
            to="/"
            style={{
              color: '#ffffff',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontWeight: 700,
              textDecoration: 'none'
            }}
          >
            <ArrowLeft size={17} />
            Volver a la página pública
          </Link>
        </div>
      </section>

      <main className="login-main">

        <form
          className="login-card"
          onSubmit={submit}
        >
          <h2>Iniciar sesión</h2>

          <p>
            Ingresa con tu cuenta autorizada.
          </p>

          {estadoNavegacion?.registrado && (
            <div
              className="alert"
              style={{
                background: '#e8f6ee',
                borderColor: '#9fd5b5',
                color: '#1d6b42'
              }}
            >
              Cuenta creada. Ingresa tu contraseña para continuar.
            </div>
          )}

          <label>
            Correo electrónico

            <input
              type="email"
              name="username"
              autoComplete="username"
              required
              value={correo}
              onChange={e =>
                setCorreo(e.target.value)
              }
              placeholder="correo@ejemplo.com"
            />
          </label>

          <label>
            Contraseña

            <CampoContrasena
              name="password"
              autoComplete="current-password"
              required
              value={contrasena}
              onChange={e =>
                setContrasena(e.target.value)
              }
            />
          </label>

          {error && (
            <div className="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="primary"
            disabled={busy}
          >
            {busy
              ? 'Ingresando...'
              : 'Ingresar'}
          </button>

          {/* REGISTRO DE CLIENTES */}

          <div
            style={{
              marginTop: 22,
              textAlign: 'center',
              padding: '17px 12px',
              background: '#f3f7fb',
              borderRadius: 10,
              border: '1px solid #e2eaf1'
            }}
          >
            <p
              style={{
                margin: '0 0 10px',
                fontSize: 13,
                color: '#5d7285'
              }}
            >
              ¿Todavía no tienes una cuenta?
            </p>

            <Link
              to="/registro"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 9,
                width: '100%',
                background: '#ee8b2f',
                color: '#fff',
                padding: '12px 14px',
                borderRadius: 8,
                fontWeight: 700,
                textDecoration: 'none'
              }}
            >
              <UserRoundPlus size={18} />
              Crear cuenta de cliente
            </Link>
          </div>

          {/* VIAJES PÚBLICOS */}

          <Link
            to="/viajes/publico"
            style={{
              display: 'block',
              marginTop: 19,
              textAlign: 'center',
              fontWeight: 600,
              color: '#173b63',
              textDecoration: 'none'
            }}
          >
            Consultar viajes y tarifas
          </Link>

          {/* RECLAMACIONES */}

          <Link
            to="/reclamaciones/publico"
            style={{
              display: 'block',
              marginTop: 16,
              textAlign: 'center',
              fontWeight: 600,
              color: '#173b63',
              textDecoration: 'none'
            }}
          >
            Libro de Reclamaciones
            {' — '}
            Registrar o consultar
          </Link>

          <small>
            El perfil se determina según
            el rol registrado en SQL Server.
          </small>

        </form>

      </main>

    </div>
  );
}

// =====================================================
// DASHBOARD ADMINISTRATIVO
// =====================================================

function Dashboard({
  token
}: {
  token: string;
}) {
  return (
    <DashboardAdmin token={token} />
  );
}

// =====================================================
// INICIO DEL PERSONAL DE VENTAS Y DEL OPERADOR
// =====================================================

function InicioPersonal({ usuario }: { usuario: User }) {
  const accesos = items.filter(
    ([path]) =>
      path !== '/' && path !== '/panel' && puedeAcceder(usuario.Rol, path)
  );

  return (
    <>
      <div className="heading">
        <h1>Hola, {usuario.Nombres}</h1>

        <p>
          Bienvenido a SIGET-VÍA · {nombrePerfil(usuario.Rol)}
        </p>
      </div>

      <div className="inicio-accesos">
        {accesos.map(([path, label, Icon]) => (
          <Link key={path} to={path} className="inicio-acceso">
            <Icon size={22} />
            <span>{label}</span>
          </Link>
        ))}
      </div>

      <div className="dashboard-note">
        <CheckCircle2 size={22} />

        <div>
          <b>Sistema conectado</b>

          <p>
            Selecciona uno de los módulos
            autorizados para tu perfil.
          </p>
        </div>
      </div>
    </>
  );
}

// =====================================================
// GESTIÓN DE USUARIOS — RF2
// =====================================================

function Usuarios({
  token
}: {
  token: string;
}) {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [modal, setModal] = useState<Modal>(null);

  const [selected, setSelected] =
    useState<User | null>(null);

  const [form, setForm] =
    useState<UserForm>(emptyForm);

  const [busy, setBusy] = useState(false);

  // ---------------------------------------------------
  // CONSULTAR USUARIOS
  // ---------------------------------------------------

  async function load(search = '') {
    try {
      const data = await listarUsuarios<User[]>(token, search);

      setUsers(data);
      setError('');
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'No se pudieron cargar los usuarios.'
      );
    }
  }

  // ---------------------------------------------------
  // CONSULTAR USUARIOS Y ROLES
  // ---------------------------------------------------

  useEffect(() => {
    let active = true;

    listarUsuarios<User[]>(token)
      .then(data => {
        if (active) {
          setUsers(data);
        }
      })
      .catch(e => {
        if (active) {
          setError(
            e instanceof Error
              ? e.message
              : 'Error al consultar usuarios.'
          );
        }
      });

    listarRoles<Role[]>(token)
      .then(data => {
        if (active) {
          setRoles(data);
        }
      })
      .catch(e => {
        if (active) {
          setError(
            e instanceof Error
              ? e.message
              : 'Error al consultar roles.'
          );
        }
      });

    return () => {
      active = false;
    };
  }, [token]);

  // ---------------------------------------------------
  // ABRIR MODAL
  // ---------------------------------------------------

  function open(
    mode: Exclude<Modal, null>,
    u?: User
  ) {
    setSelected(u || null);

    setForm(
      u
        ? {
            nombres: u.Nombres,
            apellidos: u.Apellidos,
            correo: u.Correo,
            telefono: u.Telefono || '',
            contrasena: '',
            rolId: u.RolID,
            estado: u.Estado
          }
        : emptyForm()
    );

    setError('');
    setInfo('');
    setModal(mode);
  }

  // ---------------------------------------------------
  // ACTUALIZAR FORMULARIO
  // ---------------------------------------------------

  function update<K extends keyof UserForm>(
    campo: K,
    valor: UserForm[K]
  ) {
    setForm(prev => ({
      ...prev,
      [campo]: valor
    }));
  }

  // ---------------------------------------------------
  // GUARDAR USUARIO
  // ---------------------------------------------------

  async function save(
    e: FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    if (!modal || modal === 'view' || busy) {
      return;
    }

    setError('');
    setInfo('');

    if (!form.rolId) {
      setError(
        'Selecciona un perfil de usuario.'
      );
      return;
    }

    const telefono = form.telefono.trim();

    if (
      telefono &&
      !/^[0-9+()\s-]{6,20}$/.test(telefono)
    ) {
      setError(
        'El teléfono tiene un formato inválido.'
      );
      return;
    }

    if (modal === 'edit' && !selected) {
      setError(
        'No se seleccionó ningún usuario.'
      );
      return;
    }

    setBusy(true);

    try {
      const payload = {
        ...form,
        nombres: form.nombres.trim(),
        apellidos: form.apellidos.trim(),
        correo: form.correo
          .trim()
          .toLowerCase(),
        telefono: telefono || null
      };

      await (modal === 'edit'
        ? editarUsuario(token, selected?.UsuarioID, payload)
        : crearUsuario(token, payload));

      setModal(null);

      setInfo(
        modal === 'edit'
          ? 'Usuario actualizado correctamente.'
          : 'Usuario registrado correctamente.'
      );

      await load(q);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'No se pudo guardar el usuario.'
      );
    } finally {
      setBusy(false);
    }
  }

  // ---------------------------------------------------
  // CAMBIAR ESTADO DEL USUARIO
  // ---------------------------------------------------

  async function toggle(u: User) {
    const estado: Estado =
      u.Estado === 'ACTIVO'
        ? 'INACTIVO'
        : 'ACTIVO';

    if (
      !window.confirm(
        `¿Cambiar el estado de ${u.Nombres} ` +
        `${u.Apellidos} a ${estado}?`
      )
    ) {
      return;
    }

    setError('');
    setInfo('');

    try {
      await cambiarEstadoUsuario(token, u.UsuarioID, estado);

      setInfo(
        'Estado actualizado correctamente.'
      );

      await load(q);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'No se pudo actualizar el estado.'
      );
    }
  }

  // ---------------------------------------------------
  // INTERFAZ DE USUARIOS
  // ---------------------------------------------------

  return (
    <>
      <div className="heading">
        <h1>Gestión de usuarios</h1>

        <p>
          RF2 · Registro, consulta, edición
          y control de estados
        </p>
      </div>

      <div className="panel">

        <div className="section-heading">
          <div>
            <h2>
              Registros · Gestión de usuarios
            </h2>

            <p>
              Consulta y administración de usuarios
            </p>
          </div>

          <button
            type="button"
            className="orange"
            onClick={() => open('new')}
          >
            <Plus size={17} />
            Nuevo
          </button>
        </div>

        {/* BÚSQUEDA */}

        <form
          className="search-form"
          onSubmit={e => {
            e.preventDefault();
            void load(q);
          }}
        >
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar por nombre o correo"
          />

          <button
            type="submit"
            className="secondary"
          >
            <Search size={16} />
            Buscar
          </button>
        </form>

        {info && (
          <div className="success">
            {info}
          </div>
        )}

        {!modal && error && (
          <div className="alert">
            {error}
          </div>
        )}

        {/* TABLA */}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombres</th>
                <th>Apellidos</th>
                <th>Correo</th>
                <th>Perfil</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {users.map(u => (
                <tr key={u.UsuarioID}>
                  <td>{u.UsuarioID}</td>
                  <td>{u.Nombres}</td>
                  <td>{u.Apellidos}</td>
                  <td>{u.Correo}</td>
                  <td>{u.Rol}</td>

                  <td>
                    <span
                      className={
                        u.Estado === 'ACTIVO'
                          ? 'status active'
                          : 'status'
                      }
                    >
                      {u.Estado}
                    </span>
                  </td>

                  <td className="actions">
                    <button
                      type="button"
                      title="Ver detalle"
                      onClick={() =>
                        open('view', u)
                      }
                    >
                      <Eye size={16} />
                    </button>

                    <button
                      type="button"
                      title="Editar usuario"
                      onClick={() =>
                        open('edit', u)
                      }
                    >
                      <Pencil size={16} />
                    </button>

                    <button
                      type="button"
                      title="Cambiar estado"
                      onClick={() =>
                        void toggle(u)
                      }
                    >
                      <CheckCircle2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}

              {users.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    No hay usuarios con este criterio.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* =============================================
          MODAL NUEVO / EDITAR / VER
          ============================================= */}

      {modal && (
        <div
          className="overlay"
          onMouseDown={e => {
            if (
              e.target === e.currentTarget &&
              !busy
            ) {
              setModal(null);
            }
          }}
        >
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Gestión de usuarios"
          >
            <div className="dialog-head">

              <h2>
                {modal === 'new'
                  ? 'Registrar usuario'
                  : modal === 'edit'
                    ? 'Editar usuario'
                    : 'Detalle del usuario'}
              </h2>

              <button
                type="button"
                disabled={busy}
                onClick={() => setModal(null)}
                aria-label="Cerrar"
              >
                <X />
              </button>

            </div>

            <form
              key={
                `${modal}-` +
                `${selected?.UsuarioID ?? 'nuevo'}`
              }
              autoComplete="off"
              onSubmit={save}
            >
              <div className="fields">

                <label>
                  Nombres

                  <input
                    name="siget_registro_nombres"
                    autoComplete="off"
                    maxLength={100}
                    required
                    disabled={modal === 'view'}
                    value={form.nombres}
                    onChange={e =>
                      update(
                        'nombres',
                        e.target.value
                      )
                    }
                  />
                </label>

                <label>
                  Apellidos

                  <input
                    name="siget_registro_apellidos"
                    autoComplete="off"
                    maxLength={120}
                    required
                    disabled={modal === 'view'}
                    value={form.apellidos}
                    onChange={e =>
                      update(
                        'apellidos',
                        e.target.value
                      )
                    }
                  />
                </label>

                <label>
                  Correo

                  <input
                    type="email"
                    name="siget_registro_correo"
                    autoComplete="off"
                    maxLength={254}
                    required
                    disabled={modal === 'view'}
                    value={form.correo}
                    onChange={e =>
                      update(
                        'correo',
                        e.target.value
                      )
                    }
                  />
                </label>

                <label>
                  Teléfono (opcional)

                  <input
                    type="tel"
                    name="siget_registro_telefono"
                    autoComplete="off"
                    maxLength={20}
                    placeholder="Ej.: 987654321"
                    disabled={modal === 'view'}
                    value={form.telefono}
                    onChange={e =>
                      update(
                        'telefono',
                        e.target.value
                      )
                    }
                  />
                </label>

                {modal !== 'view' && (
                  <label>
                    Contraseña{' '}

                    {modal === 'edit'
                      ? '(opcional: dejar vacía para mantener)'
                      : ''}

                    <CampoContrasena
                      name="siget_nueva_clave_usuario"
                      autoComplete="new-password"
                      minLength={8}
                      maxLength={72}
                      required={modal === 'new'}
                      value={form.contrasena}
                      onChange={e =>
                        update(
                          'contrasena',
                          e.target.value
                        )
                      }
                    />
                  </label>
                )}

                <label>
                  Perfil de usuario

                  <select
                    name="siget_registro_rol"
                    value={form.rolId}
                    required
                    disabled={modal === 'view'}
                    onChange={e =>
                      update(
                        'rolId',
                        Number(e.target.value)
                      )
                    }
                  >
                    <option value={0} disabled>
                      Selecciona un perfil
                    </option>

                    {roles.map(r => (
                      <option
                        key={r.RolID}
                        value={r.RolID}
                      >
                        {r.Nombre}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Estado

                  <select
                    value={form.estado}
                    disabled={modal === 'view'}
                    onChange={e =>
                      update(
                        'estado',
                        e.target.value as Estado
                      )
                    }
                  >
                    <option value="ACTIVO">
                      ACTIVO
                    </option>

                    <option value="INACTIVO">
                      INACTIVO
                    </option>
                  </select>
                </label>

              </div>

              {error && (
                <div className="alert">
                  {error}
                </div>
              )}

              <div className="dialog-actions">

                {modal !== 'view' && (
                  <button
                    type="submit"
                    className="orange"
                    disabled={busy}
                  >
                    {busy
                      ? 'Guardando...'
                      : modal === 'edit'
                        ? 'Guardar cambios'
                        : 'Guardar'}
                  </button>
                )}

                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => setModal(null)}
                >
                  Cerrar
                </button>

              </div>

            </form>
          </div>
        </div>
      )}
    </>
  );
}

// =====================================================
// ESTRUCTURA GENERAL DEL PANEL AUTENTICADO
// =====================================================

function PanelLayout({
  user,
  cliente,
  onLogout,
  children
}: {
  user: User;
  cliente: boolean;
  onLogout: () => void;
  children: ReactNode;
}) {
  const enlaces = cliente
    ? itemsCliente.filter(
        ([path]) => path !== '/'
      )
    : items.filter(
        ([path]) => path !== '/' && puedeAcceder(user.Rol, path)
      );

  return (
    <div className="app">

      {/* MENÚ LATERAL */}

      <aside>
        <div className="logo">
          <h2>SIGET-VÍA</h2>

          <small>
            {cliente
              ? 'PORTAL DEL CLIENTE'
              : 'TRANSPORTES VÍA S.A.C.'}
          </small>
        </div>

        <nav>
          {enlaces.map(
            ([path, label, Icon]) => (
              <NavLink
                key={path}
                to={path}
                end={
                  path === '/panel' ||
                  path === '/cliente'
                }
                className={({ isActive }) =>
                  isActive ? 'selected' : ''
                }
              >
                <Icon size={17} />
                {label}
              </NavLink>
            )
          )}

          {/* ACCESO AL PORTAL PÚBLICO */}

          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              isActive ? 'selected' : ''
            }
          >
            <House size={17} />
            Página pública
          </NavLink>
        </nav>

        <div className="side-bottom">
          <span>
            {user.Nombres}{' '}
            {user.Apellidos}

            <small>
              {user.Rol}
            </small>
          </span>

          <button
            type="button"
            onClick={onLogout}
          >
            <LogOut size={16} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* CONTENIDO PRINCIPAL */}

      <main className="workspace">
        <header>
          {cliente
            ? 'SIGET-VÍA / Portal del cliente'
            : 'SIGET-VÍA / Sistema integrado de gestión'}
        </header>

        <div className="content">
          {children}
        </div>
      </main>
    </div>
  );
}

// =====================================================
// APLICACIÓN PRINCIPAL
// =====================================================

export default function App() {
  const [token, setToken] = useState(
    () =>
      leerToken()
  );

  const [user, setUser] =
    useState<User | null>(null);

  const [loading, setLoading] =
    useState(Boolean(token));

  const navigate = useNavigate();
  const location = useLocation();

  // Página a la que se va después de iniciar sesión.
  const destinoTrasLogin = useRef('');

  // ===================================================
  // VALIDAR SESIÓN JWT
  // ===================================================

  useEffect(() => {
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    let active = true;

    setLoading(true);

    obtenerSesion<{ usuario: User }>(token)
      .then(({ usuario }) => {
        if (active) {
          setUser(usuario);
        }
      })
      .catch(() => {
        if (active) {
          borrarToken();

          setToken('');
          setUser(null);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [token]);

  // ===================================================
  // INICIAR SESIÓN
  // ===================================================

  function login(data: LoginResponse) {
    guardarToken(data.token);

    // El mismo destino lo usa la ruta /login cuando ya hay usuario.
    destinoTrasLogin.current =
      rutaDespuesDeIniciarSesion(data.usuario);

    setUser(data.usuario);
    setToken(data.token);

    navigate(
      destinoTrasLogin.current,
      { replace: true }
    );
  }

  // ===================================================
  // CERRAR SESIÓN
  // ===================================================

  function logout() {
    borrarToken();

    setToken('');
    setUser(null);

    navigate('/', {
      replace: true
    });
  }

  // ===================================================
  // CLASIFICAR RUTAS PÚBLICAS
  // ===================================================

  const pathname = location.pathname;

  const esRutaPublica =
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/registro' ||
    pathname === '/viajes/publico' ||
    pathname === '/reclamaciones/publico' ||
    pathname === '/condiciones' ||
    /^\/viajes\/publico\/[^/]+\/asientos\/?$/.test(
      pathname
    );

  // ===================================================
  // MOSTRAR CARGA DE SESIÓN
  // ===================================================

  if (loading) {
    return (
      <div className="loader">
        Validando sesión...
      </div>
    );
  }

  // ===================================================
  // PASO 188 — PORTAL PÚBLICO
  // ===================================================
  //
  // Estas páginas se pueden visitar sin iniciar
  // sesión y también con una sesión activa.
  //
  // La ruta "/" SIEMPRE es la página pública.
  //
  // ===================================================

  if (esRutaPublica) {
    return (
      <Routes>

        {/* PORTADA PÚBLICA PRINCIPAL */}

        <Route
          path="/"
          element={<ViajesPublicos usuario={user} onSalir={logout} />}
        />

        {/* CONSULTA PÚBLICA DE VIAJES */}

        <Route
          path="/viajes/publico"
          element={<ViajesPublicos usuario={user} onSalir={logout} />}
        />

        {/* SELECCIÓN PÚBLICA DE ASIENTOS */}

        <Route
          path="/viajes/publico/:viajeId/asientos"
          element={<AsientosPublicos />}
        />

        {/* LIBRO DE RECLAMACIONES */}

        <Route
          path="/reclamaciones/publico"
          element={<ReclamacionesPublicas />}
        />

        {/* REGISTRO DE CLIENTES */}

        <Route
          path="/registro"
          element={<RegistroCliente />}
        />

        {/* CONDICIONES DEL SERVICIO — CU017 */}

        <Route
          path="/condiciones"
          element={<CondicionesServicio />}
        />

        {/* INICIO DE SESIÓN */}

        <Route
          path="/login"
          element={
            user
              ? (
                  <Navigate
                    to={destinoTrasLogin.current || rutaInicial(user)}
                    replace
                  />
                )
              : <Login onLogin={login} />
          }
        />

      </Routes>
    );
  }

  // ===================================================
  // PROTEGER LAS RUTAS PRIVADAS
  // ===================================================

  if (!token || !user) {
    return (
      <Routes>
        <Route
          path="*"
          element={
            <Navigate
              to="/login"
              replace
            />
          }
        />
      </Routes>
    );
  }

  // ===================================================
  // VERIFICAR ROLES
  // ===================================================

  const esAdmin =
    user.Rol === 'ADMINISTRADOR';

  // Regla de acceso por perfil (reglas/sesion.ts).
  const puede = (ruta: string) => puedeAcceder(user.Rol, ruta);

  const esCliente =
    user.Rol === 'CLIENTE';

  // ===================================================
  // PORTAL EXCLUSIVO DEL CLIENTE
  // ===================================================

  if (esCliente) {
    return (
      <PanelLayout
        user={user}
        cliente={true}
        onLogout={logout}
      >
        <Routes>

          {/* INICIO DEL CLIENTE */}

          <Route
            path="/cliente"
            element={
              <ClienteInicio cliente={user} />
            }
          />

          {/* MIS RESERVAS */}

          <Route
            path="/mis-reservas"
            element={
              <MisReservas token={token} />
            }
          />

          {/* MIS RECLAMACIONES — CU012 */}

          <Route
            path="/mis-reclamaciones"
            element={
              <MisReclamaciones token={token} />
            }
          />

          {/* POLÍTICAS DEL SERVICIO */}

          <Route
            path="/politicas"
            element={
              <Politicas
                token={token}
                esAdmin={false}
              />
            }
          />

          {/* NO PERMITIR ENTRADA ADMINISTRATIVA */}

          <Route
            path="*"
            element={
              <Navigate
                to="/cliente"
                replace
              />
            }
          />

        </Routes>
      </PanelLayout>
    );
  }

  // ===================================================
  // CONTROL DE ROLES NO AUTORIZADOS
  // ===================================================

  if (!esPersonal(user.Rol)) {
    return (
      <div className="login">
        <main className="login-main">
          <div className="login-card">
            <h2>Acceso restringido</h2>

            <p>
              Tu cuenta no tiene un perfil
              autorizado para ingresar.
            </p>

            <button
              type="button"
              className="primary"
              onClick={logout}
            >
              Cerrar sesión
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ===================================================
  // PANEL DE ADMINISTRADOR Y OPERADOR
  // ===================================================

  return (
    <PanelLayout
      user={user}
      cliente={false}
      onLogout={logout}
    >
      <Routes>

        {/* DASHBOARD */}

        <Route
          path="/panel"
          element={
            esAdmin
              ? <Dashboard token={token} />
              : <InicioPersonal usuario={user} />
          }
        />

        {/* ============================================
            GESTIÓN DE USUARIOS
            ============================================ */}

        <Route
          path="/usuarios"
          element={
            puede('/usuarios')
              ? <Usuarios token={token} />
              : (
                  <Navigate
                    to="/panel"
                    replace
                  />
                )
          }
        />

        {/* PASAJEROS */}

        <Route
          path="/pasajeros"
          element={
            puede('/pasajeros')
              ? <Pasajeros token={token} />
              : <Navigate to="/panel" replace />
          }
        />

        {/* RUTAS */}

        <Route
          path="/rutas"
          element={
            puede('/rutas')
              ? <Rutas token={token} />
              : <Navigate to="/panel" replace />
          }
        />

        {/* TERMINALES TERRESTRES */}

        <Route
          path="/terminales"
          element={
            puede('/terminales')
              ? <Terminales token={token} />
              : <Navigate to="/panel" replace />
          }
        />

        {/* VIAJES */}

        <Route
          path="/viajes"
          element={
            puede('/viajes')
              ? <Viajes token={token} />
              : <Navigate to="/panel" replace />
          }
        />

        {/* BUSES */}

        <Route
          path="/buses"
          element={
            puede('/buses')
              ? <Buses token={token} />
              : <Navigate to="/panel" replace />
          }
        />

        {/* CONDUCTORES */}

        <Route
          path="/conductores"
          element={
            puede('/conductores')
              ? <Conductores token={token} />
              : <Navigate to="/panel" replace />
          }
        />

        {/* RESERVAS ADMINISTRATIVAS */}

        <Route
          path="/reservas"
          element={
            puede('/reservas')
              ? <Reservas token={token} />
              : <Navigate to="/panel" replace />
          }
        />

        {/* VENTAS */}

        <Route
          path="/ventas"
          element={
            puede('/ventas')
              ? <Ventas token={token} />
              : <Navigate to="/panel" replace />
          }
        />

        {/* PAGOS */}

        <Route
          path="/pagos"
          element={
            puede('/pagos')
              ? <Pagos token={token} />
              : <Navigate to="/panel" replace />
          }
        />

        {/* AUDITORÍA */}

        <Route
          path="/auditoria"
          element={
            puede('/auditoria')
              ? <Auditoria token={token} />
              : <Navigate to="/panel" replace />
          }
        />

        {/* RECLAMACIONES ADMINISTRATIVAS */}

        <Route
          path="/reclamaciones"
          element={
            puede('/reclamaciones')
              ? <Reclamaciones token={token} />
              : <Navigate to="/panel" replace />
          }
        />

        {/* REPORTES */}

        <Route
          path="/reportes"
          element={
            puede('/reportes')
              ? <Reportes token={token} />
              : <Navigate to="/panel" replace />
          }
        />

        {/* MANIFIESTOS */}

        <Route
          path="/manifiestos"
          element={
            puede('/manifiestos')
              ? <Manifiestos token={token} />
              : <Navigate to="/panel" replace />
          }
        />

        {/* POLÍTICAS DEL SERVICIO */}

        <Route
          path="/politicas"
          element={
            <Politicas
              token={token}
              esAdmin={esAdmin}
            />
          }
        />

        {/* RUTAS NO AUTORIZADAS */}

        <Route
          path="*"
          element={
            <Navigate
              to="/panel"
              replace
            />
          }
        />

      </Routes>
    </PanelLayout>
  );
}
