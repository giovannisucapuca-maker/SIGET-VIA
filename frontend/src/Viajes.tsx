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
  BusFront,
  Info
} from 'lucide-react';
import Swal from 'sweetalert2';
import {
  alertaExito,
  alertaError,
  alertaAdvertencia
} from './utils/alertas';
import {
  validarMonto,
  validarRangoFechas
} from './utils/validaciones';
// =====================================================
// SIGET-VÍA — GESTIÓN DE VIAJES
// PASO 172.9.4.2
//
// NUEVO:
// - TipoServicioID
// - TipoServicio
// - Capacidad del bus
// - Tipo de servicio en formulario
// - Tipo de servicio en listado
// - Información del bus seleccionado
//
// SE CONSERVA:
// - Programar viajes
// - Editar viajes
// - Consultar viajes
// - Cambiar estados
// - Validación de horarios
// - Validación de catálogos
// - Alertas SweetAlert2
// =====================================================
type Estado =
  | 'PROGRAMADO'
  | 'EN_CURSO'
  | 'FINALIZADO'
  | 'CANCELADO';
type Viaje = {
  ViajeID: number;
  RutaID: number;
  BusID: number;
  ConductorID: number;
  Salida: string;
  LlegadaEstimada: string;
  Tarifa: number;
  Estado: Estado;
  Origen: string;
  Destino: string;
  BusPlaca: string;
  BusModelo: string;
  BusCapacidad: number;
  TipoServicioID: number | null;
  TipoServicio: string | null;
  ConductorNombres: string;
  ConductorApellidos: string;
};
type Ruta = {
  RutaID: number;
  Origen: string;
  Destino: string;
  Estado: 'ACTIVA' | 'INACTIVA';
};
type Bus = {
  BusID: number;
  Placa: string;
  Modelo: string;
  Capacidad: number;
  Estado:
    | 'OPERATIVO'
    | 'MANTENIMIENTO'
    | 'INACTIVO';
  TipoServicioID: number | null;
  TipoServicio: string | null;
};
type Conductor = {
  ConductorID: number;
  Nombres: string;
  Apellidos: string;
  NumeroLicencia: string;
  Estado: 'ACTIVO' | 'INACTIVO';
};
type Catalogos = {
  rutas: Ruta[];
  buses: Bus[];
  conductores: Conductor[];
};
type Formulario = {
  rutaId: number;
  busId: number;
  conductorId: number;
  salida: string;
  llegadaEstimada: string;
  tarifa: string;
  estado: Estado;
};
type Modal = 'new' | 'edit' | 'view' | null;
const API =
  import.meta.env.VITE_API_URL ||
  'http://localhost:4000/api';
const TRANSICIONES: Record<Estado, Estado[]> = {
  PROGRAMADO: ['EN_CURSO', 'CANCELADO'],
  EN_CURSO: ['PROGRAMADO', 'FINALIZADO'],
  FINALIZADO: [],
  CANCELADO: []
};
// =====================================================
// FORMULARIO VACÍO
// =====================================================
function formularioVacio(): Formulario {
  return {
    rutaId: 0,
    busId: 0,
    conductorId: 0,
    salida: '',
    llegadaEstimada: '',
    tarifa: '',
    estado: 'PROGRAMADO'
  };
}
// =====================================================
// PETICIONES API
// =====================================================
async function api<T>(
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
// =====================================================
// FUNCIONES AUXILIARES
// =====================================================
function fechaFormulario(valor: string): string {
  return valor ? valor.slice(0, 16) : '';
}
function fechaTexto(valor: string): string {
  if (!valor) return '-';
  const partes = valor.slice(0, 16).split('T');
  if (partes.length !== 2) {
    return valor;
  }
  const [anio, mes, dia] = partes[0].split('-');
  return `${dia}/${mes}/${anio} ${partes[1]}`;
}
function soles(valor: number): string {
  return (
    'S/ ' +
    Number(valor).toLocaleString('es-PE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  );
}
// =====================================================
// TIPO DE SERVICIO
// =====================================================
function nombreServicio(
  nombre: string | null | undefined
): string {
  if (!nombre) {
    return 'Sin asignar';
  }
  const nombres: Record<string, string> = {
    ECONOMICO: 'Económico',
    EJECUTIVO: 'Ejecutivo',
    CAMA: 'Cama',
    SUITE: 'Suite'
  };
  const clave = nombre.trim().toUpperCase();
  return nombres[clave] || nombre;
}
// =====================================================
// VALIDACIÓN DE FECHAS
// =====================================================
function fechaValida(valor: string): boolean {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valor)
  ) {
    return false;
  }
  const fecha = new Date(`${valor}:00Z`);
  return (
    !Number.isNaN(fecha.getTime()) &&
    fecha.toISOString().slice(0, 16) === valor
  );
}
// =====================================================
// HORARIO ACTUAL DE PERÚ
// =====================================================
function ahoraPeru(): string {
  const partes = new Intl.DateTimeFormat(
    'en-US',
    {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    }
  ).formatToParts(new Date());
  const valores = Object.fromEntries(
    partes.map(x => [x.type, x.value])
  );
  return (
    `${valores.year}-${valores.month}-${valores.day}T` +
    `${valores.hour}:${valores.minute}:${valores.second}`
  );
}
function fechaConSegundos(valor: string): string {
  const normalizada = valor
    .replace(' ', 'T')
    .replace(/Z$/, '');
  return normalizada
    .slice(0, 19)
    .padEnd(19, '0');
}
function sumarMinutos(
  valor: string,
  minutos: number
): string {
  const texto = fechaConSegundos(valor);
  const fecha = new Date(`${texto}Z`);
  if (Number.isNaN(fecha.getTime())) {
    return '';
  }
  return new Date(
    fecha.getTime() + minutos * 60000
  ).toISOString().slice(0, 19);
}
// =====================================================
// CONTROL DE EDICIÓN
// =====================================================
function sePuedeEditar(viaje: Viaje): boolean {
  if (
    viaje.Estado === 'FINALIZADO' ||
    viaje.Estado === 'CANCELADO'
  ) {
    return false;
  }
  return fechaConSegundos(viaje.Salida) >
    ahoraPeru();
}
// =====================================================
// TRANSICIONES DE ESTADO
// =====================================================
function estadosDisponibles(
  viaje: Viaje
): Estado[] {
  const ahora = ahoraPeru();
  const salida = fechaConSegundos(
    viaje.Salida
  );
  const llegadaMas15 = sumarMinutos(
    viaje.LlegadaEstimada,
    15
  );
  const transiciones =
    TRANSICIONES[viaje.Estado] || [];
  return transiciones.filter(estado => {
    if (estado === 'PROGRAMADO') {
      return ahora < salida;
    }
    if (estado === 'FINALIZADO') {
      return Boolean(
        llegadaMas15 &&
        ahora >= llegadaMas15
      );
    }
    if (estado === 'CANCELADO') {
      return ahora < salida;
    }
    return true;
  });
}
function textoEstado(estado: Estado): string {
  switch (estado) {
    case 'PROGRAMADO':
      return 'Programado';
    case 'EN_CURSO':
      return 'En curso';
    case 'FINALIZADO':
      return 'Finalizado';
    case 'CANCELADO':
      return 'Cancelado';
    default:
      return estado;
  }
}
// =====================================================
// COMPONENTE PRINCIPAL
// =====================================================
export default function Viajes({
  token
}: {
  token: string;
}) {
  const [viajes, setViajes] =
    useState<Viaje[]>([]);
  const [catalogos, setCatalogos] =
    useState<Catalogos>({
      rutas: [],
      buses: [],
      conductores: []
    });
  const [busqueda, setBusqueda] =
    useState('');
  const [modal, setModal] =
    useState<Modal>(null);
  const [seleccionado, setSeleccionado] =
    useState<Viaje | null>(null);
  const [form, setForm] =
    useState<Formulario>(formularioVacio);
  const [error, setError] =
    useState('');
  const [guardando, setGuardando] =
    useState(false);
  const [cargando, setCargando] =
    useState(true);
  const [
    cargandoCatalogos,
    setCargandoCatalogos
  ] = useState(false);
  const [
    cambiandoEstado,
    setCambiandoEstado
  ] = useState(false);
  // PASO 179 — Verificación preventiva del horario elegido.
  // La validación definitiva se realiza en el backend.
  const [viajesDisponibilidad, setViajesDisponibilidad] = useState<Viaje[]>([]);
  const [cargandoDisponibilidad, setCargandoDisponibilidad] = useState(false);
  const [errorDisponibilidad, setErrorDisponibilidad] = useState('');
  async function cargarDisponibilidad() {
    setCargandoDisponibilidad(true);
    setErrorDisponibilidad('');
    setViajesDisponibilidad([]);
    try {
      const registros = await api<Viaje[]>('/viajes?q=', token);
      setViajesDisponibilidad(registros);
    } catch (e) {
      setErrorDisponibilidad((e as Error).message);
    } finally {
      setCargandoDisponibilidad(false);
    }
  }
  // ===================================================
  // LISTAR VIAJES
  // ===================================================
  async function cargar(q = '') {
    setCargando(true);
    try {
      const datos = await api<Viaje[]>(
        `/viajes?q=${encodeURIComponent(q)}`,
        token
      );
      setViajes(datos);
      setError('');
    } catch (e) {
      const mensaje = (e as Error).message;
      setError(mensaje);
      await alertaError(
        mensaje,
        'No se pudieron consultar los viajes'
      );
    } finally {
      setCargando(false);
    }
  }
  // ===================================================
  // CARGAR CATÁLOGOS
  // ===================================================
  async function cargarCatalogos() {
    setCargandoCatalogos(true);
    try {
      const datos = await api<Catalogos>(
        '/viajes/catalogos',
        token
      );
      setCatalogos({
        rutas: datos.rutas || [],
        buses: datos.buses || [],
        conductores: datos.conductores || []
      });
    } catch (e) {
      await alertaError(
        (e as Error).message,
        'No se pudieron cargar los catálogos'
      );
    } finally {
      setCargandoCatalogos(false);
    }
  }
  // ===================================================
  // CARGA INICIAL
  // ===================================================
  useEffect(() => {
    let activo = true;
    Promise.all([
      api<Viaje[]>('/viajes', token),
      api<Catalogos>(
        '/viajes/catalogos',
        token
      )
    ])
      .then(([registros, opciones]) => {
        if (!activo) return;
        setViajes(registros);
        setCatalogos({
          rutas: opciones.rutas || [],
          buses: opciones.buses || [],
          conductores:
            opciones.conductores || []
        });
        setError('');
      })
      .catch(e => {
        if (activo) {
          setError(
            (e as Error).message
          );
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
  // ===================================================
  // ABRIR FORMULARIOS
  // ===================================================
  function abrir(
    tipo: Exclude<Modal, null>,
    viaje?: Viaje
  ) {
    if (
      tipo === 'edit' &&
      viaje &&
      !sePuedeEditar(viaje)
    ) {
      void alertaAdvertencia(
        'Este viaje ya no permite modificar ' +
        'sus datos programados.',
        'Edición no disponible'
      );
      return;
    }
    setSeleccionado(viaje || null);
    setError('');
    setForm(
      viaje
        ? {
            rutaId: viaje.RutaID,
            busId: viaje.BusID,
            conductorId: viaje.ConductorID,
            salida:
              fechaFormulario(viaje.Salida),
            llegadaEstimada:
              fechaFormulario(
                viaje.LlegadaEstimada
              ),
            tarifa: String(viaje.Tarifa),
            estado: viaje.Estado
          }
        : formularioVacio()
    );
    setModal(tipo);
    void cargarCatalogos();
    void cargarDisponibilidad();
  }
  function cerrarModal() {
    if (guardando) return;
    setModal(null);
    setSeleccionado(null);
    setError('');
  }
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
  // OPCIONES DISPONIBLES
  // ===================================================
  const rutasDisponibles =
    catalogos.rutas.filter(
      ruta =>
        ruta.Estado === 'ACTIVA' ||
        (
          modal !== 'new' &&
          ruta.RutaID === form.rutaId
        )
    );
  const busesDisponibles =
    catalogos.buses.filter(
      bus =>
        bus.Estado === 'OPERATIVO' ||
        (
          modal !== 'new' &&
          bus.BusID === form.busId
        )
    );
  const conductoresDisponibles =
    catalogos.conductores.filter(
      conductor =>
        conductor.Estado === 'ACTIVO' ||
        (
          modal !== 'new' &&
          conductor.ConductorID ===
            form.conductorId
        )
    );
  // Conflicto si: salida anterior < nueva llegada y
  // llegada anterior > nueva salida. Viajes cancelados/finalizados
  // no bloquean disponibilidad. Se excluye la edición actual.
  const horarioCompleto =
    fechaValida(form.salida) &&
    fechaValida(form.llegadaEstimada) &&
    form.salida < form.llegadaEstimada;
  const viajesCoincidentes = horarioCompleto
    ? viajesDisponibilidad.filter(v =>
        v.ViajeID !== seleccionado?.ViajeID &&
        (v.Estado === 'PROGRAMADO' || v.Estado === 'EN_CURSO') &&
        fechaFormulario(v.Salida) < form.llegadaEstimada &&
        fechaFormulario(v.LlegadaEstimada) > form.salida
      )
    : [];
  const conflictoBus = viajesCoincidentes.find(v =>
    v.BusID === form.busId
  );
  const conflictoConductor = viajesCoincidentes.find(v =>
    v.ConductorID === form.conductorId
  );
  function viajeDelBus(id: number) {
    return viajesCoincidentes.find(v => v.BusID === id);
  }
  function viajeDelConductor(id: number) {
    return viajesCoincidentes.find(v => v.ConductorID === id);
  }
  // ===================================================
  // NUEVO — INFORMACIÓN DEL BUS SELECCIONADO
  // ===================================================
  const busSeleccionado =
    catalogos.buses.find(
      bus => bus.BusID === form.busId
    );
  const servicioSeleccionado =
    busSeleccionado?.TipoServicio ??
    seleccionado?.TipoServicio ??
    null;
  const capacidadSeleccionada =
    busSeleccionado?.Capacidad ??
    seleccionado?.BusCapacidad ??
    0;
  const placaSeleccionada =
    busSeleccionado?.Placa ??
    seleccionado?.BusPlaca ??
    '';
  const modeloSeleccionado =
    busSeleccionado?.Modelo ??
    seleccionado?.BusModelo ??
    '';
  // ===================================================
  // VALIDAR FORMULARIO
  // ===================================================
  function validarFormulario(): string | null {
    if (!form.rutaId) {
      return 'Selecciona una ruta.';
    }
    if (!form.busId) {
      return 'Selecciona un bus.';
    }
    if (!form.conductorId) {
      return 'Selecciona un conductor.';
    }
    const ruta = catalogos.rutas.find(
      x => x.RutaID === form.rutaId
    );
    const bus = catalogos.buses.find(
      x => x.BusID === form.busId
    );
    const conductor = catalogos.conductores.find(
      x => x.ConductorID === form.conductorId
    );
    if (!ruta || ruta.Estado !== 'ACTIVA') {
      return 'La ruta debe estar ACTIVA.';
    }
    if (
      !bus ||
      bus.Estado !== 'OPERATIVO'
    ) {
      return 'El bus debe estar OPERATIVO.';
    }
    if (
      !conductor ||
      conductor.Estado !== 'ACTIVO'
    ) {
      return 'El conductor debe estar ACTIVO.';
    }
    if (!fechaValida(form.salida)) {
      return (
        'Ingresa una fecha y hora ' +
        'de salida válidas.'
      );
    }
    if (!fechaValida(form.llegadaEstimada)) {
      return (
        'Ingresa una fecha y hora ' +
        'de llegada válidas.'
      );
    }
    if (
      !validarRangoFechas(
        form.salida,
        form.llegadaEstimada
      )
    ) {
      return (
        'La llegada debe ser posterior ' +
        'a la fecha de salida.'
      );
    }
    if (
      form.salida + ':00' <= ahoraPeru()
    ) {
      return 'La nueva salida debe ser futura.';
    }
    if (!cargandoDisponibilidad && !errorDisponibilidad) {
      if (conflictoBus) {
        return `El bus ya está ocupado en el viaje #${conflictoBus.ViajeID} (${fechaTexto(conflictoBus.Salida)} a ${fechaTexto(conflictoBus.LlegadaEstimada)}).`;
      }
      if (conflictoConductor) {
        return `El conductor ya está ocupado en el viaje #${conflictoConductor.ViajeID} (${fechaTexto(conflictoConductor.Salida)} a ${fechaTexto(conflictoConductor.LlegadaEstimada)}).`;
      }
    }
    if (!form.tarifa.trim()) {
      return 'Ingresa la tarifa.';
    }
    const tarifa = Number(form.tarifa);
    if (!validarMonto(tarifa)) {
      return (
        'La tarifa debe ser válida y tener ' +
        'como máximo dos decimales.'
      );
    }
    if (
      modal === 'new' &&
      form.estado !== 'PROGRAMADO'
    ) {
      return (
        'Todo viaje nuevo debe registrarse ' +
        'como PROGRAMADO.'
      );
    }
    if (
      modal === 'edit' &&
      seleccionado
    ) {
      if (!sePuedeEditar(seleccionado)) {
        return (
          'Este viaje ya no admite edición.'
        );
      }
      if (
        form.estado !==
        seleccionado.Estado
      ) {
        return (
          'Para cambiar el estado utiliza ' +
          'el botón Cambiar estado.'
        );
      }
    }
    return null;
  }
  // ===================================================
  // GUARDAR NUEVO / EDITAR
  // ===================================================
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
    const fallo = validarFormulario();
    if (fallo) {
      setError(fallo);
      await alertaAdvertencia(
        fallo,
        'Datos incorrectos'
      );
      return;
    }
    const esEdicion = modal === 'edit';
    if (esEdicion && !seleccionado) {
      return;
    }
    const confirmacion = await Swal.fire({
      title: esEdicion
        ? 'Confirmar edición'
        : 'Programar viaje',
      text: esEdicion
        ? '¿Deseas guardar los cambios de este viaje?'
        : '¿Deseas registrar este viaje?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, guardar',
      cancelButtonText: 'Volver',
      confirmButtonColor: '#f58220',
      cancelButtonColor: '#173b63'
    });
    if (!confirmacion.isConfirmed) {
      return;
    }
    setGuardando(true);
    setError('');
    try {
      await api(
        esEdicion
          ? `/viajes/${seleccionado?.ViajeID}`
          : '/viajes',
        token,
        {
          method: esEdicion ? 'PUT' : 'POST',
          body: JSON.stringify({
            rutaId: form.rutaId,
            busId: form.busId,
            conductorId: form.conductorId,
            salida: form.salida,
            llegadaEstimada:
              form.llegadaEstimada,
            tarifa: Number(form.tarifa),
            estado: form.estado
          })
        }
      );
      setModal(null);
      setSeleccionado(null);
      setError('');
      await alertaExito(
        esEdicion
          ? 'Los datos del viaje se actualizaron.'
          : 'El viaje fue programado correctamente.',
        esEdicion
          ? 'Viaje actualizado'
          : 'Viaje registrado'
      );
      await cargar(busqueda);
    } catch (e) {
      const mensaje = (e as Error).message;
      setError(mensaje);
      await alertaError(
        mensaje,
        'No se pudo guardar el viaje'
      );
    } finally {
      setGuardando(false);
    }
  }
  // ===================================================
  // CAMBIAR ESTADO DEL VIAJE
  // ===================================================
  async function cambiarEstado(viaje: Viaje) {
    if (cambiandoEstado) return;
    const opciones =
      estadosDisponibles(viaje);
    if (!opciones.length) {
      const limite = sumarMinutos(
        viaje.LlegadaEstimada,
        15
      );
      const mensaje =
        viaje.Estado === 'EN_CURSO'
          ? (
              'Todavía no hay cambios de estado ' +
              'disponibles. Para volver a PROGRAMADO ' +
              'debes hacerlo antes de la salida. ' +
              'Para FINALIZADO debes esperar hasta ' +
              `${fechaTexto(limite)}.`
            )
          : 'Este viaje no permite cambios de estado.';
      await alertaAdvertencia(
        mensaje,
        'Cambio no disponible'
      );
      return;
    }
    const seleccion = await Swal.fire({
      title: 'Cambiar estado del viaje',
      text:
        `Viaje #${viaje.ViajeID} - ` +
        `${viaje.Origen} a ${viaje.Destino}`,
      icon: 'question',
      input: 'select',
      inputOptions: Object.fromEntries(
        opciones.map(estado => [
          estado,
          textoEstado(estado)
        ])
      ),
      inputPlaceholder:
        'Selecciona el nuevo estado',
      showCancelButton: true,
      confirmButtonText: 'Continuar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#f58220',
      cancelButtonColor: '#173b63',
      inputValidator: valor =>
        !valor
          ? 'Selecciona un estado.'
          : undefined
    });
    if (!seleccion.isConfirmed) {
      return;
    }
    const estado =
      seleccion.value as Estado;
    if (!opciones.includes(estado)) {
      await alertaAdvertencia(
        'La transición seleccionada no está permitida.'
      );
      return;
    }
    const confirmacion = await Swal.fire({
      title: 'Confirmar cambio de estado',
      text:
        `¿Cambiar el viaje #${viaje.ViajeID} ` +
        `de ${textoEstado(viaje.Estado)} ` +
        `a ${textoEstado(estado)}?`,
      icon:
        estado === 'CANCELADO'
          ? 'warning'
          : 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, cambiar estado',
      cancelButtonText: 'Volver',
      confirmButtonColor: '#f58220',
      cancelButtonColor: '#173b63'
    });
    if (!confirmacion.isConfirmed) {
      return;
    }
    setCambiandoEstado(true);
    setError('');
    try {
      const resultado = await api<{
        ViajeID: number;
        Estado: Estado;
        mensaje: string;
      }>(
        `/viajes/${viaje.ViajeID}/estado`,
        token,
        {
          method: 'PATCH',
          body: JSON.stringify({
            estado
          })
        }
      );
      await alertaExito(
        resultado.mensaje ||
          `El viaje cambió a ${estado}.`,
        'Estado actualizado'
      );
      await cargar(busqueda);
    } catch (e) {
      const mensaje = (e as Error).message;
      setError(mensaje);
      await alertaError(
        mensaje,
        'No se pudo cambiar el estado'
      );
    } finally {
      setCambiandoEstado(false);
    }
  }
  // ===================================================
  // INTERFAZ PRINCIPAL
  // ===================================================
  return (
    <>
      {/* =========================================
          CABECERA
          ========================================= */}
      <div className="heading">
        <h1>Gestión de viajes</h1>
        <p>
          Programación, consulta, edición,
          tipos de servicio y control
          de estados por horario
        </p>
      </div>
      {/* =====================================================
          PASO 182 — VIAJES CON SALIDA VENCIDA
          Solo advertencia visual: no modifica registros.
          ===================================================== */}
      {(() => {
        const vencidos = viajes.filter(v =>
          v.Estado === 'PROGRAMADO' &&
          fechaConSegundos(v.Salida) <= ahoraPeru()
        );
        return vencidos.length > 0 ? (
          <div
            role="alert"
            style={{
              background: '#fff7ed',
              border: '1px solid #fdba74',
              borderRadius: 10,
              padding: 16,
              marginBottom: 18,
              color: '#9a3412'
            }}
          >
            <strong>Atención: viajes con salida vencida</strong>
            <p style={{ margin: '8px 0 0' }}>
              Se encontraron {vencidos.length} viaje(s) con fecha de salida
              vencida que continúan en estado PROGRAMADO.
            </p>
            <p style={{ margin: '8px 0 0', fontSize: 13 }}>
              Requieren revisión administrativa antes de cualquier cambio de
              estado. Las reservas y pagos no se modifican automáticamente.
            </p>
            <small>
              Viajes identificados: {vencidos.map(v => `#${v.ViajeID}`).join(', ')}.
            </small>
          </div>
        ) : null;
      })()}
      {/* =========================================
          PANEL PRINCIPAL
          ========================================= */}
      <div className="panel">
        <div className="section-heading">
          <div>
            <h2>
              Registros · Gestión de viajes
            </h2>
            <p>
              Transporte interprovincial
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
            placeholder={
              'Buscar por ruta, bus, servicio, ' +
              'conductor o estado'
            }
          />
          <button
            type="submit"
            className="secondary"
          >
            <Search size={16} />
            Buscar
          </button>
        </form>
        {!modal && error && (
          <div className="alert">
            {error}
          </div>
        )}
        {/* =======================================
            TABLA DE VIAJES
            ======================================= */}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Ruta</th>
                <th>Bus</th>
                <th>Tipo de servicio</th>
                <th>Conductor</th>
                <th>Salida</th>
                <th>Llegada</th>
                <th>Tarifa</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cargando && (
                <tr>
                  <td colSpan={10}>
                    Cargando viajes...
                  </td>
                </tr>
              )}
              {!cargando && viajes.map(v => (
                <tr key={v.ViajeID}>
                  <td>
                    {v.ViajeID}
                  </td>
                  <td>
                    {v.Origen}
                    {' - '}
                    {v.Destino}
                  </td>
                  {/* BUS */}
                  <td>
                    <strong>
                      {v.BusPlaca}
                    </strong>
                    <small
                      style={{
                        display: 'block',
                        marginTop: 4,
                        color: '#64748b'
                      }}
                    >
                      {v.BusModelo}
                    </small>
                  </td>
                  {/* TIPO DE SERVICIO */}
                  <td>
                    <span
                      className={
                        v.TipoServicioID != null
                          ? 'status active'
                          : 'status'
                      }
                    >
                      {nombreServicio(
                        v.TipoServicio
                      )}
                    </span>
                  </td>
                  {/* CONDUCTOR */}
                  <td>
                    {v.ConductorNombres}
                    {' '}
                    {v.ConductorApellidos}
                  </td>
                  <td>
                    {fechaTexto(v.Salida)}
                  </td>
                  <td>
                    {fechaTexto(
                      v.LlegadaEstimada
                    )}
                  </td>
                  <td>
                    {soles(v.Tarifa)}
                  </td>
                  <td>
                    <span
                      className={
                        v.Estado === 'PROGRAMADO'
                          ? 'status active'
                          : 'status'
                      }
                    >
                      {textoEstado(v.Estado)}
                    </span>
                  </td>
                  {/* ACCIONES */}
                  <td className="actions">
                    <button
                      type="button"
                      title="Consultar viaje"
                      onClick={() =>
                        abrir('view', v)
                      }
                    >
                      <Eye size={16} />
                    </button>
                    <button
                      type="button"
                      title={
                        sePuedeEditar(v)
                          ? 'Editar viaje'
                          : 'Edición no disponible'
                      }
                      disabled={!sePuedeEditar(v)}
                      onClick={() =>
                        abrir('edit', v)
                      }
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      title="Cambiar estado"
                      disabled={
                        cambiandoEstado ||
                        v.Estado === 'FINALIZADO' ||
                        v.Estado === 'CANCELADO'
                      }
                      onClick={() =>
                        void cambiarEstado(v)
                      }
                    >
                      <CheckCircle2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {!cargando &&
                viajes.length === 0 &&
                !error && (
                  <tr>
                    <td colSpan={10}>
                      No se encontraron viajes.
                    </td>
                  </tr>
                )}
            </tbody>
          </table>
        </div>
      </div>
      {/* =========================================
          MODAL NUEVO / EDITAR / VER
          ========================================= */}
      {modal && (
        <div className="overlay">
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Gestión de viajes"
            style={{
              width: '95%',
              maxWidth: 820,
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
          >
            <div className="dialog-head">
              <h2>
                {modal === 'new'
                  ? 'Programar viaje'
                  : modal === 'edit'
                    ? 'Editar viaje'
                    : 'Detalle del viaje'}
              </h2>
              <button
                type="button"
                aria-label="Cerrar"
                disabled={guardando}
                onClick={cerrarModal}
              >
                <X />
              </button>
            </div>
            <form
              key={
                `${modal}-` +
                `${seleccionado?.ViajeID ?? 'nuevo'}`
              }
              onSubmit={guardar}
              autoComplete="off"
              noValidate
            >
              <div className="fields">
                {/* RUTA */}
                <label>
                  Ruta
                  <select
                    required
                    value={form.rutaId}
                    disabled={
                      modal === 'view' ||
                      cargandoCatalogos ||
                      guardando
                    }
                    onChange={e =>
                      actualizar(
                        'rutaId',
                        Number(e.target.value)
                      )
                    }
                  >
                    <option value={0}>
                      Selecciona una ruta
                    </option>
                    {rutasDisponibles.map(ruta => (
                      <option
                        key={ruta.RutaID}
                        value={ruta.RutaID}
                      >
                        {ruta.Origen}
                        {' - '}
                        {ruta.Destino}
                      </option>
                    ))}
                  </select>
                </label>
                {/* =================================
                    BUS Y TIPO DE SERVICIO
                    ================================= */}
                <label>
                  Bus
                  <select
                    required
                    value={form.busId}
                    disabled={
                      modal === 'view' ||
                      cargandoCatalogos ||
                      guardando
                    }
                    onChange={e =>
                      actualizar(
                        'busId',
                        Number(e.target.value)
                      )
                    }
                  >
                    <option value={0}>
                      Selecciona un bus
                    </option>
                    {busesDisponibles.map(bus => (
                      <option
                        key={bus.BusID}
                        value={bus.BusID}
                        disabled={Boolean(viajeDelBus(bus.BusID)) && form.busId !== bus.BusID}
                      >
                        {bus.Placa}
                        {' - '}
                        {bus.Modelo}
                        {' | '}
                        {nombreServicio(
                          bus.TipoServicio
                        )}
                        {' | '}
                        {bus.Capacidad} asientos
                        {viajeDelBus(bus.BusID) ? ' | OCUPADO EN ESTE HORARIO' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                {/* DATOS DEL BUS SELECCIONADO */}
                {form.busId > 0 && (
                  <div
                    style={{
                      gridColumn: '1 / -1',
                      padding: 16,
                      borderRadius: 10,
                      background: '#f0f6fc',
                      border: '1px solid #cfe1f1',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10
                    }}
                  >
                    <strong
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        color: '#205d8d'
                      }}
                    >
                      <BusFront size={19} />
                      Información del bus seleccionado
                    </strong>
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 16,
                        fontSize: 13,
                        color: '#344a60'
                      }}
                    >
                      <span>
                        <strong>Placa:</strong>
                        {' '}
                        {placaSeleccionada || '-'}
                      </span>
                      <span>
                        <strong>Modelo:</strong>
                        {' '}
                        {modeloSeleccionado || '-'}
                      </span>
                      <span>
                        <strong>Servicio:</strong>
                        {' '}
                        {nombreServicio(
                          servicioSeleccionado
                        )}
                      </span>
                      <span>
                        <strong>Capacidad:</strong>
                        {' '}
                        {capacidadSeleccionada}
                        {' '}
                        asientos
                      </span>
                    </div>
                    {busSeleccionado &&
                      busSeleccionado.Estado !==
                        'OPERATIVO' && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            color: '#a65a10',
                            fontSize: 12
                          }}
                        >
                          <Info size={16} />
                          Este bus no está operativo.
                        </div>
                      )}
                  </div>
                )}
                {/* CONDUCTOR */}
                <label>
                  Conductor
                  <select
                    required
                    value={form.conductorId}
                    disabled={
                      modal === 'view' ||
                      cargandoCatalogos ||
                      guardando
                    }
                    onChange={e =>
                      actualizar(
                        'conductorId',
                        Number(e.target.value)
                      )
                    }
                  >
                    <option value={0}>
                      Selecciona un conductor
                    </option>
                    {conductoresDisponibles.map(
                      conductor => (
                        <option
                          key={
                            conductor.ConductorID
                          }
                          value={
                            conductor.ConductorID
                          }
                          disabled={Boolean(viajeDelConductor(conductor.ConductorID)) && form.conductorId !== conductor.ConductorID}
                        >
                          {conductor.Nombres}
                          {' '}
                          {conductor.Apellidos}
                          {' | Licencia: '}
                          {conductor.NumeroLicencia}
                          {viajeDelConductor(conductor.ConductorID) ? ' | OCUPADO EN ESTE HORARIO' : ''}
                        </option>
                      )
                    )}
                  </select>
                </label>
                {/* SALIDA */}
                <label>
                  Fecha y hora de salida
                  <input
                    type="datetime-local"
                    required
                    value={form.salida}
                    disabled={
                      modal === 'view' ||
                      guardando
                    }
                    onChange={e =>
                      actualizar(
                        'salida',
                        e.target.value
                      )
                    }
                  />
                </label>
                {/* LLEGADA */}
                <label>
                  Llegada estimada
                  <input
                    type="datetime-local"
                    required
                    value={
                      form.llegadaEstimada
                    }
                    disabled={
                      modal === 'view' ||
                      guardando
                    }
                    onChange={e =>
                      actualizar(
                        'llegadaEstimada',
                        e.target.value
                      )
                    }
                  />
                </label>
                {/* DISPONIBILIDAD PREVENTIVA POR HORARIO */}
                {modal !== 'view' && (
                  <div style={{
                    gridColumn: '1 / -1', padding: 13,
                    background: conflictoBus || conflictoConductor ? '#fef2f2' : '#eff6ff',
                    border: '1px solid #cbd5e1', borderRadius: 9,
                    color: '#173b63', fontSize: 13
                  }}>
                    <strong>Disponibilidad de bus y conductor</strong>
                    {!horarioCompleto ? (
                      <p>Indica una salida y una llegada válidas para comprobar el horario.</p>
                    ) : cargandoDisponibilidad ? (
                      <p>Consultando asignaciones existentes...</p>
                    ) : errorDisponibilidad ? (
                      <p>No se pudo comprobar anticipadamente: {errorDisponibilidad}. El servidor validará al guardar.</p>
                    ) : (
                      <>
                        <p>{conflictoBus
                          ? `Bus ocupado: viaje #${conflictoBus.ViajeID}, del ${fechaTexto(conflictoBus.Salida)} al ${fechaTexto(conflictoBus.LlegadaEstimada)}.`
                          : 'Bus: sin conflictos detectados para el horario indicado.'}</p>
                        <p>{conflictoConductor
                          ? `Conductor ocupado: viaje #${conflictoConductor.ViajeID}, del ${fechaTexto(conflictoConductor.Salida)} al ${fechaTexto(conflictoConductor.LlegadaEstimada)}.`
                          : 'Conductor: sin conflictos detectados para el horario indicado.'}</p>
                      </>
                    )}
                    <small>La disponibilidad se vuelve a validar en SQL Server al guardar.</small>
                  </div>
                )}
                {/* TARIFA */}
                <label>
                  Tarifa (S/)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={form.tarifa}
                    disabled={
                      modal === 'view' ||
                      guardando
                    }
                    onChange={e =>
                      actualizar(
                        'tarifa',
                        e.target.value
                      )
                    }
                  />
                </label>
                {/* ESTADO */}
                <label>
                  Estado
                  <input
                    type="text"
                    value={
                      textoEstado(form.estado)
                    }
                    readOnly
                  />
                  {modal === 'edit' && (
                    <small>
                      El estado del viaje se
                      modifica desde el botón
                      Cambiar estado.
                    </small>
                  )}
                </label>
              </div>
              {modal === 'edit' && (
                <p
                  style={{
                    marginTop: 16,
                    fontSize: 13,
                    color: '#64748b'
                  }}
                >
                  Los datos programados pueden
                  editarse antes de la salida.
                  Si existen reservas, no es
                  posible cambiar la ruta,
                  el bus ni la tarifa.
                </p>
              )}
              {modal === 'view' && (
                <p
                  style={{
                    marginTop: 16,
                    fontSize: 13,
                    color: '#64748b'
                  }}
                >
                  El cambio de estado se realiza
                  desde la columna Acciones.
                  Para finalizar, deben haber
                  transcurrido 15 minutos desde
                  la llegada estimada.
                </p>
              )}
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
                    disabled={
                      guardando ||
                      cargandoCatalogos
                    }
                  >
                    {guardando
                      ? 'Guardando...'
                      : modal === 'new'
                        ? 'Programar viaje'
                        : 'Guardar cambios'}
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
