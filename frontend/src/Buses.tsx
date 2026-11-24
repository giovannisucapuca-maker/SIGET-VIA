
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
  X,
  Armchair,
  BusFront,
  Footprints
} from 'lucide-react';

import {
  alertaExito,
  alertaError,
  alertaAdvertencia,
  confirmarAccion
} from './utils/alertas';

import {
  limpiarTexto,
  validarCapacidad,
  validarDistribucion
} from './utils/validaciones';

// =====================================================
// SIGET-VÍA — GESTIÓN DE BUSES
// PASO 172.9.3.2
//
// RF8 — Gestión de buses
//
// NUEVO:
// - Catálogo de tipos de servicio desde SQL Server
// - Registrar bus con tipo de servicio
// - Editar tipo de servicio
// - Visualizar categoría en el listado
// - Buscar por placa, modelo o servicio
//
// SE CONSERVA:
// - Registro y edición completa de buses
// - Cambios de estado operativo
// - Validaciones
// - Alertas SweetAlert2
// - Distribución de asientos por pisos
// - Vista previa de asientos
// - Protección de buses con viajes/reservas
// =====================================================

type Estado =
  | 'OPERATIVO'
  | 'MANTENIMIENTO'
  | 'INACTIVO';

type Modal =
  | 'new'
  | 'edit'
  | 'view'
  | null;

type TipoServicio = {
  TipoServicioID: number;
  Nombre: string;
  Descripcion: string | null;
  Estado: 'ACTIVO' | 'INACTIVO';
};

type Bus = {
  BusID: number;
  Placa: string;
  Modelo: string;
  Capacidad: number;
  Estado: Estado;

  TipoServicioID: number | null;
  TipoServicio: string | null;
  DescripcionServicio?: string | null;
  EstadoTipoServicio?: string | null;

  AsientosRegistrados: number;
  AsientosPrimerPiso: number;
  AsientosSegundoPiso: number;
};

type Formulario = {
  placa: string;
  modelo: string;
  capacidad: string;
  asientosPrimerPiso: string;
  asientosSegundoPiso: string;
  tipoServicioId: string;
  estado: Estado;
};

const API =
  import.meta.env.VITE_API_URL ||
  'http://localhost:4000/api';

const ESTADOS: Estado[] = [
  'OPERATIVO',
  'MANTENIMIENTO',
  'INACTIVO'
];

// =====================================================
// FORMULARIO VACÍO
// =====================================================

function vacio(): Formulario {
  return {
    placa: '',
    modelo: '',
    capacidad: '',
    asientosPrimerPiso: '',
    asientosSegundoPiso: '',
    tipoServicioId: '',
    estado: 'OPERATIVO'
  };
}

// =====================================================
// PETICIONES HTTP
// =====================================================

async function peticion<T>(
  ruta: string,
  token: string,
  options: RequestInit = {}
): Promise<T> {
  const respuesta = await fetch(
    `${API}${ruta}`,
    {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options.headers
      }
    }
  );

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

// =====================================================
// MOSTRAR NOMBRE DEL SERVICIO
// =====================================================

function nombreServicio(
  nombre: string | null | undefined
) {
  if (!nombre) {
    return 'Sin asignar';
  }

  const nombres: Record<string, string> = {
    ECONOMICO: 'Económico',
    EJECUTIVO: 'Ejecutivo',
    CAMA: 'Cama',
    SUITE: 'Suite'
  };

  return nombres[nombre] || nombre;
}

// =====================================================
// ASIENTO VISUAL
// =====================================================

function AsientoVisual({
  numero
}: {
  numero?: number;
}) {
  if (numero === undefined) {
    return (
      <div
        style={{
          width: 40,
          height: 43
        }}
      />
    );
  }

  return (
    <div
      style={{
        width: 40,
        height: 43,
        border: '1px solid #173b63',
        borderRadius: 5,
        background: '#ffffff',
        color: '#173b63',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        fontWeight: 700,
        fontSize: 10
      }}
    >
      <Armchair size={15} />

      {String(numero).padStart(2, '0')}
    </div>
  );
}

// =====================================================
// VISTA DE UN PISO
// =====================================================

function PisoVisual({
  titulo,
  numeros,
  columnas,
  conductor
}: {
  titulo: string;
  numeros: number[];
  columnas: 3 | 4;
  conductor: boolean;
}) {
  const filas: (number | undefined)[][] = [];

  for (
    let i = 0;
    i < numeros.length;
    i += columnas
  ) {
    filas.push(
      Array.from(
        { length: columnas },
        (_, j) => numeros[i + j]
      )
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8
      }}
    >
      <strong
        style={{
          color: '#173b63',
          fontSize: 14
        }}
      >
        {titulo} — {numeros.length} asientos
      </strong>

      <div
        style={{
          padding: 12,
          border: '2px solid #173b63',
          borderRadius: '13px 13px 7px 7px',
          background: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          gap: 9
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: '#173b63',
            borderBottom:
              '1px dashed #cbd5e1',
            paddingBottom: 8
          }}
        >
          <span style={{ fontSize: 10 }}>
            FRENTE
          </span>

          {conductor ? (
            <BusFront size={22} />
          ) : (
            <Footprints size={20} />
          )}
        </div>

        {filas.map((fila, index) => (
          <div
            key={index}
            style={{
              display: 'flex',
              gap: 5,
              alignItems: 'center'
            }}
          >
            <AsientoVisual
              numero={fila[0]}
            />

            <AsientoVisual
              numero={fila[1]}
            />

            <div
              style={{
                width: 22,
                minWidth: 22,
                height: 43,
                background: '#f1f5f9',
                borderLeft:
                  '1px dashed #cbd5e1',
                borderRight:
                  '1px dashed #cbd5e1'
              }}
            />

            <AsientoVisual
              numero={fila[2]}
            />

            {columnas === 4 && (
              <AsientoVisual
                numero={fila[3]}
              />
            )}
          </div>
        ))}

        <div
          style={{
            borderTop:
              '1px dashed #cbd5e1',
            paddingTop: 8,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 5,
            fontSize: 10,
            color: '#64748b'
          }}
        >
          <Footprints size={15} />
          Escalera / circulación
        </div>
      </div>
    </div>
  );
}

// =====================================================
// VISTA PREVIA DE ASIENTOS
//
// Se mantiene la distribución:
// Primer piso: números finales.
// Segundo piso: números iniciales.
// =====================================================

function VistaAsientos({
  primero,
  segundo
}: {
  primero: number;
  segundo: number;
}) {
  const total = primero + segundo;

  if (
    !Number.isInteger(primero) ||
    !Number.isInteger(segundo) ||
    primero < 1 ||
    segundo < 0 ||
    total > 200
  ) {
    return null;
  }

  const segundoNumeros = Array.from(
    { length: segundo },
    (_, i) => i + 1
  );

  const primerNumeros = Array.from(
    { length: primero },
    (_, i) => segundo + i + 1
  );

  return (
    <div
      style={{
        marginTop: 16,
        padding: 15,
        background: '#f4f7fb',
        border: '1px solid #d6dde7',
        borderRadius: 9
      }}
    >
      <h3
        style={{
          margin: '0 0 7px',
          color: '#173b63',
          fontSize: 15
        }}
      >
        Distribución de asientos
      </h3>

      <p
        style={{
          fontSize: 12,
          color: '#64748b',
          marginBottom: 14
        }}
      >
        Vista previa según los asientos configurados.
      </p>

      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 20
        }}
      >
        <PisoVisual
          titulo="Primer nivel"
          numeros={primerNumeros}
          columnas={3}
          conductor
        />

        {segundo > 0 && (
          <PisoVisual
            titulo="Segundo nivel"
            numeros={segundoNumeros}
            columnas={4}
            conductor={false}
          />
        )}
      </div>

      <p
        style={{
          textAlign: 'center',
          borderTop:
            '1px solid #d6dde7',
          paddingTop: 12,
          marginTop: 15,
          fontWeight: 700,
          color: '#173b63'
        }}
      >
        Capacidad total: {total} asientos
      </p>
    </div>
  );
}

// =====================================================
// COMPONENTE PRINCIPAL
// =====================================================

export default function Buses({
  token
}: {
  token: string;
}) {
  const [buses, setBuses] =
    useState<Bus[]>([]);

  const [tiposServicio, setTiposServicio] =
    useState<TipoServicio[]>([]);

  const [busqueda, setBusqueda] =
    useState('');

  const [modal, setModal] =
    useState<Modal>(null);

  const [seleccionado, setSeleccionado] =
    useState<Bus | null>(null);

  const [form, setForm] =
    useState<Formulario>(vacio);

  const [error, setError] =
    useState('');

  const [errorCatalogo, setErrorCatalogo] =
    useState('');

  const [guardando, setGuardando] =
    useState(false);

  const [cargando, setCargando] =
    useState(true);

  const [cargandoCatalogo, setCargandoCatalogo] =
    useState(true);

  const [busEstado, setBusEstado] =
    useState<Bus | null>(null);

  const [nuevoEstado, setNuevoEstado] =
    useState<Estado>('OPERATIVO');

  // ===================================================
  // CARGAR BUSES
  // ===================================================

  async function cargar(q = '') {
    setCargando(true);

    try {
      const datos = await peticion<Bus[]>(
        `/buses?q=${encodeURIComponent(q)}`,
        token
      );

      setBuses(datos);
      setError('');
    } catch (e) {
      const mensaje = (e as Error).message;

      setError(mensaje);

      await alertaError(mensaje);
    } finally {
      setCargando(false);
    }
  }

  // ===================================================
  // CARGAR TIPOS DE SERVICIO
  // ===================================================

  async function cargarTiposServicio() {
    setCargandoCatalogo(true);
    setErrorCatalogo('');

    try {
      const datos =
        await peticion<TipoServicio[]>(
          '/buses/tipos-servicio',
          token
        );

      if (!Array.isArray(datos)) {
        throw new Error(
          'La respuesta del catálogo no es válida.'
        );
      }

      setTiposServicio(datos);
    } catch (e) {
      const mensaje = (e as Error).message;

      setErrorCatalogo(mensaje);
      setTiposServicio([]);
    } finally {
      setCargandoCatalogo(false);
    }
  }

  // ===================================================
  // CARGA INICIAL
  // ===================================================

  useEffect(() => {
    let activo = true;

    peticion<Bus[]>('/buses', token)
      .then(datos => {
        if (activo) {
          setBuses(datos);
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

    peticion<TipoServicio[]>(
      '/buses/tipos-servicio',
      token
    )
      .then(datos => {
        if (activo) {
          setTiposServicio(datos);
          setErrorCatalogo('');
        }
      })
      .catch(e => {
        if (activo) {
          setErrorCatalogo(
            (e as Error).message
          );
        }
      })
      .finally(() => {
        if (activo) {
          setCargandoCatalogo(false);
        }
      });

    return () => {
      activo = false;
    };
  }, [token]);

  // ===================================================
  // ABRIR REGISTRAR / EDITAR / VER
  // ===================================================

  function abrir(
    tipo: Exclude<Modal, null>,
    bus?: Bus
  ) {
    setError('');
    setSeleccionado(bus || null);

    if (bus) {
      setForm({
        placa: bus.Placa,
        modelo: bus.Modelo,
        capacidad: String(bus.Capacidad),

        asientosPrimerPiso:
          bus.AsientosRegistrados > 0
            ? String(bus.AsientosPrimerPiso)
            : '',

        asientosSegundoPiso:
          bus.AsientosRegistrados > 0
            ? String(bus.AsientosSegundoPiso)
            : '',

        tipoServicioId:
          bus.TipoServicioID == null
            ? ''
            : String(bus.TipoServicioID),

        estado: bus.Estado
      });
    } else {
      setForm(vacio());
    }

    setModal(tipo);
  }

  // ===================================================
  // ACTUALIZAR FORMULARIO
  // ===================================================

  function actualizar<
    K extends keyof Formulario
  >(
    campo: K,
    valor: Formulario[K]
  ) {
    setForm(anterior => ({
      ...anterior,
      [campo]: valor
    }));
  }

  // ===================================================
  // CALCULAR DISTRIBUCIÓN
  // ===================================================

  const capacidad =
    Number(form.capacidad);

  const primero =
    Number(form.asientosPrimerPiso);

  const segundo =
    Number(form.asientosSegundoPiso);

  const distribucionValida =
    form.capacidad.trim() !== '' &&
    form.asientosPrimerPiso.trim() !== '' &&
    form.asientosSegundoPiso.trim() !== '' &&
    validarDistribucion(
      capacidad,
      primero,
      segundo
    );

  const servicioElegido = tiposServicio.find(
    tipo =>
      String(tipo.TipoServicioID) ===
      form.tipoServicioId
  );

  // ===================================================
  // VALIDACIONES
  // ===================================================

  function validarFormulario(): string | null {
    const placa = form.placa
      .trim()
      .toUpperCase();

    const modelo =
      limpiarTexto(form.modelo);

    if (!/^[A-Z0-9-]{5,12}$/.test(placa)) {
      return (
        'La placa debe tener entre 5 y 12 caracteres ' +
        'y contener solo letras, números o guiones.'
      );
    }

    if (
      modelo.length < 2 ||
      modelo.length > 100
    ) {
      return (
        'El modelo debe contener ' +
        'entre 2 y 100 caracteres.'
      );
    }

    if (
      !form.capacidad.trim() ||
      !validarCapacidad(capacidad)
    ) {
      return (
        'La capacidad debe ser un número ' +
        'entero entre 1 y 200.'
      );
    }

    if (!distribucionValida) {
      return (
        'Los asientos del primer y segundo nivel ' +
        'deben sumar exactamente la capacidad del bus.'
      );
    }

    // Para registros nuevos, exigimos una categoría.
    if (
      modal === 'new' &&
      !form.tipoServicioId
    ) {
      return 'Selecciona el tipo de servicio del bus.';
    }

    // Se permite mantener sin asignar un bus antiguo.
    if (
      form.tipoServicioId &&
      !servicioElegido
    ) {
      return (
        'El tipo de servicio seleccionado ' +
        'no existe en el catálogo.'
      );
    }

    if (
      servicioElegido &&
      servicioElegido.Estado !== 'ACTIVO' &&
      Number(seleccionado?.TipoServicioID) !==
        servicioElegido.TipoServicioID
    ) {
      return (
        'No puedes asignar un tipo de servicio inactivo.'
      );
    }

    const duplicado = buses.find(
      bus =>
        bus.Placa.trim().toUpperCase() ===
          placa &&
        bus.BusID !== seleccionado?.BusID
    );

    if (duplicado) {
      return 'Ya existe un bus registrado con esa placa.';
    }

    return null;
  }

  // ===================================================
  // GUARDAR REGISTRO O EDICIÓN
  // ===================================================

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

    if (
      modal === 'edit' &&
      !seleccionado
    ) {
      await alertaAdvertencia(
        'Selecciona un bus para editar.'
      );
      return;
    }

    const fallo = validarFormulario();

    if (fallo) {
      setError(fallo);

      await alertaAdvertencia(
        fallo,
        'Datos incorrectos'
      );

      return;
    }

    const cambioDistribucion =
      modal === 'edit' &&
      seleccionado !== null &&
      (
        seleccionado.Capacidad !== capacidad ||
        seleccionado.AsientosPrimerPiso !== primero ||
        seleccionado.AsientosSegundoPiso !== segundo ||
        seleccionado.AsientosRegistrados !== capacidad
      );

    if (cambioDistribucion) {
      const confirmado =
        await confirmarAccion(
          'Estás modificando la capacidad o la ' +
          'distribución de asientos. Solo se permite ' +
          'si el bus no tiene viajes ni reservas ' +
          'asociados. ¿Deseas continuar?',
          'Modificar distribución de asientos'
        );

      if (!confirmado) {
        return;
      }
    }

    const tipoServicioId =
      form.tipoServicioId
        ? Number(form.tipoServicioId)
        : null;

    const datos = {
      placa: form.placa
        .trim()
        .toUpperCase(),

      modelo: limpiarTexto(
        form.modelo
      ),

      capacidad,

      asientosPrimerPiso: primero,

      asientosSegundoPiso: segundo,

      tipoServicioId,

      estado: form.estado
    };

    setGuardando(true);

    try {
      await peticion(
        modal === 'edit'
          ? `/buses/${seleccionado?.BusID}`
          : '/buses',
        token,
        {
          method:
            modal === 'edit'
              ? 'PUT'
              : 'POST',
          body: JSON.stringify(datos)
        }
      );

      const editando =
        modal === 'edit';

      setModal(null);
      setError('');

      await alertaExito(
        editando
          ? 'Los datos y el tipo de servicio ' +
            'del bus se actualizaron correctamente.'
          : 'El bus, su tipo de servicio y ' +
            'sus asientos se registraron correctamente.',
        editando
          ? 'Bus actualizado'
          : 'Bus registrado'
      );

      await cargar(busqueda);
    } catch (e) {
      const mensaje =
        (e as Error).message;

      setError(mensaje);

      await alertaError(
        mensaje,
        'No se pudo guardar el bus'
      );
    } finally {
      setGuardando(false);
    }
  }

  // ===================================================
  // CAMBIAR ESTADO OPERATIVO
  // ===================================================

  function abrirCambioEstado(bus: Bus) {
    setError('');
    setBusEstado(bus);
    setNuevoEstado(bus.Estado);
  }

  async function cambiarEstado() {
    if (
      !busEstado ||
      guardando ||
      nuevoEstado === busEstado.Estado
    ) {
      return;
    }

    const confirmado =
      await confirmarAccion(
        `¿Deseas cambiar el estado del bus ` +
        `${busEstado.Placa} de ` +
        `${busEstado.Estado} a ${nuevoEstado}?`,
        'Cambiar estado operativo'
      );

    if (!confirmado) {
      return;
    }

    setGuardando(true);
    setError('');

    try {
      await peticion(
        `/buses/${busEstado.BusID}/estado`,
        token,
        {
          method: 'PATCH',
          body: JSON.stringify({
            estado: nuevoEstado
          })
        }
      );

      setBusEstado(null);

      await alertaExito(
        `El estado del bus cambió a ${nuevoEstado}.`,
        'Estado actualizado'
      );

      await cargar(busqueda);
    } catch (e) {
      const mensaje =
        (e as Error).message;

      setError(mensaje);

      await alertaError(mensaje);
    } finally {
      setGuardando(false);
    }
  }

  // ===================================================
  // INTERFAZ PRINCIPAL
  // ===================================================

  return (
    <>
      {/* CABECERA */}

      <div className="heading">
        <h1>Gestión de buses</h1>

        <p>
          RF8 · Registro, consulta, edición,
          tipos de servicio y distribución
          de asientos
        </p>
      </div>

      {/* LISTADO */}

      <div className="panel">
        <div className="section-heading">
          <div>
            <h2>
              Registros · Gestión de buses
            </h2>

            <p>
              Administración de buses
              interprovinciales
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
            value={busqueda}
            onChange={e =>
              setBusqueda(e.target.value)
            }
            placeholder="Buscar por placa, modelo o servicio"
          />

          <button
            className="secondary"
            type="submit"
          >
            <Search size={16} />
            Buscar
          </button>
        </form>

        {!modal && !busEstado && error && (
          <div className="alert">
            {error}
          </div>
        )}

        {/* TABLA DE BUSES */}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Placa</th>
                <th>Modelo</th>
                <th>Capacidad</th>
                <th>1.er nivel</th>
                <th>2.º nivel</th>
                <th>Tipo de servicio</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {!cargando && buses.map(bus => (
                <tr key={bus.BusID}>
                  <td>
                    {bus.BusID}
                  </td>

                  <td>
                    {bus.Placa}
                  </td>

                  <td>
                    {bus.Modelo}
                  </td>

                  <td>
                    {bus.Capacidad}
                  </td>

                  <td>
                    {bus.AsientosPrimerPiso}
                  </td>

                  <td>
                    {bus.AsientosSegundoPiso}
                  </td>

                  <td>
                    <span
                      className={
                        bus.TipoServicioID !== null
                          ? 'status active'
                          : 'status'
                      }
                    >
                      {nombreServicio(
                        bus.TipoServicio
                      )}
                    </span>
                  </td>

                  <td>
                    <span
                      className={
                        bus.Estado === 'OPERATIVO'
                          ? 'status active'
                          : 'status'
                      }
                    >
                      {bus.Estado}
                    </span>
                  </td>

                  <td className="actions">
                    <button
                      type="button"
                      title="Ver bus"
                      onClick={() =>
                        abrir('view', bus)
                      }
                    >
                      <Eye size={16} />
                    </button>

                    <button
                      type="button"
                      title="Editar bus"
                      onClick={() =>
                        abrir('edit', bus)
                      }
                    >
                      <Pencil size={16} />
                    </button>

                    <button
                      type="button"
                      title="Cambiar estado"
                      onClick={() =>
                        abrirCambioEstado(bus)
                      }
                    >
                      <CheckCircle2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}

              {cargando && (
                <tr>
                  <td colSpan={9}>
                    Cargando buses...
                  </td>
                </tr>
              )}

              {!cargando &&
                buses.length === 0 && (
                  <tr>
                    <td colSpan={9}>
                      No se encontraron buses.
                    </td>
                  </tr>
                )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ==========================================
          REGISTRAR / EDITAR / VISUALIZAR
          ========================================== */}

      {modal && (
        <div className="overlay">
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Gestión de buses"
            style={{
              width: '95%',
              maxWidth: 850,
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
          >
            <div className="dialog-head">
              <h2>
                {modal === 'new'
                  ? 'Registrar bus'
                  : modal === 'edit'
                    ? `Editar bus ${seleccionado?.Placa}`
                    : 'Detalle del bus'}
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
              onSubmit={guardar}
              autoComplete="off"
              noValidate
            >
              <div className="fields">
                {/* PLACA */}

                <label>
                  Placa

                  <input
                    required
                    maxLength={12}
                    placeholder="Ej.: ABC-123"
                    disabled={
                      modal === 'view'
                    }
                    value={form.placa}
                    onChange={e =>
                      actualizar(
                        'placa',
                        e.target.value
                          .toUpperCase()
                          .replace(
                            /[^A-Z0-9-]/g,
                            ''
                          )
                      )
                    }
                  />
                </label>

                {/* MODELO */}

                <label>
                  Modelo

                  <input
                    required
                    maxLength={100}
                    placeholder="Ej.: Mercedes-Benz"
                    disabled={
                      modal === 'view'
                    }
                    value={form.modelo}
                    onChange={e =>
                      actualizar(
                        'modelo',
                        e.target.value
                      )
                    }
                  />
                </label>

                {/* TIPO DE SERVICIO */}

                <label>
                  Tipo de servicio

                  <select
                    required={modal === 'new'}
                    disabled={
                      modal === 'view' ||
                      cargandoCatalogo
                    }
                    value={form.tipoServicioId}
                    onChange={e =>
                      actualizar(
                        'tipoServicioId',
                        e.target.value
                      )
                    }
                  >
                    <option value="">
                      Sin asignar
                    </option>

                    {tiposServicio.map(tipo => {
                      const esActual =
                        String(tipo.TipoServicioID) ===
                        form.tipoServicioId;

                      const inactivo =
                        tipo.Estado !== 'ACTIVO';

                      return (
                        <option
                          key={tipo.TipoServicioID}
                          value={tipo.TipoServicioID}
                          disabled={
                            inactivo && !esActual
                          }
                        >
                          {nombreServicio(tipo.Nombre)}

                          {inactivo
                            ? ' (inactivo)'
                            : ''}
                        </option>
                      );
                    })}
                  </select>

                  {servicioElegido?.Descripcion && (
                    <small
                      style={{
                        display: 'block',
                        marginTop: 5,
                        color: '#64748b'
                      }}
                    >
                      {servicioElegido.Descripcion}
                    </small>
                  )}

                  {errorCatalogo && (
                    <small
                      style={{
                        display: 'block',
                        marginTop: 6,
                        color: '#b45309'
                      }}
                    >
                      No se pudo cargar el catálogo:{' '}
                      {errorCatalogo}
                    </small>
                  )}
                </label>

                {/* CAPACIDAD */}

                <label>
                  Capacidad total

                  <input
                    type="number"
                    min="1"
                    max="200"
                    step="1"
                    required
                    disabled={
                      modal === 'view'
                    }
                    value={form.capacidad}
                    onChange={e =>
                      actualizar(
                        'capacidad',
                        e.target.value
                      )
                    }
                  />
                </label>

                {/* PRIMER NIVEL */}

                <label>
                  Asientos del primer nivel

                  <input
                    type="number"
                    min="1"
                    max="200"
                    step="1"
                    required
                    disabled={
                      modal === 'view'
                    }
                    value={form.asientosPrimerPiso}
                    onChange={e =>
                      actualizar(
                        'asientosPrimerPiso',
                        e.target.value
                      )
                    }
                  />
                </label>

                {/* SEGUNDO NIVEL */}

                <label>
                  Asientos del segundo nivel

                  <input
                    type="number"
                    min="0"
                    max="200"
                    step="1"
                    required
                    disabled={
                      modal === 'view'
                    }
                    value={form.asientosSegundoPiso}
                    onChange={e =>
                      actualizar(
                        'asientosSegundoPiso',
                        e.target.value
                      )
                    }
                  />
                </label>

                {/* ESTADO */}

                <label>
                  Estado operativo

                  <select
                    disabled={
                      modal === 'view'
                    }
                    value={form.estado}
                    onChange={e =>
                      actualizar(
                        'estado',
                        e.target.value as Estado
                      )
                    }
                  >
                    {ESTADOS.map(estado => (
                      <option
                        key={estado}
                        value={estado}
                      >
                        {estado}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* ERROR DE CATÁLOGO */}

              {errorCatalogo && modal !== 'view' && (
                <div
                  style={{
                    marginTop: 12,
                    display: 'flex',
                    gap: 10,
                    alignItems: 'center',
                    flexWrap: 'wrap'
                  }}
                >
                  <button
                    type="button"
                    className="secondary"
                    disabled={cargandoCatalogo}
                    onClick={() =>
                      void cargarTiposServicio()
                    }
                  >
                    Reintentar cargar servicios
                  </button>
                </div>
              )}

              {/* RESUMEN DE DISTRIBUCIÓN */}

              <div
                style={{
                  marginTop: 15,
                  padding: 13,
                  background: '#f5f8fc',
                  border: '1px solid #d6dde7',
                  borderRadius: 8
                }}
              >
                <strong
                  style={{
                    color: '#173b63'
                  }}
                >
                  Resumen de distribución
                </strong>

                <p style={{ fontSize: 13 }}>
                  Primer nivel:{' '}
                  {form.asientosPrimerPiso || 0}

                  {' | '}

                  Segundo nivel:{' '}
                  {form.asientosSegundoPiso || 0}
                </p>

                <p
                  style={{
                    fontWeight: 700,
                    color: distribucionValida
                      ? '#16845a'
                      : '#ad5b0b'
                  }}
                >
                  Total distribuido:{' '}

                  {
                    (
                      Number.isFinite(primero)
                        ? primero
                        : 0
                    ) +
                    (
                      Number.isFinite(segundo)
                        ? segundo
                        : 0
                    )
                  }

                  {' '}de{' '}
                  {form.capacidad || 0}
                  {' '}asientos
                </p>

                <p
                  style={{
                    fontSize: 12,
                    color: distribucionValida
                      ? '#16845a'
                      : '#ad5b0b'
                  }}
                >
                  {distribucionValida
                    ? 'Distribución correcta.'
                    : 'La suma debe coincidir con la capacidad.'}
                </p>

                <p
                  style={{
                    fontSize: 12,
                    color: '#205d8d',
                    marginTop: 8
                  }}
                >
                  Tipo de servicio:{' '}

                  <strong>
                    {nombreServicio(
                      servicioElegido?.Nombre ??
                      seleccionado?.TipoServicio ??
                      null
                    )}
                  </strong>
                </p>
              </div>

              {/* INFORMACIÓN DE EDICIÓN */}

              {modal === 'edit' && (
                <p
                  style={{
                    fontSize: 12,
                    color: '#64748b',
                    marginTop: 10
                  }}
                >
                  Puedes editar la placa, el modelo,
                  el estado operativo y el tipo de
                  servicio. La capacidad y distribución
                  solo pueden modificarse si no
                  existen viajes o reservas
                  relacionados con este bus.
                </p>
              )}

              {/* VISTA PREVIA */}

              {distribucionValida && (
                <VistaAsientos
                  primero={primero}
                  segundo={segundo}
                />
              )}

              {/* MENSAJES */}

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
                    disabled={
                      guardando ||
                      cargandoCatalogo ||
                      Boolean(errorCatalogo)
                    }
                  >
                    {guardando
                      ? 'Guardando...'
                      : modal === 'edit'
                        ? 'Guardar cambios'
                        : 'Registrar bus'}
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

      {/* ==========================================
          CAMBIO DE ESTADO OPERATIVO
          ========================================== */}

      {busEstado && (
        <div className="overlay">
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Cambiar estado del bus"
            style={{
              maxWidth: 480,
              width: '95%'
            }}
          >
            <div className="dialog-head">
              <h2>Cambiar estado</h2>

              <button
                type="button"
                disabled={guardando}
                aria-label="Cerrar"
                onClick={() =>
                  setBusEstado(null)
                }
              >
                <X />
              </button>
            </div>

            <p>
              <strong>Bus:</strong>
              {' '}
              {busEstado.Placa}
            </p>

            <p>
              <strong>Tipo de servicio:</strong>
              {' '}
              {nombreServicio(
                busEstado.TipoServicio
              )}
            </p>

            <p>
              <strong>Estado actual:</strong>
              {' '}
              {busEstado.Estado}
            </p>

            <label>
              Nuevo estado

              <select
                value={nuevoEstado}
                disabled={guardando}
                onChange={e =>
                  setNuevoEstado(
                    e.target.value as Estado
                  )
                }
              >
                {ESTADOS.map(estado => (
                  <option
                    key={estado}
                    value={estado}
                  >
                    {estado}
                  </option>
                ))}
              </select>
            </label>

            {error && (
              <div className="alert">
                {error}
              </div>
            )}

            <div className="dialog-actions">
              <button
                type="button"
                className="orange"
                disabled={
                  guardando ||
                  nuevoEstado === busEstado.Estado
                }
                onClick={() =>
                  void cambiarEstado()
                }
              >
                {guardando
                  ? 'Guardando...'
                  : 'Guardar estado'}
              </button>

              <button
                type="button"
                className="secondary"
                disabled={guardando}
                onClick={() =>
                  setBusEstado(null)
                }
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
