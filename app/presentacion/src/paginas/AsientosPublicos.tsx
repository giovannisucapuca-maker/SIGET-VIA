import {
  useEffect,
  useState,
  type CSSProperties,
  type FormEvent
} from 'react';
import {
  Armchair,
  ArrowLeft,
  ArrowRight,
  BusFront,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Info,
  LockKeyhole,
  LogIn,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  FileText,
  Ticket,
  UserRoundPlus,
  Users
} from 'lucide-react';
import {
  Link,
  useParams
} from 'react-router-dom';
import './AsientosPublicos.css';

import {
  consultarAsientosPublicos,
  obtenerSesion,
  politicasVigentesReserva,
  consultarDniCliente,
  crearReserva
} from '../reglas/portal-publico';

import { leerToken } from '../reglas/sesion';
// =====================================================
// SIGET-VÍA — ASIENTOS PÚBLICOS
// PASO 172.9.5.4 — CONFIRMACIÓN DE RESERVA Y POLÍTICAS
//
// RF3  — Consulta pública de viajes
// RF4  — Reserva de pasajes
// RF10 — Selección de asientos
// RF15 — Datos de pasajeros
// RF17 — Políticas del servicio
//
// NUEVO:
// - Consultar DNI del pasajero
// - Completar nombres y apellidos
// - Confirmación de autorización
// - Validación de documentos
//
// Registra reservas con aceptación de políticas. No procesa pagos.
// =====================================================
const CLAVE_RETORNO =
  'siget-cliente-retorno-reserva';
const VIGENCIA_BORRADOR_MS =
  30 * 60 * 1000;
// =====================================================
// TIPOS
// =====================================================
type Asiento = {
  AsientoID: number;
  Numero: number;
  Nivel: number;
  Ocupado: boolean;
};
type Viaje = {
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
  Capacidad: number;
  BusID?: number;
  Placa?: string | null;
  Modelo?: string | null;
  TipoServicioID?: number | null;
  TipoServicio?: string | null;
  DescripcionServicio?: string | null;
};
type ResumenPiso = {
  Nivel: number;
  TotalAsientos: number;
  AsientosDisponibles: number;
  AsientosOcupados: number;
};
type Datos = {
  viaje: Viaje;
  totalAsientos: number;
  asientosDisponibles: number;
  asientosOcupados: number;
  pisos?: ResumenPiso[];
  asientos: Asiento[];
};
type TipoDocumento =
  | 'DNI'
  | 'CE'
  | 'PASAPORTE';
type PasajeroFormulario = {
  asientoId: number;
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  nombres: string;
  apellidos: string;
  fechaNacimiento: string;
  autorizaConsulta: boolean;
};
type UsuarioSesion = {
  UsuarioID: number;
  Rol: string;
  Estado: string;
};
type Borrador = {
  viajeId: number;
  asientosIds: number[];
  actualizado: number;
};
type Paso = 'asientos' | 'pasajeros' | 'politicas' | 'confirmada';
type ReservaConfirmada = {
  ReservaID: number;
  Codigo: string;
  Total: number;
  CantidadAsientos: number;
  TotalAceptaciones: number;
};
type PoliticaVigente = {
  id: number | string;
  version: string;
  titulo: string;
  contenido: string;
};
type ObjetoApi = Record<string, unknown>;
type RespuestaDni = {
  encontrado: boolean;
  fuente?: string;
  tipoDocumento?: string;
  nombres: string | null;
  apellidos: string | null;
  error?: string;
};
// =====================================================
// FUNCIONES AUXILIARES
// =====================================================
function fechaHora(valor: string) {
  if (!valor || valor.length < 16) {
    return 'No disponible';
  }
  const [anio, mes, dia] =
    valor.slice(0, 10).split('-');
  return (
    `${dia}/${mes}/${anio}` +
    ` · ${valor.slice(11, 16)}`
  );
}
function moneda(valor: number) {
  return `S/ ${Number(valor).toFixed(2)}`;
}
function nombreServicio(valor?: string | null) {
  const nombres: Record<string, string> = {
    ECONOMICO: 'Económico',
    EJECUTIVO: 'Ejecutivo',
    CAMA: 'Cama',
    SUITE: 'Suite'
  };
  const nombre = valor?.trim().toUpperCase();
  return nombre ? (nombres[nombre] ?? valor) : 'Sin asignar';
}
function nombrePiso(numero: number) {
  if (numero === 1) return 'Primer piso';
  if (numero === 2) return 'Segundo piso';
  return `Piso ${numero}`;
}
function claveBorrador(viajeId: string) {
  return `siget-publico-asientos-${viajeId}`;
}
function leerBorrador(viajeId: string): number[] {
  try {
    const texto = sessionStorage.getItem(
      claveBorrador(viajeId)
    );
    if (!texto) return [];
    const borrador = JSON.parse(texto) as Borrador;
    if (
      Number(borrador.viajeId) !== Number(viajeId) ||
      !Array.isArray(borrador.asientosIds) ||
      !Number.isFinite(borrador.actualizado) ||
      Date.now() - borrador.actualizado >
        VIGENCIA_BORRADOR_MS
    ) {
      sessionStorage.removeItem(
        claveBorrador(viajeId)
      );
      return [];
    }
    return borrador.asientosIds.filter(
      id =>
        Number.isSafeInteger(id) &&
        id > 0
    );
  } catch {
    return [];
  }
}
function guardarBorrador(
  viajeId: string,
  ids: number[]
) {
  try {
    const borrador: Borrador = {
      viajeId: Number(viajeId),
      asientosIds: ids,
      actualizado: Date.now()
    };
    sessionStorage.setItem(
      claveBorrador(viajeId),
      JSON.stringify(borrador)
    );
  } catch {
    // Si el almacenamiento está bloqueado,
    // la selección sigue funcionando en memoria.
  }
}
function nuevoPasajero(
  asientoId: number
): PasajeroFormulario {
  return {
    asientoId,
    tipoDocumento: 'DNI',
    numeroDocumento: '',
    nombres: '',
    apellidos: '',
    fechaNacimiento: '',
    autorizaConsulta: false
  };
}
function fechaLocalHoy() {
  const ahora = new Date();
  const anio = ahora.getFullYear();
  const mes = String(
    ahora.getMonth() + 1
  ).padStart(2, '0');
  const dia = String(
    ahora.getDate()
  ).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}
// =====================================================
// POLÍTICAS VIGENTES: NORMALIZAR RESPUESTA DEL BACKEND
// No se inventan textos ni versiones.
// =====================================================
function esObjeto(valor: unknown): valor is ObjetoApi {
  return typeof valor === 'object' && valor !== null &&
    !Array.isArray(valor);
}
function textoCampo(obj: ObjetoApi, claves: string[]): string {
  for (const clave of claves) {
    const valor = obj[clave];
    if (typeof valor === 'string' && valor.trim()) {
      return valor.trim();
    }
    if (typeof valor === 'number' && Number.isFinite(valor)) {
      return String(valor);
    }
  }
  return '';
}
function normalizarPoliticas(respuesta: unknown): PoliticaVigente[] {
  let filas: unknown[] = [];
  if (Array.isArray(respuesta)) {
    filas = respuesta;
  } else if (esObjeto(respuesta)) {
    if (Array.isArray(respuesta.politicas)) {
      filas = respuesta.politicas;
    } else if (Array.isArray(respuesta.data)) {
      filas = respuesta.data;
    } else if (esObjeto(respuesta.politica)) {
      filas = [respuesta.politica];
    } else if (esObjeto(respuesta.data)) {
      filas = [respuesta.data];
    } else {
      filas = [respuesta];
    }
  }
  return filas.map((fila, indice) => {
    if (!esObjeto(fila)) {
      throw new Error('Formato de políticas no reconocido.');
    }
    const id = textoCampo(fila, [
      'PoliticaID', 'PoliticaServicioID', 'ID', 'id', 'politicaId'
    ]);
    const titulo = textoCampo(fila, [
      'Titulo', 'Nombre', 'titulo', 'nombre'
    ]);
    const version = textoCampo(fila, [
      'Version', 'NumeroVersion', 'version', 'numeroVersion'
    ]);
    const contenido = textoCampo(fila, [
      'Contenido', 'Texto', 'Descripcion', 'contenido', 'texto',
      'descripcion'
    ]);
    if (!id || !version || !titulo || !contenido) {
      throw new Error(
        `La política ${indice + 1} no incluye identificador, ` +
        'versión, título y contenido. Revisa la respuesta del backend.'
      );
    }
    return { id, titulo, version, contenido };
  });
}
// =====================================================
// ESTILOS LOCALES PARA LOS FORMULARIOS
// =====================================================
const estiloCampo: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 7,
  fontSize: 13,
  fontWeight: 600,
  color: '#344a60'
};
const estiloInput: CSSProperties = {
  width: '100%',
  minWidth: 0,
  padding: '12px 13px',
  border: '1px solid #d7e0e9',
  borderRadius: 8,
  background: '#fff',
  color: '#18324c',
  fontSize: 13
};
const estiloConsulta: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  padding: '11px 14px',
  borderRadius: 8,
  background: '#205d8d',
  color: '#fff',
  fontSize: 12,
  fontWeight: 700,
  whiteSpace: 'nowrap'
};
// =====================================================
// COMPONENTE PRINCIPAL
// =====================================================
export default function AsientosPublicos() {
  const { viajeId } = useParams();
  // ===================================================
  // ESTADOS DE VIAJE Y ASIENTOS
  // ===================================================
  const [datos, setDatos] =
    useState<Datos | null>(null);
  const [seleccionados, setSeleccionados] =
    useState<number[]>([]);
  const [nivel, setNivel] =
    useState(1);
  const [cargando, setCargando] =
    useState(true);
  const [error, setError] =
    useState('');
  const [aviso, setAviso] =
    useState('');
  const [version, setVersion] =
    useState(0);
  const [paso, setPaso] =
    useState<Paso>('asientos');
  // ===================================================
  // ESTADOS DE AUTENTICACIÓN
  // ===================================================
  const [usuario, setUsuario] =
    useState<UsuarioSesion | null>(null);
  const [comprobandoSesion, setComprobandoSesion] =
    useState(true);
  const [mostrarAcceso, setMostrarAcceso] =
    useState(false);
  const [
    validandoContinuacion,
    setValidandoContinuacion
  ] = useState(false);
  // ===================================================
  // ESTADOS DE PASAJEROS
  // ===================================================
  const [pasajeros, setPasajeros] =
    useState<PasajeroFormulario[]>([]);
  const [datosRevisados, setDatosRevisados] =
    useState(false);
  const [politicas, setPoliticas] =
    useState<PoliticaVigente[]>([]);
  const [cargandoPoliticas, setCargandoPoliticas] =
    useState(false);
  const [errorPoliticas, setErrorPoliticas] =
    useState('');
  const [aceptaPoliticas, setAceptaPoliticas] =
    useState(false);
  const [aceptacionRevisada, setAceptacionRevisada] =
    useState(false);
  const [confirmandoReserva, setConfirmandoReserva] = useState(false);
  const [reservaConfirmada, setReservaConfirmada] =
    useState<ReservaConfirmada | null>(null);
  // ===================================================
  // NUEVO — CONSULTA DE DNI
  // ===================================================
  const [consultandoAsiento, setConsultandoAsiento] =
    useState<number | null>(null);
  const [mensajesDni, setMensajesDni] =
    useState<Record<number, string>>({});
  // ===================================================
  // CARGAR VIAJE Y ASIENTOS
  // ===================================================
  useEffect(() => {
    const controller = new AbortController();
    async function cargar() {
      setCargando(true);
      setError('');
      if (
        !viajeId ||
        !/^[1-9]\d*$/.test(viajeId) ||
        !Number.isSafeInteger(Number(viajeId))
      ) {
        setDatos(null);
        setError(
          'El identificador del viaje no es válido.'
        );
        setCargando(false);
        return;
      }
      try {
        const resultado = await consultarAsientosPublicos<Partial<Datos>>(viajeId, {
          signal: controller.signal,
          formatoError: c => (typeof c.error === 'string' && c.error) ||
            'No se pudo obtener la disponibilidad.'
        });
        if (
          !resultado.viaje ||
          !Array.isArray(resultado.asientos)
        ) {
          throw new Error(
            'Respuesta inválida del servidor.'
          );
        }
        const nuevos = resultado as Datos;
        setDatos(nuevos);
        // Restaurar solamente asientos aún libres.
        const guardados =
          leerBorrador(viajeId);
        const libres = nuevos.asientos
          .filter(a => !a.Ocupado)
          .map(a => Number(a.AsientoID));
        const restaurados = guardados.filter(
          id => libres.includes(id)
        );
        setSeleccionados(restaurados);
        guardarBorrador(
          viajeId,
          restaurados
        );
        if (restaurados.length !== guardados.length) {
          setAviso(
            'Algunos asientos guardados ya no están ' +
            'disponibles. Revisa tu selección.'
          );
          setPaso('asientos');
          setDatosRevisados(false);
        }
        const nivelesDisponibles = [
          ...new Set(
            nuevos.asientos.map(
              a => Number(a.Nivel)
            )
          )
        ].sort((a, b) => a - b);
        setNivel(anterior =>
          nivelesDisponibles.includes(anterior)
            ? anterior
            : nivelesDisponibles[0] ?? 1
        );
      } catch (e) {
        if (controller.signal.aborted) return;
        setDatos(null);
        setError(
          e instanceof Error
            ? e.message
            : 'No se pudieron cargar los asientos.'
        );
      } finally {
        if (!controller.signal.aborted) {
          setCargando(false);
        }
      }
    }
    void cargar();
    return () => controller.abort();
  }, [viajeId, version]);
  // ===================================================
  // VERIFICAR LA SESIÓN JWT
  // ===================================================
  useEffect(() => {
    const token = leerToken();
    if (!token) {
      setUsuario(null);
      setComprobandoSesion(false);
      return;
    }
    const tokenSesion: string = token;
    const controller = new AbortController();
    async function verificar() {
      setComprobandoSesion(true);
      try {
        const resultado = await obtenerSesion<{ usuario?: unknown }>(tokenSesion, {
          signal: controller.signal,
          cache: 'no-store'
        });
        if (!resultado.usuario) {
          throw new Error('Sesión no válida.');
        }
        if (!controller.signal.aborted) {
          setUsuario(
            resultado.usuario as UsuarioSesion
          );
        }
      } catch {
        if (!controller.signal.aborted) {
          setUsuario(null);
        }
      } finally {
        if (!controller.signal.aborted) {
          setComprobandoSesion(false);
        }
      }
    }
    void verificar();
    return () => controller.abort();
  }, []);
  // ===================================================
  // CONSULTAR POLÍTICAS VIGENTES AL LLEGAR AL PASO 3
  // ===================================================
  useEffect(() => {
    if (paso !== 'politicas') return;
    const controller = new AbortController();
    async function cargarPoliticas() {
      setCargandoPoliticas(true);
      setErrorPoliticas('');
      setAceptaPoliticas(false);
      setAceptacionRevisada(false);
      setPoliticas([]);
      try {
        const token = leerToken();
        if (!token) {
          throw new Error('Inicia sesión como cliente para consultar las políticas.');
        }
        // Reservas entrega exactamente las cinco políticas obligatorias.
        const resultado = await politicasVigentesReserva<unknown>(token, {
          cache: 'no-store',
          signal: controller.signal,
          formatoError: c => typeof c.error === 'string'
            ? c.error
            : 'No fue posible obtener las políticas vigentes.'
        });
        const vigentes = normalizarPoliticas(resultado);
        if (vigentes.length !== 5) {
          throw new Error('Deben existir cinco políticas obligatorias vigentes.');
        }
        if (!controller.signal.aborted) setPoliticas(vigentes);
      } catch (e) {
        if (!controller.signal.aborted) {
          setErrorPoliticas(e instanceof Error ? e.message :
            'No fue posible consultar las políticas.');
        }
      } finally {
        if (!controller.signal.aborted) setCargandoPoliticas(false);
      }
    }
    void cargarPoliticas();
    return () => controller.abort();
  }, [paso]);
  // ===================================================
  // SELECCIÓN DE ASIENTOS
  // ===================================================
  function seleccionar(asiento: Asiento) {
    if (
      asiento.Ocupado ||
      cargando ||
      paso !== 'asientos'
    ) {
      return;
    }
    setAviso('');
    setDatosRevisados(false);
    setAceptaPoliticas(false);
    setAceptacionRevisada(false);
    setSeleccionados(actuales => {
      const nuevos = actuales.includes(
        asiento.AsientoID
      )
        ? actuales.filter(
            id => id !== asiento.AsientoID
          )
        : [...actuales, asiento.AsientoID];
      if (viajeId) {
        guardarBorrador(viajeId, nuevos);
      }
      return nuevos;
    });
  }
  // ===================================================
  // NIVELES Y ASIENTOS
  // ===================================================
  const niveles = datos
    ? [
        ...new Set(
          datos.asientos.map(
            a => Number(a.Nivel)
          )
        )
      ].sort((a, b) => a - b)
    : [];
  const asientosNivel = datos
    ? datos.asientos
        .filter(
          a => Number(a.Nivel) === nivel
        )
        .sort(
          (a, b) =>
            Number(a.Numero) -
            Number(b.Numero)
        )
    : [];
  // Distribución visual referencial 2+2.
  const filas: (Asiento | null)[][] = [];
  for (
    let i = 0;
    i < asientosNivel.length;
    i += 4
  ) {
    const grupo =
      asientosNivel.slice(i, i + 4);
    filas.push([
      grupo[0] ?? null,
      grupo[1] ?? null,
      null,
      grupo[2] ?? null,
      grupo[3] ?? null
    ]);
  }
  const elegidos = datos
    ? datos.asientos
        .filter(a =>
          seleccionados.includes(a.AsientoID)
        )
        .sort(
          (a, b) =>
            Number(a.Nivel) -
              Number(b.Nivel) ||
            Number(a.Numero) -
              Number(b.Numero)
        )
    : [];
  const total = datos
    ? elegidos.length *
      Number(datos.viaje.Tarifa)
    : 0;
  // ===================================================
  // RENDERIZAR BOTÓN DE ASIENTO
  // ===================================================
  function botonAsiento(
    asiento: Asiento | null,
    indice: number
  ) {
    if (!asiento) {
      return (
        <div
          key={`pasillo-${indice}`}
          className="siget-pasillo"
          aria-hidden="true"
        />
      );
    }
    const elegido =
      seleccionados.includes(asiento.AsientoID);
    const clase = asiento.Ocupado
      ? 'ocupado'
      : elegido
        ? 'elegido'
        : 'libre';
    const estado = asiento.Ocupado
      ? 'ocupado'
      : elegido
        ? 'seleccionado'
        : 'libre';
    return (
      <button
        key={asiento.AsientoID}
        type="button"
        className={`siget-asiento ${clase}`}
        disabled={
          asiento.Ocupado ||
          cargando
        }
        onClick={() => seleccionar(asiento)}
        aria-label={
          `Asiento ${asiento.Numero}, ${estado}`
        }
        aria-pressed={elegido}
        title={
          `Asiento ${asiento.Numero} — ${estado}`
        }
      >
        <Armchair
          size={23}
          strokeWidth={1.8}
        />
        <strong>
          {asiento.Numero}
        </strong>
      </button>
    );
  }
  // ===================================================
  // REVALIDAR DISPONIBILIDAD
  // ===================================================
  async function comprobarAsientos(): Promise<boolean> {
    if (
      !viajeId ||
      seleccionados.length === 0
    ) {
      return false;
    }
    try {
      const resultado = await consultarAsientosPublicos<Partial<Datos>>(viajeId, {
        formatoError: c => (typeof c.error === 'string' && c.error) ||
          'No se pudo comprobar la disponibilidad.'
      });
      if (
        !resultado.viaje ||
        !Array.isArray(resultado.asientos)
      ) {
        throw new Error(
          'La disponibilidad recibida no es válida.'
        );
      }
      const actualizados =
        resultado as Datos;
      setDatos(actualizados);
      const libres = new Set(
        actualizados.asientos
          .filter(a => !a.Ocupado)
          .map(a => Number(a.AsientoID))
      );
      const vigentes = seleccionados.filter(
        id => libres.has(id)
      );
      if (
        vigentes.length !== seleccionados.length
      ) {
        setSeleccionados(vigentes);
        guardarBorrador(
          viajeId,
          vigentes
        );
        setAviso(
          'La disponibilidad cambió. ' +
          'Algunos asientos ya están ocupados. ' +
          'Revisa nuevamente tu elección.'
        );
        setPaso('asientos');
        setDatosRevisados(false);
        return false;
      }
      return true;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Error al verificar los asientos.'
      );
      return false;
    }
  }
  // ===================================================
  // CONTINUAR CON PASAJEROS
  // ===================================================
  async function continuar() {
    if (
      cargando ||
      comprobandoSesion ||
      validandoContinuacion ||
      seleccionados.length === 0
    ) {
      return;
    }
    setError('');
    setAviso('');
    if (!usuario) {
      if (viajeId) {
        guardarBorrador(
          viajeId,
          seleccionados
        );
        try {
          sessionStorage.setItem(
            CLAVE_RETORNO,
            `/viajes/publico/${viajeId}/asientos`
          );
        } catch {
          // No impedir el acceso al login.
        }
      }
      setMostrarAcceso(true);
      return;
    }
    if (
      usuario.Rol !== 'CLIENTE' ||
      usuario.Estado !== 'ACTIVO'
    ) {
      setAviso(
        'Para realizar una reserva pública ' +
        'debes iniciar sesión con una cuenta ' +
        'de cliente activa.'
      );
      return;
    }
    setValidandoContinuacion(true);
    try {
      const disponibles =
        await comprobarAsientos();
      if (!disponibles) return;
      setPasajeros(actuales =>
        elegidos.map(asiento =>
          actuales.find(
            p =>
              p.asientoId === asiento.AsientoID
          ) ??
          nuevoPasajero(asiento.AsientoID)
        )
      );
      setPaso('pasajeros');
      setDatosRevisados(false);
      setMostrarAcceso(false);
    } finally {
      setValidandoContinuacion(false);
    }
  }
  // ===================================================
  // ACTUALIZAR DATOS DE UN PASAJERO
  // ===================================================
  function actualizarPasajero(
    asientoId: number,
    campo: keyof Omit<
      PasajeroFormulario,
      'asientoId'
    >,
    valor: string | boolean
  ) {
    setDatosRevisados(false);
    setAceptaPoliticas(false);
    setAceptacionRevisada(false);
    // Evita mostrar un resultado de consulta anterior.
    setMensajesDni(actuales => ({
      ...actuales,
      [asientoId]: ''
    }));
    setPasajeros(actuales =>
      actuales.map(p => {
        if (p.asientoId !== asientoId) {
          return p;
        }
        // Al cambiar documento o tipo,
        // invalidar la autorización anterior.
        if (
          campo === 'numeroDocumento' ||
          campo === 'tipoDocumento'
        ) {
          return {
            ...p,
            [campo]: valor,
            autorizaConsulta: false
          };
        }
        return {
          ...p,
          [campo]: valor
        };
      })
    );
  }
  // ===================================================
  // NUEVO — CONSULTAR DNI
  //
  // Solo permite:
  // - Usuarios CLIENTE activos.
  // - DNI de 8 dígitos.
  // - Autorización confirmada.
  //
  // El backend limita las consultas.
  // ===================================================
  async function consultarDni(
    asientoId: number
  ) {
    if (consultandoAsiento !== null) {
      return;
    }
    const pasajero = pasajeros.find(
      p => p.asientoId === asientoId
    );
    if (!pasajero) return;
    setMensajesDni(actuales => ({
      ...actuales,
      [asientoId]: ''
    }));
    if (
      !usuario ||
      usuario.Rol !== 'CLIENTE' ||
      usuario.Estado !== 'ACTIVO'
    ) {
      setMensajesDni(actuales => ({
        ...actuales,
        [asientoId]:
          'Necesitas una sesión de cliente activa.'
      }));
      return;
    }
    if (pasajero.tipoDocumento !== 'DNI') {
      setMensajesDni(actuales => ({
        ...actuales,
        [asientoId]:
          'La consulta automática está disponible ' +
          'solamente para DNI.'
      }));
      return;
    }
    const dni =
      pasajero.numeroDocumento.trim();
    if (!/^\d{8}$/.test(dni)) {
      setMensajesDni(actuales => ({
        ...actuales,
        [asientoId]:
          'El DNI debe contener exactamente 8 dígitos.'
      }));
      return;
    }
    if (!pasajero.autorizaConsulta) {
      setMensajesDni(actuales => ({
        ...actuales,
        [asientoId]:
          'Confirma primero que tienes autorización ' +
          'del titular para consultar su DNI.'
      }));
      return;
    }
    const token = leerToken();
    if (!token) {
      setMensajesDni(actuales => ({
        ...actuales,
        [asientoId]:
          'Tu sesión no está disponible. ' +
          'Inicia sesión nuevamente.'
      }));
      return;
    }
    setConsultandoAsiento(asientoId);
    try {
      const resultado = await consultarDniCliente<Partial<RespuestaDni>>(
        token,
        dni,
        c => (typeof c.error === 'string' && c.error) ||
          'No se pudo consultar el documento.'
      );
      if (
        !resultado.encontrado ||
        !resultado.nombres ||
        !resultado.apellidos
      ) {
        setMensajesDni(actuales => ({
          ...actuales,
          [asientoId]:
            'No se encontraron datos. ' +
            'Puedes completar los campos manualmente.'
        }));
        return;
      }
      // Evitar colocar el resultado de un DNI
      // sobre otro documento si fue cambiado
      // durante la consulta.
      setPasajeros(actuales =>
        actuales.map(p => {
          if (
            p.asientoId !== asientoId ||
            p.tipoDocumento !== 'DNI' ||
            p.numeroDocumento.trim() !== dni
          ) {
            return p;
          }
          return {
            ...p,
            nombres: resultado.nombres!,
            apellidos: resultado.apellidos!
          };
        })
      );
      setDatosRevisados(false);
      setMensajesDni(actuales => ({
        ...actuales,
        [asientoId]:
          'Consulta completada. Verifica que ' +
          'los nombres y apellidos sean correctos.'
      }));
    } catch (e) {
      setMensajesDni(actuales => ({
        ...actuales,
        [asientoId]:
          e instanceof Error
            ? e.message
            : 'No fue posible consultar el DNI. ' +
              'Puedes ingresar los datos manualmente.'
      }));
    } finally {
      setConsultandoAsiento(null);
    }
  }
  // ===================================================
  // VALIDAR PASAJEROS
  //
  // Esta etapa todavía NO guarda datos.
  // ===================================================
  async function revisarPasajeros(
    e: FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();
    setError('');
    setAviso('');
    setDatosRevisados(false);
    if (
      !usuario ||
      usuario.Rol !== 'CLIENTE' ||
      usuario.Estado !== 'ACTIVO'
    ) {
      setError(
        'Debes iniciar sesión como cliente.'
      );
      setPaso('asientos');
      return;
    }
    if (
      pasajeros.length === 0 ||
      pasajeros.length !== elegidos.length
    ) {
      setError(
        'Registra un pasajero por cada asiento.'
      );
      return;
    }
    const documentos = new Set<string>();
    for (const pasajero of pasajeros) {
      const documento =
        pasajero.numeroDocumento
          .trim()
          .toUpperCase();
      const nombres =
        pasajero.nombres.trim();
      const apellidos =
        pasajero.apellidos.trim();
      if (
        !documento ||
        !nombres ||
        !apellidos
      ) {
        setError(
          'Completa los datos obligatorios ' +
          'de todos los pasajeros.'
        );
        return;
      }
      if (
        nombres.length < 2 ||
        apellidos.length < 2 ||
        nombres.length > 100 ||
        apellidos.length > 120
      ) {
        setError(
          'Verifica los nombres y apellidos ' +
          'de los pasajeros.'
        );
        return;
      }
      if (
        pasajero.tipoDocumento === 'DNI' &&
        !/^\d{8}$/.test(documento)
      ) {
        setError(
          'El DNI debe contener exactamente 8 dígitos.'
        );
        return;
      }
      if (
        pasajero.tipoDocumento === 'CE' &&
        !/^[A-Z0-9]{9,12}$/.test(documento)
      ) {
        setError(
          'El carné de extranjería debe contener ' +
          'entre 9 y 12 caracteres alfanuméricos.'
        );
        return;
      }
      if (
        pasajero.tipoDocumento === 'PASAPORTE' &&
        !/^[A-Z0-9]{6,20}$/.test(documento)
      ) {
        setError(
          'El pasaporte debe contener entre ' +
          '6 y 20 caracteres alfanuméricos.'
        );
        return;
      }
      const clave =
        `${pasajero.tipoDocumento}:${documento}`;
      if (documentos.has(clave)) {
        setError(
          'Un mismo documento no puede ocupar ' +
          'dos asientos en este viaje.'
        );
        return;
      }
      documentos.add(clave);
      if (
        pasajero.fechaNacimiento &&
        (
          !/^\d{4}-\d{2}-\d{2}$/.test(
            pasajero.fechaNacimiento
          ) ||
          pasajero.fechaNacimiento > fechaLocalHoy()
        )
      ) {
        setError(
          'Verifica la fecha de nacimiento.'
        );
        return;
      }
    }
    setValidandoContinuacion(true);
    try {
      const disponibles =
        await comprobarAsientos();
      if (!disponibles) return;
      setDatosRevisados(true);
      setPaso('politicas');
    } finally {
      setValidandoContinuacion(false);
    }
  }
  // ===================================================
  // CONFIRMACIÓN DE RESERVA Y ACEPTACIÓN PERSISTENTE
  // POST /api/reservas verifica nuevamente políticas, viaje,
  // pasajeros y disponibilidad dentro de una transacción SQL.
  // ===================================================
  async function revisarAceptacion() {
    if (confirmandoReserva || validandoContinuacion) return;
    setErrorPoliticas('');
    if (!usuario || usuario.Rol !== 'CLIENTE' || usuario.Estado !== 'ACTIVO') {
      setErrorPoliticas('Debes tener una sesión de cliente activa.');
      return;
    }
    if (!datosRevisados || !aceptaPoliticas || politicas.length !== 5) {
      setErrorPoliticas('Debes revisar y aceptar las cinco políticas vigentes.');
      return;
    }
    if (!viajeId || !datos || pasajeros.length !== elegidos.length || !elegidos.length) {
      setErrorPoliticas('La selección de viaje o los pasajeros están incompletos.');
      return;
    }
    const politicaIds = politicas.map(p => Number(p.id));
    if (politicaIds.some(id => !Number.isSafeInteger(id) || id <= 0) ||
        new Set(politicaIds).size !== 5) {
      setErrorPoliticas('Los identificadores de políticas no son válidos.');
      return;
    }
    const token = leerToken();
    if (!token) {
      setErrorPoliticas('Tu sesión caducó. Vuelve a iniciar sesión.');
      return;
    }
    setValidandoContinuacion(true);
    try {
      if (!(await comprobarAsientos())) {
        setAceptaPoliticas(false);
        setAceptacionRevisada(false);
        return;
      }
      setConfirmandoReserva(true);
      const resultado = await crearReserva<unknown>(token, {
          viajeId: Number(viajeId),
          politicaIds,
          aceptacionConfirmada: true,
          items: pasajeros.map(p => ({
            asientoId: p.asientoId,
            tipoDocumento: p.tipoDocumento,
            numeroDocumento: p.numeroDocumento.trim().toUpperCase(),
            nombres: p.nombres.trim(),
            apellidos: p.apellidos.trim(),
            fechaNacimiento: p.fechaNacimiento || null
        }))
      }, (c, status) => typeof c.error === 'string'
        ? c.error
        : `No se pudo confirmar la reserva (HTTP ${status}).`, 'no-store');
      if (!esObjeto(resultado) || typeof resultado.Codigo !== 'string' ||
          !Number.isSafeInteger(Number(resultado.ReservaID)) ||
          Number(resultado.ReservaID) <= 0) {
        throw new Error(
          'El servidor respondió, pero no devolvió una confirmación válida. ' +
          'Verifica tus reservas antes de reintentar para evitar duplicados.'
        );
      }
      setReservaConfirmada({
        ReservaID: Number(resultado.ReservaID),
        Codigo: resultado.Codigo,
        Total: Number(resultado.Total),
        CantidadAsientos: Number(resultado.CantidadAsientos),
        TotalAceptaciones: Number(resultado.TotalAceptaciones)
      });
      setAceptacionRevisada(true);
      setPaso('confirmada');
      try {
        sessionStorage.removeItem(claveBorrador(viajeId));
        sessionStorage.removeItem(CLAVE_RETORNO);
      } catch {
        // La reserva ya fue confirmada en el servidor.
      }
    } catch (e) {
      setErrorPoliticas(
        e instanceof Error ? e.message : 'No se pudo confirmar la reserva.'
      );
    } finally {
      setConfirmandoReserva(false);
      setValidandoContinuacion(false);
    }
  }
  // ===================================================
  // INTERFAZ
  // ===================================================
  return (
    <div className="siget-reserva-publica">
      {/* =========================================
          CABECERA
          ========================================= */}
      <header className="siget-reserva-header">
        <div className="siget-reserva-header-inner">
          <div className="siget-marca">
            <div className="siget-marca-icono">
              <BusFront size={26} />
            </div>
            <div>
              <strong>SIGET-VÍA</strong>
              <span>Transportes Vía S.A.C.</span>
            </div>
          </div>
          <Link
            to="/viajes/publico"
            className="siget-volver"
          >
            <ArrowLeft size={17} />
            Volver a viajes
          </Link>
        </div>
      </header>
      <main className="siget-reserva-main">
        {/* =======================================
            INDICADOR DEL PROCESO
            ======================================= */}
        <div className="siget-pasos">
          <span className="completo">
            <CheckCircle2 size={17} />
            Buscar viaje
          </span>
          <span
            className={
              paso === 'asientos'
                ? 'actual'
                : 'completo'
            }
          >
            <Armchair size={17} />
            Elegir asiento
          </span>
          <span
            className={
              paso === 'pasajeros'
                ? 'actual'
                : ['politicas', 'confirmada'].includes(paso) ? 'completo' : ''
            }
          >
            <Ticket size={17} />
            Datos de pasajeros
          </span>
          <span className={paso === 'politicas' ? 'actual' : paso === 'confirmada' ? 'completo' : ''}>
            <FileText size={17} />
            Políticas del servicio
          </span>
          {paso === 'confirmada' && (
            <span className="actual"><CheckCircle2 size={17} /> Reserva confirmada</span>
          )}
        </div>
        <div className="siget-titulo-pagina">
          <h1>
            {paso === 'asientos'
              ? 'Elige tu asiento ideal'
              : paso === 'pasajeros'
                ? 'Datos de tus pasajeros'
                : paso === 'politicas'
                  ? 'Revisa las políticas del servicio'
                  : 'Tu reserva ha sido registrada'}
          </h1>
          <p>
            {paso === 'asientos'
              ? 'Revisa la distribución del bus y selecciona los asientos disponibles.'
              : paso === 'pasajeros'
                ? 'Completa los datos de cada pasajero según los asientos seleccionados.'
                : paso === 'politicas'
                  ? 'Lee la versión vigente de las políticas antes de continuar.'
                  : 'Conserva el código de tu reserva para futuras consultas.'}
          </p>
        </div>
        {/* =======================================
            MENSAJES GENERALES
            ======================================= */}
        {error && (
          <div
            className="siget-error"
            role="alert"
          >
            <Info size={20} />
            {error}
          </div>
        )}
        {aviso && (
          <div
            role="status"
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              padding: 15,
              marginBottom: 18,
              background: '#fff8e8',
              border: '1px solid #f4d8a2',
              borderRadius: 9,
              color: '#805a18',
              fontSize: 13
            }}
          >
            <Info size={19} />
            {aviso}
          </div>
        )}
        {cargando && (
          <div className="siget-cargando">
            <RefreshCw size={25} />
            Consultando disponibilidad...
          </div>
        )}
        {!cargando && datos && (
          <>
            {/* ===================================
                DATOS DEL VIAJE
                =================================== */}
            <section className="siget-viaje-banner">
              <div className="siget-viaje-banner-principal">
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  flexWrap: 'wrap',
                  marginBottom: 12
                }}>
                  <span className="siget-etiqueta">
                    <BusFront size={15} />
                    VIAJE PROGRAMADO
                  </span>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    border: '1px solid #b7d9c8',
                    borderRadius: 8,
                    padding: '6px 11px',
                    background: '#eaf7f0',
                    color: '#195d43',
                    fontWeight: 700,
                    fontSize: 12
                  }}>
                    <ShieldCheck size={15} />
                    Servicio {nombreServicio(datos.viaje.TipoServicio)}
                  </span>
                </div>
                <h2>
                  {datos.viaje.Origen}
                  <ArrowRight size={22} />
                  {datos.viaje.Destino}
                </h2>
                {(datos.viaje.TerminalOrigen || datos.viaje.TerminalDestino) && (
                  <p style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', margin: '4px 0 8px', fontSize: 13, color: '#4b5d70' }}>
                    <span>
                      <MapPin size={14} style={{ verticalAlign: 'middle' }} />{' '}
                      Embarque: <strong>{datos.viaje.TerminalOrigen || datos.viaje.Origen}</strong>
                      {datos.viaje.DireccionOrigen ? ` · ${datos.viaje.DireccionOrigen}` : ''}
                    </span>
                    <span>
                      Llegada: <strong>{datos.viaje.TerminalDestino || datos.viaje.Destino}</strong>
                      {datos.viaje.DireccionDestino ? ` · ${datos.viaje.DireccionDestino}` : ''}
                    </span>
                  </p>
                )}
                {(datos.viaje.Modelo || datos.viaje.Placa) && (
                  <p style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    flexWrap: 'wrap',
                    margin: '7px 0 12px',
                    fontSize: 13
                  }}>
                    <BusFront size={16} />
                    Bus {datos.viaje.Modelo || 'Sin modelo'}
                    {datos.viaje.Placa ? ` · ${datos.viaje.Placa}` : ''}
                  </p>
                )}
                <div className="siget-viaje-meta">
                  <span>
                    <CalendarDays size={16} />
                    {fechaHora(datos.viaje.Salida)}
                  </span>
                  <span>
                    <Clock3 size={16} />
                    Llegada:{' '}
                    {fechaHora(
                      datos.viaje.LlegadaEstimada
                    )}
                  </span>
                </div>
              </div>
              <div className="siget-viaje-banner-precio">
                <small>Precio por asiento</small>
                <strong>
                  {moneda(
                    Number(datos.viaje.Tarifa)
                  )}
                </strong>
                <span>
                  Viaje #{datos.viaje.ViajeID}
                </span>
              </div>
            </section>
            {/* ===================================
                PASO 1 — SELECCIÓN DE ASIENTOS
                =================================== */}
            {paso === 'asientos' && (
              <div className="siget-reserva-layout">
                {/* PLANO DEL BUS */}
                <section className="siget-plano-card">
                  <div className="siget-panel-head">
                    <div>
                      <h2>
                        Selecciona tus asientos
                      </h2>
                      <p>
                        Elige el piso y pulsa sobre
                        un asiento disponible.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="siget-actualizar"
                      onClick={() =>
                        setVersion(v => v + 1)
                      }
                    >
                      <RefreshCw size={16} />
                      Actualizar
                    </button>
                  </div>
                  {/* PISOS */}
                  <div className="siget-niveles">
                    {niveles.map(n => (
                      <button
                        type="button"
                        key={n}
                        className={
                          nivel === n
                            ? 'activo'
                            : ''
                        }
                        onClick={() =>
                          setNivel(n)
                        }
                      >
                        <BusFront size={19} />
                        <span>
                          {nombrePiso(n)}
                        </span>
                        <small>
                          {
                            datos.asientos.filter(
                              a =>
                                Number(a.Nivel) === n &&
                                !a.Ocupado
                            ).length
                          } libres
                        </small>
                      </button>
                    ))}
                  </div>
                  {/* LEYENDA */}
                  <div className="siget-leyenda">
                    <span>
                      <i className="siget-color libre" />
                      Disponible
                    </span>
                    <span>
                      <i className="siget-color ocupado" />
                      Ocupado
                    </span>
                    <span>
                      <i className="siget-color elegido" />
                      Seleccionado
                    </span>
                  </div>
                  {/* BUS */}
                  <div className="siget-bus-area">
                    <div className="siget-bus">
                      <div className="siget-bus-frente">
                        <span>
                          PARTE DELANTERA
                        </span>
                        <BusFront size={25} />
                      </div>
                      {nivel === 1 && (
                        <div className="siget-conductor">
                          <span>
                            <BusFront size={17} />
                            Cabina / conductor
                          </span>
                        </div>
                      )}
                      <div className="siget-bus-interior">
                        {filas.map((fila, i) => (
                          <div
                            className="siget-fila"
                            key={`${nivel}-${i}`}
                          >
                            {fila.map(
                              (asiento, j) =>
                                botonAsiento(
                                  asiento,
                                  i * 5 + j
                                )
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="siget-bus-trasera">
                        PARTE POSTERIOR
                      </div>
                    </div>
                  </div>
                  <p className="siget-plano-nota">
                    <Info size={15} />
                    Distribución visual referencial.
                    Numeración, piso y ocupación
                    consultados desde SQL Server.
                  </p>
                </section>
                {/* RESUMEN LATERAL */}
                <aside className="siget-resumen-card">
                  <div className="siget-resumen-head">
                    <Ticket size={21} />
                    <h2>
                      Resumen de tu viaje
                    </h2>
                  </div>
                  <div className="siget-resumen-ruta">
                    <MapPin size={18} />
                    <div>
                      <strong>
                        {datos.viaje.Origen}
                        {' → '}
                        {datos.viaje.Destino}
                      </strong>
                      <small>
                        {fechaHora(
                          datos.viaje.Salida
                        )}
                      </small>
                      {datos.viaje.TerminalOrigen && (
                        <small>Embarque: {datos.viaje.TerminalOrigen}</small>
                      )}
                    </div>
                  </div>
                  <div className="siget-disponibilidad">
                    <strong>
                      {datos.asientosDisponibles}
                    </strong>
                    <span>
                      asientos disponibles de{' '}
                      {datos.totalAsientos}
                    </span>
                  </div>
                  <div style={{
                    padding: '12px 14px',
                    marginBottom: 14,
                    border: '1px solid #d7e5ee',
                    background: '#f6f9fc',
                    borderRadius: 9,
                    fontSize: 12,
                    color: '#34556f'
                  }}>
                    <strong>
                      Servicio {nombreServicio(datos.viaje.TipoServicio)}
                    </strong>
                    <div style={{ marginTop: 8 }}>
                      {niveles.map(n => {
                        const asientosPiso = datos.asientos.filter(
                          a => Number(a.Nivel) === n
                        );
                        const libresPiso = asientosPiso.filter(
                          a => !a.Ocupado
                        ).length;
                        return (
                          <div key={n} style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 10,
                            marginTop: 5
                          }}>
                            <span>{nombrePiso(n)}</span>
                            <span>
                              {libresPiso} libres ·{' '}
                              {asientosPiso.length - libresPiso} ocupados
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="siget-resumen-bloque">
                    <h3>
                      Asientos elegidos
                    </h3>
                    {elegidos.length === 0 ? (
                      <p className="siget-sin-asientos">
                        Aún no seleccionaste asientos.
                      </p>
                    ) : (
                      <div className="siget-chips">
                        {elegidos.map(a => (
                          <button
                            key={a.AsientoID}
                            type="button"
                            onClick={() =>
                              seleccionar(a)
                            }
                            title="Quitar selección"
                          >
                            <Armchair size={15} />
                            {a.Numero}
                            <span>×</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="siget-precios">
                    <div>
                      <span>
                        {elegidos.length} asiento(s)
                      </span>
                      <strong>
                        {moneda(total)}
                      </strong>
                    </div>
                    <div className="siget-precio-total">
                      <span>
                        Total estimado
                      </span>
                      <strong>
                        {moneda(total)}
                      </strong>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="siget-continuar"
                    disabled={
                      elegidos.length === 0 ||
                      cargando ||
                      comprobandoSesion ||
                      validandoContinuacion
                    }
                    onClick={() =>
                      void continuar()
                    }
                    style={
                      elegidos.length > 0
                        ? {
                            background: '#f28e30',
                            cursor: 'pointer'
                          }
                        : undefined
                    }
                  >
                    {validandoContinuacion
                      ? 'Verificando asientos...'
                      : comprobandoSesion
                        ? 'Validando sesión...'
                        : 'Continuar con pasajeros'}
                    <ArrowRight size={19} />
                  </button>
                  <p className="siget-resumen-aviso">
                    {usuario?.Rol === 'CLIENTE'
                      ? 'Tu sesión de cliente está activa.'
                      : 'Para reservar debes iniciar sesión con una cuenta de cliente.'}
                  </p>
                  <div className="siget-seguridad">
                    <ShieldCheck size={19} />
                    <span>
                      La selección no bloquea
                      los asientos ni confirma
                      una reserva. Se verificará
                      nuevamente la disponibilidad.
                    </span>
                  </div>
                </aside>
              </div>
            )}
            {/* ===================================
                PASO 2 — DATOS DE PASAJEROS
                =================================== */}
            {paso === 'pasajeros' && (
              <section className="siget-plano-card">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 15,
                    flexWrap: 'wrap',
                    marginBottom: 22
                  }}
                >
                  <div>
                    <h2>
                      Datos de los pasajeros
                    </h2>
                    <p
                      style={{
                        color: '#718398',
                        fontSize: 13
                      }}
                    >
                      Registra una persona por
                      cada asiento elegido.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="siget-actualizar"
                    onClick={() => {
                      setPaso('asientos');
                      setDatosRevisados(false);
                    }}
                  >
                    <ArrowLeft size={16} />
                    Cambiar asientos
                  </button>
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: 15,
                    background: '#edf8f2',
                    borderRadius: 9,
                    marginBottom: 24,
                    fontSize: 13,
                    color: '#247748'
                  }}
                >
                  <CheckCircle2 size={20} />
                  Cuenta de cliente autenticada.
                  Puedes completar los datos.
                </div>
                <form
                  onSubmit={e =>
                    void revisarPasajeros(e)
                  }
                >
                  <div
                    style={{
                      display: 'grid',
                      gap: 20
                    }}
                  >
                    {elegidos.map(
                      (asiento, indice) => {
                        const pasajero =
                          pasajeros.find(
                            p =>
                              p.asientoId ===
                              asiento.AsientoID
                          );
                        if (!pasajero) {
                          return null;
                        }
                        const consultando =
                          consultandoAsiento ===
                          asiento.AsientoID;
                        return (
                          <div
                            key={asiento.AsientoID}
                            style={{
                              padding: 22,
                              background: '#f9fbfd',
                              border:
                                '1px solid #e1e9f0',
                              borderRadius: 12
                            }}
                          >
                            {/* CABECERA DE PASAJERO */}
                            <div
                              style={{
                                display: 'flex',
                                justifyContent:
                                  'space-between',
                                alignItems: 'center',
                                gap: 12,
                                flexWrap: 'wrap',
                                marginBottom: 20
                              }}
                            >
                              <h3
                                style={{
                                  margin: 0,
                                  fontSize: 17
                                }}
                              >
                                <Users
                                  size={19}
                                  style={{
                                    verticalAlign:
                                      'middle',
                                    marginRight: 8
                                  }}
                                />
                                Pasajero {indice + 1}
                              </h3>
                              <span
                                style={{
                                  padding: '8px 12px',
                                  borderRadius: 8,
                                  background: '#e7f1fc',
                                  color: '#205e91',
                                  fontWeight: 700,
                                  fontSize: 12
                                }}
                              >
                                Asiento {asiento.Numero}
                                {' · '}
                                {nombrePiso(
                                  Number(asiento.Nivel)
                                )}
                              </span>
                            </div>
                            {/* CAMPOS */}
                            <div
                              style={{
                                display: 'grid',
                                gridTemplateColumns:
                                  'repeat(auto-fit, minmax(210px, 1fr))',
                                gap: 16
                              }}
                            >
                              {/* TIPO DE DOCUMENTO */}
                              <label style={estiloCampo}>
                                Tipo de documento *
                                <select
                                  value={
                                    pasajero.tipoDocumento
                                  }
                                  style={estiloInput}
                                  onChange={e =>
                                    actualizarPasajero(
                                      asiento.AsientoID,
                                      'tipoDocumento',
                                      e.target.value
                                    )
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
                              {/* NÚMERO DE DOCUMENTO */}
                              <label style={estiloCampo}>
                                Número de documento *
                                <input
                                  type="text"
                                  required
                                  inputMode={
                                    pasajero.tipoDocumento === 'DNI'
                                      ? 'numeric'
                                      : 'text'
                                  }
                                  maxLength={
                                    pasajero.tipoDocumento === 'DNI'
                                      ? 8
                                      : 20
                                  }
                                  style={estiloInput}
                                  placeholder="Número de documento"
                                  value={
                                    pasajero.numeroDocumento
                                  }
                                  onChange={e =>
                                    actualizarPasajero(
                                      asiento.AsientoID,
                                      'numeroDocumento',
                                      e.target.value
                                    )
                                  }
                                />
                              </label>
                              {/* CONSULTAR DNI */}
                              {pasajero.tipoDocumento ===
                                'DNI' && (
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'flex-end'
                                  }}
                                >
                                  <button
                                    type="button"
                                    style={{
                                      ...estiloConsulta,
                                      width: '100%',
                                      minHeight: 43,
                                      opacity:
                                        consultando ||
                                        consultandoAsiento !== null
                                          ? 0.7
                                          : 1
                                    }}
                                    disabled={
                                      consultandoAsiento !== null ||
                                      !/^\d{8}$/.test(
                                        pasajero.numeroDocumento.trim()
                                      ) ||
                                      !pasajero.autorizaConsulta
                                    }
                                    onClick={() =>
                                      void consultarDni(
                                        asiento.AsientoID
                                      )
                                    }
                                  >
                                    {consultando
                                      ? <RefreshCw size={17} />
                                      : <Search size={17} />}
                                    {consultando
                                      ? 'Consultando...'
                                      : 'Consultar DNI'}
                                  </button>
                                </div>
                              )}
                              {/* NOMBRES */}
                              <label style={estiloCampo}>
                                Nombres *
                                <input
                                  type="text"
                                  required
                                  minLength={2}
                                  maxLength={100}
                                  style={estiloInput}
                                  placeholder="Nombres del pasajero"
                                  value={
                                    pasajero.nombres
                                  }
                                  onChange={e =>
                                    actualizarPasajero(
                                      asiento.AsientoID,
                                      'nombres',
                                      e.target.value
                                    )
                                  }
                                />
                              </label>
                              {/* APELLIDOS */}
                              <label style={estiloCampo}>
                                Apellidos *
                                <input
                                  type="text"
                                  required
                                  minLength={2}
                                  maxLength={120}
                                  style={estiloInput}
                                  placeholder="Apellidos del pasajero"
                                  value={
                                    pasajero.apellidos
                                  }
                                  onChange={e =>
                                    actualizarPasajero(
                                      asiento.AsientoID,
                                      'apellidos',
                                      e.target.value
                                    )
                                  }
                                />
                              </label>
                              {/* FECHA DE NACIMIENTO */}
                              <label style={estiloCampo}>
                                Fecha de nacimiento
                                <input
                                  type="date"
                                  style={estiloInput}
                                  max={fechaLocalHoy()}
                                  value={
                                    pasajero.fechaNacimiento
                                  }
                                  onChange={e =>
                                    actualizarPasajero(
                                      asiento.AsientoID,
                                      'fechaNacimiento',
                                      e.target.value
                                    )
                                  }
                                />
                              </label>
                            </div>
                            {/* AUTORIZACIÓN DE CONSULTA */}
                            {pasajero.tipoDocumento ===
                              'DNI' && (
                              <label
                                style={{
                                  display: 'flex',
                                  gap: 10,
                                  alignItems: 'flex-start',
                                  marginTop: 17,
                                  padding: 12,
                                  background: '#edf5fc',
                                  borderRadius: 8,
                                  color: '#4a6981',
                                  fontSize: 12,
                                  lineHeight: 1.6,
                                  cursor: 'pointer'
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={
                                    pasajero.autorizaConsulta
                                  }
                                  onChange={e =>
                                    actualizarPasajero(
                                      asiento.AsientoID,
                                      'autorizaConsulta',
                                      e.target.checked
                                    )
                                  }
                                  style={{
                                    marginTop: 3,
                                    width: 16,
                                    height: 16,
                                    accentColor: '#205d8d',
                                    flexShrink: 0
                                  }}
                                />
                                Confirmo que soy el titular
                                del documento o que cuento
                                con su autorización para
                                consultar sus datos y
                                utilizarlos en este proceso
                                de reserva.
                              </label>
                            )}
                            {/* RESULTADO CONSULTA */}
                            {mensajesDni[
                              asiento.AsientoID
                            ] && (
                              <div
                                role="status"
                                style={{
                                  marginTop: 14,
                                  padding: '12px 14px',
                                  borderRadius: 8,
                                  background: '#eef5fc',
                                  border:
                                    '1px solid #cddfee',
                                  color: '#255d85',
                                  fontSize: 12,
                                  lineHeight: 1.6
                                }}
                              >
                                <Info
                                  size={16}
                                  style={{
                                    verticalAlign:
                                      'middle',
                                    marginRight: 7
                                  }}
                                />
                                {
                                  mensajesDni[
                                    asiento.AsientoID
                                  ]
                                }
                              </div>
                            )}
                          </div>
                        );
                      }
                    )}
                  </div>
                  {/* RESUMEN */}
                  <div
                    style={{
                      marginTop: 24,
                      padding: 20,
                      background: '#f3f7fb',
                      borderRadius: 10,
                      display: 'flex',
                      justifyContent:
                        'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 12
                    }}
                  >
                    <div>
                      <strong>
                        {elegidos.length}
                        {' '}pasajero(s)
                      </strong>
                      <p
                        style={{
                          fontSize: 12,
                          color: '#708396',
                          margin: '6px 0 0'
                        }}
                      >
                        Viaje #{datos.viaje.ViajeID}
                      </p>
                    </div>
                    <strong
                      style={{
                        fontSize: 24,
                        color: '#175b8b'
                      }}
                    >
                      {moneda(total)}
                    </strong>
                  </div>
                  {/* REVISAR */}
                  <button
                    type="submit"
                    className="siget-continuar"
                    disabled={
                      validandoContinuacion ||
                      consultandoAsiento !== null
                    }
                    style={{
                      marginTop: 20,
                      background: '#f28e30',
                      cursor: 'pointer'
                    }}
                  >
                    {validandoContinuacion
                      ? 'Revisando información...'
                      : 'Revisar datos de pasajeros'}
                    <ArrowRight size={19} />
                  </button>
                  {/* VALIDACIÓN FINAL */}
                  {datosRevisados && (
                    <div
                      role="status"
                      style={{
                        display: 'flex',
                        gap: 11,
                        alignItems: 'flex-start',
                        marginTop: 18,
                        padding: 17,
                        borderRadius: 9,
                        background: '#edf8f2',
                        color: '#247748',
                        fontSize: 13,
                        lineHeight: 1.6
                      }}
                    >
                      <CheckCircle2 size={22} />
                      <div>
                        <strong>
                          Datos revisados correctamente.
                        </strong>
                        <p
                          style={{
                            margin: '6px 0 0'
                          }}
                        >
                          Los datos de los pasajeros
                          cumplen las validaciones del
                          formulario. La reserva todavía
                          no se ha registrado en SQL Server
                          y no se realizó ningún pago.
                        </p>
                      </div>
                    </div>
                  )}
                </form>
              </section>
            )}
            {/* ===================================
                PASO 3 — POLÍTICAS VIGENTES
                =================================== */}
            {paso === 'politicas' && (
              <section className="siget-plano-card">
                <div style={{
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12, flexWrap: 'wrap', marginBottom: 18
                }}>
                  <div>
                    <h2>Políticas del servicio</h2>
                    <p style={{ fontSize: 13, color: '#64748b' }}>
                      Revisa el texto vigente antes de aceptar.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="siget-actualizar"
                    onClick={() => {
                      setPaso('pasajeros');
                      setAceptaPoliticas(false);
                      setAceptacionRevisada(false);
                    }}
                  >
                    <ArrowLeft size={16} />
                    Volver a pasajeros
                  </button>
                </div>
                <div style={{
                  background: '#f2f7fb', borderRadius: 10,
                  padding: 16, marginBottom: 18,
                  color: '#34556f', fontSize: 13
                }}>
                  <strong>
                    {datos.viaje.Origen} → {datos.viaje.Destino}
                  </strong>
                  <div style={{ marginTop: 7 }}>
                    {elegidos.length} asiento(s) · Total estimado: {' '}
                    <strong>{moneda(total)}</strong>
                  </div>
                </div>
                {cargandoPoliticas && (
                  <p role="status">Consultando las políticas vigentes...</p>
                )}
                {errorPoliticas && (
                  <div className="siget-error" role="alert">
                    <Info size={19} />
                    {errorPoliticas}
                  </div>
                )}
                {!cargandoPoliticas && politicas.map(politica => (
                  <article key={String(politica.id)} style={{
                    marginBottom: 18,
                    padding: 20,
                    border: '1px solid #dce5ed',
                    borderRadius: 10,
                    background: '#fff'
                  }}>
                    <h3 style={{ margin: '0 0 8px', color: '#173b63' }}>
                      {politica.titulo}
                    </h3>
                    <p style={{
                      color: '#64748b', fontSize: 12,
                      marginBottom: 14
                    }}>
                      Versión {politica.version} · ID {politica.id}
                    </p>
                    <div style={{
                      whiteSpace: 'pre-wrap',
                      overflowWrap: 'anywhere',
                      lineHeight: 1.75,
                      color: '#344a60', fontSize: 13
                    }}>
                      {politica.contenido}
                    </div>
                  </article>
                ))}
                {politicas.length > 0 && !cargandoPoliticas && (
                  <>
                    <label style={{
                      display: 'flex', gap: 12,
                      alignItems: 'flex-start', padding: 17,
                      background: '#edf5fc',
                      border: '1px solid #c9dfef',
                      borderRadius: 10, cursor: 'pointer',
                      fontSize: 13, color: '#234c70', lineHeight: 1.6
                    }}>
                      <input
                        type="checkbox"
                        checked={aceptaPoliticas}
                        onChange={e => {
                          setAceptaPoliticas(e.target.checked);
                          setAceptacionRevisada(false);
                        }}
                        style={{ marginTop: 4, width: 18, height: 18 }}
                      />
                      He leído y acepto expresamente las políticas
                      vigentes del servicio indicadas arriba.
                    </label>
                    <button
                      type="button"
                      className="siget-continuar"
                      disabled={
                        !aceptaPoliticas || validandoContinuacion || confirmandoReserva
                      }
                      onClick={() => void revisarAceptacion()}
                      style={{
                        marginTop: 18,
                        background: '#f28e30'
                      }}
                    >
                      {validandoContinuacion
                        ? 'Confirmando reserva...'
                        : 'Aceptar políticas y confirmar reserva'}
                      <ArrowRight size={18} />
                    </button>
                  </>
                )}
              </section>
            )}
            {paso === 'confirmada' && reservaConfirmada && aceptacionRevisada && (
              <section className="siget-plano-card" role="status">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12,
                  color: '#21734c', marginBottom: 14 }}>
                  <CheckCircle2 size={29} />
                  <h2 style={{ margin: 0 }}>Reserva confirmada</h2>
                </div>
                <p>
                  El servidor confirmó tu reserva y registró las aceptaciones
                  de las políticas del servicio.
                </p>
                <div style={{ background: '#edf8f2', padding: 20, borderRadius: 10,
                  marginTop: 16, lineHeight: 1.9 }}>
                  <div><strong>Código:</strong> {reservaConfirmada.Codigo}</div>
                  <div><strong>Número de reserva:</strong> {reservaConfirmada.ReservaID}</div>
                  <div><strong>Pasajes:</strong> {reservaConfirmada.CantidadAsientos}</div>
                  <div><strong>Total:</strong> {moneda(reservaConfirmada.Total)}</div>
                  <div><strong>Políticas registradas:</strong> {reservaConfirmada.TotalAceptaciones}</div>
                </div>
                <p style={{ marginTop: 16, color: '#64748b', fontSize: 13 }}>
                  Conserva el código de reserva. Esta operación no procesa pagos.
                </p>
                <Link to="/viajes/publico" className="siget-volver">
                  <ArrowLeft size={16} /> Volver a viajes
                </Link>
              </section>
            )}
            {/* ===================================
                ACCESO OBLIGATORIO DEL CLIENTE
                =================================== */}
            {mostrarAcceso &&
              paso === 'asientos' && (
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Iniciar sesión para reservar"
                style={{
                  position: 'fixed',
                  inset: 0,
                  zIndex: 1000,
                  background:
                    'rgba(12, 32, 52, 0.67)',
                  display: 'grid',
                  placeItems: 'center',
                  padding: 18
                }}
              >
                <div
                  style={{
                    background: '#fff',
                    borderRadius: 15,
                    padding: 28,
                    maxWidth: 450,
                    width: '100%',
                    boxShadow:
                      '0 15px 50px rgba(0,0,0,.2)',
                    textAlign: 'center'
                  }}
                >
                  <div
                    style={{
                      width: 64,
                      height: 64,
                      background: '#e9f3fc',
                      color: '#215d8d',
                      borderRadius: 16,
                      margin: '0 auto 18px',
                      display: 'grid',
                      placeItems: 'center'
                    }}
                  >
                    <LockKeyhole size={31} />
                  </div>
                  <h2
                    style={{
                      marginBottom: 12,
                      fontSize: 23,
                      color: '#173b63'
                    }}
                  >
                    Inicia sesión para reservar
                  </h2>
                  <p
                    style={{
                      color: '#718398',
                      fontSize: 13,
                      lineHeight: 1.7,
                      marginBottom: 19
                    }}
                  >
                    Puedes consultar viajes
                    y seleccionar asientos sin
                    iniciar sesión. Para continuar
                    con la reserva necesitas
                    una cuenta de cliente.
                  </p>
                  <div
                    style={{
                      padding: 15,
                      background: '#f3f8fc',
                      borderRadius: 9,
                      marginBottom: 20,
                      fontSize: 13
                    }}
                  >
                    <strong>
                      {elegidos.length}
                      {' '}asiento(s) seleccionado(s)
                    </strong>
                    <p
                      style={{
                        margin: '8px 0 0',
                        fontSize: 12,
                        color: '#718398'
                      }}
                    >
                      La selección se guarda
                      temporalmente en este
                      navegador y se volverá a
                      comprobar su disponibilidad.
                    </p>
                  </div>
                  <Link
                    to="/login"
                    style={{
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: 9,
                      background: '#f28e30',
                      color: '#fff',
                      borderRadius: 9,
                      padding: 13,
                      marginBottom: 12,
                      fontWeight: 700,
                      textDecoration: 'none'
                    }}
                  >
                    <LogIn size={18} />
                    Iniciar sesión
                  </Link>
                  <Link
                    to="/registro"
                    style={{
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: 9,
                      border:
                        '1px solid #aac7df',
                      background: '#edf5fc',
                      color: '#205d8d',
                      borderRadius: 9,
                      padding: 13,
                      fontWeight: 700,
                      textDecoration: 'none'
                    }}
                  >
                    <UserRoundPlus size={18} />
                    Crear una cuenta
                  </Link>
                  <button
                    type="button"
                    onClick={() =>
                      setMostrarAcceso(false)
                    }
                    style={{
                      marginTop: 18,
                      padding: 10,
                      width: '100%',
                      background: 'transparent',
                      color: '#63798f',
                      cursor: 'pointer'
                    }}
                  >
                    Seguir eligiendo asientos
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
