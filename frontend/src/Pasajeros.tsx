
import {
  useEffect,
  useState,
  type FormEvent
} from 'react';

import {
  Plus,
  Search,
  Eye,
  Pencil,
  CheckCircle2,
  X
} from 'lucide-react';

import {
  alertaExito,
  alertaError,
  alertaAdvertencia,
  confirmarAccion
} from './utils/alertas';

import {
  limpiarTexto,
  normalizarDocumento,
  validarDNI,
  validarCE,
  validarNombre
} from './utils/validaciones';

// ========================================
// SIGET-VÍA - GESTIÓN DE PASAJEROS RF15
// VALIDACIONES Y SWEETALERT2
// ========================================

type EstadoPasajero = 'ACTIVO' | 'INACTIVO';

type TipoDocumento = 'DNI' | 'CE' | 'PASAPORTE';

type Pasajero = {
  PasajeroID: number;
  UsuarioID: number | null;
  TipoDocumento: string;
  NumeroDocumento: string;
  Nombres: string;
  Apellidos: string;
  FechaNacimiento: string | null;
  Telefono: string | null;
  Estado: EstadoPasajero;
  UsuarioCorreo: string | null;
};

type UsuarioDisponible = {
  UsuarioID: number;
  Nombres: string;
  Apellidos: string;
  Correo: string;
};

type Formulario = {
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  nombres: string;
  apellidos: string;
  fechaNacimiento: string;
  telefono: string;
  usuarioId: number | null;
  estado: EstadoPasajero;
};

type Modal = 'new' | 'edit' | 'view' | null;

// ========================================
// CONFIGURACIÓN
// ========================================

const API =
  import.meta.env.VITE_API_URL ||
  'http://localhost:4000/api';

const vacio = (): Formulario => ({
  tipoDocumento: 'DNI',
  numeroDocumento: '',
  nombres: '',
  apellidos: '',
  fechaNacimiento: '',
  telefono: '',
  usuarioId: null,
  estado: 'ACTIVO'
});

function fechaLocalHoy(): string {
  const ahora = new Date();
  const anio = ahora.getFullYear();
  const mes = String(ahora.getMonth() + 1)
    .padStart(2, '0');
  const dia = String(ahora.getDate())
    .padStart(2, '0');

  return `${anio}-${mes}-${dia}`;
}

// ========================================
// CONEXIÓN CON BACKEND
// ========================================

async function peticion<T>(
  ruta: string,
  token: string,
  options: RequestInit = {}
): Promise<T> {
  const respuesta = await fetch(`${API}${ruta}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers
    }
  });

  const datos = await respuesta
    .json()
    .catch(() => ({}));

  if (!respuesta.ok) {
    throw new Error(
      typeof datos.error === 'string'
        ? datos.error
        : `Error HTTP ${respuesta.status}`
    );
  }

  return datos as T;
}

// ========================================
// VALIDACIONES ESPECÍFICAS
// ========================================

function validarPasaporte(numero: string): boolean {
  // Formato general, no verificación oficial.
  return /^[A-Z0-9]{6,20}$/.test(numero);
}

function validarTelefonoOpcional(
  telefono: string
): boolean {
  if (!telefono) return true;

  // Permite móvil peruano de 9 dígitos,
  // y números nacionales/internacionales
  // con prefijo y separadores convencionales.
  const digitos = telefono.replace(/\D/g, '');

  return (
    /^[+0-9()\s-]{6,20}$/.test(telefono) &&
    digitos.length >= 6 &&
    digitos.length <= 15
  );
}

function validarFechaNacimiento(
  fecha: string
): boolean {
  if (!fecha) return true;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return false;
  }

  const [anio, mes, dia] =
    fecha.split('-').map(Number);

  const comprobacion =
    new Date(anio, mes - 1, dia);

  const fechaValida =
    comprobacion.getFullYear() === anio &&
    comprobacion.getMonth() === mes - 1 &&
    comprobacion.getDate() === dia;

  return (
    fechaValida &&
    fecha <= fechaLocalHoy()
  );
}

function validarNumeroDocumento(
  tipo: TipoDocumento,
  numero: string
): string | null {
  if (!numero) {
    return 'Ingresa el número de documento.';
  }

  if (tipo === 'DNI') {
    if (!validarDNI(numero)) {
      return 'El DNI debe contener exactamente 8 dígitos numéricos.';
    }
  }

  if (tipo === 'CE') {
    if (!validarCE(numero)) {
      return (
        'El carné de extranjería debe tener ' +
        'entre 9 y 12 caracteres alfanuméricos.'
      );
    }
  }

  if (tipo === 'PASAPORTE') {
    if (!validarPasaporte(numero)) {
      return (
        'El pasaporte debe tener entre 6 y 20 ' +
        'caracteres alfanuméricos.'
      );
    }
  }

  return null;
}

// ========================================
// COMPONENTE PRINCIPAL
// ========================================

export default function Pasajeros({
  token
}: {
  token: string;
}) {
  const [pasajeros, setPasajeros] =
    useState<Pasajero[]>([]);

  const [usuarios, setUsuarios] =
    useState<UsuarioDisponible[]>([]);

  const [busqueda, setBusqueda] =
    useState('');

  const [modal, setModal] =
    useState<Modal>(null);

  const [seleccionado, setSeleccionado] =
    useState<Pasajero | null>(null);

  const [form, setForm] =
    useState<Formulario>(vacio);

  const [error, setError] =
    useState('');

  const [guardando, setGuardando] =
    useState(false);

  const [cambiandoEstado, setCambiandoEstado] =
    useState(false);

  const [cargando, setCargando] =
    useState(true);

  const [cargandoUsuarios, setCargandoUsuarios] =
    useState(false);

  // ======================================
  // LISTAR Y BUSCAR PASAJEROS
  // ======================================

  async function cargar(q = '') {
    setCargando(true);

    try {
      const datos = await peticion<Pasajero[]>(
        `/pasajeros?q=${encodeURIComponent(q)}`,
        token
      );

      setPasajeros(datos);
    } catch (e) {
      const mensaje = (e as Error).message;
      setError(mensaje);
      await alertaError(mensaje);
    } finally {
      setCargando(false);
    }
  }

  // ======================================
  // CARGAR USUARIOS DISPONIBLES
  // ======================================

  async function cargarUsuarios() {
    setCargandoUsuarios(true);

    try {
      const datos = await peticion<UsuarioDisponible[]>(
        '/usuarios',
        token
      );

      setUsuarios(datos);
    } catch (e) {
      setError(
        `No se pudo cargar el catálogo de usuarios: ${
          (e as Error).message
        }`
      );
    } finally {
      setCargandoUsuarios(false);
    }
  }

  // ======================================
  // CARGA INICIAL
  // ======================================

  useEffect(() => {
    let activo = true;

    const cargarInicial = async () => {
      try {
        const [datosPasajeros, datosUsuarios] =
          await Promise.all([
            peticion<Pasajero[]>('/pasajeros', token),
            peticion<UsuarioDisponible[]>(
              '/usuarios',
              token
            )
          ]);

        if (!activo) return;

        setPasajeros(datosPasajeros);
        setUsuarios(datosUsuarios);
        setError('');
      } catch (e) {
        if (activo) {
          setError((e as Error).message);
        }
      } finally {
        if (activo) {
          setCargando(false);
        }
      }
    };

    void cargarInicial();

    return () => {
      activo = false;
    };
  }, [token]);

  // ======================================
  // ABRIR REGISTRO / EDICIÓN / DETALLE
  // ======================================

  function abrir(
    tipo: Exclude<Modal, null>,
    pasajero?: Pasajero
  ) {
    setSeleccionado(pasajero || null);
    setError('');

    if (pasajero) {
      setForm({
        tipoDocumento:
          pasajero.TipoDocumento as TipoDocumento,
        numeroDocumento: pasajero.NumeroDocumento,
        nombres: pasajero.Nombres,
        apellidos: pasajero.Apellidos,
        fechaNacimiento:
          pasajero.FechaNacimiento
            ? pasajero.FechaNacimiento.slice(0, 10)
            : '',
        telefono: pasajero.Telefono || '',
        usuarioId: pasajero.UsuarioID,
        estado: pasajero.Estado
      });
    } else {
      setForm(vacio());
    }

    setModal(tipo);

    // Actualizar catálogo de usuarios
    // al abrir el formulario.
    void cargarUsuarios();
  }

  // ======================================
  // ACTUALIZAR CAMPOS
  // ======================================

  function actualizar<K extends keyof Formulario>(
    campo: K,
    valor: Formulario[K]
  ) {
    setForm(anterior => ({
      ...anterior,
      [campo]: valor
    }));
  }

  // ======================================
  // VALIDAR FORMULARIO COMPLETO
  // ======================================

  function validarFormulario(): string | null {
    const numero = normalizarDocumento(
      form.numeroDocumento
    );

    const nombres = limpiarTexto(form.nombres);
    const apellidos = limpiarTexto(form.apellidos);
    const telefono = form.telefono.trim();

    // Tipo y número de documento.

    if (
      !['DNI', 'CE', 'PASAPORTE'].includes(
        form.tipoDocumento
      )
    ) {
      return 'Selecciona un tipo de documento válido.';
    }

    const errorDocumento =
      validarNumeroDocumento(
        form.tipoDocumento,
        numero
      );

    if (errorDocumento) {
      return errorDocumento;
    }

    // Nombres.

    if (!validarNombre(nombres)) {
      return (
        'Los nombres deben tener entre 2 y 100 caracteres ' +
        'y contener solamente letras y separadores válidos.'
      );
    }

    // Apellidos.

    if (
      !validarNombre(apellidos) ||
      apellidos.length > 120
    ) {
      return (
        'Los apellidos deben tener entre 2 y 120 caracteres ' +
        'y no contener números ni símbolos indebidos.'
      );
    }

    // Fecha opcional.

    if (
      form.fechaNacimiento &&
      !validarFechaNacimiento(form.fechaNacimiento)
    ) {
      return (
        'La fecha de nacimiento no es válida ' +
        'o es posterior a la fecha actual.'
      );
    }

    // Teléfono opcional.

    if (!validarTelefonoOpcional(telefono)) {
      return (
        'Ingresa un teléfono válido. ' +
        'Para celulares peruanos utiliza 9 dígitos; ' +
        'también se admiten formatos internacionales.'
      );
    }

    // Usuario asociado.

    if (form.usuarioId !== null) {
      if (
        !Number.isInteger(form.usuarioId) ||
        form.usuarioId <= 0
      ) {
        return 'Selecciona un usuario válido.';
      }

      if (
        !usuarios.some(
          usuario =>
            usuario.UsuarioID === form.usuarioId
        )
      ) {
        return (
          'El usuario asociado no está disponible ' +
          'en el catálogo.'
        );
      }
    }

    // Registro repetido en los datos cargados.

    const duplicado = pasajeros.find(p =>
      p.TipoDocumento.toUpperCase() ===
        form.tipoDocumento &&
      normalizarDocumento(p.NumeroDocumento) ===
        numero &&
      (
        modal !== 'edit' ||
        p.PasajeroID !== seleccionado?.PasajeroID
      )
    );

    if (duplicado) {
      return (
        'Ya existe un pasajero registrado con ' +
        'ese tipo y número de documento.'
      );
    }

    return null;
  }

  // ======================================
  // REGISTRAR Y EDITAR PASAJERO
  // ======================================

  async function guardar(
    e: FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    if (
      guardando ||
      modal === null ||
      modal === 'view'
    ) {
      return;
    }

    setError('');

    if (modal === 'edit' && !seleccionado) {
      await alertaAdvertencia(
        'No se seleccionó ningún pasajero.'
      );
      return;
    }

    const errorValidacion =
      validarFormulario();

    if (errorValidacion) {
      setError(errorValidacion);

      await alertaAdvertencia(
        errorValidacion,
        'Datos incorrectos'
      );

      return;
    }

    const datos = {
      tipoDocumento: form.tipoDocumento,
      numeroDocumento:
        normalizarDocumento(
          form.numeroDocumento
        ),
      nombres: limpiarTexto(form.nombres),
      apellidos: limpiarTexto(form.apellidos),
      fechaNacimiento:
        form.fechaNacimiento || null,
      telefono: form.telefono.trim() || null,
      usuarioId: form.usuarioId,
      estado: form.estado
    };

    setGuardando(true);

    try {
      await peticion(
        modal === 'edit'
          ? `/pasajeros/${seleccionado?.PasajeroID}`
          : '/pasajeros',
        token,
        {
          method:
            modal === 'edit' ? 'PUT' : 'POST',
          body: JSON.stringify(datos)
        }
      );

      const mensaje =
        modal === 'edit'
          ? 'Los datos del pasajero se actualizaron correctamente.'
          : 'El pasajero se registró correctamente.';

      setModal(null);
      setError('');

      await alertaExito(
        mensaje,
        modal === 'edit'
          ? 'Pasajero actualizado'
          : 'Pasajero registrado'
      );

      await cargar(busqueda);
    } catch (e) {
      const mensaje = (e as Error).message;

      setError(mensaje);

      await alertaError(
        mensaje,
        'No se pudo guardar el pasajero'
      );
    } finally {
      setGuardando(false);
    }
  }

  // ======================================
  // CAMBIAR ESTADO DEL PASAJERO
  // ======================================

  async function cambiarEstado(
    pasajero: Pasajero
  ) {
    if (cambiandoEstado) return;

    const nuevo: EstadoPasajero =
      pasajero.Estado === 'ACTIVO'
        ? 'INACTIVO'
        : 'ACTIVO';

    const confirmado = await confirmarAccion(
      `¿Deseas cambiar el estado de ` +
      `${pasajero.Nombres} ${pasajero.Apellidos} ` +
      `a ${nuevo}?`,
      'Cambiar estado de pasajero'
    );

    if (!confirmado) return;

    setCambiandoEstado(true);
    setError('');

    try {
      await peticion(
        `/pasajeros/${pasajero.PasajeroID}/estado`,
        token,
        {
          method: 'PATCH',
          body: JSON.stringify({
            estado: nuevo
          })
        }
      );

      await alertaExito(
        `El estado del pasajero cambió a ${nuevo}.`,
        'Estado actualizado'
      );

      await cargar(busqueda);
    } catch (e) {
      const mensaje = (e as Error).message;

      setError(mensaje);

      await alertaError(mensaje);
    } finally {
      setCambiandoEstado(false);
    }
  }

  // ======================================
  // INTERFAZ PRINCIPAL
  // ======================================

  return (
    <>
      <div className="heading">
        <h1>Gestión de pasajeros</h1>
        <p>
          RF15 · Registro, consulta, edición
          y control de pasajeros
        </p>
      </div>

      <div className="panel">
        <div className="section-heading">
          <div>
            <h2>
              Registros · Gestión de pasajeros
            </h2>

            <p>
              Consulta y administración de pasajeros
            </p>
          </div>

          <button
            type="button"
            className="orange"
            onClick={() => abrir('new')}
          >
            <Plus size={17} />
            Nuevo
          </button>
        </div>

        {/* BUSCADOR */}

        <form
          className="search-form"
          onSubmit={e => {
            e.preventDefault();
            void cargar(busqueda);
          }}
        >
          <input
            type="text"
            value={busqueda}
            onChange={e =>
              setBusqueda(e.target.value)
            }
            placeholder="Buscar por nombre o documento"
          />

          <button
            type="submit"
            className="secondary"
          >
            <Search size={16} />
            Buscar
          </button>
        </form>

        {/* ERROR GENERAL */}

        {!modal && error && (
          <div className="alert">
            {error}
          </div>
        )}

        {/* TABLA DE PASAJEROS */}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Documento</th>
                <th>Nombres</th>
                <th>Apellidos</th>
                <th>Usuario asociado</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {!cargando &&
                pasajeros.map(p => (
                  <tr key={p.PasajeroID}>
                    <td>{p.PasajeroID}</td>

                    <td>
                      {p.TipoDocumento}
                      {' '}
                      {p.NumeroDocumento}
                    </td>

                    <td>{p.Nombres}</td>
                    <td>{p.Apellidos}</td>

                    <td>
                      {p.UsuarioCorreo || 'Sin asociar'}
                    </td>

                    <td>
                      <span
                        className={
                          p.Estado === 'ACTIVO'
                            ? 'status active'
                            : 'status'
                        }
                      >
                        {p.Estado}
                      </span>
                    </td>

                    <td className="actions">
                      {/* VER DETALLE */}

                      <button
                        type="button"
                        title="Ver detalle"
                        onClick={() =>
                          abrir('view', p)
                        }
                      >
                        <Eye size={16} />
                      </button>

                      {/* EDITAR DATOS */}

                      <button
                        type="button"
                        title="Editar pasajero"
                        onClick={() =>
                          abrir('edit', p)
                        }
                      >
                        <Pencil size={16} />
                      </button>

                      {/* CAMBIAR ESTADO */}

                      <button
                        type="button"
                        title="Cambiar estado"
                        disabled={cambiandoEstado}
                        onClick={() =>
                          void cambiarEstado(p)
                        }
                      >
                        <CheckCircle2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}

              {cargando && (
                <tr>
                  <td colSpan={7}>
                    Cargando pasajeros...
                  </td>
                </tr>
              )}

              {!cargando &&
                pasajeros.length === 0 &&
                !error && (
                  <tr>
                    <td colSpan={7}>
                      No se encontraron pasajeros.
                    </td>
                  </tr>
                )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ======================================
          MODAL NUEVO / EDITAR / VER
      ====================================== */}

      {modal && (
        <div className="overlay">
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Gestión de pasajeros"
            style={{
              maxHeight: '90vh',
              overflowY: 'auto',
              width: '95%',
              maxWidth: 750
            }}
          >
            <div className="dialog-head">
              <h2>
                {modal === 'new'
                  ? 'Registrar pasajero'
                  : modal === 'edit'
                    ? 'Editar pasajero'
                    : 'Detalle del pasajero'}
              </h2>

              <button
                type="button"
                disabled={guardando}
                onClick={() =>
                  setModal(null)
                }
                aria-label="Cerrar"
              >
                <X />
              </button>
            </div>

            <form
              key={`${modal}-${seleccionado?.PasajeroID ?? 'nuevo'}`}
              autoComplete="off"
              noValidate
              onSubmit={guardar}
            >
              <div className="fields">
                {/* TIPO DE DOCUMENTO */}

                <label>
                  Tipo de documento

                  <select
                    value={form.tipoDocumento}
                    disabled={modal === 'view'}
                    onChange={e => {
                      actualizar(
                        'tipoDocumento',
                        e.target.value as TipoDocumento
                      );

                      actualizar(
                        'numeroDocumento',
                        ''
                      );
                    }}
                  >
                    <option value="DNI">
                      DNI
                    </option>

                    <option value="CE">
                      Carné de extranjería
                    </option>

                    <option value="PASAPORTE">
                      Pasaporte
                    </option>
                  </select>
                </label>

                {/* NÚMERO DE DOCUMENTO */}

                <label>
                  Número de documento

                  <input
                    type="text"
                    required
                    autoComplete="off"
                    inputMode={
                      form.tipoDocumento === 'DNI'
                        ? 'numeric'
                        : 'text'
                    }
                    maxLength={
                      form.tipoDocumento === 'DNI'
                        ? 8
                        : form.tipoDocumento === 'CE'
                          ? 12
                          : 20
                    }
                    placeholder={
                      form.tipoDocumento === 'DNI'
                        ? 'Ej.: 12345678'
                        : form.tipoDocumento === 'CE'
                          ? 'Carné de extranjería'
                          : 'Número de pasaporte'
                    }
                    value={form.numeroDocumento}
                    disabled={modal === 'view'}
                    onChange={e => {
                      const valor =
                        form.tipoDocumento === 'DNI'
                          ? e.target.value
                              .replace(/\D/g, '')
                              .slice(0, 8)
                          : e.target.value
                              .toUpperCase()
                              .replace(/[^A-Z0-9]/g, '');

                      actualizar(
                        'numeroDocumento',
                        valor
                      );
                    }}
                  />
                </label>

                {/* NOMBRES */}

                <label>
                  Nombres

                  <input
                    type="text"
                    required
                    autoComplete="off"
                    maxLength={100}
                    placeholder="Ej.: JUAN CARLOS"
                    value={form.nombres}
                    disabled={modal === 'view'}
                    onChange={e =>
                      actualizar(
                        'nombres',
                        e.target.value
                      )
                    }
                  />
                </label>

                {/* APELLIDOS */}

                <label>
                  Apellidos

                  <input
                    type="text"
                    required
                    autoComplete="off"
                    maxLength={120}
                    placeholder="Ej.: PÉREZ GARCÍA"
                    value={form.apellidos}
                    disabled={modal === 'view'}
                    onChange={e =>
                      actualizar(
                        'apellidos',
                        e.target.value
                      )
                    }
                  />
                </label>

                {/* FECHA DE NACIMIENTO */}

                <label>
                  Fecha de nacimiento (opcional)

                  <input
                    type="date"
                    value={form.fechaNacimiento}
                    max={fechaLocalHoy()}
                    disabled={modal === 'view'}
                    onChange={e =>
                      actualizar(
                        'fechaNacimiento',
                        e.target.value
                      )
                    }
                  />
                </label>

                {/* TELÉFONO */}

                <label>
                  Teléfono (opcional)

                  <input
                    type="tel"
                    maxLength={20}
                    autoComplete="off"
                    placeholder="Ej.: 987654321"
                    value={form.telefono}
                    disabled={modal === 'view'}
                    onChange={e =>
                      actualizar(
                        'telefono',
                        e.target.value
                      )
                    }
                  />
                </label>

                {/* USUARIO ASOCIADO */}

                <label>
                  Usuario asociado (opcional)

                  <select
                    value={form.usuarioId ?? ''}
                    disabled={modal === 'view'}
                    onChange={e =>
                      actualizar(
                        'usuarioId',
                        e.target.value
                          ? Number(e.target.value)
                          : null
                      )
                    }
                  >
                    <option value="">
                      Sin usuario asociado
                    </option>

                    {usuarios.map(u => (
                      <option
                        key={u.UsuarioID}
                        value={u.UsuarioID}
                      >
                        {u.Nombres}
                        {' '}
                        {u.Apellidos}
                        {' · '}
                        {u.Correo}
                      </option>
                    ))}

                    {form.usuarioId !== null &&
                      !usuarios.some(
                        u => u.UsuarioID === form.usuarioId
                      ) && (
                        <option value={form.usuarioId}>
                          Usuario asociado #{form.usuarioId}
                        </option>
                      )}
                  </select>

                  {cargandoUsuarios && (
                    <span style={{
                      fontSize: 12,
                      color: '#64748b'
                    }}>
                      Actualizando usuarios...
                    </span>
                  )}
                </label>

                {/* ESTADO */}

                <label>
                  Estado

                  <select
                    value={form.estado}
                    disabled={modal === 'view'}
                    onChange={e =>
                      actualizar(
                        'estado',
                        e.target.value as EstadoPasajero
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

              {/* ERROR DEL FORMULARIO */}

              {error && (
                <div className="alert">
                  {error}
                </div>
              )}

              {/* BOTONES */}

              <div className="dialog-actions">
                {modal !== 'view' && (
                  <button
                    type="submit"
                    className="orange"
                    disabled={guardando}
                  >
                    {guardando
                      ? 'Guardando...'
                      : modal === 'edit'
                        ? 'Guardar cambios'
                        : 'Registrar pasajero'}
                  </button>
                )}

                <button
                  type="button"
                  className="secondary"
                  disabled={guardando}
                  onClick={() =>
                    setModal(null)
                  }
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
