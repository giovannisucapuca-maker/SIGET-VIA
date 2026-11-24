
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent
} from 'react';

import {
  Plus, Search, Eye, X, Armchair,
  BusFront, Footprints, RefreshCw,
  Printer, Download, Pencil, Ban, CalendarClock
} from 'lucide-react';

import { jsPDF } from 'jspdf';

import {
  alertaExito,
  alertaError,
  alertaAdvertencia,
  confirmarAccion
} from './utils/alertas';

// ==========================================
// SIGET-VÍA - GESTIÓN DE RESERVAS
// DNI + ASIENTOS + PDF + SWEETALERT2
// ==========================================

type Politica = {
  PoliticaID: number;
  Tipo: string;
  Titulo: string;
  Version: string;
  Contenido: string;
};

type Viaje = {
  ViajeID: number;
  BusID: number;
  Salida: string;
  LlegadaEstimada: string;
  Tarifa: number;
  Estado: string;
  Origen: string;
  Destino: string;
  Placa: string;
  Modelo: string;
  Capacidad: number;
};

type Asiento = {
  AsientoID: number;
  BusID: number;
  Numero: number;
  Nivel: number;
  Ocupado: boolean | number;
};

type Reserva = {
  ReservaID: number;
  Codigo: string | null;
  FechaReserva: string;
  Estado: string;
  Total: number;
  ViajeID: number;
  Ruta: string;
  Salida: string;
  Placa: string;
  CantidadAsientos: number;
};

type ReservaItem = {
  ReservaAsientoID: number;
  AsientoID: number;
  Numero: number;
  Nivel: number;
  PasajeroID: number;
  TipoDocumento: TipoDocumento;
  NumeroDocumento: string;
  Nombres: string;
  Apellidos: string;
  FechaNacimiento: string | null;
  Precio: number;
  Estado: string;
};

type ReservaDetalle = {
  ReservaID: number;
  ViajeID: number;
  Codigo: string | null;
  FechaReserva: string;
  Estado: string;
  Total: number;
  UsuarioNombres: string;
  UsuarioApellidos: string;
  Salida: string;
  Origen: string;
  Destino: string;
  Placa: string;
  Modelo: string;
  items: ReservaItem[];
};


type MovimientoReserva = {
  ReservaID: number;
  Accion: string;
  FechaCambio: string;
  ViajeAnteriorID: number | null;
  ViajeNuevoID: number | null;
  Detalle: string | null;
  UsuarioResponsableID: number | null;
  Responsable: string;
};

type RespuestaHistorial = {
  ReservaID: number;
  Codigo: string | null;
  Estado: string;
  TotalMovimientos: number;
  historial: MovimientoReserva[];
};


type DatosDocumento = {
  fuente: string;
  registrado: boolean;
  pasajeroId: number | null;
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  dni?: string | null;
  nombres: string;
  apellidos: string;
  fechaNacimiento: string | null;
  estado: string | null;
};

type TipoDocumento = 'DNI' | 'CE' | 'PASAPORTE';

const REGLAS_DOCUMENTO: Record<
  TipoDocumento,
  { max: number; patron: RegExp; descripcion: string }
> = {
  DNI: {
    max: 8,
    patron: /^\d{8}$/,
    descripcion: '8 números'
  },
  CE: {
    max: 12,
    patron: /^[A-Z0-9]{9,12}$/,
    descripcion: '9 a 12 letras o números'
  },
  PASAPORTE: {
    max: 20,
    patron: /^[A-Z0-9]{6,20}$/,
    descripcion: '6 a 20 letras o números'
  }
};

function limpiarDocumento(
  tipo: TipoDocumento,
  valor: string
): string {
  const limpio = tipo === 'DNI'
    ? valor.replace(/\D/g, '')
    : valor.toUpperCase().replace(/[^A-Z0-9]/g, '');

  return limpio.slice(0, REGLAS_DOCUMENTO[tipo].max);
}

function documentoValido(
  tipo: TipoDocumento,
  numero: string
): boolean {
  return REGLAS_DOCUMENTO[tipo].patron.test(numero);
}

function claveDocumento(s: {
  tipoDocumento: TipoDocumento;
  numeroDocumento: string
}): string {
  return `${s.tipoDocumento}:${s.numeroDocumento}`;
}

type Seleccion = {
  asientoId: number;
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  nombres: string;
  apellidos: string;
  fechaNacimiento: string;
  pasajeroId: number | null;
  consultado: boolean;
  consultando: boolean;
};

type Modal = 'new' | 'view' | 'edit' | 'reprogram' | null;

const API =
  import.meta.env.VITE_API_URL ||
  'http://localhost:4000/api';

const AZUL = '#173b63';
const NARANJA = '#f58220';

// ==========================================
// SERVICIO HTTP
// ==========================================

async function api<T>(
  path: string,
  token: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers
    }
  });

  const datos = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      typeof datos.error === 'string'
        ? datos.error
        : `Error HTTP ${response.status}`
    );
  }

  return datos as T;
}

// ==========================================
// FUNCIONES AUXILIARES
// ==========================================

function fechaTexto(valor: string): string {
  if (!valor) return '-';

  const [fecha, hora] = valor.slice(0, 16).split('T');
  const partes = fecha?.split('-');

  if (!partes || partes.length !== 3) return valor;

  return `${partes[2]}/${partes[1]}/${partes[0]}${hora ? ` ${hora}` : ''}`;
}

function soles(valor: number): string {
  return `S/ ${Number(valor).toLocaleString('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function ocupado(a: Asiento): boolean {
  return a.Ocupado === true || a.Ocupado === 1;
}

function hoyLocal(): string {
  const d = new Date();

  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0')
  ].join('-');
}

function fechaValida(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;

  const [a, m, d] = valor.split('-').map(Number);
  const fecha = new Date(a, m - 1, d);

  return (
    fecha.getFullYear() === a &&
    fecha.getMonth() === m - 1 &&
    fecha.getDate() === d &&
    valor <= hoyLocal()
  );
}

function calcularEdad(valor: string): number | null {
  if (!fechaValida(valor)) return null;

  const [a, m, d] = valor.split('-').map(Number);
  const hoy = new Date();

  let edad = hoy.getFullYear() - a;

  if (
    hoy.getMonth() + 1 < m ||
    (hoy.getMonth() + 1 === m && hoy.getDate() < d)
  ) {
    edad--;
  }

  return edad >= 0 ? edad : null;
}

function nuevaSeleccion(asientoId: number): Seleccion {
  return {
    asientoId,
    tipoDocumento: 'DNI',
    numeroDocumento: '',
    nombres: '',
    apellidos: '',
    fechaNacimiento: '',
    pasajeroId: null,
    consultado: false,
    consultando: false
  };
}

// ==========================================
// PDF DE RESERVA
// ==========================================

function generarPDF(detalle: ReservaDetalle): jsPDF {
  const doc = new jsPDF({
    unit: 'mm',
    format: 'a4'
  });

  const margen = 16;
  let y = 18;

  function tituloPagina() {
    doc.setFillColor(23, 59, 99);
    doc.rect(0, 0, 210, 35, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(19);
    doc.text('SIGET-VIA', margen, 16);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('TRANSPORTES VIA S.A.C.', margen, 23);

    doc.text(
      'CONSTANCIA DE RESERVA',
      194,
      19,
      { align: 'right' }
    );

    doc.setTextColor(23, 59, 99);
  }

  function asegurarEspacio(altura: number) {
    if (y + altura > 275) {
      doc.addPage();
      tituloPagina();
      y = 45;
    }
  }

  function seccion(texto: string) {
    asegurarEspacio(18);
    y += 7;

    doc.setFillColor(241, 245, 249);
    doc.rect(margen, y - 5, 178, 10, 'F');

    doc.setTextColor(23, 59, 99);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(texto, margen + 3, y + 1);

    y += 13;
  }

  function dato(etiqueta: string, valor: string) {
    asegurarEspacio(10);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(90, 100, 114);
    doc.text(etiqueta, margen, y);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(23, 59, 99);

    const lineas = doc.splitTextToSize(
      valor || '-',
      120
    ) as string[];

    doc.text(lineas, 65, y);
    y += Math.max(7, lineas.length * 5 + 2);
  }

  tituloPagina();
  y = 47;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);

  doc.text(
    detalle.Codigo ||
      `RESERVA-${detalle.ReservaID}`,
    margen,
    y
  );

  doc.setFontSize(10);
  doc.setTextColor(
    detalle.Estado === 'COMPLETADA' ? 22 : 150,
    detalle.Estado === 'COMPLETADA' ? 132 : 82,
    75
  );

  doc.text(
    detalle.Estado,
    194,
    y,
    { align: 'right' }
  );

  seccion('DATOS DE LA RESERVA');

  dato(
    'Codigo:',
    detalle.Codigo || '-'
  );

  dato(
    'Fecha:',
    fechaTexto(detalle.FechaReserva)
  );

  dato('Estado:', detalle.Estado);

  seccion('INFORMACION DEL VIAJE');

  dato('Origen:', detalle.Origen);
  dato('Destino:', detalle.Destino);

  dato(
    'Bus:',
    `${detalle.Placa} - ${detalle.Modelo}`
  );

  dato('Salida:', fechaTexto(detalle.Salida));

  dato(
    'Registrado por:',
    `${detalle.UsuarioNombres || ''} ${detalle.UsuarioApellidos || ''}`.trim()
  );

  seccion('PASAJEROS Y ASIENTOS');

  detalle.items.forEach((item, index) => {
    const nombreCompleto =
      `${item.Nombres} ${item.Apellidos}`;

    const lineas = doc.splitTextToSize(
      nombreCompleto,
      158
    ) as string[];

    const altura = Math.max(
      25,
      18 + lineas.length * 5
    );

    asegurarEspacio(altura + 6);

    doc.setDrawColor(217, 224, 233);
    doc.roundedRect(
      margen,
      y - 4,
      178,
      altura,
      2,
      2
    );

    doc.setTextColor(23, 59, 99);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);

    doc.text(
      `PASAJERO ${index + 1}`,
      margen + 4,
      y + 2
    );

    doc.text(
      `Piso ${item.Nivel} - Asiento ${String(item.Numero).padStart(2, '0')}`,
      190,
      y + 2,
      { align: 'right' }
    );

    doc.setFont('helvetica', 'normal');
    doc.text(lineas, margen + 4, y + 9);

    doc.setFontSize(8);
    doc.setTextColor(90, 100, 114);

    const base = y + 11 + lineas.length * 5;

    doc.text(
      `${item.TipoDocumento || 'DNI'}: ${item.NumeroDocumento}`,
      margen + 4,
      base
    );

    doc.text(
      soles(item.Precio),
      190,
      base,
      { align: 'right' }
    );

    y += altura + 6;
  });

  asegurarEspacio(55);

  y += 5;
  doc.setFillColor(23, 59, 99);
  doc.roundedRect(margen, y, 178, 18, 3, 3, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);

  doc.text('TOTAL DE LA RESERVA', margen + 6, y + 11);

  doc.text(
    soles(detalle.Total),
    188,
    y + 11,
    { align: 'right' }
  );

  y += 28;

  doc.setTextColor(90, 100, 114);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  const nota = doc.splitTextToSize(
    'Documento generado por SIGET-VIA. ' +
    'Esta constancia acredita el registro de una reserva, ' +
    'no su pago y no es un comprobante tributario.',
    175
  );

  doc.text(nota, margen, y);

  const paginas = doc.getNumberOfPages();

  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    doc.setDrawColor(215, 224, 233);
    doc.line(16, 284, 194, 284);

    doc.setTextColor(100, 110, 120);
    doc.setFontSize(8);

    doc.text(
      `SIGET-VIA | Pagina ${p} de ${paginas}`,
      105,
      290,
      { align: 'center' }
    );
  }

  return doc;
}


function descargarPDF(detalle: ReservaDetalle) {
  const doc = generarPDF(detalle);

  const nombre = (
    detalle.Codigo ||
    `RESERVA-${detalle.ReservaID}`
  ).replace(/[^A-Za-z0-9_-]/g, '_');

  doc.save(`SIGET-VIA-${nombre}.pdf`);
}

function imprimirPDF(detalle: ReservaDetalle) {
  const doc = generarPDF(detalle);

  const url = URL.createObjectURL(
    doc.output('blob')
  );

  const ventana = window.open(
    url,
    '_blank'
  );

  if (!ventana) {
    URL.revokeObjectURL(url);

    throw new Error(
      'El navegador bloqueó la ventana. ' +
      'Permite ventanas emergentes para imprimir.'
    );
  }

  // Abre el visor PDF para usar Imprimir.
}

// ==========================================
// COMPONENTE VISUAL ASIENTO
// ==========================================

function BotonAsiento({
  asiento,
  seleccionado,
  deshabilitado,
  onClick
}: {
  asiento?: Asiento;
  seleccionado: boolean;
  deshabilitado: boolean;
  onClick: (a: Asiento) => void;
}) {
  if (!asiento) {
    return <div style={{ width: 43, height: 46 }} />;
  }

  const estaOcupado = ocupado(asiento);

  return (
    <button
      type="button"
      disabled={estaOcupado || deshabilitado}
      onClick={() => onClick(asiento)}
      title={
        estaOcupado
          ? 'Asiento ocupado'
          : `Asiento ${asiento.Numero}`
      }
      style={{
        width: 43,
        height: 46,
        border: seleccionado
          ? '2px solid #bd6818'
          : '1px solid #173b63',
        borderRadius: 5,
        background: estaOcupado
          ? '#555b65'
          : seleccionado
            ? NARANJA
            : '#fff',
        color: estaOcupado || seleccionado
          ? '#fff'
          : AZUL,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11,
        fontWeight: 700,
        padding: 2,
        cursor: estaOcupado
          ? 'not-allowed'
          : 'pointer'
      }}
    >
      <Armchair size={17} />
      {String(asiento.Numero).padStart(2, '0')}
    </button>
  );
}

// ==========================================
// PLANO DE CADA NIVEL
// ==========================================

function PlanoNivel({
  nivel,
  asientos,
  seleccionados,
  deshabilitado,
  onSeleccionar
}: {
  nivel: 1 | 2;
  asientos: Asiento[];
  seleccionados: Set<number>;
  deshabilitado: boolean;
  onSeleccionar: (a: Asiento) => void;
}) {
  const ordenados = [...asientos].sort(
    (a, b) => a.Numero - b.Numero
  );

  const columnas = nivel === 1 ? 3 : 4;
  const filas: (Asiento | undefined)[][] = [];

  for (let i = 0; i < ordenados.length; i += columnas) {
    filas.push(
      Array.from(
        { length: columnas },
        (_, j) => ordenados[i + j]
      )
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 9
    }}>
      <strong style={{ color: AZUL }}>
        {nivel === 1 ? 'Primer piso' : 'Segundo piso'}
        {' — '}{asientos.length} asientos
      </strong>

      <div style={{
        border: `2px solid ${AZUL}`,
        borderRadius: 12,
        padding: 12,
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        gap: 10
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px dashed #cbd5e1',
          paddingBottom: 8
        }}>
          <small>FRENTE</small>
          {nivel === 1
            ? <BusFront size={22} />
            : <Footprints size={22} />}
        </div>

        {filas.map((fila, indice) => (
          <div
            key={indice}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            {[0, 1].map(pos => (
              <BotonAsiento
                key={pos}
                asiento={fila[pos]}
                seleccionado={
                  fila[pos]
                    ? seleccionados.has(
                        fila[pos]!.AsientoID
                      )
                    : false
                }
                deshabilitado={deshabilitado}
                onClick={onSeleccionar}
              />
            ))}

            <div style={{
              width: 29,
              height: 46,
              background: '#f1f5f9',
              borderLeft: '1px dashed #cbd5e1',
              borderRight: '1px dashed #cbd5e1'
            }} />

            <BotonAsiento
              asiento={fila[2]}
              seleccionado={
                fila[2]
                  ? seleccionados.has(fila[2].AsientoID)
                  : false
              }
              deshabilitado={deshabilitado}
              onClick={onSeleccionar}
            />

            {nivel === 2 && (
              <BotonAsiento
                asiento={fila[3]}
                seleccionado={
                  fila[3]
                    ? seleccionados.has(fila[3].AsientoID)
                    : false
                }
                deshabilitado={deshabilitado}
                onClick={onSeleccionar}
              />
            )}
          </div>
        ))}

        <small style={{
          textAlign: 'center',
          borderTop: '1px dashed #cbd5e1',
          paddingTop: 8,
          color: '#64748b'
        }}>
          Pasillo / circulación
        </small>
      </div>
    </div>
  );
}

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================

export default function Reservas({
  token
}: {
  token: string;
}) {
  const [politicas, setPoliticas] = useState<Politica[]>([]);
  const [aceptacionConfirmada, setAceptacionConfirmada] = useState(false);
  const [cargandoPoliticas, setCargandoPoliticas] = useState(false);

  const [reservas, setReservas] =
    useState<Reserva[]>([]);

  const [viajes, setViajes] =
    useState<Viaje[]>([]);

  const [viajeId, setViajeId] =
    useState(0);

  const [viajeActual, setViajeActual] =
    useState<Viaje | null>(null);

  const [asientos, setAsientos] =
    useState<Asiento[]>([]);

  const [seleccionados, setSeleccionados] =
    useState<Seleccion[]>([]);

  const [detalle, setDetalle] =
    useState<ReservaDetalle | null>(null);

  const [modal, setModal] =
    useState<Modal>(null);

  const [busqueda, setBusqueda] =
    useState('');

  const [error, setError] =
    useState('');

  const [cargando, setCargando] =
    useState(true);

  const [guardando, setGuardando] =
    useState(false);

  const [cargandoAsientos, setCargandoAsientos] =
    useState(false);

  const solicitudAsientos = useRef(0);
  type EditFila = Seleccion & { reservaAsientoId: number };
  const [editFilas, setEditFilas] = useState<EditFila[]>([]);
  const [editAsientos, setEditAsientos] = useState<Asiento[]>([]);
  const [editandoCarga, setEditandoCarga] = useState(false);
  const [editFilaActivaId, setEditFilaActivaId] = useState<number | null>(null);
  // PASO 170.7.7.9 - Reprogramación sin perder el detalle original
  const [viajeDestinoId, setViajeDestinoId] = useState(0);
  const [asientosDestino, setAsientosDestino] = useState<Asiento[]>([]);
  const [filasReprogramacion, setFilasReprogramacion] = useState<{
    reservaAsientoId: number;
    pasajero: string;
    asientoId: number;
  }[]>([]);
  const [filaReprogramacionActiva, setFilaReprogramacionActiva] = useState<number | null>(null);
  const [cargandoDestino, setCargandoDestino] = useState(false);
  const solicitudDestino = useRef(0);


  const [historial, setHistorial] =
    useState<MovimientoReserva[]>([]);

  const [mostrarHistorial, setMostrarHistorial] =
    useState(false);

  const [cargandoHistorial, setCargandoHistorial] =
    useState(false);


  // ========================================
  // CONSULTAR REGISTROS
  // ========================================

  async function cargarReservas(q = '') {
    setCargando(true);

    try {
      const datos = await api<Reserva[]>(
        `/reservas?q=${encodeURIComponent(q)}`,
        token
      );

      setReservas(datos);
      setError('');
    } catch (e) {
      const mensaje = (e as Error).message;
      setError(mensaje);
      await alertaError(mensaje);
    } finally {
      setCargando(false);
    }
  }

  async function cargarCatalogos() {
    try {
      const datos = await api<{ viajes: Viaje[] }>(
        '/reservas/catalogos',
        token
      );

      setViajes(datos.viajes || []);
    } catch (e) {
      await alertaError((e as Error).message);
    }
  }

  async function cargarAsientos(id: number) {
    const solicitud = ++solicitudAsientos.current;

    setCargandoAsientos(true);
    setError('');

    try {
      const datos = await api<{
        viaje: Viaje;
        asientos: Asiento[];
      }>(
        `/reservas/asientos/${id}`,
        token
      );

      if (solicitud !== solicitudAsientos.current) {
        return;
      }

      setViajeActual(datos.viaje);
      setAsientos(datos.asientos);

      setSeleccionados(prev =>
        prev.filter(s =>
          datos.asientos.some(a =>
            a.AsientoID === s.asientoId &&
            !ocupado(a)
          )
        )
      );
    } catch (e) {
      if (solicitud === solicitudAsientos.current) {
        setError((e as Error).message);
        setViajeActual(null);
        setAsientos([]);

        await alertaError(
          (e as Error).message
        );
      }
    } finally {
      if (solicitud === solicitudAsientos.current) {
        setCargandoAsientos(false);
      }
    }
  }

  useEffect(() => {
    let activo = true;

    Promise.all([
      api<Reserva[]>('/reservas', token),
      api<{ viajes: Viaje[] }>(
        '/reservas/catalogos',
        token
      )
    ])
      .then(([registros, catalogos]) => {
        if (!activo) return;

        setReservas(registros);
        setViajes(catalogos.viajes || []);
      })
      .catch(e => {
        if (activo) {
          setError((e as Error).message);
        }
      })
      .finally(() => {
        if (activo) setCargando(false);
      });

    return () => {
      activo = false;
    };
  }, [token]);

  // ========================================
  // ABRIR / CERRAR MODALES
  // ========================================

  function abrirNueva() {
    solicitudAsientos.current++;

    setModal('new');
    setViajeId(0);
    setViajeActual(null);
    setAsientos([]);
    setSeleccionados([]);
    setDetalle(null);
    setError('');

    setAceptacionConfirmada(false);
    setPoliticas([]);
    setCargandoPoliticas(true);
    void api<Politica[]>('/reservas/politicas-vigentes', token)
      .then(setPoliticas)
      .catch(e => { void alertaError((e as Error).message); })
      .finally(() => setCargandoPoliticas(false));
    void cargarCatalogos();
  }

  function cerrarModal() {
    if (guardando) return;

    solicitudAsientos.current++;
    solicitudDestino.current++;
    setModal(null);
    setCargandoAsientos(false);
    setCargandoDestino(false);
    setError('');
  }


  async function consultarHistorial(reservaId: number) {
    if (cargandoHistorial) return;

    setCargandoHistorial(true);
    setHistorial([]);

    try {
      const respuesta = await api<RespuestaHistorial>(
        `/reservas/${reservaId}/historial`,
        token
      );

      setHistorial(respuesta.historial || []);
      setMostrarHistorial(true);
    } catch (e) {
      await alertaError(
        (e as Error).message,
        'No se pudo consultar el historial'
      );
    } finally {
      setCargandoHistorial(false);
    }
  }


  async function abrirDetalle(id: number) {
    try {
      const datos = await api<ReservaDetalle>(
        `/reservas/${id}`,
        token
      );

      setDetalle(datos);
      setHistorial([]);
      setMostrarHistorial(false);
      setModal('view');
      setError('');
    } catch (e) {
      await alertaError(
        (e as Error).message,
        'No se pudo consultar la reserva'
      );
    }
  }

  function cambiarViaje(id: number) {
    solicitudAsientos.current++;

    setViajeId(id);
    setViajeActual(null);
    setAsientos([]);
    setSeleccionados([]);
    setError('');

    if (id > 0) {
      void cargarAsientos(id);
    }
  }

  // ========================================
  // SELECCIONAR ASIENTOS
  // ========================================

  function toggleAsiento(asiento: Asiento) {
    if (
      ocupado(asiento) ||
      guardando ||
      cargandoAsientos
    ) {
      return;
    }

    setSeleccionados(prev => {
      const existe = prev.some(
        s => s.asientoId === asiento.AsientoID
      );

      if (existe) {
        return prev.filter(
          s => s.asientoId !== asiento.AsientoID
        );
      }

      return [
        ...prev,
        nuevaSeleccion(asiento.AsientoID)
      ];
    });
  }

  function actualizarSeleccion(
    asientoId: number,
    cambios: Partial<Seleccion>
  ) {
    setSeleccionados(prev =>
      prev.map(s =>
        s.asientoId === asientoId
          ? { ...s, ...cambios }
          : s
      )
    );
  }

  function cambiarTipoDocumento(asientoId: number, tipoDocumento: TipoDocumento) {
    actualizarSeleccion(asientoId, {
      tipoDocumento, numeroDocumento: '', nombres: '', apellidos: '',
      fechaNacimiento: '', pasajeroId: null, consultado: false, consultando: false
    });
  }

  function cambiarNumeroDocumento(asientoId: number, tipo: TipoDocumento, valor: string) {
    actualizarSeleccion(asientoId, {
      numeroDocumento: limpiarDocumento(tipo, valor),
      nombres: '', apellidos: '', fechaNacimiento: '',
      pasajeroId: null, consultado: false
    });
  }

  async function consultarDocumento(s: Seleccion) {
    if (!documentoValido(s.tipoDocumento, s.numeroDocumento)) {
      await alertaAdvertencia(
        `Documento inválido. ${REGLAS_DOCUMENTO[s.tipoDocumento].descripcion}.`
      );
      return;
    }

    if (seleccionados.some(otro =>
      otro.asientoId !== s.asientoId &&
      claveDocumento(otro) === claveDocumento(s)
    )) {
      await alertaAdvertencia(
        'Ese documento ya está asignado a otro asiento.'
      );
      return;
    }

    actualizarSeleccion(s.asientoId, {
      consultando: true,
      consultado: false
    });


    try {
      const datos = await api<DatosDocumento>(
        `/pasajeros/documento/${s.tipoDocumento}/${encodeURIComponent(s.numeroDocumento)}`,
        token
      );

      if (datos.registrado && datos.estado !== 'ACTIVO') {
        throw new Error('El pasajero existe pero está INACTIVO.');
      }

      setSeleccionados(prev => prev.map(actual =>
        actual.asientoId === s.asientoId &&
        claveDocumento(actual) === claveDocumento(s)
          ? {
              ...actual,
              nombres: datos.nombres || '',
              apellidos: datos.apellidos || '',
              fechaNacimiento: datos.fechaNacimiento?.slice(0, 10) || '',
              pasajeroId: datos.pasajeroId,
              consultado: true,
              consultando: false
            }
          : actual
      ));

      await alertaExito(
        datos.registrado
          ? 'Pasajero encontrado en SQL Server.'
          : s.tipoDocumento === 'DNI'
            ? 'Datos del DNI recuperados.'
            : 'Documento no registrado. Completa los datos manualmente.',
        'Consulta realizada'
      );
    } catch (e) {
      setSeleccionados(prev => prev.map(actual =>
        actual.asientoId === s.asientoId &&
        claveDocumento(actual) === claveDocumento(s)
          ? { ...actual, consultando: false }
          : actual
      ));

      await alertaError(
        (e as Error).message,
        'No se pudo consultar el documento'
      );
    }
  }

  // ========================================
  // RESUMEN
  // ========================================

  const idsSeleccionados = useMemo(
    () => new Set(
      seleccionados.map(s => s.asientoId)
    ),
    [seleccionados]
  );

  const primerPiso = asientos.filter(
    a => Number(a.Nivel) === 1
  );

  const segundoPiso = asientos.filter(
    a => Number(a.Nivel) === 2
  );

  const disponibles = asientos.filter(
    a => !ocupado(a)
  ).length;

  const ocupados = asientos.length - disponibles;

  const total = Number(
    (
      Number(viajeActual?.Tarifa || 0) *
      seleccionados.length
    ).toFixed(2)
  );

  // ========================================
  // GUARDAR RESERVA
  // ========================================

  async function guardar(
    e: FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    if (guardando || cargandoAsientos) {
      return;
    }

    async function advertir(mensaje: string) {
      setError(mensaje);
      await alertaAdvertencia(mensaje);
    }

    if (!viajeId || !viajeActual) {
      await advertir('Selecciona un viaje.');
      return;
    }

    if (viajeActual.Estado !== 'PROGRAMADO') {
      await advertir(
        'Solo se pueden registrar reservas en viajes PROGRAMADOS.'
      );
      return;
    }

    if (!seleccionados.length) {
      await advertir(
        'Selecciona al menos un asiento.'
      );
      return;
    }

    if (seleccionados.some(s => s.consultando)) {
      await advertir(
        'Espera a que finalicen las consultas de documentos.'
      );
      return;
    }

    if (seleccionados.some(s =>
      !s.consultado ||
      !documentoValido(s.tipoDocumento, s.numeroDocumento) ||
      !s.nombres.trim() ||
      !s.apellidos.trim()
    )) {
      await advertir(
        'Consulta los documentos de todos los pasajeros.'
      );
      return;
    }

    const documentos = seleccionados.map(claveDocumento);

    if (new Set(documentos).size !== documentos.length) {
      await advertir(
        'No se permite repetir un mismo documento en dos asientos.'
      );
      return;
    }

    if (seleccionados.some(s =>
      !s.pasajeroId &&
      !fechaValida(s.fechaNacimiento)
    )) {
      await advertir(
        'Ingresa una fecha de nacimiento válida para los pasajeros nuevos.'
      );
      return;
    }

    if (seleccionados.some(s =>
      s.fechaNacimiento &&
      !fechaValida(s.fechaNacimiento)
    )) {
      await advertir(
        'Hay una fecha de nacimiento incorrecta.'
      );
      return;
    }

    const validos = seleccionados.every(s =>
      asientos.some(a =>
        a.AsientoID === s.asientoId &&
        a.BusID === viajeActual.BusID &&
        !ocupado(a)
      )
    );

    if (!validos) {
      await advertir(
        'Uno o más asientos ya están ocupados.'
      );
      return;
    }

    if (
      !Number.isFinite(total) ||
      total < 0 ||
      total > 9999999999.99
    ) {
      await advertir('El total no es válido.');
      return;
    }

    if (
      cargandoPoliticas ||
      politicas.length !== 5 ||
      !aceptacionConfirmada
    ) {
      await advertir(
        'Debes revisar las cinco políticas y registrar la aceptación expresa antes de continuar.'
      );
      return;
    }

    const confirmado = await confirmarAccion(
      `¿Confirmar ${seleccionados.length} asiento(s) ` +
      `por ${soles(total)}?`,
      'Confirmar reserva'
    );

    if (!confirmado) return;

    setGuardando(true);
    setError('');

    try {
      const creada = await api<{
        ReservaID: number;
        Codigo: string;
      }>('/reservas', token, {
        method: 'POST',
        body: JSON.stringify({
          viajeId,
          politicaIds: politicas.map(p => p.PoliticaID),
          aceptacionConfirmada: true,
          items: seleccionados.map(s => ({
            asientoId: s.asientoId,
            tipoDocumento: s.tipoDocumento,
            numeroDocumento: s.numeroDocumento,
            nombres: s.nombres,
            apellidos: s.apellidos,
            fechaNacimiento: s.fechaNacimiento || null
          }))
        })
      });

      solicitudAsientos.current++;
      setModal(null);
      setSeleccionados([]);
      setViajeActual(null);
      setAsientos([]);

      await alertaExito(
        `Reserva registrada con código ${creada.Codigo}`,
        'Reserva confirmada'
      );

      await cargarReservas(busqueda);
    } catch (e) {
      const mensaje = (e as Error).message;

      setError(mensaje);

      await alertaError(
        mensaje,
        'No se pudo registrar la reserva'
      );

      if (viajeId > 0) {
        await cargarAsientos(viajeId);
      }
    } finally {
      setGuardando(false);
    }
  }

  // ========================================
  // CANCELAR RESERVA SIN ELIMINAR HISTORIAL
  // PATCH /api/reservas/:id/cancelar
  // ========================================

  async function cancelarReserva(reserva: ReservaDetalle) {
    if (guardando || reserva.Estado === 'CANCELADA') return;

    const confirmado = await confirmarAccion(
      `¿Deseas cancelar la reserva ${reserva.Codigo || `#${reserva.ReservaID}`}? ` +
      'Se liberarán sus asientos y conservará el historial.',
      'Confirmar cancelación'
    );

    if (!confirmado) return;

    setGuardando(true);
    setError('');

    try {
      await api<{ mensaje: string; Estado: string }>(
        `/reservas/${reserva.ReservaID}/cancelar`,
        token,
        { method: 'PATCH' }
      );

      setDetalle(null);
      setModal(null);

      await alertaExito(
        'La reserva se canceló y sus asientos fueron liberados.',
        'Reserva cancelada'
      );

      await cargarReservas(busqueda);
    } catch (e) {
      const mensaje = (e as Error).message;
      setError(mensaje);
      await alertaError(mensaje, 'No se pudo cancelar la reserva');
    } finally {
      setGuardando(false);
    }
  }

  // ========================================
  // EDITAR RESERVA — CONSERVA CANTIDAD Y PRECIO
  // ========================================

  async function abrirEditar(reserva: ReservaDetalle) {
    if (guardando || editandoCarga) return;

    setEditandoCarga(true);

    try {
      const completa = await api<ReservaDetalle>(
        `/reservas/${reserva.ReservaID}`,
        token
      );

      const d = await api<{
        viaje: Viaje;
        asientos: Asiento[];
      }>(
        `/reservas/asientos/${completa.ViajeID}`,
        token
      );

      if (
        !['COMPLETADA', 'CONFIRMADA', 'REPROGRAMADA'].includes(
          completa.Estado
        ) ||
        d.viaje.Estado !== 'PROGRAMADO'
      ) {
        throw new Error(
          'Solo se pueden editar reservas de viajes PROGRAMADOS que no estén canceladas.'
        );
      }

      setEditAsientos(d.asientos);

      setEditFilas(
        completa.items
          .filter(x => x.Estado === 'ACTIVA')
          .map(x => ({
            reservaAsientoId: x.ReservaAsientoID,
            asientoId: x.AsientoID,
            tipoDocumento: x.TipoDocumento || 'DNI',
            numeroDocumento: x.NumeroDocumento,
            nombres: x.Nombres,
            apellidos: x.Apellidos,
            fechaNacimiento: x.FechaNacimiento?.slice(0, 10) || '',
            pasajeroId: x.PasajeroID,
            consultado: true,
            consultando: false
          }))
      );

      setEditFilaActivaId(
        completa.items.find(
          x => x.Estado === 'ACTIVA'
        )?.ReservaAsientoID ?? null
      );

      setDetalle(completa);
      setModal('edit');
      setError('');
    } catch (e) {
      await alertaError(
        (e as Error).message,
        'No se pudo abrir la edición'
      );
    } finally {
      setEditandoCarga(false);
    }
  }

  function actualizarEdit(
    id: number,
    cambios: Partial<EditFila>
  ) {
    setEditFilas(prev =>
      prev.map(x =>
        x.reservaAsientoId === id
          ? { ...x, ...cambios }
          : x
      )
    );
  }

  async function consultarDocumentoEdit(fila: EditFila) {
    if (!documentoValido(
      fila.tipoDocumento,
      fila.numeroDocumento
    )) {
      await alertaAdvertencia(
        `Documento inválido. ${REGLAS_DOCUMENTO[fila.tipoDocumento].descripcion}.`
      );
      return;
    }

    if (editFilas.some(
      x =>
        x.reservaAsientoId !== fila.reservaAsientoId &&
        claveDocumento(x) === claveDocumento(fila)
    )) {
      await alertaAdvertencia(
        'El documento está repetido.'
      );
      return;
    }

    actualizarEdit(fila.reservaAsientoId, {
      consultando: true,
      consultado: false
    });

    try {
      const d = await api<DatosDocumento>(
        `/pasajeros/documento/${fila.tipoDocumento}/${encodeURIComponent(fila.numeroDocumento)}`,
        token
      );

      if (d.registrado && d.estado !== 'ACTIVO') {
        throw new Error('Pasajero inactivo.');
      }

      setEditFilas(prev => prev.map(x =>
        x.reservaAsientoId === fila.reservaAsientoId &&
        claveDocumento(x) === claveDocumento(fila)
          ? {
              ...x,
              nombres: d.nombres || '',
              apellidos: d.apellidos || '',
              pasajeroId: d.pasajeroId,
              fechaNacimiento: d.fechaNacimiento?.slice(0, 10) || '',
              consultado: true,
              consultando: false
            }
          : x
      ));
    } catch (e) {
      setEditFilas(prev => prev.map(x =>
        x.reservaAsientoId === fila.reservaAsientoId &&
        claveDocumento(x) === claveDocumento(fila)
          ? { ...x, consultando: false }
          : x
      ));

      await alertaError(
        (e as Error).message,
        'No se pudo consultar el documento'
      );
    }
  }

  async function guardarEdicion(
    e: FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();
    if (!detalle || guardando) return;

    if (editFilas.some(x =>
      !x.consultado ||
      x.consultando ||
      !documentoValido(
        x.tipoDocumento,
        x.numeroDocumento
      ) ||
      !x.nombres.trim() ||
      !x.apellidos.trim() ||
      (!x.pasajeroId && !fechaValida(x.fechaNacimiento))
    )) {
      await alertaAdvertencia(
        'Verifica el documento y fecha de nacimiento de cada pasajero.'
      );
      return;
    }

    if (
      new Set(editFilas.map(x => x.asientoId)).size !== editFilas.length ||
      new Set(editFilas.map(claveDocumento)).size !== editFilas.length
    ) {
      await alertaAdvertencia(
        'No se pueden repetir asientos ni documentos.'
      );
      return;
    }

    const confirmado = await confirmarAccion(
      `¿Guardar los cambios de la reserva ${detalle.Codigo}?`,
      'Confirmar edición'
    );

    if (!confirmado) return;

    setGuardando(true);

    try {
      await api(`/reservas/${detalle.ReservaID}`, token, {
        method: 'PUT',
        body: JSON.stringify({
          items: editFilas.map(x => ({
            reservaAsientoId: x.reservaAsientoId,
            asientoId: x.asientoId,
            tipoDocumento: x.tipoDocumento,
            numeroDocumento: x.numeroDocumento,
            nombres: x.nombres,
            apellidos: x.apellidos,
            fechaNacimiento: x.fechaNacimiento || null
          }))
        })
      });

      const actualizado = await api<ReservaDetalle>(
        `/reservas/${detalle.ReservaID}`,
        token
      );

      setDetalle(actualizado);
      setModal('view');

      await alertaExito(
        'Pasajeros y asientos actualizados.',
        'Reserva editada'
      );

      await cargarReservas(busqueda);
    } catch (err) {
      await alertaError(
        (err as Error).message,
        'No se pudo editar la reserva'
      );
    } finally {
      setGuardando(false);
    }
  }

  // ========================================
  // REPROGRAMAR RESERVA
  // PATCH /api/reservas/:id/reprogramar
  // ========================================

  async function abrirReprogramacion(reserva: ReservaDetalle) {
    if (guardando || cargandoDestino) return;

    solicitudDestino.current++;
    setCargandoDestino(false);

    if (
      !['COMPLETADA', 'CONFIRMADA', 'REPROGRAMADA'].includes(
        reserva.Estado
      )
    ) {
      await alertaAdvertencia(
        'El estado de la reserva no permite reprogramar.'
      );
      return;
    }

    const originales = reserva.items.filter(
      item => item.Estado === 'ACTIVA'
    );

    if (!originales.length) {
      await alertaAdvertencia(
        'Esta reserva no tiene asientos activos.'
      );
      return;
    }

    await cargarCatalogos();
    setDetalle(reserva);
    setViajeDestinoId(0);
    setAsientosDestino([]);

    setFilasReprogramacion(
      originales.map(item => ({
        reservaAsientoId: item.ReservaAsientoID,
        pasajero: `${item.Nombres} ${item.Apellidos}`,
        asientoId: 0
      }))
    );

    setFilaReprogramacionActiva(
      originales[0].ReservaAsientoID
    );

    setError('');
    setModal('reprogram');
  }

  async function cargarViajeDestino(id: number) {
    const solicitud = ++solicitudDestino.current;

    setViajeDestinoId(id);
    setAsientosDestino([]);
    setFilasReprogramacion(
      prev => prev.map(x => ({ ...x, asientoId: 0 }))
    );

    if (!id) return;

    setCargandoDestino(true);

    try {
      const datos = await api<{
        viaje: Viaje;
        asientos: Asiento[];
      }>(
        `/reservas/asientos/${id}`,
        token
      );

      if (solicitud !== solicitudDestino.current) return;

      if (datos.viaje.Estado !== 'PROGRAMADO') {
        throw new Error(
          'El viaje de destino no está PROGRAMADO.'
        );
      }

      if (
        new Date(datos.viaje.Salida).getTime() <= Date.now()
      ) {
        throw new Error(
          'La salida del viaje destino ya venció.'
        );
      }

      setAsientosDestino(datos.asientos);
    } catch (e) {
      if (solicitud === solicitudDestino.current) {
        setError((e as Error).message);
        await alertaError((e as Error).message);
      }
    } finally {
      if (solicitud === solicitudDestino.current) {
        setCargandoDestino(false);
      }
    }
  }

  function elegirAsientoDestino(asiento: Asiento) {
    if (
      ocupado(asiento) ||
      guardando ||
      cargandoDestino ||
      !filaReprogramacionActiva
    ) {
      return;
    }

    if (filasReprogramacion.some(x =>
      x.reservaAsientoId !== filaReprogramacionActiva &&
      x.asientoId === asiento.AsientoID
    )) {
      return;
    }

    setFilasReprogramacion(prev => prev.map(x =>
      x.reservaAsientoId === filaReprogramacionActiva
        ? { ...x, asientoId: asiento.AsientoID }
        : x
    ));
  }

  async function guardarReprogramacion(
    evento: FormEvent<HTMLFormElement>
  ) {
    evento.preventDefault();

    if (!detalle || guardando || cargandoDestino) return;

    const destino = viajes.find(
      v => v.ViajeID === viajeDestinoId
    );

    if (
      !destino ||
      !viajeDestinoId ||
      viajeDestinoId === detalle.ViajeID
    ) {
      await alertaAdvertencia(
        'Selecciona un viaje destino diferente.'
      );
      return;
    }

    if (
      !filasReprogramacion.length ||
      filasReprogramacion.some(x => !x.asientoId)
    ) {
      await alertaAdvertencia(
        'Asigna un asiento a cada pasajero.'
      );
      return;
    }

    const ids = filasReprogramacion.map(
      x => x.asientoId
    );

    if (new Set(ids).size !== ids.length) {
      await alertaAdvertencia(
        'Los asientos no pueden repetirse.'
      );
      return;
    }

    const confirmado = await confirmarAccion(
      `¿Reprogramar ${detalle.Codigo} al viaje ${viajeDestinoId}? ` +
      'Los pasajeros se conservarán y cambiarán sus asientos.',
      'Confirmar reprogramación'
    );

    if (!confirmado) return;

    setGuardando(true);
    setError('');

    try {
      await api(
        `/reservas/${detalle.ReservaID}/reprogramar`,
        token,
        {
          method: 'PATCH',
          body: JSON.stringify({
            viajeNuevoId: viajeDestinoId,
            items: filasReprogramacion.map(x => ({
              reservaAsientoId: x.reservaAsientoId,
              asientoId: x.asientoId
            }))
          })
        }
      );

      const actualizada = await api<ReservaDetalle>(
        `/reservas/${detalle.ReservaID}`,
        token
      );

      setDetalle(actualizada);
      setModal('view');
      setAsientosDestino([]);

      await alertaExito(
        'La reserva fue reprogramada correctamente.',
        'Reprogramación registrada'
      );

      await cargarReservas(busqueda);
    } catch (e) {
      setError((e as Error).message);

      await alertaError(
        (e as Error).message,
        'No se pudo reprogramar'
      );

      await cargarViajeDestino(viajeDestinoId);
    } finally {
      setGuardando(false);
    }
  }

  // ========================================
  // INTERFAZ PRINCIPAL
  // ========================================

  return (
    <>

      <div className="heading">
        <h1>Gestión de reservas</h1>
        <p>
          Registro por DNI, CE o PASAPORTE, consulta e impresión
          de constancias de reserva
        </p>
      </div>

      <div className="panel">
        <div className="section-heading">
          <div>
            <h2>Registros · Gestión de reservas</h2>
            <p>Administración de reservas de pasajes</p>
          </div>

          <button
            type="button"
            className="orange"
            onClick={abrirNueva}
          >
            <Plus size={17} />
            Nuevo
          </button>
        </div>

        <form
          className="search-form"
          onSubmit={e => {
            e.preventDefault();
            void cargarReservas(busqueda);
          }}
        >
          <input
            value={busqueda}
            onChange={e =>
              setBusqueda(e.target.value)
            }
            placeholder="Buscar por código, ruta o placa"
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

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Código</th>
                <th>Ruta</th>
                <th>Salida</th>
                <th>Bus</th>
                <th>Asientos</th>
                <th>Total</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {cargando && (
                <tr>
                  <td colSpan={9}>
                    Cargando reservas...
                  </td>
                </tr>
              )}

              {!cargando && reservas.map(r => (
                <tr key={r.ReservaID}>
                  <td>{r.ReservaID}</td>
                  <td>{r.Codigo || '-'}</td>
                  <td>{r.Ruta}</td>
                  <td>{fechaTexto(r.Salida)}</td>
                  <td>{r.Placa}</td>
                  <td>{r.CantidadAsientos}</td>
                  <td>{soles(r.Total)}</td>

                  <td>
                    <span className={
                      r.Estado === 'COMPLETADA'
                        ? 'status active'
                        : 'status'
                    }>
                      {r.Estado}
                    </span>
                  </td>

                  <td className="actions">
                    <button
                      type="button"
                      title="Ver detalle de reserva"
                      onClick={() =>
                        void abrirDetalle(r.ReservaID)
                      }
                    >
                      <Eye size={16} />
                    </button>
                  </td>
                </tr>
              ))}

              {!cargando &&
                !reservas.length &&
                !error && (
                  <tr>
                    <td colSpan={9}>
                      No se encontraron reservas.
                    </td>
                  </tr>
                )}
            </tbody>
          </table>
        </div>
      </div>

      {/* =====================================
          MODAL NUEVA RESERVA
      ===================================== */}

      {modal === 'new' && (
        <div className="overlay">
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Registrar reserva"
            style={{
              width: '96%',
              maxWidth: 1120,
              maxHeight: '92vh',
              overflowY: 'auto'
            }}
          >
            <div className="dialog-head">
              <h2>Registrar reserva de pasajeros</h2>

              <button
                type="button"
                disabled={guardando}
                onClick={cerrarModal}
                aria-label="Cerrar"
              >
                <X />
              </button>
            </div>

            <form onSubmit={guardar} noValidate>
              <div className="fields">
                <label style={{
                  gridColumn: '1 / -1'
                }}>
                  Seleccionar viaje

                  <select
                    required
                    value={viajeId}
                    disabled={guardando}
                    onChange={e =>
                      cambiarViaje(
                        Number(e.target.value)
                      )
                    }
                  >
                    <option value={0}>
                      Selecciona un viaje
                    </option>

                    {viajes.map(v => (
                      <option
                        key={v.ViajeID}
                        value={v.ViajeID}
                      >
                        {v.Origen} - {v.Destino}
                        {' | '}{v.Placa}
                        {' | '}{fechaTexto(v.Salida)}
                        {' | '}{soles(v.Tarifa)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {viajes.length === 0 && (
                <div className="alert">
                  No hay viajes disponibles.
                </div>
              )}

              {cargandoAsientos && (
                <p>Cargando asientos...</p>
              )}

              {viajeActual && !cargandoAsientos && (
                <>
                  <div style={{
                    padding: 16,
                    marginTop: 15,
                    background: '#f5f8fc',
                    border: '1px solid #d6dde7',
                    borderRadius: 9
                  }}>
                    <h3 style={{ color: AZUL }}>
                      Información del viaje
                    </h3>

                    <div className="fields">
                      <div>
                        <strong>Ruta</strong>
                        <p>
                          {viajeActual.Origen} -{' '}
                          {viajeActual.Destino}
                        </p>
                      </div>

                      <div>
                        <strong>Bus</strong>
                        <p>
                          {viajeActual.Placa} -{' '}
                          {viajeActual.Modelo}
                        </p>
                      </div>

                      <div>
                        <strong>Salida</strong>
                        <p>
                          {fechaTexto(viajeActual.Salida)}
                        </p>
                      </div>

                      <div>
                        <strong>Tarifa</strong>
                        <p>
                          {soles(viajeActual.Tarifa)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div style={{
                    marginTop: 18,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 12
                  }}>
                    <h3 style={{
                      color: AZUL,
                      margin: 0
                    }}>
                      Selección de asientos
                    </h3>

                    <button
                      type="button"
                      className="secondary"
                      disabled={
                        guardando || cargandoAsientos
                      }
                      onClick={() =>
                        void cargarAsientos(viajeId)
                      }
                    >
                      <RefreshCw size={16} />
                      Actualizar asientos
                    </button>
                  </div>

                  <div style={{
                    display: 'flex',
                    gap: 18,
                    flexWrap: 'wrap',
                    marginTop: 12
                  }}>
                    <span>
                      Capacidad: {asientos.length}
                    </span>
                    <span>
                      Disponibles: {disponibles}
                    </span>
                    <span>
                      Ocupados: {ocupados}
                    </span>
                    <span>
                      Seleccionados: {seleccionados.length}
                    </span>
                  </div>

                  <p style={{
                    marginTop: 12,
                    fontSize: 12
                  }}>
                    ⬜ Disponible · 🟧 Seleccionado ·
                    ⬛ Ocupado
                  </p>

                  <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                    gap: 28,
                    padding: 18,
                    marginTop: 10,
                    background: '#f4f7fb',
                    border: '1px solid #d6dde7',
                    borderRadius: 10
                  }}>
                    {primerPiso.length > 0 && (
                      <PlanoNivel
                        nivel={1}
                        asientos={primerPiso}
                        seleccionados={idsSeleccionados}
                        deshabilitado={guardando}
                        onSeleccionar={toggleAsiento}
                      />
                    )}

                    {segundoPiso.length > 0 && (
                      <PlanoNivel
                        nivel={2}
                        asientos={segundoPiso}
                        seleccionados={idsSeleccionados}
                        deshabilitado={guardando}
                        onSeleccionar={toggleAsiento}
                      />
                    )}
                  </div>

                  <h3 style={{
                    color: AZUL,
                    marginTop: 22
                  }}>
                    Asignar pasajeros mediante DNI, CE o PASAPORTE
                  </h3>

                  {!seleccionados.length && (
                    <p>
                      Selecciona al menos un asiento
                      en el plano.
                    </p>
                  )}

                  {seleccionados.map(s => {
                    const asiento = asientos.find(
                      a => a.AsientoID === s.asientoId
                    );

                    const edad = s.fechaNacimiento
                      ? calcularEdad(s.fechaNacimiento)
                      : null;

                    return (
                      <div
                        key={s.asientoId}
                        style={{
                          border: '1px solid #d6dde7',
                          borderRadius: 10,
                          padding: 16,
                          marginTop: 12,
                          background: '#fff'
                        }}
                      >
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 12
                        }}>
                          <strong style={{
                            color: AZUL
                          }}>
                            Asiento {
                              String(
                                asiento?.Numero || 0
                              ).padStart(2, '0')
                            }
                            {' — '}
                            Piso {asiento?.Nivel}
                          </strong>

                          <button
                            type="button"
                            className="secondary"
                            disabled={guardando}
                            onClick={() => {
                              if (asiento) {
                                toggleAsiento(asiento);
                              }
                            }}
                          >
                            Quitar
                          </button>
                        </div>

                        <div style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 10,
                          alignItems: 'end',
                          marginTop: 12
                        }}>
                          <label style={{
                            flex: '1 1 200px'
                          }}>
                            Tipo de documento
                            <select
                              value={s.tipoDocumento}
                              disabled={guardando || s.consultando}
                              onChange={e =>
                                cambiarTipoDocumento(
                                  s.asientoId,
                                  e.target.value as TipoDocumento
                                )
                              }
                            >
                              <option value="DNI">DNI</option>
                              <option value="CE">Carné de extranjería</option>
                              <option value="PASAPORTE">Pasaporte</option>
                            </select>

                            Número de documento
                            <input
                              type="text"
                              inputMode={
                                s.tipoDocumento === 'DNI'
                                  ? 'numeric'
                                  : 'text'
                              }
                              maxLength={REGLAS_DOCUMENTO[s.tipoDocumento].max}
                              placeholder={REGLAS_DOCUMENTO[s.tipoDocumento].descripcion}
                              value={s.numeroDocumento}
                              disabled={guardando || s.consultando}
                              onChange={e =>
                                cambiarNumeroDocumento(
                                  s.asientoId,
                                  s.tipoDocumento,
                                  e.target.value
                                )
                              }
                            />
                          </label>

                          <button
                            type="button"
                            className="orange"
                            disabled={
                              guardando ||
                              s.consultando ||
                              !documentoValido(
                                s.tipoDocumento,
                                s.numeroDocumento
                              )
                            }
                            onClick={() =>
                              void consultarDocumento(s)
                            }
                          >
                            <Search size={16} />
                            {s.consultando
                              ? 'Consultando...'
                              : 'Consultar documento'}
                          </button>
                        </div>

                        {s.consultado && (
                          <>
                            <div
                              className="fields"
                              style={{ marginTop: 14 }}

                            >
                              <label>
                                Nombres
                                <input
                                  value={s.nombres}
                                  readOnly={
                                    s.pasajeroId !== null ||
                                    s.tipoDocumento === 'DNI'
                                  }
                                  onChange={e =>
                                    actualizarSeleccion(
                                      s.asientoId,
                                      { nombres: e.target.value }
                                    )
                                  }
                                />
                              </label>

                              <label>
                                Apellidos
                                <input
                                  value={s.apellidos}
                                  readOnly={
                                    s.pasajeroId !== null ||
                                    s.tipoDocumento === 'DNI'
                                  }
                                  onChange={e =>
                                    actualizarSeleccion(
                                      s.asientoId,
                                      { apellidos: e.target.value }
                                    )
                                  }
                                />
                              </label>

                              <label>
                                Fecha de nacimiento
                                <input
                                  type="date"
                                  max={hoyLocal()}
                                  value={s.fechaNacimiento}
                                  disabled={
                                    guardando ||
                                    s.pasajeroId !== null
                                  }
                                  onChange={e =>
                                    actualizarSeleccion(
                                      s.asientoId,
                                      {
                                        fechaNacimiento:
                                          e.target.value
                                      }
                                    )
                                  }
                                />
                              </label>

                              <label>
                                Edad
                                <input
                                  value={
                                    edad === null
                                      ? 'No disponible'
                                      : `${edad} años`
                                  }
                                  readOnly
                                />
                              </label>
                            </div>

                            <p style={{
                              fontSize: 12,
                              color: '#64748b',
                              marginTop: 10
                            }}>
                              {s.pasajeroId
                                ? 'Pasajero existente en SQL Server.'
                                : 'Pasajero nuevo: se registrará al confirmar la reserva.'}
                            </p>
                          </>
                        )}
                      </div>
                    );
                  })}

                  <div style={{
                    marginTop: 20,
                    padding: 16,
                    borderRadius: 9,
                    background: '#f5f8fc',
                    border: '1px solid #d6dde7',
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                    gap: 12
                  }}>
                    <span>
                      Asientos: {seleccionados.length}
                    </span>

                    <span>
                      Tarifa: {soles(viajeActual.Tarifa)}
                    </span>

                    <strong style={{
                      color: AZUL,
                      fontSize: 18
                    }}>
                      Total: {soles(total)}
                    </strong>
                  </div>
                </>
              )}

              <section style={{
                padding: 16,
                marginTop: 16,
                border: '1px solid #cbd5e1',
                borderRadius: 9
              }}>
                <h3 style={{ color: AZUL }}>
                  Políticas y condiciones de servicio
                </h3>

                {cargandoPoliticas && (
                  <p>Cargando políticas vigentes...</p>
                )}

                {!cargandoPoliticas && politicas.length !== 5 && (
                  <p role="alert">
                    No están disponibles las cinco políticas obligatorias.
                  </p>
                )}

                {politicas.map(p => (
                  <details
                    key={p.PoliticaID}
                    style={{ marginBottom: 10 }}
                  >
                    <summary style={{
                      cursor: 'pointer',
                      fontWeight: 600
                    }}>
                      {p.Titulo} — versión {p.Version}
                    </summary>

                    <p style={{
                      whiteSpace: 'pre-wrap',
                      padding: 12,
                      background: '#f8fafc'
                    }}>
                      {p.Contenido}
                    </p>
                  </details>
                ))}

                <label style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                  marginTop: 12
                }}>
                  <input
                    type="checkbox"
                    checked={aceptacionConfirmada}
                    disabled={
                      guardando ||
                      cargandoPoliticas ||
                      politicas.length !== 5
                    }
                    onChange={e =>
                      setAceptacionConfirmada(e.target.checked)
                    }
                  />

                  <span>
                    Confirmo que he mostrado las cinco políticas al solicitante
                    y he recibido su aceptación expresa. Esta declaración
                    será registrada a nombre del usuario administrador que
                    realiza la operación.
                  </span>
                </label>
              </section>

              {error && (
                <div className="alert">
                  {error}
                </div>
              )}

              <div className="dialog-actions">
                <button
                  type="submit"
                  className="orange"
                  disabled={
                    guardando ||
                    cargandoAsientos ||
                    seleccionados.some(s => s.consultando)
                  }
                >
                  {guardando
                    ? 'Registrando...'
                    : 'Confirmar reserva'}
                </button>

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

      {/* =====================================
          MODAL REPROGRAMAR RESERVA
      ===================================== */}

      {modal === 'reprogram' && detalle && (
        <div className="overlay">
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Reprogramar reserva"
            style={{
              maxWidth: 1050,
              width: '96%',
              maxHeight: '92vh',
              overflowY: 'auto'
            }}
          >
            <div className="dialog-head">
              <h2>Reprogramar {detalle.Codigo}</h2>

              <button
                type="button"
                disabled={guardando}
                onClick={() => setModal('view')}
                aria-label="Volver al detalle"
              >
                <X />
              </button>
            </div>

            <form onSubmit={guardarReprogramacion}>
              <div style={{
                padding: 14,
                borderRadius: 8,
                background: '#f1f5f9'
              }}>
                <strong>
                  Reserva actual: {detalle.Origen} - {detalle.Destino}
                </strong>
                <p>
                  Salida anterior: {fechaTexto(detalle.Salida)}
                </p>
                <p>
                  Pasajeros: {filasReprogramacion.length} ·
                  Total: {soles(detalle.Total)}
                </p>
                <small>
                  Solo se permiten viajes futuros de la misma ruta y tarifa,
                  sin venta asociada.
                </small>
              </div>

              <div className="fields" style={{ marginTop: 15 }}>
                <label>
                  Viaje de destino
                  <select
                    value={viajeDestinoId}
                    disabled={guardando || cargandoDestino}
                    onChange={e =>
                      void cargarViajeDestino(
                        Number(e.target.value)
                      )
                    }
                  >
                    <option value={0}>Seleccionar viaje</option>

                    {viajes.filter(v =>
                      v.ViajeID !== detalle.ViajeID &&
                      v.Estado === 'PROGRAMADO' &&
                      new Date(v.Salida).getTime() > Date.now() &&
                      v.Origen === detalle.Origen &&
                      v.Destino === detalle.Destino &&
                      Math.round(Number(v.Tarifa) * 100) ===
                        Math.round(
                          Number(detalle.Total) * 100 /
                          Math.max(1, filasReprogramacion.length)
                        )
                    ).map(v => (
                      <option key={v.ViajeID} value={v.ViajeID}>
                        {v.ViajeID} · {fechaTexto(v.Salida)} ·
                        {v.Placa} · {soles(v.Tarifa)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {cargandoDestino && (
                <p>Cargando asientos disponibles...</p>
              )}

              {!!error && (
                <div className="alert">{error}</div>
              )}

              {viajeDestinoId > 0 &&
                !cargandoDestino &&
                asientosDestino.length > 0 && (
                  <>
                    <h3 style={{
                      color: AZUL,
                      marginTop: 16
                    }}>
                      Asignar nuevos asientos
                    </h3>

                    <div style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 8,
                      marginBottom: 12
                    }}>
                      {filasReprogramacion.map((fila, i) => {
                        const asiento = asientosDestino.find(
                          x => x.AsientoID === fila.asientoId
                        );

                        return (
                          <button
                            key={fila.reservaAsientoId}
                            type="button"
                            className={
                              filaReprogramacionActiva === fila.reservaAsientoId
                                ? 'orange'
                                : 'secondary'
                            }
                            onClick={() =>
                              setFilaReprogramacionActiva(
                                fila.reservaAsientoId
                              )
                            }
                          >
                            {i + 1}. {fila.pasajero} ·
                            Asiento {asiento?.Numero ?? 'sin asignar'}
                          </button>
                        );
                      })}
                    </div>

                    <div style={{
                      display: 'flex',
                      justifyContent: 'center',
                      flexWrap: 'wrap',
                      gap: 25,
                      padding: 15,
                      background: '#f4f7fb',
                      borderRadius: 9
                    }}>
                      {([1, 2] as const).map(nivel => {
                        const visuales = asientosDestino
                          .filter(a => Number(a.Nivel) === nivel)
                          .map(a => ({
                            ...a,
                            Ocupado:
                              ocupado(a) ||
                              filasReprogramacion.some(f =>
                                f.reservaAsientoId !==
                                  filaReprogramacionActiva &&
                                f.asientoId === a.AsientoID
                              )
                                ? 1
                                : 0
                          }));

                        return visuales.length ? (
                          <PlanoNivel
                            key={nivel}
                            nivel={nivel}
                            asientos={visuales}
                            seleccionados={new Set(
                              filasReprogramacion
                                .filter(f =>
                                  f.reservaAsientoId ===
                                  filaReprogramacionActiva
                                )
                                .map(f => f.asientoId)
                            )}
                            deshabilitado={guardando}
                            onSeleccionar={elegirAsientoDestino}
                          />
                        ) : null;
                      })}
                    </div>
                  </>
                )}

              <div
                className="dialog-actions"
                style={{ marginTop: 18 }}
              >
                <button
                  type="submit"
                  className="orange"
                  disabled={
                    guardando ||
                    cargandoDestino ||
                    !viajeDestinoId ||
                    filasReprogramacion.some(f => !f.asientoId)
                  }
                >
                  <CalendarClock size={16} />
                  {guardando
                    ? 'Guardando...'
                    : 'Confirmar reprogramación'}
                </button>

                <button
                  type="button"
                  className="secondary"
                  disabled={guardando}
                  onClick={() => setModal('view')}
                >
                  Volver al detalle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================
          EDITAR RESERVA: ASIENTO Y DOCUMENTO
      ===================================== */}

      {modal === 'edit' && detalle && (
        <div className="overlay">
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Editar reserva"
            style={{
              maxWidth: 960,
              width: '96%',
              maxHeight: '92vh',
              overflowY: 'auto'
            }}
          >
            <div className="dialog-head">
              <h2>Editar reserva {detalle.Codigo}</h2>
              <button
                type="button"
                disabled={guardando}
                onClick={cerrarModal}
              >
                <X />
              </button>
            </div>

            <form onSubmit={guardarEdicion} noValidate>
              <div style={{
                padding: 14,
                background: '#f1f5f9',
                borderRadius: 8,
                margin: '12px 0'
              }}>
                <strong style={{ color: AZUL }}>
                  {detalle.Origen} - {detalle.Destino}
                </strong>

                <p style={{
                  fontSize: 12,
                  margin: '5px 0'
                }}>
                  Cambia los asientos libres y consulta el documento
                  de cada pasajero. La cantidad de asientos y el
                  total se conservan.
                </p>
              </div>

              {/* Plano gráfico de asientos para editar */}

              <div style={{
                padding: 15,
                background: '#f4f7fb',
                border: '1px solid #d6dde7',
                borderRadius: 10,
                margin: '12px 0'
              }}>
                <h3 style={{
                  color: AZUL,
                  margin: '0 0 8px'
                }}>
                  Seleccionar nuevo asiento
                </h3>

                <p style={{
                  fontSize: 12,
                  color: '#475569',
                  margin: '0 0 12px'
                }}>
                  Primero selecciona el pasajero que vas a modificar.
                  Después pulsa un asiento libre en el plano.
                  Los asientos de otros pasajeros y reservas
                  permanecen bloqueados.
                </p>

                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  marginBottom: 12
                }}>
                  {editFilas.map((f, i) => (
                    <button
                      key={f.reservaAsientoId}
                      type="button"
                      disabled={guardando}
                      className={
                        editFilaActivaId === f.reservaAsientoId
                          ? 'orange'
                          : 'secondary'
                      }
                      onClick={() =>
                        setEditFilaActivaId(f.reservaAsientoId)
                      }
                    >
                      Pasajero {i + 1}: {f.nombres} {f.apellidos}
                    </button>
                  ))}
                </div>

                <p style={{
                  fontSize: 12,
                  margin: '0 0 10px'
                }}>
                  ⬜ Libre · 🟧 Seleccionado · ⬛ Ocupado
                </p>

                {(() => {
                  const originales = new Set(
                    detalle.items
                      .filter(x => x.Estado === 'ACTIVA')
                      .map(x => x.AsientoID)
                  );

                  const filaActiva = editFilas.find(
                    x => x.reservaAsientoId === editFilaActivaId
                  );

                  const asientosVisuales: Asiento[] =
                    editAsientos.map(a => ({
                      ...a,
                      Ocupado: (
                        (
                          ocupado(a) &&
                          a.AsientoID !== detalle.items.find(
                            x => x.ReservaAsientoID === editFilaActivaId
                          )?.AsientoID
                        ) ||
                        (
                          originales.has(a.AsientoID) &&
                          a.AsientoID !== detalle.items.find(
                            x => x.ReservaAsientoID === editFilaActivaId
                          )?.AsientoID
                        ) ||
                        editFilas.some(f =>
                          f.reservaAsientoId !== editFilaActivaId &&
                          f.asientoId === a.AsientoID
                        )
                      ) ? 1 : 0
                    }));

                  const seleccionar = (a: Asiento) => {
                    if (
                      !filaActiva ||
                      guardando ||
                      ocupado(a)
                    ) {
                      return;
                    }

                    const originalOtro = detalle.items.some(x =>
                      x.Estado === 'ACTIVA' &&
                      x.AsientoID === a.AsientoID &&
                      x.ReservaAsientoID !== filaActiva.reservaAsientoId
                    );

                    const seleccionadoOtro = editFilas.some(x =>
                      x.reservaAsientoId !== filaActiva.reservaAsientoId &&
                      x.asientoId === a.AsientoID
                    );

                    if (originalOtro || seleccionadoOtro) return;

                    actualizarEdit(
                      filaActiva.reservaAsientoId,
                      { asientoId: a.AsientoID }
                    );
                  };

                  return (
                    <div style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 24,
                      justifyContent: 'center'
                    }}>
                      {[1, 2].map(nivel => {
                        const nivelAsientos = asientosVisuales.filter(
                          a => Number(a.Nivel) === nivel
                        );

                        if (!nivelAsientos.length) return null;

                        return (
                          <PlanoNivel
                            key={nivel}
                            nivel={nivel as 1 | 2}
                            asientos={nivelAsientos}
                            seleccionados={new Set(
                              filaActiva
                                ? [filaActiva.asientoId]
                                : []
                            )}
                            deshabilitado={
                              guardando || !filaActiva
                            }
                            onSeleccionar={seleccionar}
                          />
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {editFilas.map((fila, i) => {
                const actual = editAsientos.find(
                  x => x.AsientoID === fila.asientoId
                );

                const edad = calcularEdad(fila.fechaNacimiento);

                return (
                  <div
                    key={fila.reservaAsientoId}
                    style={{
                      border:
                        editFilaActivaId === fila.reservaAsientoId
                          ? `2px solid ${NARANJA}`
                          : '1px solid #d6dde7',
                      borderRadius: 9,
                      padding: 15,
                      margin: '12px 0',
                      background: '#fff'
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 10,
                      flexWrap: 'wrap'
                    }}>
                      <strong style={{ color: AZUL }}>
                        Pasajero {i + 1} — Piso {actual?.Nivel ?? '-'},
                        asiento {String(actual?.Numero ?? 0).padStart(2, '0')}
                      </strong>

                      <button
                        type="button"
                        className="secondary"
                        disabled={guardando}
                        onClick={() =>
                          setEditFilaActivaId(
                            fila.reservaAsientoId
                          )
                        }
                      >
                        <Armchair size={16} />
                        Cambiar asiento en plano
                      </button>
                    </div>

                    <div
                      className="fields"
                      style={{ marginTop: 12 }}
                    >
                      <label>
                        Tipo de documento
                        <select
                          value={fila.tipoDocumento}
                          disabled={guardando || fila.consultando}
                          onChange={e =>
                            actualizarEdit(
                              fila.reservaAsientoId,
                              {
                                tipoDocumento:
                                  e.target.value as TipoDocumento,
                                numeroDocumento: '',
                                nombres: '',
                                apellidos: '',
                                fechaNacimiento: '',
                                pasajeroId: null,
                                consultado: false
                              }
                            )
                          }
                        >
                          <option value="DNI">DNI</option>
                          <option value="CE">Carné de extranjería</option>
                          <option value="PASAPORTE">Pasaporte</option>
                        </select>
                      </label>

                      <label>
                        Número de documento
                        <input
                          value={fila.numeroDocumento}
                          inputMode={
                            fila.tipoDocumento === 'DNI'
                              ? 'numeric'
                              : 'text'
                          }
                          maxLength={REGLAS_DOCUMENTO[fila.tipoDocumento].max}

                          disabled={guardando || fila.consultando}
                          onChange={e =>
                            actualizarEdit(
                              fila.reservaAsientoId,
                              {
                                numeroDocumento: limpiarDocumento(
                                  fila.tipoDocumento,
                                  e.target.value
                                ),
                                nombres: '',
                                apellidos: '',
                                fechaNacimiento: '',
                                pasajeroId: null,
                                consultado: false
                              }
                            )
                          }
                        />
                      </label>
                    </div>

                    <button
                      type="button"
                      className="secondary"
                      disabled={
                        guardando ||
                        fila.consultando ||
                        !documentoValido(
                          fila.tipoDocumento,
                          fila.numeroDocumento
                        )
                      }
                      onClick={() =>
                        void consultarDocumentoEdit(fila)
                      }
                    >
                      <Search size={16} />
                      {fila.consultando
                        ? 'Consultando...'
                        : 'Consultar documento'}
                    </button>

                    {fila.consultado && (
                      <div
                        className="fields"
                        style={{ marginTop: 12 }}
                      >
                        <label>
                          Nombres
                          <input
                            value={fila.nombres}
                            readOnly={
                              fila.pasajeroId !== null ||
                              fila.tipoDocumento === 'DNI'
                            }
                            onChange={e =>
                              actualizarEdit(
                                fila.reservaAsientoId,
                                { nombres: e.target.value }
                              )
                            }
                          />
                        </label>

                        <label>
                          Apellidos
                          <input
                            value={fila.apellidos}
                            readOnly={
                              fila.pasajeroId !== null ||
                              fila.tipoDocumento === 'DNI'
                            }
                            onChange={e =>
                              actualizarEdit(
                                fila.reservaAsientoId,
                                { apellidos: e.target.value }
                              )
                            }
                          />
                        </label>

                        <label>
                          Fecha de nacimiento
                          <input
                            type="date"
                            max={hoyLocal()}
                            value={fila.fechaNacimiento}
                            disabled={
                              guardando ||
                              fila.pasajeroId !== null
                            }
                            onChange={e =>
                              actualizarEdit(
                                fila.reservaAsientoId,
                                { fechaNacimiento: e.target.value }
                              )
                            }
                          />
                        </label>

                        <label>
                          Edad
                          <input
                            readOnly
                            value={
                              edad === null
                                ? 'No disponible'
                                : `${edad} años`
                            }
                          />
                        </label>
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="dialog-actions">
                <button
                  type="submit"
                  className="orange"
                  disabled={
                    guardando ||
                    editFilas.some(x => x.consultando)
                  }
                >
                  {guardando
                    ? 'Guardando...'
                    : 'Guardar cambios'}
                </button>

                <button
                  type="button"
                  className="secondary"
                  disabled={guardando}
                  onClick={() => setModal('view')}
                >
                  Volver al detalle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================
          MODAL DE DETALLE MEJORADO
      ===================================== */}

      {modal === 'view' && detalle && (
        <div className="overlay">
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Detalle de reserva"
            style={{
              width: '95%',
              maxWidth: 920,
              maxHeight: '92vh',
              overflowY: 'auto'
            }}
          >
            <div className="dialog-head">
              <h2>
                Detalle de reserva #{detalle.ReservaID}
              </h2>

              <button
                type="button"
                aria-label="Cerrar"
                onClick={cerrarModal}
              >
                <X />
              </button>
            </div>

            {/* CABECERA DE RESERVA */}

            <div style={{
              padding: 20,
              marginTop: 12,
              background:
                'linear-gradient(135deg, #173b63, #285c83)',
              borderRadius: 12,
              color: '#fff'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12
              }}>
                <div>
                  <div style={{
                    fontSize: 12,
                    opacity: 0.85
                  }}>
                    SIGET-VÍA · TRANSPORTES VÍA S.A.C.
                  </div>

                  <h2 style={{
                    margin: '8px 0',
                    color: '#fff'
                  }}>
                    {detalle.Codigo ||
                      `RESERVA-${detalle.ReservaID}`}
                  </h2>

                  <span style={{
                    fontSize: 12,
                    opacity: 0.85
                  }}>
                    Fecha: {
                      fechaTexto(detalle.FechaReserva)
                    }
                  </span>
                </div>

                <span style={{
                  background:
                    detalle.Estado === 'COMPLETADA'
                      ? '#d8f5e3'
                      : '#fff0d4',
                  color:
                    detalle.Estado === 'COMPLETADA'
                      ? '#17663c'
                      : '#925600',
                  borderRadius: 20,
                  padding: '7px 13px',
                  fontWeight: 700,
                  fontSize: 12
                }}>
                  {detalle.Estado}
                </span>
              </div>
            </div>

            {/* DATOS DEL VIAJE */}

            <div style={{
              marginTop: 18,
              padding: 16,
              border: '1px solid #d6dde7',
              borderRadius: 10
            }}>
              <h3 style={{
                color: AZUL,
                marginBottom: 14
              }}>
                Información del viaje
              </h3>

              <div className="fields">
                <div>
                  <strong>Origen</strong>
                  <p>{detalle.Origen}</p>
                </div>

                <div>
                  <strong>Destino</strong>
                  <p>{detalle.Destino}</p>
                </div>

                <div>
                  <strong>Bus</strong>
                  <p>
                    {detalle.Placa} - {detalle.Modelo}
                  </p>
                </div>

                <div>
                  <strong>Fecha y hora de salida</strong>
                  <p>{fechaTexto(detalle.Salida)}</p>
                </div>

                <div>
                  <strong>Registrado por</strong>
                  <p>
                    {detalle.UsuarioNombres}{' '}
                    {detalle.UsuarioApellidos}
                  </p>
                </div>

                <div>
                  <strong>Pasajeros</strong>
                  <p>{detalle.items.length}</p>
                </div>
              </div>
            </div>


            {/* =====================================
                HISTORIAL DE MOVIMIENTOS
            ===================================== */}

            <div style={{
              marginTop: 18,
              padding: 16,
              border: '1px solid #d6dde7',
              borderRadius: 10
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 12
              }}>
                <h3 style={{ color: AZUL, margin: 0 }}>
                  Historial de la reserva
                </h3>

                <button
                  type="button"
                  className="secondary"
                  disabled={cargandoHistorial}
                  onClick={() => {
                    if (mostrarHistorial) {
                      setMostrarHistorial(false);
                    } else {
                      void consultarHistorial(detalle.ReservaID);
                    }
                  }}
                >
                  <RefreshCw size={16} />
                  {cargandoHistorial
                    ? 'Consultando...'
                    : mostrarHistorial
                      ? 'Ocultar historial'
                      : 'Ver historial'}
                </button>
              </div>

              {mostrarHistorial && (
                <div style={{ marginTop: 15 }}>
                  {!historial.length ? (
                    <p>No existen movimientos registrados.</p>
                  ) : (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Fecha</th>
                            <th>Acción</th>
                            <th>Responsable</th>
                            <th>Viaje anterior</th>
                            <th>Viaje nuevo</th>
                            <th>Detalle</th>
                          </tr>
                        </thead>

                        <tbody>
                          {historial.map((movimiento, indice) => (
                            <tr key={`${movimiento.FechaCambio}-${indice}`}>
                              <td>
                                {fechaTexto(movimiento.FechaCambio)}
                              </td>
                              <td>
                                <strong>{movimiento.Accion}</strong>
                              </td>
                              <td>{movimiento.Responsable}</td>
                              <td>
                                {movimiento.ViajeAnteriorID ?? '-'}
                              </td>
                              <td>
                                {movimiento.ViajeNuevoID ?? '-'}
                              </td>
                              <td>{movimiento.Detalle || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>


            {/* PASAJEROS Y ASIENTOS */}

            <div style={{
              marginTop: 18,
              border: '1px solid #d6dde7',
              borderRadius: 10,
              overflow: 'hidden'
            }}>
              <div style={{
                padding: '14px 16px',
                background: '#f4f7fb'
              }}>
                <h3 style={{
                  color: AZUL,
                  margin: 0
                }}>
                  Pasajeros y asientos
                </h3>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Piso</th>
                      <th>Asiento</th>
                      <th>Documento</th>
                      <th>Nombre completo</th>
                      <th>Precio</th>
                    </tr>
                  </thead>

                  <tbody>
                    {detalle.items.map(item => (
                      <tr key={item.ReservaAsientoID}>
                        <td>{item.Nivel}</td>

                        <td>
                          <strong>
                            {String(
                              item.Numero
                            ).padStart(2, '0')}
                          </strong>
                        </td>

                        <td>
                          {item.TipoDocumento || 'DNI'}:
                          {' '}{item.NumeroDocumento}
                        </td>

                        <td>
                          {item.Nombres}{' '}
                          {item.Apellidos}
                        </td>

                        <td>
                          {soles(item.Precio)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* TOTAL */}

            <div style={{
              marginTop: 18,
              background: '#f5f8fc',
              borderRadius: 10,
              padding: 18,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12
            }}>
              <div>
                <strong style={{ color: AZUL }}>
                  Total de la reserva
                </strong>

                <p style={{
                  fontSize: 12,
                  color: '#64748b',
                  margin: '5px 0 0'
                }}>
                  {detalle.items.length} pasaje(s)
                </p>
              </div>

              <strong style={{
                color: AZUL,
                fontSize: 24
              }}>
                {soles(detalle.Total)}
              </strong>
            </div>

            <p style={{
              fontSize: 12,
              color: '#64748b',
              marginTop: 12
            }}>
              Esta constancia corresponde a una reserva.
              No acredita un pago ni es un comprobante
              tributario.
            </p>

            {/* ACCIONES */}

            <div
              className="dialog-actions"
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 9,
                marginTop: 20
              }}
            >
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  try {
                    imprimirPDF(detalle);
                  } catch (e) {
                    void alertaError(
                      (e as Error).message
                    );
                  }
                }}
              >
                <Printer size={16} />
                Imprimir
              </button>

              <button
                type="button"
                className="orange"
                onClick={() => {
                  try {
                    descargarPDF(detalle);
                  } catch (e) {
                    void alertaError(
                      (e as Error).message
                    );
                  }
                }}
              >
                <Download size={16} />
                Descargar PDF
              </button>

              <button
                type="button"
                className="secondary"
                disabled={
                  guardando ||
                  editandoCarga ||
                  detalle.Estado === 'CANCELADA'
                }
                onClick={() =>
                  void abrirEditar(detalle)
                }
                title="Editar pasajeros y asientos"
              >
                <Pencil size={16} />
                Editar
              </button>

              <button
                type="button"
                className="secondary"
                disabled={
                  guardando ||
                  cargandoDestino ||
                  ![
                    'COMPLETADA',
                    'CONFIRMADA',
                    'REPROGRAMADA'
                  ].includes(detalle.Estado)
                }
                onClick={() =>
                  void abrirReprogramacion(detalle)
                }
              >
                <CalendarClock size={16} />
                Reprogramar
              </button>

              <button
                type="button"
                className="secondary"
                disabled={
                  guardando ||
                  detalle.Estado === 'CANCELADA'
                }
                title={
                  detalle.Estado === 'CANCELADA'
                    ? 'La reserva ya está cancelada'
                    : 'Cancelar reserva y liberar asientos'
                }
                onClick={() =>
                  void cancelarReserva(detalle)
                }
              >
                <Ban size={16} />
                {guardando
                  ? 'Procesando...'
                  : 'Cancelar reserva'}
              </button>

              <button
                type="button"
                className="secondary"
                onClick={cerrarModal}
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
