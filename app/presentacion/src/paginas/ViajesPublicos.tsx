
import {
  useEffect,
  useState,
  type FormEvent
} from 'react';

import { Link } from 'react-router-dom';

import {
  ArrowRight,
  Armchair,
  BadgeCheck,
  BusFront,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Info,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  Ticket,
  Users,
  X
} from 'lucide-react';

import './ViajesPublicos.css';

import { buscarViajesPublicos } from '../reglas/portal-publico';

// =====================================================
// SIGET-VÍA — VENTANA PÚBLICA
// PASO 187 — DISEÑO VÍA SAC
// =====================================================
// RF3  — Consulta pública de viajes
// RF4  — Reservas
// RF8  — Tipos de servicio
// RF10 — Selección de asientos
//
// Mantiene la conexión con la API existente.
// Las imágenes se cargan desde frontend/public.
// =====================================================

// =====================================================
// TIPOS
// =====================================================

type ViajePublico = {
  ViajeID: number;
  Origen: string;
  Destino: string;
  TerminalOrigen?: string | null;
  DireccionOrigen?: string | null;
  TerminalDestino?: string | null;
  DireccionDestino?: string | null;
  Salida: string;
  LlegadaEstimada: string;
  Tarifa: number;

  BusID?: number;
  Placa?: string;
  Modelo?: string;
  Capacidad?: number;

  TipoServicioID?: number | null;
  TipoServicio?: string | null;

  AsientosRegistrados?: number;
  AsientosOcupados?: number;
  AsientosDisponibles: number;
};

type Filtros = {
  origen: string;
  destino: string;
  fecha: string;
};

const filtrosVacios: Filtros = {
  origen: '',
  destino: '',
  fecha: ''
};

// =====================================================
// FUNCIONES AUXILIARES
// =====================================================

function fechaHora(valor: string): string {
  if (!valor || valor.length < 16) {
    return 'No disponible';
  }

  const [anio, mes, dia] = valor
    .slice(0, 10)
    .split('-');

  return (
    `${dia}/${mes}/${anio} · ` +
    valor.slice(11, 16)
  );
}

function moneda(valor: number): string {
  const numero = Number(valor);

  if (!Number.isFinite(numero)) {
    return 'Tarifa no disponible';
  }

  return `S/ ${numero.toFixed(2)}`;
}

function nombreServicio(
  valor?: string | null
): string {
  const nombres: Record<string, string> = {
    ECONOMICO: 'Económico',
    EJECUTIVO: 'Ejecutivo',
    CAMA: 'Cama',
    SUITE: 'Suite'
  };

  const clave = String(valor || '')
    .trim()
    .toUpperCase();

  return nombres[clave] || valor || 'Servicio general';
}

// =====================================================
// COMPONENTE PRINCIPAL
// =====================================================

// Fecha de hoy (AAAA-MM-DD) para no permitir buscar viajes en fechas pasadas (CU003 — 8b).
function hoyLima(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
}

type UsuarioSesion = {
  Nombres: string;
  Rol: string;
};

export default function ViajesPublicos({
  usuario = null,
  onSalir
}: {
  usuario?: UsuarioSesion | null;
  onSalir?: () => void;
}) {
  // Panel al que entra el usuario con sesión activa.
  const panel = usuario?.Rol === 'CLIENTE' ? '/cliente' : '/panel';

  // ---------------------------------------------------
  // CAMPOS DEL BUSCADOR
  // ---------------------------------------------------

  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  const [fecha, setFecha] = useState('');

  // ---------------------------------------------------
  // FILTROS APLICADOS
  // ---------------------------------------------------

  const [filtros, setFiltros] =
    useState<Filtros>(filtrosVacios);

  const [version, setVersion] = useState(0);

  // ---------------------------------------------------
  // INFORMACIÓN DE VIAJES
  // ---------------------------------------------------

  const [viajes, setViajes] =
    useState<ViajePublico[]>([]);

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [buscado, setBuscado] = useState(false);

  // ===================================================
  // CONSULTAR VIAJES DESDE SQL SERVER
  // ===================================================

  useEffect(() => {
    const controller = new AbortController();

    async function consultar() {
      setCargando(true);
      setError('');

      try {
        const datos = await buscarViajesPublicos<unknown>(
          {
            origen: filtros.origen,
            destino: filtros.destino,
            fecha: filtros.fecha
          },
          { signal: controller.signal }
        );

        if (!Array.isArray(datos)) {
          throw new Error(
            'El servidor devolvió una respuesta inválida.'
          );
        }

        if (!controller.signal.aborted) {
          setViajes(datos as ViajePublico[]);
          setBuscado(true);
        }
      } catch (e) {
        if (controller.signal.aborted) {
          return;
        }

        setViajes([]);
        setBuscado(true);

        setError(
          e instanceof Error
            ? e.message
            : 'No se pudieron consultar los viajes.'
        );
      } finally {
        if (!controller.signal.aborted) {
          setCargando(false);
        }
      }
    }

    void consultar();

    return () => {
      controller.abort();
    };
  }, [filtros, version]);

  // ===================================================
  // BUSCAR VIAJES
  // ===================================================

  function buscar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setFiltros({
      origen: origen.trim(),
      destino: destino.trim(),
      fecha
    });

    // Permite repetir una búsqueda con los
    // mismos filtros y actualizar disponibilidad.
    setVersion(anterior => anterior + 1);

    document
      .getElementById('via-publica-resultados')
      ?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
  }

  // ===================================================
  // ACTUALIZAR DISPONIBILIDAD
  // ===================================================

  function actualizar() {
    setVersion(anterior => anterior + 1);
  }

  // ===================================================
  // LIMPIAR FILTROS
  // ===================================================

  function limpiar() {
    setOrigen('');
    setDestino('');
    setFecha('');

    setFiltros({
      origen: '',
      destino: '',
      fecha: ''
    });

    setVersion(anterior => anterior + 1);
  }

  // ===================================================
  // INTERFAZ DE LA VENTANA PÚBLICA
  // ===================================================

  return (
    <div className="via-publica">

      {/* ===============================================
          ENCABEZADO PRINCIPAL
          =============================================== */}

      <header className="via-publica-nav">

        <Link
          to="/viajes/publico"
          className="via-publica-marca"
          aria-label="Vía SAC, inicio público"
        >
          <img
            src="/via-sac-logo.png"
            alt="Logo Vía SAC"
          />
        </Link>

        <nav
          className="via-publica-enlaces"
          aria-label="Navegación principal"
        >
          <a href="#inicio-publico">
            Inicio
          </a>

          <a href="#buscador-publico">
            Buscar viajes
          </a>

          <a href="#servicios-publicos">
            Servicios
          </a>

          <a href="#via-publica-resultados">
            Salidas
          </a>

          <Link to="/reclamaciones/publico">
            Reclamaciones
          </Link>

          <Link to="/condiciones">
            Condiciones
          </Link>
        </nav>

        <div className="via-publica-cuenta">

          {usuario ? (
            <>
              <Link
                className="via-publica-acceso"
                to={panel}
                title={`Sesión iniciada como ${usuario.Nombres}`}
              >
                {usuario.Rol === 'CLIENTE' ? 'Mi cuenta' : 'Ir al panel'}
              </Link>

              <button
                type="button"
                className="via-publica-registro"
                onClick={onSalir}
              >
                Cerrar sesión
              </button>
            </>
          ) : (
            <>
              <Link
                className="via-publica-acceso"
                to="/login"
              >
                Iniciar sesión
              </Link>

              <Link
                className="via-publica-registro"
                to="/registro"
              >
                Registrarme
                <ArrowRight size={15} />
              </Link>
            </>
          )}

        </div>
      </header>

      {/* ===============================================
          PORTADA CON FOTOGRAFÍA DEL BUS
          =============================================== */}

      <section
        id="inicio-publico"
        className="via-publica-hero"
      >

        <div
          className="via-publica-hero-imagen"
          aria-hidden="true"
        />

        <div className="via-publica-hero-sombra" />

        <div className="via-publica-hero-interior">

          <div className="via-publica-hero-texto">

            <span className="via-publica-pildora">
              <ShieldCheck size={16} />
              Transportes Vía S.A.C.
            </span>

            <h1>
              Tu próximo destino comienza aquí.
            </h1>

            <p>
              Consulta salidas, conoce nuestras
              tarifas y elige tu asiento para
              viajar con comodidad.
            </p>

            <a
              href="#buscador-publico"
              className="via-publica-hero-boton"
            >
              Buscar pasajes
              <ArrowRight size={19} />
            </a>

          </div>
        </div>
      </section>

      {/* ===============================================
          BUSCADOR DE PASAJES
          =============================================== */}

      <section
        id="buscador-publico"
        className="via-publica-buscador-area"
      >

        <div className="via-publica-contenedor">

          <form
            className="via-publica-buscador"
            onSubmit={buscar}
          >

            <div className="via-publica-buscador-titulo">

              <span>
                <Search size={19} />
              </span>

              <div>
                <h2>
                  ¿A dónde quieres viajar?
                </h2>

                <p>
                  Busca viajes disponibles
                  en nuestro sistema.
                </p>
              </div>

            </div>

            <div className="via-publica-campos">

              {/* ORIGEN */}

              <label>
                <span>
                  <MapPin size={16} />
                  Origen
                </span>

                <input
                  type="text"
                  value={origen}
                  onChange={e =>
                    setOrigen(e.target.value)
                  }
                  placeholder="Ej. Juliaca"
                  maxLength={120}
                />
              </label>

              {/* DESTINO */}

              <label>
                <span>
                  <MapPin size={16} />
                  Destino
                </span>

                <input
                  type="text"
                  value={destino}
                  onChange={e =>
                    setDestino(e.target.value)
                  }
                  placeholder="Ej. Arequipa"
                  maxLength={120}
                />
              </label>

              {/* FECHA DE SALIDA */}

              <label>
                <span>
                  <CalendarDays size={16} />
                  Fecha de salida
                </span>

                <input
                  type="date"
                  min={hoyLima()}
                  value={fecha}
                  onChange={e =>
                    setFecha(e.target.value)
                  }
                />
              </label>

              {/* BOTÓN BUSCAR */}

              <button
                className="via-publica-buscar-btn"
                type="submit"
                disabled={cargando}
              >
                <Search size={18} />

                {cargando
                  ? 'Buscando...'
                  : 'Buscar viajes'}
              </button>

            </div>

            {/* LIMPIAR FILTROS */}

            {(origen ||
              destino ||
              fecha ||
              filtros.origen ||
              filtros.destino ||
              filtros.fecha) && (

              <button
                type="button"
                className="via-publica-limpiar"
                onClick={limpiar}
                disabled={cargando}
              >
                <X size={14} />
                Limpiar filtros
              </button>

            )}

          </form>

        </div>
      </section>

      {/* ===============================================
          CONTENIDO PRINCIPAL
          =============================================== */}

      <main className="via-publica-contenedor">

        {/* ============================================
            LISTADO DE VIAJES DISPONIBLES
            ============================================ */}

        <section
          id="via-publica-resultados"
          className={
            'via-publica-seccion ' +
            'via-publica-resultados-seccion'
          }
        >

          <div className="via-publica-titulo-fila">

            <div>
              <span className="via-publica-sobretitulo">
                DISPONIBILIDAD EN LÍNEA
              </span>

              <h2>
                Viajes disponibles
              </h2>

              <p>
                Horarios y asientos consultados
                directamente del sistema.
              </p>
            </div>

            <button
              className="via-publica-actualizar"
              type="button"
              onClick={actualizar}
              disabled={cargando}
            >
              <RefreshCw size={17} />
              Actualizar
            </button>

          </div>

          {/* ERROR DE CONSULTA */}

          {error && (
            <div
              className="via-publica-mensaje error"
              role="alert"
            >
              <Info size={18} />
              {error}
            </div>
          )}

          {/* CARGANDO */}

          {cargando && (
            <div className="via-publica-mensaje">
              <RefreshCw size={18} />
              Consultando salidas...
            </div>
          )}

          {/* SIN RESULTADOS */}

          {!cargando &&
            !error &&
            buscado &&
            viajes.length === 0 && (

              <div className="via-publica-vacio">

                <BusFront size={40} />

                <h3>
                  Sin viajes disponibles
                </h3>

                <p>
                  No encontramos salidas para los
                  filtros seleccionados. Prueba
                  otra fecha o destino.
                </p>

              </div>

            )}

          {/* ========================================
              TARJETAS DE VIAJES
              ======================================== */}

          {!cargando &&
            !error &&
            viajes.length > 0 && (

              <>
                <p className="via-publica-contador">
                  {viajes.length} viaje(s) encontrado(s)
                </p>

                <div className="via-publica-lista">

                  {viajes.map(viaje => {

                    const disponibles = Number(
                      viaje.AsientosDisponibles
                    );

                    const hayDisponibles =
                      Number.isFinite(disponibles) &&
                      disponibles > 0;

                    const servicio = nombreServicio(
                      viaje.TipoServicio
                    );

                    return (
                      <article
                        className="via-publica-viaje"
                        key={viaje.ViajeID}
                      >

                        {/* ICONO DEL VIAJE */}

                        <div className="via-publica-viaje-icono">
                          <BusFront size={30} />
                        </div>

                        {/* DATOS DEL VIAJE */}

                        <div className="via-publica-viaje-datos">

                          <span className="via-publica-servicio">
                            <BadgeCheck size={15} />
                            {servicio}
                          </span>

                          <h3>
                            {viaje.Origen}
                            <ArrowRight size={19} />
                            {viaje.Destino}
                          </h3>

                          {/* TERMINALES TERRESTRES */}

                          {(viaje.TerminalOrigen || viaje.TerminalDestino) && (
                            <p className="via-publica-terminales">
                              <MapPin size={14} />
                              <span title={viaje.DireccionOrigen || ''}>
                                Embarque: {viaje.TerminalOrigen || viaje.Origen}
                              </span>
                              <span title={viaje.DireccionDestino || ''}>
                                Llegada: {viaje.TerminalDestino || viaje.Destino}
                              </span>
                            </p>
                          )}

                          {/* HORARIOS */}

                          <div className="via-publica-meta">

                            <span>
                              <CalendarDays size={15} />
                              Salida:
                              {' '}
                              {fechaHora(viaje.Salida)}
                            </span>

                            <span>
                              <Clock3 size={15} />
                              Llegada:
                              {' '}
                              {fechaHora(
                                viaje.LlegadaEstimada
                              )}
                            </span>

                          </div>

                          {/* BUS Y DISPONIBILIDAD */}

                          <div className="via-publica-meta">

                            <span>
                              <BusFront size={15} />

                              {viaje.Modelo || 'Bus asignado'}

                              {viaje.Placa
                                ? ` (${viaje.Placa})`
                                : ''}
                            </span>

                            <span
                              className={
                                hayDisponibles
                                  ? 'via-publica-disponible'
                                  : 'via-publica-agotado'
                              }
                            >
                              <Armchair size={15} />

                              {hayDisponibles
                                ? `${disponibles} asientos disponibles`
                                : 'Sin asientos disponibles'}
                            </span>

                          </div>

                        </div>

                        {/* TARIFA Y RESERVA */}

                        <div className="via-publica-viaje-accion">

                          <small>
                            Desde
                          </small>

                          <strong>
                            {moneda(viaje.Tarifa)}
                          </strong>

                          <span>
                            Por asiento · Viaje #{viaje.ViajeID}
                          </span>

                          {hayDisponibles ? (

                            <Link
                              to={
                                `/viajes/publico/` +
                                `${viaje.ViajeID}/asientos`
                              }
                            >
                              <Ticket size={16} />
                              Elegir asientos
                              <ArrowRight size={16} />
                            </Link>

                          ) : (

                            <em>
                              Agotado
                            </em>

                          )}

                        </div>

                      </article>
                    );
                  })}

                </div>
              </>

            )}

        </section>

        {/* ============================================
            SECCIÓN DE SERVICIOS
            ============================================ */}

        <section
          id="servicios-publicos"
          className="via-publica-seccion"
        >

          <div className="via-publica-titulo-centro">

            <span className="via-publica-sobretitulo">
              NUESTRA FLOTA
            </span>

            <h2>
              Viaja a tu manera
            </h2>

            <p>
              Conoce nuestros servicios y elige
              tu viaje según los horarios publicados.
            </p>

          </div>

          <div className="via-publica-servicios">

            {/* SEGUNDA FOTOGRAFÍA */}

            <div className="via-publica-foto-servicios">

              <img
                src="/via-sac-bus-servicios.png"
                alt="Bus de Transportes Vía SAC en carretera"
                loading="lazy"
              />

            </div>

            {/* INFORMACIÓN DE SERVICIOS */}

            <div className="via-publica-servicios-texto">

              <h3>
                Comodidad en cada recorrido
              </h3>

              <p>
                Consulta los servicios registrados
                para cada viaje. La disponibilidad
                y el precio se actualizan desde
                SIGET-VÍA.
              </p>

              <div className="via-publica-beneficios">

                <span>
                  <Armchair size={18} />
                  Selección de asientos
                </span>

                <span>
                  <Clock3 size={18} />
                  Horarios de salida
                </span>

                <span>
                  <BadgeCheck size={18} />
                  Tipos de servicio
                </span>

                <span>
                  <CheckCircle2 size={18} />
                  Reserva con confirmación
                </span>

              </div>

              <a href="#buscador-publico">
                Consultar pasajes
                <ArrowRight size={17} />
              </a>

            </div>
          </div>
        </section>

        {/* ============================================
            ACCESO A CUENTA DEL CLIENTE
            ============================================ */}

        <section className="via-publica-final">

          <div>

            <Users size={27} />

            <h2>
              ¿Ya tienes una cuenta?
            </h2>

            <p>
              Inicia sesión para consultar tus
              reservas y gestionar tu perfil.
            </p>

          </div>

          <Link to={usuario ? panel : '/login'}>
            {usuario ? 'Ir a mi cuenta' : 'Ingresar a mi cuenta'}
            <ArrowRight size={17} />
          </Link>

        </section>

      </main>

      {/* ===============================================
          PIE DE PÁGINA
          =============================================== */}

      <footer className="via-publica-footer">

        <div>

          <img
            src="/via-sac-logo.png"
            alt="Vía SAC"
          />

          <p>
            Portal académico SIGET-VÍA ·
            Sistema de gestión de transporte
            interprovincial.
          </p>

        </div>

        <div>

          <Link to={usuario ? panel : '/login'}>
            {usuario ? 'Mi cuenta' : 'Ingresar'}
          </Link>

          {!usuario && (
            <Link to="/registro">
              Crear cuenta
            </Link>
          )}

          <Link to="/reclamaciones/publico">
            Libro de reclamaciones
          </Link>

          <Link to="/condiciones">
            Condiciones del servicio
          </Link>

        </div>

      </footer>

    </div>
  );
}
