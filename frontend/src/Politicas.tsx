
import {
  useEffect,
  useState,
  type FormEvent
} from 'react';

import {
  BookOpen,
  Plus,
  Search,
  RefreshCw,
  Pencil,
  Eye,
  ShieldCheck,
  ShieldOff,
  X,
  Save,
  CalendarDays,
  FileText,
  CheckCircle2,
  AlertCircle,
  Scale
} from 'lucide-react';

// =====================================================
// SIGET-VÍA — POLÍTICAS DEL SERVICIO
// PASO 168.5 — RF17
// =====================================================

type TipoPolitica =
  | 'RESERVA'
  | 'CANCELACION'
  | 'REPROGRAMACION'
  | 'CONTRATACION'
  | 'PRIVACIDAD'
  | 'OTRA';

type Politica = {
  PoliticaID: number;
  Tipo: TipoPolitica;
  Titulo: string;
  Contenido: string;
  Version: string;
  VigenteDesde: string;
  VigenteHasta: string | null;
  Activa: boolean | number;
};

type FormPolitica = {
  tipo: TipoPolitica;
  titulo: string;
  contenido: string;
  version: string;
  vigenteDesde: string;
  vigenteHasta: string;
  activa: boolean;
};

type Modal = 'new' | 'edit' | 'view' | null;

type Catalogos = {
  tipos: TipoPolitica[];
};

const API =
  import.meta.env.VITE_API_URL ||
  'http://localhost:4000/api';

const AZUL = '#173b63';

const TIPOS: TipoPolitica[] = [
  'RESERVA',
  'CANCELACION',
  'REPROGRAMACION',
  'CONTRATACION',
  'PRIVACIDAD',
  'OTRA'
];

const NOMBRES: Record<TipoPolitica, string> = {
  RESERVA: 'Reservas',
  CANCELACION: 'Cancelaciones',
  REPROGRAMACION: 'Reprogramaciones',
  CONTRATACION: 'Contratación',
  PRIVACIDAD: 'Privacidad',
  OTRA: 'Otras condiciones'
};

function fechaHoy(): string {
  const fecha = new Date();
  const anio = fecha.getFullYear();
  const mes = String(
    fecha.getMonth() + 1
  ).padStart(2, '0');
  const dia = String(
    fecha.getDate()
  ).padStart(2, '0');

  return `${anio}-${mes}-${dia}`;
}

function formularioVacio(): FormPolitica {
  return {
    tipo: 'RESERVA',
    titulo: '',
    contenido: '',
    version: '1.0',
    vigenteDesde: fechaHoy(),
    vigenteHasta: '',
    activa: true
  };
}

function estaActiva(politica: Politica): boolean {
  return (
    politica.Activa === true ||
    politica.Activa === 1
  );
}

function estaVigente(politica: Politica): boolean {
  const hoy = fechaHoy();

  return (
    estaActiva(politica) &&
    politica.VigenteDesde <= hoy &&
    (
      !politica.VigenteHasta ||
      politica.VigenteHasta >= hoy
    )
  );
}

function fechaTexto(valor: string | null): string {
  if (!valor) return 'Sin fecha final';

  const partes = valor.slice(0, 10).split('-');

  if (partes.length !== 3) {
    return valor;
  }

  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

async function api<T>(
  ruta: string,
  token: string,
  opciones: RequestInit = {}
): Promise<T> {
  const response = await fetch(
    `${API}${ruta}`,
    {
      ...opciones,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...opciones.headers
      }
    }
  );

  const data: unknown = await response
    .json()
    .catch(() => ({}));

  if (!response.ok) {
    const respuesta = data as {
      error?: string;
      details?: Array<{
        message?: string;
      }>;
    };

    const detalle = respuesta.details
      ?.map(item => item.message)
      .filter(Boolean)
      .join('. ');

    throw new Error(
      detalle ||
      respuesta.error ||
      `Error HTTP ${response.status}`
    );
  }

  return data as T;
}

// =====================================================
// COMPONENTE
// =====================================================

export default function Politicas({
  token,
  esAdmin = false
}: {
  token: string;
  esAdmin?: boolean;
}) {
  const [politicas, setPoliticas] =
    useState<Politica[]>([]);

  const [catalogos, setCatalogos] =
    useState<TipoPolitica[]>(TIPOS);

  const [busqueda, setBusqueda] =
    useState('');

  const [tipoFiltro, setTipoFiltro] =
    useState('TODAS');

  const [modal, setModal] =
    useState<Modal>(null);

  const [seleccionada, setSeleccionada] =
    useState<Politica | null>(null);

  const [form, setForm] =
    useState<FormPolitica>(formularioVacio);

  const [cargando, setCargando] =
    useState(true);

  const [guardando, setGuardando] =
    useState(false);

  const [error, setError] =
    useState('');

  const [mensaje, setMensaje] =
    useState('');

  // ===================================================
  // CARGAR POLÍTICAS
  // ===================================================

  async function cargar(
    texto = ''
  ) {
    setCargando(true);
    setError('');

    try {
      const ruta = esAdmin
        ? `/politicas?q=${encodeURIComponent(texto)}`
        : '/politicas/vigentes';

      const resultado = await api<Politica[]>(
        ruta,
        token
      );

      setPoliticas(resultado);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    let activo = true;

    const ruta = esAdmin
      ? '/politicas'
      : '/politicas/vigentes';

    setCargando(true);

    api<Politica[]>(ruta, token)
      .then(data => {
        if (activo) {
          setPoliticas(data);
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

    api<Catalogos>(
      '/politicas/catalogos',
      token
    )
      .then(data => {
        if (activo && data.tipos?.length) {
          setCatalogos(data.tipos);
        }
      })
      .catch(() => {
        // Los tipos locales permanecen disponibles.
      });

    return () => {
      activo = false;
    };
  }, [token, esAdmin]);

  // ===================================================
  // FORMULARIO
  // ===================================================

  function actualizar<
    K extends keyof FormPolitica
  >(
    campo: K,
    valor: FormPolitica[K]
  ) {
    setForm(actual => ({
      ...actual,
      [campo]: valor
    }));
  }

  function abrirNuevo() {
    setSeleccionada(null);
    setForm(formularioVacio());
    setError('');
    setMensaje('');
    setModal('new');
  }

  function abrir(
    modo: 'edit' | 'view',
    politica: Politica
  ) {
    setSeleccionada(politica);

    setForm({
      tipo: politica.Tipo,
      titulo: politica.Titulo,
      contenido: politica.Contenido,
      version: politica.Version,
      vigenteDesde:
        politica.VigenteDesde?.slice(0, 10) || '',
      vigenteHasta:
        politica.VigenteHasta?.slice(0, 10) || '',
      activa: estaActiva(politica)
    });

    setError('');
    setMensaje('');
    setModal(modo);
  }

  function cerrarModal() {
    if (guardando) return;

    setModal(null);
    setSeleccionada(null);
    setError('');
  }

  // ===================================================
  // GUARDAR POLÍTICA
  // ===================================================

  async function guardar(
    e: FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    if (
      !esAdmin ||
      guardando ||
      modal === null ||
      modal === 'view'
    ) {
      return;
    }

    setError('');
    setMensaje('');

    const titulo = form.titulo.trim();
    const contenido = form.contenido.trim();
    const version = form.version.trim();

    if (titulo.length < 5) {
      setError(
        'El título debe contener al menos 5 caracteres.'
      );
      return;
    }

    if (contenido.length < 20) {
      setError(
        'El contenido debe contener al menos 20 caracteres.'
      );
      return;
    }

    if (!form.vigenteDesde) {
      setError(
        'Selecciona la fecha de inicio de vigencia.'
      );
      return;
    }

    if (
      form.vigenteHasta &&
      form.vigenteHasta < form.vigenteDesde
    ) {
      setError(
        'La fecha final no puede ser anterior a la inicial.'
      );
      return;
    }

    if (modal === 'edit' && !seleccionada) {
      setError(
        'No se seleccionó ninguna política.'
      );
      return;
    }

    setGuardando(true);

    try {
      const payload = {
        tipo: form.tipo,
        titulo,
        contenido,
        version,
        vigenteDesde: form.vigenteDesde,
        vigenteHasta: form.vigenteHasta || null,
        activa: form.activa
      };

      const editando = modal === 'edit';

      await api(
        editando
          ? `/politicas/${seleccionada?.PoliticaID}`
          : '/politicas',
        token,
        {
          method: editando ? 'PUT' : 'POST',
          body: JSON.stringify(payload)
        }
      );

      setModal(null);
      setSeleccionada(null);

      await cargar(busqueda);

      setMensaje(
        editando
          ? 'Política actualizada correctamente.'
          : 'Política registrada correctamente.'
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  // ===================================================
  // CAMBIAR ESTADO
  // ===================================================

  async function cambiarEstado(
    politica: Politica
  ) {
    if (!esAdmin || guardando) return;

    const activa = !estaActiva(politica);

    const accion = activa
      ? 'activar'
      : 'desactivar';

    if (
      !window.confirm(
        `¿Deseas ${accion} la política ` +
        `"${politica.Titulo}"?`
      )
    ) {
      return;
    }

    setError('');
    setMensaje('');
    setGuardando(true);

    try {
      await api(
        `/politicas/${politica.PoliticaID}/estado`,
        token,
        {
          method: 'PATCH',
          body: JSON.stringify({ activa })
        }
      );

      await cargar(busqueda);

      setMensaje(
        `Política ${activa ? 'activada' : 'desactivada'} correctamente.`
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  // ===================================================
  // FILTROS Y RESUMEN
  // ===================================================

  function buscar(
    e: FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();
    void cargar(busqueda);
  }

  function limpiar() {
    setBusqueda('');
    setTipoFiltro('TODAS');
    void cargar('');
  }

  const filtradas = politicas.filter(politica => {
    const coincideTipo =
      tipoFiltro === 'TODAS' ||
      politica.Tipo === tipoFiltro;

    const coincideTexto =
      esAdmin ||
      [
        politica.Titulo,
        politica.Tipo,
        politica.Contenido
      ]
        .join(' ')
        .toLowerCase()
        .includes(busqueda.trim().toLowerCase());

    return coincideTipo && coincideTexto;
  });

  const totalActivas = politicas.filter(
    estaActiva
  ).length;

  const totalVigentes = politicas.filter(
    estaVigente
  ).length;

  const totalInactivas =
    politicas.length - totalActivas;

  // ===================================================
  // INTERFAZ
  // ===================================================

  return (
    <>
      <div className="heading">
        <h1>
          Políticas y condiciones del servicio
        </h1>

        <p>
          RF17 · Consulta y administración de
          las condiciones de transporte
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 14,
          marginBottom: 18
        }}
      >
        {[
          {
            titulo: esAdmin
              ? 'Políticas registradas'
              : 'Políticas disponibles',
            valor: politicas.length,
            Icono: FileText
          },
          {
            titulo: 'Políticas activas',
            valor: totalActivas,
            Icono: ShieldCheck
          },
          {
            titulo: 'Vigentes hoy',
            valor: totalVigentes,
            Icono: CalendarDays
          },
          {
            titulo: 'Inactivas',
            valor: totalInactivas,
            Icono: ShieldOff
          }
        ].map(item => (
          <div
            className="panel"
            key={item.titulo}
            style={{
              padding: 18,
              display: 'flex',
              gap: 12,
              alignItems: 'center'
            }}
          >
            <item.Icono
              size={24}
              color={AZUL}
            />

            <div>
              <p
                style={{
                  fontSize: 12,
                  color: '#64748b'
                }}
              >
                {item.titulo}
              </p>

              <strong
                style={{
                  color: AZUL,
                  fontSize: 22
                }}
              >
                {item.valor}
              </strong>
            </div>
          </div>
        ))}
      </div>

      <div className="panel">
        <div className="section-heading">
          <div>
            <h2>
              {esAdmin
                ? 'Administración de políticas'
                : 'Condiciones vigentes'}
            </h2>

            <p>
              {esAdmin
                ? 'Registra y actualiza las condiciones del servicio'
                : 'Consulta las condiciones aplicables al transporte'}
            </p>
          </div>

          {esAdmin && (
            <button
              type="button"
              className="orange"
              onClick={abrirNuevo}
            >
              <Plus size={17} />
              Nueva política
            </button>
          )}
        </div>

        <form
          className="search-form"
          onSubmit={buscar}
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            marginTop: 16,
            marginBottom: 18
          }}
        >
          <input
            style={{
              flex: '1 1 210px'
            }}
            value={busqueda}
            maxLength={100}
            onChange={e =>
              setBusqueda(e.target.value)
            }
            placeholder="Buscar por título, tipo o versión"
          />

          <select
            style={{
              minWidth: 170
            }}
            value={tipoFiltro}
            onChange={e =>
              setTipoFiltro(e.target.value)
            }
          >
            <option value="TODAS">
              Todas las categorías
            </option>

            {catalogos.map(tipo => (
              <option
                key={tipo}
                value={tipo}
              >
                {NOMBRES[tipo]}
              </option>
            ))}
          </select>

          <button
            type="submit"
            className="secondary"
            disabled={cargando}
          >
            <Search size={16} />
            Buscar
          </button>

          <button
            type="button"
            className="secondary"
            disabled={cargando}
            onClick={limpiar}
          >
            Limpiar
          </button>

          <button
            type="button"
            className="secondary"
            disabled={cargando}
            onClick={() =>
              void cargar(busqueda)
            }
          >
            <RefreshCw size={16} />
            Actualizar
          </button>
        </form>

        {mensaje && (
          <div className="success">
            <CheckCircle2 size={16} />
            {' '}
            {mensaje}
          </div>
        )}

        {!modal && error && (
          <div className="alert">
            <AlertCircle size={16} />
            {' '}
            {error}
          </div>
        )}

        {cargando ? (
          <p>Cargando políticas del servicio...</p>
        ) : esAdmin ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Tipo</th>
                  <th>Título</th>
                  <th>Versión</th>
                  <th>Vigencia</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>

              <tbody>
                {filtradas.map(politica => (
                  <tr key={politica.PoliticaID}>
                    <td>
                      {politica.PoliticaID}
                    </td>

                    <td>
                      {NOMBRES[politica.Tipo]}
                    </td>

                    <td>
                      <strong>
                        {politica.Titulo}
                      </strong>
                    </td>

                    <td>
                      {politica.Version}
                    </td>

                    <td>
                      <div>
                        Desde:{' '}
                        {fechaTexto(
                          politica.VigenteDesde
                        )}
                      </div>

                      <small>
                        Hasta:{' '}
                        {fechaTexto(
                          politica.VigenteHasta
                        )}
                      </small>
                    </td>

                    <td>
                      <span
                        className={
                          estaActiva(politica)
                            ? 'status active'
                            : 'status'
                        }
                      >
                        {estaVigente(politica)
                          ? 'VIGENTE'
                          : estaActiva(politica)
                            ? 'ACTIVA'
                            : 'INACTIVA'}
                      </span>
                    </td>

                    <td className="actions">
                      <button
                        type="button"
                        title="Ver política"
                        onClick={() =>
                          abrir('view', politica)
                        }
                      >
                        <Eye size={16} />
                      </button>

                      <button
                        type="button"
                        title="Editar política"
                        onClick={() =>
                          abrir('edit', politica)
                        }
                      >
                        <Pencil size={16} />
                      </button>

                      <button
                        type="button"
                        title={
                          estaActiva(politica)
                            ? 'Desactivar política'
                            : 'Activar política'
                        }
                        disabled={guardando}
                        onClick={() =>
                          void cambiarEstado(politica)
                        }
                      >
                        {estaActiva(politica)
                          ? <ShieldOff size={16} />
                          : <ShieldCheck size={16} />}
                      </button>
                    </td>
                  </tr>
                ))}

                {filtradas.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      No se encontraron políticas
                      con estos criterios.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gap: 14
            }}
          >
            {filtradas.map(politica => (
              <article
                key={politica.PoliticaID}
                style={{
                  padding: 18,
                  border:
                    '1px solid #e2e8f0',
                  borderRadius: 10
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    marginBottom: 10
                  }}
                >
                  <Scale
                    size={19}
                    color={AZUL}
                  />

                  <strong
                    style={{
                      color: AZUL,
                      fontSize: 16
                    }}
                  >
                    {politica.Titulo}
                  </strong>
                </div>

                <p
                  style={{
                    color: '#64748b',
                    fontSize: 12,
                    marginBottom: 12
                  }}
                >
                  {NOMBRES[politica.Tipo]}
                  {' · '}Versión {politica.Version}
                  {' · '}Vigente desde{' '}
                  {fechaTexto(
                    politica.VigenteDesde
                  )}
                </p>

                <div
                  style={{
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                    lineHeight: 1.65
                  }}
                >
                  {politica.Contenido}
                </div>
              </article>
            ))}

            {filtradas.length === 0 && (
              <p>
                No hay políticas vigentes
                para mostrar.
              </p>
            )}
          </div>
        )}
      </div>

      {esAdmin && (
        <p
          style={{
            marginTop: 14,
            color: '#64748b',
            fontSize: 12
          }}
        >
          <BookOpen
            size={15}
            style={{
              verticalAlign: 'middle',
              marginRight: 5
            }}
          />
          Las modificaciones se registran en
          Auditoría. La desactivación no elimina
          el registro de la base de datos.
        </p>
      )}

      {/* ===========================================
          MODAL DE REGISTRO, EDICIÓN Y CONSULTA
         =========================================== */}

      {modal && esAdmin && (
        <div
          className="overlay"
          onMouseDown={e => {
            if (
              e.target === e.currentTarget &&
              !guardando
            ) {
              cerrarModal();
            }
          }}
        >
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Gestión de políticas"
            style={{
              maxWidth: 780,
              width: '95%',
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
          >
            <div className="dialog-head">
              <h2>
                {modal === 'new'
                  ? 'Registrar política'
                  : modal === 'edit'
                    ? 'Editar política'
                    : 'Detalle de política'}
              </h2>

              <button
                type="button"
                disabled={guardando}
                onClick={cerrarModal}
                aria-label="Cerrar"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={guardar}>
              <div className="fields">
                <label>
                  Tipo de política

                  <select
                    value={form.tipo}
                    required
                    disabled={modal === 'view'}
                    onChange={e =>
                      actualizar(
                        'tipo',
                        e.target.value as TipoPolitica
                      )
                    }
                  >
                    {catalogos.map(tipo => (
                      <option
                        key={tipo}
                        value={tipo}
                      >
                        {NOMBRES[tipo]}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Versión

                  <input
                    type="text"
                    maxLength={20}
                    minLength={1}
                    required
                    disabled={modal === 'view'}
                    value={form.version}
                    onChange={e =>
                      actualizar(
                        'version',
                        e.target.value
                      )
                    }
                    placeholder="Ej.: 1.0"
                  />
                </label>

                <label
                  style={{
                    gridColumn: '1 / -1'
                  }}
                >
                  Título

                  <input
                    type="text"
                    minLength={5}
                    maxLength={150}
                    required
                    disabled={modal === 'view'}
                    value={form.titulo}
                    onChange={e =>
                      actualizar(
                        'titulo',
                        e.target.value
                      )
                    }
                    placeholder="Ej.: Condiciones de reserva de pasajes"
                  />
                </label>

                <label>
                  Vigente desde

                  <input
                    type="date"
                    required
                    disabled={modal === 'view'}
                    value={form.vigenteDesde}
                    onChange={e =>
                      actualizar(
                        'vigenteDesde',
                        e.target.value
                      )
                    }
                  />
                </label>

                <label>
                  Vigente hasta (opcional)

                  <input
                    type="date"
                    min={form.vigenteDesde}
                    disabled={modal === 'view'}
                    value={form.vigenteHasta}
                    onChange={e =>
                      actualizar(
                        'vigenteHasta',
                        e.target.value
                      )
                    }
                  />
                </label>

                <label
                  style={{
                    gridColumn: '1 / -1'
                  }}
                >
                  Contenido de la política

                  <textarea
                    rows={10}
                    minLength={20}
                    maxLength={30000}
                    required
                    disabled={modal === 'view'}
                    value={form.contenido}
                    onChange={e =>
                      actualizar(
                        'contenido',
                        e.target.value
                      )
                    }
                    placeholder="Escribe las condiciones y reglas aplicables al servicio..."
                    style={{
                      width: '100%',
                      resize: 'vertical',
                      whiteSpace: 'pre-wrap'
                    }}
                  />
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    gridColumn: '1 / -1'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={form.activa}
                    disabled={modal === 'view'}
                    onChange={e =>
                      actualizar(
                        'activa',
                        e.target.checked
                      )
                    }
                    style={{
                      width: 18,
                      height: 18
                    }}
                  />

                  Política activa
                </label>
              </div>

              {error && (
                <div className="alert">
                  <AlertCircle size={16} />
                  {' '}
                  {error}
                </div>
              )}

              <div className="dialog-actions">
                {modal !== 'view' && (
                  <button
                    type="submit"
                    className="orange"
                    disabled={guardando}
                  >
                    <Save size={16} />
                    {guardando
                      ? 'Guardando...'
                      : modal === 'edit'
                        ? 'Guardar cambios'
                        : 'Registrar política'}
                  </button>
                )}

                <button
                  type="button"
                  className="secondary"
                  disabled={guardando}
                  onClick={cerrarModal}
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
