
import {
  useEffect,
  useState,
  type FormEvent
} from 'react';

import {
  BarChart3,
  CalendarDays,
  Search,
  RefreshCw,
  Download,
  FileSpreadsheet,
  Ticket,
  Receipt,
  BusFront,
  Users,
  MessageSquareWarning,
  AlertCircle
} from 'lucide-react';

import { jsPDF } from 'jspdf';
import writeExcelFile from 'write-excel-file/browser';

import {
  obtenerReporte,
  resumenReportes
} from '../reglas/consultas';

// ===================================================
// SIGET-VÍA - REPORTES ADMINISTRATIVOS
// PASO 166.4 - RF14
// ===================================================

type TipoReporte =
  | 'reservas'
  | 'ventas'
  | 'viajes'
  | 'ocupacion'
  | 'reclamaciones';

type Registro = Record<
  string,
  string | number | boolean | null
>;

type RespuestaReporte = {
  tipo: TipoReporte;
  registros: Registro[];
  totalMostrado: number;
  limite: number;
  filtros: {
    desde: string | null;
    hasta: string | null;
    q: string;
  };
};

type Resumen = {
  TotalReservas: number;
  ReservasCanceladas: number;
  TotalVentas: number;
  VentasRegistradas: number;
  VentasAnuladas: number;
  TotalVentasVigentes: number;
  TotalViajes: number;
  ViajesProgramados: number;
  TotalReclamaciones: number;
  ReclamacionesCerradas: number;
  ReclamacionesPendientes: number;
};

type Filtros = {
  desde: string;
  hasta: string;
  q: string;
};

type Columna = {
  key: string;
  titulo: string;
  tipo?: 'fecha' | 'dinero' | 'numero' | 'porcentaje';
};

const AZUL = '#173b63';
const NARANJA = '#f58220';

const TIPOS: Array<{
  id: TipoReporte;
  nombre: string;
  descripcion: string;
}> = [
  {
    id: 'reservas',
    nombre: 'Reservas',
    descripcion: 'Reservas y asientos registrados'
  },
  {
    id: 'ventas',
    nombre: 'Ventas',
    descripcion: 'Comprobantes y pagos simulados'
  },
  {
    id: 'viajes',
    nombre: 'Viajes',
    descripcion: 'Programación y operación de viajes'
  },
  {
    id: 'ocupacion',
    nombre: 'Ocupación',
    descripcion: 'Asientos ocupados y disponibles'
  },
  {
    id: 'reclamaciones',
    nombre: 'Reclamaciones',
    descripcion: 'Reclamos, quejas y seguimiento'
  }
];

const COLUMNAS: Record<
  TipoReporte,
  Columna[]
> = {
  reservas: [
    { key: 'Codigo', titulo: 'Reserva' },
    {
      key: 'FechaReserva',
      titulo: 'Fecha de reserva',
      tipo: 'fecha'
    },
    { key: 'ClienteNombres', titulo: 'Nombres' },
    { key: 'ClienteApellidos', titulo: 'Apellidos' },
    { key: 'Origen', titulo: 'Origen' },
    { key: 'Destino', titulo: 'Destino' },
    {
      key: 'Salida',
      titulo: 'Salida',
      tipo: 'fecha'
    },
    { key: 'Estado', titulo: 'Estado' },
    {
      key: 'AsientosActivos',
      titulo: 'Asientos activos',
      tipo: 'numero'
    },
    {
      key: 'Total',
      titulo: 'Total',
      tipo: 'dinero'
    }
  ],
  ventas: [
    {
      key: 'CodigoComprobante',
      titulo: 'Comprobante'
    },
    {
      key: 'FechaVenta',
      titulo: 'Fecha de venta',
      tipo: 'fecha'
    },
    {
      key: 'CodigoReserva',
      titulo: 'Reserva'
    },
    {
      key: 'VendedorNombres',
      titulo: 'Nombres vendedor'
    },
    {
      key: 'VendedorApellidos',
      titulo: 'Apellidos vendedor'
    },
    {
      key: 'Total',
      titulo: 'Total',
      tipo: 'dinero'
    },
    { key: 'Estado', titulo: 'Estado venta' },
    { key: 'Metodo', titulo: 'Método de pago' },
    {
      key: 'MontoPago',
      titulo: 'Pago',
      tipo: 'dinero'
    },
    {
      key: 'EstadoPago',
      titulo: 'Estado pago'
    },
    {
      key: 'EsSimulado',
      titulo: 'Simulado'
    }
  ],
  viajes: [
    { key: 'ViajeID', titulo: 'Viaje ID' },
    { key: 'Origen', titulo: 'Origen' },
    { key: 'Destino', titulo: 'Destino' },
    {
      key: 'Salida',
      titulo: 'Salida',
      tipo: 'fecha'
    },
    {
      key: 'LlegadaEstimada',
      titulo: 'Llegada estimada',
      tipo: 'fecha'
    },
    { key: 'Placa', titulo: 'Bus / Placa' },
    { key: 'ConductorNombres', titulo: 'Conductor' },
    {
      key: 'ConductorApellidos',
      titulo: 'Apellidos'
    },
    {
      key: 'Capacidad',
      titulo: 'Capacidad',
      tipo: 'numero'
    },
    {
      key: 'Tarifa',
      titulo: 'Tarifa',
      tipo: 'dinero'
    },
    { key: 'Estado', titulo: 'Estado' }
  ],
  ocupacion: [
    { key: 'ViajeID', titulo: 'Viaje ID' },
    {
      key: 'Salida',
      titulo: 'Salida',
      tipo: 'fecha'
    },
    { key: 'Origen', titulo: 'Origen' },
    { key: 'Destino', titulo: 'Destino' },
    { key: 'Placa', titulo: 'Bus / Placa' },
    {
      key: 'TotalAsientos',
      titulo: 'Total asientos',
      tipo: 'numero'
    },
    {
      key: 'AsientosOcupados',
      titulo: 'Ocupados',
      tipo: 'numero'
    },
    {
      key: 'AsientosDisponibles',
      titulo: 'Disponibles',
      tipo: 'numero'
    },
    {
      key: 'PorcentajeOcupacion',
      titulo: 'Ocupación',
      tipo: 'porcentaje'
    },
    {
      key: 'EstadoViaje',
      titulo: 'Estado viaje'
    }
  ],
  reclamaciones: [
    {
      key: 'NumeroCorrelativo',
      titulo: 'Correlativo'
    },
    {
      key: 'FechaRegistro',
      titulo: 'Registro',
      tipo: 'fecha'
    },
    {
      key: 'NombreReclamante',
      titulo: 'Reclamante'
    },
    {
      key: 'NumeroDocumento',
      titulo: 'Documento'
    },
    {
      key: 'TipoSolicitud',
      titulo: 'Tipo'
    },
    { key: 'Estado', titulo: 'Estado' },
    {
      key: 'TotalRespuestas',
      titulo: 'Respuestas',
      tipo: 'numero'
    },
    {
      key: 'UltimaRespuesta',
      titulo: 'Última respuesta',
      tipo: 'fecha'
    }
  ]
};

const RESUMEN_VACIO: Resumen = {
  TotalReservas: 0,
  ReservasCanceladas: 0,
  TotalVentas: 0,
  VentasRegistradas: 0,
  VentasAnuladas: 0,
  TotalVentasVigentes: 0,
  TotalViajes: 0,
  ViajesProgramados: 0,
  TotalReclamaciones: 0,
  ReclamacionesCerradas: 0,
  ReclamacionesPendientes: 0
};

const FILTROS_VACIOS: Filtros = {
  desde: '',
  hasta: '',
  q: ''
};

// ===================================================
// SERVICIO HTTP
// ===================================================

// ===================================================
// FORMATOS
// ===================================================

function fechaTexto(valor: unknown): string {
  if (valor == null || valor === '') {
    return '-';
  }

  const texto = String(valor);
  const normalizada = texto
    .replace(' ', 'T')
    .slice(0, 19);

  const [fecha, hora] =
    normalizada.split('T');

  const partes = fecha?.split('-');

  if (
    !partes ||
    partes.length !== 3
  ) {
    return texto;
  }

  const [anio, mes, dia] = partes;

  return (
    `${dia}/${mes}/${anio}` +
    (hora ? ` ${hora}` : '')
  );
}

function dinero(valor: unknown): string {
  const numero = Number(valor ?? 0);

  if (!Number.isFinite(numero)) {
    return '-';
  }

  return `S/ ${numero.toFixed(2)}`;
}

function valorTexto(
  registro: Registro,
  columna: Columna
): string {
  const valor = registro[columna.key];

  if (valor === null || valor === undefined) {
    return '-';
  }

  if (columna.key === 'EsSimulado') {
    return Number(valor) === 1 ||
      valor === true
      ? 'Sí'
      : 'No';
  }

  if (columna.tipo === 'fecha') {
    return fechaTexto(valor);
  }

  if (columna.tipo === 'dinero') {
    return dinero(valor);
  }

  if (columna.tipo === 'porcentaje') {
    return `${Number(valor).toFixed(2)}%`;
  }

  return String(valor);
}

function nombreReporte(tipo: TipoReporte) {
  return TIPOS.find(item => item.id === tipo)
    ?.nombre || tipo;
}

function crearParametros(
  filtros: Filtros
): string {
  const params = new URLSearchParams();

  if (filtros.desde) {
    params.set('desde', filtros.desde);
  }

  if (filtros.hasta) {
    params.set('hasta', filtros.hasta);
  }

  if (filtros.q.trim()) {
    params.set('q', filtros.q.trim());
  }

  const cadena = params.toString();

  return cadena ? `?${cadena}` : '';
}

// ===================================================
// EXPORTACIÓN A CSV COMPATIBLE CON EXCEL
// ===================================================

function exportarCSV(
  tipo: TipoReporte,
  registros: Registro[]
) {
  const columnas = COLUMNAS[tipo];

  const escapar = (valor: string) => {
    // Evita interpretación de fórmulas
    // al abrir archivos CSV en Excel.
    const seguro = /^[\s]*[=+\-@\t\r]/.test(valor)
      ? `'${valor}`
      : valor;

    return `"${seguro.replace(/"/g, '""')}"`;
  };

  const encabezado = columnas
    .map(col => escapar(col.titulo))
    .join(';');

  const filas = registros.map(registro =>
    columnas
      .map(col =>
        escapar(valorTexto(registro, col))
      )
      .join(';')
  );

  const contenido = [
    encabezado,
    ...filas
  ].join('\r\n');

  const archivo = new Blob(
    ['\uFEFF', contenido],
    {
      type:
        'text/csv;charset=utf-8;'
    }
  );

  const url = URL.createObjectURL(archivo);

  const enlace = document.createElement('a');
  enlace.href = url;

  const fecha = new Date()
    .toISOString()
    .slice(0, 10);

  enlace.download =
    `SIGET-VIA-${tipo}-${fecha}.csv`;

  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();

  URL.revokeObjectURL(url);
}

// ===================================================
// EXPORTACIÓN A EXCEL (.xlsx real)
// ===================================================

function valorExcel(
  registro: Registro,
  columna: Columna
): string | number | null {
  const valor = registro[columna.key];

  if (valor === null || valor === undefined) {
    return null;
  }

  if (
    (columna.tipo === 'dinero' ||
      columna.tipo === 'porcentaje') &&
    Number.isFinite(Number(valor))
  ) {
    return Number(valor);
  }

  if (typeof valor === 'number') {
    return valor;
  }

  return valorTexto(registro, columna);
}

async function exportarExcel(
  tipo: TipoReporte,
  registros: Registro[]
) {
  const columnas = COLUMNAS[tipo];

  const titulo = [
    {
      value: `SIGET-VÍA · ${nombreReporte(tipo)}`,
      fontWeight: 'bold' as const
    }
  ];

  const generado = [
    `Generado: ${new Date().toLocaleString('es-PE')}`
  ];

  const encabezado = columnas.map(col => ({
    value: col.titulo,
    fontWeight: 'bold' as const,
    backgroundColor: '#0B2A4A',
    color: '#FFFFFF'
  }));

  const filas = registros.map(registro =>
    columnas.map(col => {
      const valor = valorExcel(registro, col);

      if (typeof valor === 'number') {
        return {
          value: valor,
          format:
            col.tipo === 'dinero'
              ? '"S/ "#,##0.00'
              : col.tipo === 'porcentaje'
                ? '0.00"%"'
                : undefined
        };
      }

      return valor === null
        ? { value: '-' }
        : { value: valor };
    })
  );

  const fecha = new Date()
    .toISOString()
    .slice(0, 10);

  await writeExcelFile(
    [titulo, generado, [], encabezado, ...filas],
    {
      sheet: 'Reporte',
      columns: columnas.map(col => ({
        width: Math.max(
          12,
          Math.min(40, col.titulo.length + 6)
        )
      })),
      stickyRowsCount: 4
    }
  ).toFile(`SIGET-VIA-${tipo}-${fecha}.xlsx`);
}

// ===================================================
// EXPORTACIÓN PDF INSTITUCIONAL
// ===================================================

function exportarPDF(
  tipo: TipoReporte,
  registros: Registro[],
  filtros: Filtros
) {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const azul = [23, 59, 99] as const;
  const naranja = [245, 130, 32] as const;
  const gris = [99, 110, 125] as const;

  const margen = 13;
  const ancho = 297;
  const anchoUtil = ancho - margen * 2;
  const limiteInferior = 193;

  const columnas = COLUMNAS[tipo];

  // Para conservar legibilidad, el PDF
  // reparte los campos en grupos de columnas.
  const columnasPorGrupo = 5;

  const grupos: Columna[][] = [];

  for (
    let i = 0;
    i < columnas.length;
    i += columnasPorGrupo
  ) {
    grupos.push(
      columnas.slice(i, i + columnasPorGrupo)
    );
  }

  let y = 0;

  function cabecera(
    subtitulo: string
  ) {
    doc.setFillColor(...azul);
    doc.rect(0, 0, ancho, 35, 'F');

    doc.setFillColor(...naranja);
    doc.rect(0, 35, ancho, 2, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);

    doc.text(
      'SIGET-VIA',
      margen,
      16
    );

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);

    doc.text(
      'TRANSPORTES VIA S.A.C.',
      margen,
      24
    );

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);

    doc.text(
      `REPORTE DE ${nombreReporte(tipo).toUpperCase()}`,
      ancho - margen,
      16,
      { align: 'right' }
    );

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');

    doc.text(
      subtitulo,
      ancho - margen,
      24,
      { align: 'right' }
    );

    y = 45;
  }

  function nuevaPagina(
    subtitulo: string
  ) {
    doc.addPage();
    cabecera(subtitulo);
  }

  function limpiar(valor: string) {
    return valor
      .replace(/→/g, ' a ')
      .replace(/•/g, '-')
      .replace(/\r/g, '')
      .trim() || '-';
  }

  function lineaInformativa() {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...azul);

    doc.text(
      `REGISTROS MOSTRADOS: ${registros.length}`,
      margen,
      y
    );

    y += 7;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...gris);

    const filtroTexto = [
      `Desde: ${filtros.desde || 'Sin límite'}`,
      `Hasta: ${filtros.hasta || 'Sin límite'}`,
      `Búsqueda: ${filtros.q || 'Todas'}`
    ].join('    |    ');

    const lineas = doc.splitTextToSize(
      limpiar(filtroTexto),
      anchoUtil
    ) as string[];

    doc.text(
      lineas,
      margen,
      y
    );

    y += lineas.length * 4 + 9;
  }

  for (
    let grupo = 0;
    grupo < grupos.length;
    grupo++
  ) {
    const cols = grupos[grupo];
    const subtitulo =
      `Columnas ${grupo + 1} de ${grupos.length}`;

    if (grupo === 0) {
      cabecera(subtitulo);
    } else {
      nuevaPagina(subtitulo);
    }

    lineaInformativa();

    const anchoColumna =
      anchoUtil / cols.length;

    function cabeceraTabla() {
      doc.setFillColor(...azul);
      doc.roundedRect(
        margen,
        y,
        anchoUtil,
        11,
        1.5,
        1.5,
        'F'
      );

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);

      cols.forEach((col, i) => {
        doc.text(
          col.titulo,
          margen + i * anchoColumna + 3,
          y + 7
        );
      });

      y += 11;
    }

    cabeceraTabla();

    if (registros.length === 0) {
      doc.setTextColor(...gris);
      doc.setFontSize(9);

      doc.text(
        'No existen datos para los filtros seleccionados.',
        margen + 4,
        y + 12
      );

      continue;
    }

    registros.forEach((registro, indice) => {
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');

      const celdas = cols.map(col =>
        doc.splitTextToSize(
          limpiar(valorTexto(registro, col)),
          anchoColumna - 6
        ) as string[]
      );

      const lineasMaximas = Math.max(
        1,
        ...celdas.map(item => item.length)
      );

      const alto = Math.max(
        11,
        lineasMaximas * 3.5 + 5
      );

      if (y + alto > limiteInferior) {
        nuevaPagina(subtitulo);
        cabeceraTabla();
      }

      if (indice % 2 === 0) {
        doc.setFillColor(244, 248, 251);
        doc.rect(
          margen,
          y,
          anchoUtil,
          alto,
          'F'
        );
      }

      doc.setDrawColor(220, 228, 235);
      doc.setLineWidth(0.2);

      doc.line(
        margen,
        y + alto,
        ancho - margen,
        y + alto
      );

      doc.setTextColor(...azul);

      celdas.forEach((lineas, i) => {
        doc.text(
          lineas,
          margen + i * anchoColumna + 3,
          y + 5
        );
      });

      y += alto;
    });
  }

  const totalPaginas = doc.getNumberOfPages();

  for (
    let pagina = 1;
    pagina <= totalPaginas;
    pagina++
  ) {
    doc.setPage(pagina);

    doc.setDrawColor(215, 224, 234);
    doc.line(
      margen,
      198,
      ancho - margen,
      198
    );

    doc.setFillColor(...naranja);
    doc.rect(
      margen,
      198,
      32,
      1,
      'F'
    );

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...gris);

    doc.text(
      'SIGET-VIA | REPORTE ADMINISTRATIVO',
      margen,
      205
    );

    doc.text(
      'Fuente: SIGET_VIA_DB - SQL Server',
      ancho / 2,
      205,
      { align: 'center' }
    );

    doc.text(
      `Página ${pagina} de ${totalPaginas}`,
      ancho - margen,
      205,
      { align: 'right' }
    );
  }

  const fecha = new Date()
    .toISOString()
    .slice(0, 10);

  doc.save(
    `SIGET-VIA-Reporte-${tipo}-${fecha}.pdf`
  );
}

// ===================================================
// COMPONENTE
// ===================================================

export default function Reportes({
  token
}: {
  token: string;
}) {
  const [tipo, setTipo] =
    useState<TipoReporte>('reservas');

  const [filtros, setFiltros] =
    useState<Filtros>({
      ...FILTROS_VACIOS
    });

  const [
    filtrosAplicados,
    setFiltrosAplicados
  ] = useState<Filtros>({
    ...FILTROS_VACIOS
  });

  const [registros, setRegistros] =
    useState<Registro[]>([]);

  const [resumen, setResumen] =
    useState<Resumen>(RESUMEN_VACIO);

  const [cargando, setCargando] =
    useState(true);

  const [error, setError] =
    useState('');

  const [limite, setLimite] =
    useState(500);

  // ================================================
  // CARGA INICIAL
  // ================================================

  useEffect(() => {
    let activo = true;

    setCargando(true);

    Promise.all([
      obtenerReporte<RespuestaReporte>(token, 'reservas'),
      resumenReportes<Resumen>(token)
    ])
      .then(([reporte, indicadores]) => {
        if (!activo) return;

        setRegistros(reporte.registros);
        setLimite(reporte.limite);
        setResumen(indicadores);
        setError('');
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

  // ================================================
  // CONSULTAR REPORTE
  // ================================================

  async function consultar(
    nuevoTipo: TipoReporte = tipo,
    nuevosFiltros: Filtros = filtros
  ) {
    if (
      nuevosFiltros.desde &&
      nuevosFiltros.hasta &&
      nuevosFiltros.desde > nuevosFiltros.hasta
    ) {
      setError(
        'La fecha inicial no puede superar la fecha final.'
      );
      return;
    }

    setCargando(true);
    setError('');

    try {
      const params =
        crearParametros(nuevosFiltros);

      const filtrosResumen =
        crearParametros({
          ...nuevosFiltros,
          q: ''
        });

      const [
        reporte,
        indicadores
      ] = await Promise.all([
        obtenerReporte<RespuestaReporte>(token, nuevoTipo, params),
        resumenReportes<Resumen>(token, filtrosResumen)
      ]);

      setRegistros(reporte.registros);
      setLimite(reporte.limite);
      setResumen(indicadores);
      setTipo(nuevoTipo);

      setFiltrosAplicados({
        ...nuevosFiltros
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  // ================================================
  // BUSCAR
  // ================================================

  function buscar(
    e: FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    void consultar(tipo, filtros);
  }

  function limpiar() {
    const vacios = {
      ...FILTROS_VACIOS
    };

    setFiltros(vacios);
    void consultar(tipo, vacios);
  }

  function cambiarTipo(
    nuevoTipo: TipoReporte
  ) {
    if (cargando) return;

    setTipo(nuevoTipo);

    void consultar(
      nuevoTipo,
      filtrosAplicados
    );
  }

  // ================================================
  // EXPORTAR
  // ================================================

  function descargarPDF() {
    if (cargando || error) return;

    try {
      exportarPDF(
        tipo,
        registros,
        filtrosAplicados
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function descargarExcel() {
    if (cargando || error) return;

    try {
      await exportarExcel(
        tipo,
        registros
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function descargarCSV() {
    if (cargando || error) return;

    try {
      exportarCSV(
        tipo,
        registros
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const columnas = COLUMNAS[tipo];

  const indicadores = [
    {
      titulo: 'Reservas',
      valor: Number(resumen.TotalReservas),
      Icono: Ticket
    },
    {
      titulo: 'Ventas registradas',
      valor: Number(resumen.VentasRegistradas),
      Icono: Receipt
    },
    {
      titulo: 'Monto vigente',
      valor: dinero(
        resumen.TotalVentasVigentes
      ),
      Icono: BarChart3
    },
    {
      titulo: 'Viajes',
      valor: Number(resumen.TotalViajes),
      Icono: BusFront
    },
    {
      titulo: 'Reclamaciones',
      valor: Number(
        resumen.TotalReclamaciones
      ),
      Icono: MessageSquareWarning
    }
  ];

  return (
    <>
      {/* ENCABEZADO */}

      <div className="heading">
        <h1>Reportes administrativos</h1>

        <p>
          RF14 · Consultas y análisis de
          operaciones de SIGET-VÍA
        </p>
      </div>

      {/* INDICADORES */}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 14,
          marginBottom: 18
        }}
      >
        {indicadores.map(item => (
          <div
            key={item.titulo}
            className="panel"
            style={{
              padding: 18,
              display: 'flex',
              gap: 12,
              alignItems: 'center'
            }}
          >
            <item.Icono
              size={23}
              color={AZUL}
            />

            <div>
              <div
                style={{
                  fontSize: 12,
                  color: '#64748b'
                }}
              >
                {item.titulo}
              </div>

              <strong
                style={{
                  fontSize: 20,
                  color: AZUL
                }}
              >
                {item.valor}
              </strong>
            </div>
          </div>
        ))}
      </div>

      {/* PANEL PRINCIPAL */}

      <div className="panel">
        <div className="section-heading">
          <div>
            <h2>
              Consultas de reportes
            </h2>

            <p>
              Información obtenida directamente
              desde SQL Server
            </p>
          </div>

          <button
            type="button"
            className="secondary"
            disabled={cargando}
            onClick={() =>
              void consultar(
                tipo,
                filtrosAplicados
              )
            }
          >
            <RefreshCw size={16} />
            Actualizar
          </button>
        </div>

        {/* SELECCIÓN DE REPORTE */}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 10,
            marginBottom: 20
          }}
        >
          {TIPOS.map(item => (
            <button
              type="button"
              key={item.id}
              disabled={cargando}
              title={item.descripcion}
              onClick={() =>
                cambiarTipo(item.id)
              }
              style={{
                padding: '13px 10px',
                borderRadius: 8,
                border:
                  tipo === item.id
                    ? `2px solid ${NARANJA}`
                    : '1px solid #d9e2ec',
                background:
                  tipo === item.id
                    ? '#fff5ed'
                    : '#f8fafc',
                color: AZUL,
                cursor: cargando
                  ? 'wait'
                  : 'pointer',
                fontWeight: 700
              }}
            >
              {item.nombre}
            </button>
          ))}
        </div>

        {/* FILTROS */}

        <form
          onSubmit={buscar}
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(175px, 1fr))',
            gap: 12,
            marginBottom: 18
          }}
        >
          <label>
            Fecha inicial

            <div
              style={{
                position: 'relative'
              }}
            >
              <input
                type="date"
                value={filtros.desde}
                onChange={e =>
                  setFiltros(actual => ({
                    ...actual,
                    desde: e.target.value
                  }))
                }
              />
            </div>
          </label>

          <label>
            Fecha final

            <input
              type="date"
              value={filtros.hasta}
              onChange={e =>
                setFiltros(actual => ({
                  ...actual,
                  hasta: e.target.value
                }))
              }
            />
          </label>

          <label>
            Búsqueda

            <input
              type="text"
              maxLength={100}
              placeholder="Código, ruta, estado..."
              value={filtros.q}
              onChange={e =>
                setFiltros(actual => ({
                  ...actual,
                  q: e.target.value
                }))
              }
            />
          </label>

          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'end'
            }}
          >
            <button
              type="submit"
              className="orange"
              disabled={cargando}
            >
              <Search size={16} />
              Consultar
            </button>

            <button
              type="button"
              className="secondary"
              disabled={cargando}
              onClick={limpiar}
            >
              Limpiar
            </button>
          </div>
        </form>

        {error && (
          <div
            className="alert"
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center'
            }}
          >
            <AlertCircle size={17} />
            {error}
          </div>
        )}

        {/* ENCABEZADO DE RESULTADOS */}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
            padding: '15px 0',
            borderTop:
              '1px solid #e2e8f0'
          }}
        >
          <div>
            <strong
              style={{
                fontSize: 17,
                color: AZUL
              }}
            >
              Reporte de {nombreReporte(tipo)}
            </strong>

            <p
              style={{
                marginTop: 5,
                color: '#64748b',
                fontSize: 12
              }}
            >
              {registros.length} registros mostrados
              {' · '}
              Máximo {limite} por consulta
            </p>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap'
            }}
          >
            <button
              type="button"
              className="secondary"
              disabled={cargando || !!error}
              onClick={descargarExcel}
            >
              <FileSpreadsheet size={16} />
              Excel
            </button>

            <button
              type="button"
              className="secondary"
              disabled={cargando || !!error}
              onClick={descargarCSV}
            >
              <FileSpreadsheet size={16} />
              CSV
            </button>

            <button
              type="button"
              className="orange"
              disabled={cargando || !!error}
              onClick={descargarPDF}
            >
              <Download size={16} />
              Exportar PDF
            </button>
          </div>
        </div>

        {/* TABLA */}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {columnas.map(columna => (
                  <th key={columna.key}>
                    {columna.titulo}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {cargando && (
                <tr>
                  <td colSpan={columnas.length}>
                    Cargando reporte...
                  </td>
                </tr>
              )}

              {!cargando &&
                registros.map(
                  (registro, indice) => (
                    <tr
                      key={
                        `${tipo}-` +
                        `${String(
                          registro.ReservaID ??
                          registro.VentaID ??
                          registro.ViajeID ??
                          registro.ReclamacionID ??
                          indice
                        )}`
                      }
                    >
                      {columnas.map(columna => (
                        <td key={columna.key}>
                          {valorTexto(
                            registro,
                            columna
                          )}
                        </td>
                      ))}
                    </tr>
                  )
                )}

              {!cargando &&
                registros.length === 0 &&
                !error && (
                  <tr>
                    <td colSpan={columnas.length}>
                      No existen registros para
                      los filtros seleccionados.
                    </td>
                  </tr>
                )}
            </tbody>
          </table>
        </div>
      </div>

      {/* NOTA */}

      <p
        style={{
          color: '#64748b',
          fontSize: 12,
          marginTop: 14
        }}
      >
        <CalendarDays
          size={15}
          style={{
            verticalAlign: 'middle',
            marginRight: 6
          }}
        />

        Los reportes consultan información real
        de SQL Server. Los pagos registrados
        son simulados. Puedes exportar a Excel
        (.xlsx), CSV o PDF.
      </p>

      <p
        style={{
          color: '#64748b',
          fontSize: 12,
          marginTop: 4
        }}
      >
        <Users
          size={15}
          style={{
            verticalAlign: 'middle',
            marginRight: 6
          }}
        />

        Acceso exclusivo para administradores.
        Las consultas no modifican registros
        de la base de datos.
      </p>
    </>
  );
}
