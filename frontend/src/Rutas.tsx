
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
  validarDistancia
} from './utils/validaciones';

// ========================================
// SIGET-VÍA - GESTIÓN DE RUTAS RF6
// VALIDACIONES Y SWEETALERT2
// ========================================

type EstadoRuta = 'ACTIVA' | 'INACTIVA';

type Ruta = {
  RutaID: number;
  Origen: string;
  Destino: string;
  DistanciaKm: number | null;
  Estado: EstadoRuta;
};

type Formulario = {
  origen: string;
  destino: string;
  distanciaKm: string;
  estado: EstadoRuta;
};

type Modal = 'new' | 'edit' | 'view' | null;

const API =
  import.meta.env.VITE_API_URL ||
  'http://localhost:4000/api';

function formularioVacio(): Formulario {
  return {
    origen: '',
    destino: '',
    distanciaKm: '',
    estado: 'ACTIVA'
  };
}

function normalizarCiudad(valor: string): string {
  return limpiarTexto(valor).toLocaleUpperCase('es-PE');
}

function compararCiudad(valor: string): string {
  return normalizarCiudad(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function ciudadValida(valor: string): boolean {
  return (
    valor.length >= 2 &&
    valor.length <= 120 &&
    /^[\p{L}\p{M}0-9][\p{L}\p{M}0-9 .,'’()/-]*$/u.test(valor)
  );
}

// ========================================
// SERVICIO API
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
// COMPONENTE PRINCIPAL
// ========================================

export default function Rutas({
  token
}: {
  token: string;
}) {
  const [rutas, setRutas] = useState<Ruta[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [modal, setModal] = useState<Modal>(null);

  const [seleccionada, setSeleccionada] =
    useState<Ruta | null>(null);

  const [form, setForm] =
    useState<Formulario>(formularioVacio);

  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [cargando, setCargando] = useState(true);

  const [cambiandoEstado, setCambiandoEstado] =
    useState(false);

  // ======================================
  // 1. LISTAR Y BUSCAR RUTAS
  // ======================================

  async function cargar(q = '') {
    setCargando(true);

    try {
      const datos = await peticion<Ruta[]>(
        `/rutas?q=${encodeURIComponent(q)}`,
        token
      );

      setRutas(datos);
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

    peticion<Ruta[]>('/rutas', token)
      .then(datos => {
        if (activo) {
          setRutas(datos);
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
  // 3. ABRIR FORMULARIO
  // ======================================

  function abrir(
    tipo: Exclude<Modal, null>,
    ruta?: Ruta
  ) {
    setSeleccionada(ruta || null);
    setError('');

    if (ruta) {
      setForm({
        origen: ruta.Origen,
        destino: ruta.Destino,
        distanciaKm:
          ruta.DistanciaKm === null
            ? ''
            : String(ruta.DistanciaKm),
        estado: ruta.Estado
      });
    } else {
      setForm(formularioVacio());
    }

    setModal(tipo);
  }

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
  // 4. VALIDAR FORMULARIO
  // ======================================

  function validarFormulario(): string | null {
    const origen = normalizarCiudad(form.origen);
    const destino = normalizarCiudad(form.destino);

    if (!ciudadValida(origen)) {
      return (
        'El origen debe tener entre 2 y 120 caracteres ' +
        'y contener un nombre de ciudad válido.'
      );
    }

    if (!ciudadValida(destino)) {
      return (
        'El destino debe tener entre 2 y 120 caracteres ' +
        'y contener un nombre de ciudad válido.'
      );
    }

    if (
      compararCiudad(origen) ===
      compararCiudad(destino)
    ) {
      return 'El origen y el destino deben ser diferentes.';
    }

    if (form.distanciaKm.trim() !== '') {
      const distancia = Number(form.distanciaKm);

      if (!validarDistancia(distancia)) {
        return (
          'La distancia debe ser un número positivo ' +
          'y no superar 99999999 km.'
        );
      }

      if (
        Math.abs(
          distancia * 100 -
          Math.round(distancia * 100)
        ) > 0.00001
      ) {
        return (
          'La distancia debe tener como máximo dos decimales.'
        );
      }
    }

    if (
      form.estado !== 'ACTIVA' &&
      form.estado !== 'INACTIVA'
    ) {
      return 'Selecciona un estado válido.';
    }

    const duplicada = rutas.find(r =>
      compararCiudad(r.Origen) ===
        compararCiudad(origen) &&
      compararCiudad(r.Destino) ===
        compararCiudad(destino) &&
      r.RutaID !== seleccionada?.RutaID
    );

    if (duplicada) {
      return (
        'Ya existe una ruta con ese origen y destino.'
      );
    }

    return null;
  }

  // ======================================
  // 5. REGISTRAR Y EDITAR
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

    if (modal === 'edit' && !seleccionada) {
      await alertaAdvertencia(
        'Selecciona una ruta para editar.'
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

    const datos = {
      origen: normalizarCiudad(form.origen),
      destino: normalizarCiudad(form.destino),

      distanciaKm:
        form.distanciaKm.trim() === ''
          ? null
          : Number(form.distanciaKm),

      estado: form.estado
    };

    setGuardando(true);

    try {
      const editando = modal === 'edit';

      await peticion(
        editando
          ? `/rutas/${seleccionada?.RutaID}`
          : '/rutas',
        token,
        {
          method: editando ? 'PUT' : 'POST',
          body: JSON.stringify(datos)
        }
      );

      setModal(null);
      setError('');

      await alertaExito(
        editando
          ? 'Los datos de la ruta se actualizaron correctamente.'
          : 'La ruta se registró correctamente.',
        editando
          ? 'Ruta actualizada'
          : 'Ruta registrada'
      );

      await cargar(busqueda);
    } catch (e) {
      const mensaje = (e as Error).message;

      setError(mensaje);

      await alertaError(
        mensaje,
        'No se pudo guardar la ruta'
      );
    } finally {
      setGuardando(false);
    }
  }

  // ======================================
  // 6. CAMBIAR ESTADO
  // ======================================

  async function cambiarEstado(ruta: Ruta) {
    if (cambiandoEstado) {
      return;
    }

    const nuevo: EstadoRuta =
      ruta.Estado === 'ACTIVA'
        ? 'INACTIVA'
        : 'ACTIVA';

    const confirmado = await confirmarAccion(
      `¿Deseas cambiar la ruta ` +
      `${ruta.Origen} - ${ruta.Destino} ` +
      `a ${nuevo}?`,
      'Cambiar estado de ruta'
    );

    if (!confirmado) {
      return;
    }

    setCambiandoEstado(true);
    setError('');

    try {
      await peticion(
        `/rutas/${ruta.RutaID}/estado`,
        token,
        {
          method: 'PATCH',
          body: JSON.stringify({
            estado: nuevo
          })
        }
      );

      await alertaExito(
        `La ruta cambió al estado ${nuevo}.`,
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
  // 7. INTERFAZ PRINCIPAL
  // ======================================

  return (
    <>
      <div className="heading">
        <h1>Gestión de rutas</h1>
        <p>
          RF6 · Registro, consulta, edición
          y control de rutas
        </p>
      </div>

      <div className="panel">
        <div className="section-heading">
          <div>
            <h2>
              Registros · Gestión de rutas
            </h2>

            <p>
              Consulta y administración de rutas
              de transporte interprovincial
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
            placeholder="Buscar por origen o destino"
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

        {/* TABLA DE RUTAS */}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Origen</th>
                <th>Destino</th>
                <th>Distancia (km)</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {!cargando &&
                rutas.map(ruta => (
                  <tr key={ruta.RutaID}>
                    <td>{ruta.RutaID}</td>
                    <td>{ruta.Origen}</td>
                    <td>{ruta.Destino}</td>

                    <td>
                      {ruta.DistanciaKm === null
                        ? 'No registrada'
                        : Number(ruta.DistanciaKm)
                            .toLocaleString('es-PE', {
                              maximumFractionDigits: 2
                            })}
                    </td>

                    <td>
                      <span
                        className={
                          ruta.Estado === 'ACTIVA'
                            ? 'status active'
                            : 'status'
                        }
                      >
                        {ruta.Estado}
                      </span>
                    </td>

                    <td className="actions">
                      {/* VER */}

                      <button
                        type="button"
                        title="Ver detalle"
                        onClick={() =>
                          abrir('view', ruta)
                        }
                      >
                        <Eye size={16} />
                      </button>

                      {/* EDITAR */}

                      <button
                        type="button"
                        title="Editar ruta"
                        onClick={() =>
                          abrir('edit', ruta)
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
                          void cambiarEstado(ruta)
                        }
                      >
                        <CheckCircle2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}

              {cargando && (
                <tr>
                  <td colSpan={6}>
                    Cargando rutas...
                  </td>
                </tr>
              )}

              {!cargando &&
                rutas.length === 0 &&
                !error && (
                  <tr>
                    <td colSpan={6}>
                      No se encontraron rutas.
                    </td>
                  </tr>
                )}
            </tbody>
          </table>
        </div>
      </div>

      {/* =====================================
          MODAL REGISTRAR / EDITAR / VER
      ===================================== */}

      {modal && (
        <div className="overlay">
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Gestión de rutas"
            style={{
              width: '95%',
              maxWidth: 700,
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
          >
            <div className="dialog-head">
              <h2>
                {modal === 'new'
                  ? 'Registrar ruta'
                  : modal === 'edit'
                    ? 'Editar ruta'
                    : 'Detalle de ruta'}
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
              key={`${modal}-${seleccionada?.RutaID ?? 'nueva'}`}
              onSubmit={guardar}
              autoComplete="off"
              noValidate
            >
              <div className="fields">
                {/* ORIGEN */}

                <label>
                  Origen

                  <input
                    type="text"
                    name="ruta_origen"
                    autoComplete="off"
                    maxLength={120}
                    required
                    disabled={modal === 'view'}
                    value={form.origen}
                    onChange={e =>
                      actualizar(
                        'origen',
                        e.target.value
                      )
                    }
                    placeholder="Ej.: JULIACA"
                  />
                </label>

                {/* DESTINO */}

                <label>
                  Destino

                  <input
                    type="text"
                    name="ruta_destino"
                    autoComplete="off"
                    maxLength={120}
                    required
                    disabled={modal === 'view'}
                    value={form.destino}
                    onChange={e =>
                      actualizar(
                        'destino',
                        e.target.value
                      )
                    }
                    placeholder="Ej.: AREQUIPA"
                  />
                </label>

                {/* DISTANCIA */}

                <label>
                  Distancia (km) (opcional)

                  <input
                    type="number"
                    name="ruta_distancia"
                    min="0.01"
                    max="99999999"
                    step="0.01"
                    disabled={modal === 'view'}
                    value={form.distanciaKm}
                    onChange={e =>
                      actualizar(
                        'distanciaKm',
                        e.target.value
                      )
                    }
                    placeholder="Ej.: 250.00"
                  />
                </label>

                {/* ESTADO */}

                <label>
                  Estado

                  <select
                    name="ruta_estado"
                    value={form.estado}
                    disabled={modal === 'view'}
                    onChange={e =>
                      actualizar(
                        'estado',
                        e.target.value as EstadoRuta
                      )
                    }
                  >
                    <option value="ACTIVA">
                      ACTIVA
                    </option>

                    <option value="INACTIVA">
                      INACTIVA
                    </option>
                  </select>
                </label>
              </div>

              {/* ERROR */}

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
                        : 'Registrar ruta'}
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
