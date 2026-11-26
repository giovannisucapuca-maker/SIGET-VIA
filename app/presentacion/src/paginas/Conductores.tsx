
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
} from '../componentes/alertas';

import {
  limpiarTexto,
  normalizarDocumento,
  validarDNI,
  validarCE,
  validarNombre
} from '../reglas/validaciones';

import {
  listarConductores,
  crearConductor,
  editarConductor,
  cambiarEstadoConductor,
  validarPasaporte,
  validarLicencia,
  licenciaVencida
} from '../reglas/conductores';

// ========================================
// SIGET-VÍA - CONDUCTORES RF9
// VALIDACIONES Y SWEETALERT2
// ========================================

type Estado = 'ACTIVO' | 'INACTIVO';

type TipoDocumento =
  | 'DNI'
  | 'CE'
  | 'PASAPORTE';

type Conductor = {
  ConductorID: number;
  TipoDocumento: string;
  NumeroDocumento: string;
  Nombres: string;
  Apellidos: string;
  NumeroLicencia: string;
  FechaVencimientoLicencia: string | null;
  Estado: Estado;
};

type Formulario = {
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  nombres: string;
  apellidos: string;
  numeroLicencia: string;
  fechaVencimientoLicencia: string;
  estado: Estado;
};

type Modal = 'new' | 'edit' | 'view' | null;

// ========================================
// FORMULARIO INICIAL
// ========================================

function vacio(): Formulario {
  return {
    tipoDocumento: 'DNI',
    numeroDocumento: '',
    nombres: '',
    apellidos: '',
    numeroLicencia: '',
    fechaVencimientoLicencia: '',
    estado: 'ACTIVO'
  };
}

// ========================================
// SERVICIO HTTP
// ========================================

// ========================================
// VALIDACIONES ESPECÍFICAS
// ========================================

// ========================================
// COMPONENTE PRINCIPAL
// ========================================

export default function Conductores({
  token
}: {
  token: string;
}) {
  const [conductores, setConductores] =
    useState<Conductor[]>([]);

  const [q, setQ] = useState('');
  const [modal, setModal] = useState<Modal>(null);

  const [seleccionado, setSeleccionado] =
    useState<Conductor | null>(null);

  const [form, setForm] =
    useState<Formulario>(vacio);

  const [error, setError] = useState('');

  const [guardando, setGuardando] =
    useState(false);

  const [cargando, setCargando] =
    useState(true);

  const [cambiandoEstado, setCambiandoEstado] =
    useState(false);

  // ======================================
  // 1. LISTAR Y BUSCAR
  // ======================================

  async function cargar(busqueda = '') {
    setCargando(true);

    try {
      const datos = await listarConductores<Conductor[]>(token, busqueda);

      setConductores(datos);
      setError('');
    } catch (e) {
      const mensaje = (e as Error).message;
      setError(mensaje);
      await alertaError(mensaje);
    } finally {
      setCargando(false);
    }
  }

  // ======================================
  // 2. CARGA INICIAL
  // ======================================

  useEffect(() => {
    let activo = true;

    listarConductores<Conductor[]>(token)
      .then(datos => {
        if (activo) {
          setConductores(datos);
          setError('');
        }
      })
      .catch(e => {
        if (activo) {
          setError((e as Error).message);
        }
      })
      .finally(() => {
        if (activo) {
          setCargando(false);
        }
      });

    return () => {
      activo = false;
    };
  }, [token]);

  // ======================================
  // 3. ABRIR MODALES
  // ======================================

  function abrir(
    tipo: Exclude<Modal, null>,
    conductor?: Conductor
  ) {
    setSeleccionado(conductor || null);
    setError('');

    if (conductor) {
      setForm({
        tipoDocumento:
          conductor.TipoDocumento as TipoDocumento,
        numeroDocumento: conductor.NumeroDocumento,
        nombres: conductor.Nombres,
        apellidos: conductor.Apellidos,
        numeroLicencia: conductor.NumeroLicencia,
        fechaVencimientoLicencia:
          conductor.FechaVencimientoLicencia || '',
        estado: conductor.Estado
      });
    } else {
      setForm(vacio());
    }

    setModal(tipo);
  }

  // ======================================
  // 4. ACTUALIZAR CAMPOS
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
  // 5. VALIDAR FORMULARIO
  // ======================================

  function validarFormulario(): string | null {
    const numero =
      normalizarDocumento(form.numeroDocumento);

    const nombres =
      limpiarTexto(form.nombres);

    const apellidos =
      limpiarTexto(form.apellidos);

    const licencia =
      normalizarDocumento(form.numeroLicencia);

    if (!numero) {
      return 'Ingresa el número de documento.';
    }

    if (modal === 'new' && !form.fechaVencimientoLicencia) {
      return 'Ingresa la fecha de vencimiento de la licencia.';
    }

    if (
      form.tipoDocumento === 'DNI' &&
      !validarDNI(numero)
    ) {
      return (
        'El DNI debe contener exactamente ' +
        '8 dígitos numéricos.'
      );
    }

    if (
      form.tipoDocumento === 'CE' &&
      !validarCE(numero)
    ) {
      return (
        'El carné de extranjería debe tener ' +
        'entre 9 y 12 caracteres alfanuméricos.'
      );
    }

    if (
      form.tipoDocumento === 'PASAPORTE' &&
      !validarPasaporte(numero)
    ) {
      return (
        'El pasaporte debe tener entre 6 y 20 ' +
        'caracteres alfanuméricos.'
      );
    }

    if (!validarNombre(nombres)) {
      return (
        'Los nombres deben tener entre 2 y 100 ' +
        'caracteres y contener solo letras.'
      );
    }

    if (
      !validarNombre(apellidos) ||
      apellidos.length > 120
    ) {
      return (
        'Los apellidos deben tener entre 2 y 120 ' +
        'caracteres y contener solo letras.'
      );
    }

    if (!validarLicencia(licencia)) {
      return (
        'El número de licencia debe contener ' +
        'entre 4 y 30 caracteres válidos.'
      );
    }

    if (
      form.estado !== 'ACTIVO' &&
      form.estado !== 'INACTIVO'
    ) {
      return 'Selecciona un estado válido.';
    }

    // Comprobación local de duplicados.

    const duplicadoDocumento = conductores.find(c =>
      c.TipoDocumento === form.tipoDocumento &&
      normalizarDocumento(c.NumeroDocumento) === numero &&
      c.ConductorID !== seleccionado?.ConductorID
    );

    if (duplicadoDocumento) {
      return (
        'El documento ya está registrado ' +
        'en otro conductor.'
      );
    }

    const duplicadoLicencia = conductores.find(c =>
      normalizarDocumento(c.NumeroLicencia) === licencia &&
      c.ConductorID !== seleccionado?.ConductorID
    );

    if (duplicadoLicencia) {
      return (
        'El número de licencia ya está registrado ' +
        'en otro conductor.'
      );
    }

    return null;
  }

  // ======================================
  // 6. REGISTRAR Y EDITAR
  // ======================================

  async function guardar(
    e: FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    if (
      guardando ||
      !modal ||
      modal === 'view'
    ) {
      return;
    }

    setError('');

    if (modal === 'edit' && !seleccionado) {
      await alertaAdvertencia(
        'Selecciona un conductor.'
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
        normalizarDocumento(form.numeroDocumento),

      nombres:
        limpiarTexto(form.nombres),

      apellidos:
        limpiarTexto(form.apellidos),

      numeroLicencia:
        normalizarDocumento(form.numeroLicencia),

      fechaVencimientoLicencia:
        form.fechaVencimientoLicencia || null,

      estado: form.estado
    };

    setGuardando(true);

    try {
      await (modal === 'edit'
        ? editarConductor(token, seleccionado?.ConductorID, datos)
        : crearConductor(token, datos));

      const esEdicion = modal === 'edit';

      setModal(null);
      setError('');

      await alertaExito(
        esEdicion
          ? 'Conductor actualizado correctamente.'
          : 'Conductor registrado correctamente.',
        esEdicion
          ? 'Conductor actualizado'
          : 'Conductor registrado'
      );

      await cargar(q);
    } catch (e) {
      const mensaje = (e as Error).message;

      setError(mensaje);

      await alertaError(
        mensaje,
        'No se pudo guardar el conductor'
      );
    } finally {
      setGuardando(false);
    }
  }

  // ======================================
  // 7. CAMBIAR ESTADO
  // ======================================

  async function cambiarEstado(c: Conductor) {
    if (cambiandoEstado) return;

    const estado: Estado =
      c.Estado === 'ACTIVO'
        ? 'INACTIVO'
        : 'ACTIVO';

    const confirmado = await confirmarAccion(
      `¿Deseas cambiar el estado de ` +
      `${c.Nombres} ${c.Apellidos} ` +
      `a ${estado}?`,
      'Cambiar estado del conductor'
    );

    if (!confirmado) {
      return;
    }

    setCambiandoEstado(true);
    setError('');

    try {
      await cambiarEstadoConductor(token, c.ConductorID, estado);

      await alertaExito(
        `El estado cambió a ${estado}.`,
        'Estado actualizado'
      );

      await cargar(q);
    } catch (e) {
      const mensaje = (e as Error).message;
      setError(mensaje);
      await alertaError(mensaje);
    } finally {
      setCambiandoEstado(false);
    }
  }

  // ======================================
  // 8. INTERFAZ PRINCIPAL
  // ======================================

  return (
    <>
      <div className="heading">
        <h1>Gestión de conductores</h1>

        <p>
          RF9 · Registro, consulta, edición
          y control de conductores
        </p>
      </div>

      <div className="panel">
        <div className="section-heading">
          <div>
            <h2>
              Registros · Gestión de conductores
            </h2>

            <p>
              Administración del personal conductor
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
            void cargar(q);
          }}
        >
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar por nombre, documento o licencia"
          />

          <button
            className="secondary"
            type="submit"
          >
            <Search size={16} />
            Buscar
          </button>
        </form>

        {/* MENSAJE GENERAL */}

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
                <th>Documento</th>
                <th>Nombres</th>
                <th>Apellidos</th>
                <th>Licencia</th>
                <th>Vence</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {!cargando && conductores.map(c => (
                <tr key={c.ConductorID}>
                  <td>{c.ConductorID}</td>

                  <td>
                    {c.TipoDocumento}
                    {' '}
                    {c.NumeroDocumento}
                  </td>

                  <td>{c.Nombres}</td>
                  <td>{c.Apellidos}</td>
                  <td>{c.NumeroLicencia}</td>

                  <td>
                    {c.FechaVencimientoLicencia
                      ? (
                          <span
                            className={
                              licenciaVencida(c.FechaVencimientoLicencia)
                                ? 'status'
                                : 'status active'
                            }
                            title={
                              licenciaVencida(c.FechaVencimientoLicencia)
                                ? 'Licencia vencida: no se puede asignar a viajes'
                                : 'Licencia vigente'
                            }
                          >
                            {c.FechaVencimientoLicencia
                              .split('-').reverse().join('/')}
                          </span>
                        )
                      : 'Sin registrar'}
                  </td>

                  <td>
                    <span
                      className={
                        c.Estado === 'ACTIVO'
                          ? 'status active'
                          : 'status'
                      }
                    >
                      {c.Estado}
                    </span>
                  </td>

                  <td className="actions">
                    {/* VER */}

                    <button
                      type="button"
                      title="Ver detalle"
                      onClick={() => abrir('view', c)}
                    >
                      <Eye size={16} />
                    </button>

                    {/* EDITAR */}

                    <button
                      type="button"
                      title="Editar conductor"
                      onClick={() => abrir('edit', c)}
                    >
                      <Pencil size={16} />
                    </button>

                    {/* CAMBIAR ESTADO */}

                    <button
                      type="button"
                      title="Cambiar estado"
                      disabled={cambiandoEstado}
                      onClick={() =>
                        void cambiarEstado(c)
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
                    Cargando conductores...
                  </td>
                </tr>
              )}

              {!cargando &&
                !conductores.length &&
                !error && (
                  <tr>
                    <td colSpan={7}>
                      No se encontraron conductores.
                    </td>
                  </tr>
                )}
            </tbody>
          </table>
        </div>
      </div>

      {/* =====================================
          MODAL REGISTRO / EDICIÓN / DETALLE
      ===================================== */}

      {modal && (
        <div className="overlay">
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Gestión de conductores"
            style={{
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
          >
            <div className="dialog-head">
              <h2>
                {modal === 'new'
                  ? 'Registrar conductor'
                  : modal === 'edit'
                    ? 'Editar conductor'
                    : 'Detalle del conductor'}
              </h2>

              <button
                type="button"
                aria-label="Cerrar"
                disabled={guardando}
                onClick={() => setModal(null)}
              >
                <X />
              </button>
            </div>

            <form
              key={`${modal}-${seleccionado?.ConductorID ?? 'nuevo'}`}
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
                    onChange={e =>
                      setForm(anterior => ({
                        ...anterior,
                        tipoDocumento:
                          e.target.value as TipoDocumento,
                        numeroDocumento: ''
                      }))
                    }
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

                {/* DOCUMENTO */}

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
                    maxLength={100}
                    autoComplete="off"
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
                    maxLength={120}
                    autoComplete="off"
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

                {/* LICENCIA */}

                <label>
                  Número de licencia

                  <input
                    type="text"
                    required
                    maxLength={30}
                    autoComplete="off"
                    placeholder="Ej.: Q12345678"
                    value={form.numeroLicencia}
                    disabled={modal === 'view'}
                    onChange={e =>
                      actualizar(
                        'numeroLicencia',
                        e.target.value
                          .toUpperCase()
                          .replace(/[^A-Z0-9-]/g, '')
                      )
                    }
                  />
                </label>

                {/* VIGENCIA DE LA LICENCIA — CU009 */}

                <label>
                  Vencimiento de la licencia

                  <input
                    type="date"
                    required={modal === 'new'}
                    value={form.fechaVencimientoLicencia}
                    disabled={modal === 'view'}
                    onChange={e =>
                      actualizar(
                        'fechaVencimientoLicencia',
                        e.target.value
                      )
                    }
                  />
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
                        : 'Registrar conductor'}
                  </button>
                )}

                <button
                  type="button"
                  className="secondary"
                  disabled={guardando}
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
