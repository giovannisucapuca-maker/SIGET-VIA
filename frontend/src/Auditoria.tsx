
import {
  useEffect,
  useState,
  type FormEvent
} from 'react';

import {
  ShieldCheck,
  Search,
  Eye,
  X,
  RefreshCw,
  Download,
  FilePlus,
  ArrowLeftRight,
  Users,
  ClipboardList
} from 'lucide-react';

import { jsPDF } from 'jspdf';

import {
  alertaError,
  alertaAdvertencia,
  alertaExito
} from './utils/alertas';

// ======================================================
// SIGET-VÍA - GESTIÓN DE AUDITORÍA
// PASO 163 - REPORTE PDF CORPORATIVO
// ======================================================

type Evento = {
  AuditoriaID: number;
  UsuarioID: number | null;
  Entidad: string;
  RegistroID: number | null;
  Accion: string;
  Detalle: string | null;
  Fecha: string;
  UsuarioNombres: string | null;
  UsuarioApellidos: string | null;
  UsuarioCorreo: string | null;
  RolID?: number | null;
};

type Resumen = {
  TotalEventos: number;
  Inserciones: number;
  CambiosEstado: number;
  Actualizaciones: number;
  IniciosSesion: number;
  UsuariosInvolucrados: number;
};

type Usuario = {
  UsuarioID: number;
  Nombres: string;
  Apellidos: string;
  Estado: string;
};

type Catalogos = {
  acciones: string[];
  entidades: {
    Entidad: string;
  }[];
  usuarios: Usuario[];
};

type Filtros = {
  q: string;
  accion: string;
  entidad: string;
  usuarioId: string;
  desde: string;
  hasta: string;
};

const API =
  import.meta.env.VITE_API_URL ||
  'http://localhost:4000/api';

const AZUL = '#173b63';

const crearFiltros = (): Filtros => ({
  q: '',
  accion: '',
  entidad: '',
  usuarioId: '',
  desde: '',
  hasta: ''
});

const crearResumen = (): Resumen => ({
  TotalEventos: 0,
  Inserciones: 0,
  CambiosEstado: 0,
  Actualizaciones: 0,
  IniciosSesion: 0,
  UsuariosInvolucrados: 0
});

// ======================================================
// SERVICIO API
// ======================================================

async function api<T>(
  ruta: string,
  token: string
): Promise<T> {
  const respuesta = await fetch(
    `${API}${ruta}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`
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

// ======================================================
// FORMATOS
// ======================================================

function fechaTexto(valor: string): string {
  if (!valor) return '-';

  const normalizada = valor
    .replace(' ', 'T')
    .slice(0, 19);

  const partes = normalizada.split('T');

  if (partes.length !== 2) {
    return valor;
  }

  const [anio, mes, dia] =
    partes[0].split('-');

  return (
    `${dia}/${mes}/${anio} ` +
    partes[1]
  );
}

function usuarioTexto(evento: Evento): string {
  const nombre = [
    evento.UsuarioNombres,
    evento.UsuarioApellidos
  ]
    .filter(Boolean)
    .join(' ');

  if (nombre) return nombre;

  return evento.UsuarioID
    ? `Usuario #${evento.UsuarioID}`
    : 'Sistema';
}

function nombreAccion(accion: string): string {
  switch (accion) {
    case 'INSERT':
      return 'Registro';

    case 'UPDATE':
      return 'Actualización';

    case 'DELETE':
      return 'Eliminación';

    case 'CAMBIO_ESTADO':
      return 'Cambio de estado';

    case 'LOGIN':
      return 'Inicio de sesión';

    default:
      return 'Otra operación';
  }
}

// ======================================================
// PARÁMETROS DE BÚSQUEDA
// ======================================================

function crearParametros(
  filtros: Filtros
): string {
  const params = new URLSearchParams();

  if (filtros.q.trim()) {
    params.set('q', filtros.q.trim());
  }

  if (filtros.accion) {
    params.set('accion', filtros.accion);
  }

  if (filtros.entidad) {
    params.set('entidad', filtros.entidad);
  }

  if (filtros.usuarioId) {
    params.set('usuarioId', filtros.usuarioId);
  }

  if (filtros.desde) {
    params.set('desde', filtros.desde);
  }

  if (filtros.hasta) {
    params.set('hasta', filtros.hasta);
  }

  const cadena = params.toString();

  return cadena ? `?${cadena}` : '';
}

// ======================================================
// REPORTE PDF CORPORATIVO
// ======================================================

function generarPDF(
  eventos: Evento[],
  filtros: Filtros
) {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  // PALETA INSTITUCIONAL

  const azul: [number, number, number] =
    [23, 59, 99];

  const naranja: [number, number, number] =
    [245, 130, 32];

  const gris: [number, number, number] =
    [100, 116, 139];

  const claro: [number, number, number] =
    [243, 247, 251];

  const borde: [number, number, number] =
    [220, 227, 235];

  const ancho = 297;
  const izquierda = 14;
  const derecha = 283;
  const anchoUtil = derecha - izquierda;

  const margenInferior = 192;

  const generado = new Date()
    .toLocaleString('es-PE');

  let y = 0;

  // Para mantener compatibilidad con fuentes
  // estándar de jsPDF en textos especiales.

  function limpiarTexto(
    valor: unknown
  ): string {
    if (
      valor === null ||
      valor === undefined
    ) {
      return '-';
    }

    return String(valor)
      .replace(/\r/g, '')
      .replace(/→/g, ' a ')
      .replace(/•/g, '-')
      .replace(/[^\S\n]+/g, ' ')
      .trim() || '-';
  }

  // ================================================
  // ENCABEZADO EN CADA PÁGINA
  // ================================================

  function dibujarEncabezado() {
    doc.setFillColor(...azul);
    doc.rect(
      0,
      0,
      ancho,
      35,
      'F'
    );

    doc.setFillColor(...naranja);
    doc.rect(
      0,
      35,
      ancho,
      2,
      'F'
    );

    // Identificador visual institucional.

    doc.setFillColor(...naranja);

    doc.roundedRect(
      14,
      9,
      8,
      17,
      2,
      2,
      'F'
    );

    doc.setTextColor(255, 255, 255);

    doc.setFont(
      'helvetica',
      'bold'
    );

    doc.setFontSize(21);

    doc.text(
      'SIGET-VIA',
      28,
      17
    );

    doc.setFont(
      'helvetica',
      'normal'
    );

    doc.setFontSize(8.5);

    doc.text(
      'TRANSPORTES VIA S.A.C.',
      28,
      24
    );

    // Título del documento.

    doc.setFont(
      'helvetica',
      'bold'
    );

    doc.setFontSize(15);

    doc.text(
      'REPORTE DE AUDITORIA',
      derecha,
      16,
      { align: 'right' }
    );

    doc.setFont(
      'helvetica',
      'normal'
    );

    doc.setFontSize(8.5);

    doc.text(
      'Control y trazabilidad de operaciones',
      derecha,
      24,
      { align: 'right' }
    );
  }

  // ================================================
  // INDICADORES DEL REPORTE
  // ================================================

  function dibujarIndicadores() {
    const total = eventos.length;

    const inserciones = eventos.filter(
      evento => evento.Accion === 'INSERT'
    ).length;

    const cambios = eventos.filter(
      evento => evento.Accion === 'CAMBIO_ESTADO'
    ).length;

    const usuarios = new Set(
      eventos
        .map(evento => evento.UsuarioID)
        .filter(
          (id): id is number =>
            id !== null
        )
    ).size;

    const tarjetas = [
      {
        titulo: 'EVENTOS INCLUIDOS',
        valor: total
      },
      {
        titulo: 'NUEVOS REGISTROS',
        valor: inserciones
      },
      {
        titulo: 'CAMBIOS DE ESTADO',
        valor: cambios
      },
      {
        titulo: 'USUARIOS INVOLUCRADOS',
        valor: usuarios
      }
    ];

    const separacion = 5;

    const anchoTarjeta =
      (anchoUtil - separacion * 3) / 4;

    tarjetas.forEach((tarjeta, indice) => {
      const x =
        izquierda +
        indice * (anchoTarjeta + separacion);

      doc.setFillColor(...claro);

      doc.roundedRect(
        x,
        y,
        anchoTarjeta,
        23,
        2,
        2,
        'F'
      );

      doc.setFillColor(...naranja);

      doc.rect(
        x,
        y + 4,
        1.7,
        15,
        'F'
      );

      doc.setTextColor(...gris);

      doc.setFont(
        'helvetica',
        'normal'
      );

      doc.setFontSize(7.5);

      doc.text(
        tarjeta.titulo,
        x + 5,
        y + 8.5
      );

      doc.setTextColor(...azul);

      doc.setFont(
        'helvetica',
        'bold'
      );

      doc.setFontSize(16);

      doc.text(
        String(tarjeta.valor),
        x + 5,
        y + 18
      );
    });

    y += 30;
  }

  // ================================================
  // FILTROS APLICADOS
  // ================================================

  function dibujarFiltros() {
    doc.setTextColor(...azul);

    doc.setFont(
      'helvetica',
      'bold'
    );

    doc.setFontSize(9);

    doc.text(
      'CRITERIOS DE CONSULTA',
      izquierda,
      y
    );

    y += 6;

    const criterios = [
      `Accion: ${filtros.accion || 'Todas'}`,
      `Entidad: ${filtros.entidad || 'Todas'}`,
      `Usuario ID: ${filtros.usuarioId || 'Todos'}`,
      `Desde: ${filtros.desde || 'Sin limite'}`,
      `Hasta: ${filtros.hasta || 'Sin limite'}`
    ];

    if (filtros.q.trim()) {
      criterios.push(
        `Busqueda: ${filtros.q.trim()}`
      );
    }

    const informacion = criterios.join('   |   ');

    doc.setFont(
      'helvetica',
      'normal'
    );

    doc.setFontSize(8);

    doc.setTextColor(...gris);

    const lineas = doc.splitTextToSize(
      limpiarTexto(informacion),
      anchoUtil
    ) as string[];

    doc.text(
      lineas,
      izquierda,
      y
    );

    y += lineas.length * 4 + 8;
  }

  // ================================================
  // COLUMNAS DEL HISTORIAL
  // ================================================

  const columnas = [
    {
      titulo: 'ID',
      ancho: 13
    },
    {
      titulo: 'FECHA / HORA',
      ancho: 35
    },
    {
      titulo: 'USUARIO',
      ancho: 39
    },
    {
      titulo: 'ENTIDAD',
      ancho: 28
    },
    {
      titulo: 'REG.',
      ancho: 16
    },
    {
      titulo: 'ACCION',
      ancho: 34
    },
    {
      titulo: 'DESCRIPCION DE LA OPERACION',
      ancho: 104
    }
  ];

  function dibujarCabeceraTabla() {
    doc.setFillColor(...azul);

    doc.roundedRect(
      izquierda,
      y,
      anchoUtil,
      11,
      1.5,
      1.5,
      'F'
    );

    doc.setTextColor(255, 255, 255);

    doc.setFont(
      'helvetica',
      'bold'
    );

    doc.setFontSize(7.5);

    let x = izquierda;

    columnas.forEach(columna => {
      doc.text(
        columna.titulo,
        x + 2,
        y + 7
      );

      x += columna.ancho;
    });

    y += 11;
  }

  // ================================================
  // PAGINACIÓN
  // ================================================

  function nuevaPagina() {
    doc.addPage();

    dibujarEncabezado();

    y = 46;

    dibujarCabeceraTabla();
  }

  // ================================================
  // FILAS DE LA TABLA
  // ================================================

  function dibujarFila(
    evento: Evento,
    indice: number
  ) {
    const valores = [
      String(evento.AuditoriaID),
      fechaTexto(evento.Fecha),
      usuarioTexto(evento),
      evento.Entidad,
      String(evento.RegistroID ?? '-'),
      evento.Accion,
      evento.Detalle || '-'
    ];

    doc.setFont(
      'helvetica',
      'normal'
    );

    doc.setFontSize(7.3);

    const celdas = valores.map(
      (valor, indiceColumna) =>
        doc.splitTextToSize(
          limpiarTexto(valor),
          columnas[indiceColumna].ancho - 4
        ) as string[]
    );

    // Las descripciones largas pueden ocupar
    // varias páginas. Se dividen por fragmentos.

    const alturaLinea = 3.7;
    const espacioVertical = 5;

    const maximoPorPagina = () =>
      Math.max(
        1,
        Math.floor(
          (margenInferior - y - espacioVertical) /
          alturaLinea
        )
      );

    let posicion = 0;

    const cantidadMaxima = Math.max(
      ...celdas.map(celda => celda.length)
    );

    while (posicion < cantidadMaxima) {
      if (y + 12 > margenInferior) {
        nuevaPagina();
      }

      const cantidad = Math.min(
        cantidadMaxima - posicion,
        maximoPorPagina()
      );

      const fragmentos = celdas.map(
        lineas =>
          lineas.slice(
            posicion,
            posicion + cantidad
          )
      );

      const alto = Math.max(
        12,
        cantidad * alturaLinea +
          espacioVertical
      );

      // Fondo de fila alternado.

      if (indice % 2 === 0) {
        doc.setFillColor(
          248,
          250,
          253
        );

        doc.rect(
          izquierda,
          y,
          anchoUtil,
          alto,
          'F'
        );
      }

      // Separador horizontal.

      doc.setDrawColor(...borde);
      doc.setLineWidth(0.15);

      doc.line(
        izquierda,
        y + alto,
        derecha,
        y + alto
      );

      let x = izquierda;

      fragmentos.forEach(
        (lineas, columnaIndice) => {
          if (
            columnaIndice === 5 &&
            evento.Accion === 'INSERT'
          ) {
            doc.setTextColor(
              30,
              115,
              80
            );

            doc.setFont(
              'helvetica',
              'bold'
            );
          } else if (
            columnaIndice === 5 &&
            evento.Accion === 'CAMBIO_ESTADO'
          ) {
            doc.setTextColor(
              185,
              95,
              25
            );

            doc.setFont(
              'helvetica',
              'bold'
            );
          } else {
            doc.setTextColor(...azul);

            doc.setFont(
              'helvetica',
              'normal'
            );
          }

          doc.setFontSize(7.3);

          if (lineas.length > 0) {
            doc.text(
              lineas,
              x + 2,
              y + 5
            );
          }

          x += columnas[columnaIndice].ancho;
        }
      );

      y += alto;
      posicion += cantidad;

      if (posicion < cantidadMaxima) {
        nuevaPagina();
      }
    }
  }

  // ================================================
  // GENERACIÓN DEL DOCUMENTO
  // ================================================

  dibujarEncabezado();

  y = 46;

  doc.setTextColor(...azul);

  doc.setFont(
    'helvetica',
    'bold'
  );

  doc.setFontSize(12);

  doc.text(
    'INFORME GENERAL DE MOVIMIENTOS',
    izquierda,
    y
  );

  doc.setTextColor(...gris);

  doc.setFont(
    'helvetica',
    'normal'
  );

  doc.setFontSize(8);

  doc.text(
    `Generado: ${generado}`,
    derecha,
    y,
    { align: 'right' }
  );

  y += 8;

  dibujarIndicadores();
  dibujarFiltros();

  if (y > margenInferior - 23) {
    nuevaPagina();
  } else {
    dibujarCabeceraTabla();
  }

  if (eventos.length === 0) {
    doc.setTextColor(...gris);

    doc.setFontSize(9);

    doc.text(
      'No existen eventos para los filtros seleccionados.',
      izquierda + 3,
      y + 12
    );
  } else {
    eventos.forEach(
      (evento, indice) => {
        dibujarFila(
          evento,
          indice
        );
      }
    );
  }

  // ================================================
  // PIE DE PÁGINA
  // ================================================

  const totalPaginas =
    doc.getNumberOfPages();

  for (
    let pagina = 1;
    pagina <= totalPaginas;
    pagina++
  ) {
    doc.setPage(pagina);

    doc.setDrawColor(...borde);

    doc.setLineWidth(0.3);

    doc.line(
      izquierda,
      197,
      derecha,
      197
    );

    doc.setFillColor(...naranja);

    doc.rect(
      izquierda,
      197,
      30,
      1,
      'F'
    );

    doc.setTextColor(...gris);

    doc.setFont(
      'helvetica',
      'normal'
    );

    doc.setFontSize(7.5);

    doc.text(
      'SIGET-VIA | DOCUMENTO INTERNO DE AUDITORIA',
      izquierda,
      204
    );

    doc.text(
      'Fuente: SIGET_VIA_DB - SQL Server',
      ancho / 2,
      204,
      { align: 'center' }
    );

    doc.text(
      `Pagina ${pagina} de ${totalPaginas}`,
      derecha,
      204,
      { align: 'right' }
    );
  }

  // ================================================
  // DESCARGA DEL PDF
  // ================================================

  const fechaArchivo = new Date()
    .toISOString()
    .slice(0, 10);

  doc.save(
    `SIGET-VIA-Reporte-Auditoria-${fechaArchivo}.pdf`
  );
}

// ======================================================
// COMPONENTE PRINCIPAL
// ======================================================

export default function Auditoria({
  token
}: {
  token: string;
}) {
  const [eventos, setEventos] =
    useState<Evento[]>([]);

  const [resumen, setResumen] =
    useState<Resumen>(crearResumen);

  const [catalogos, setCatalogos] =
    useState<Catalogos>({
      acciones: [],
      entidades: [],
      usuarios: []
    });

  const [filtros, setFiltros] =
    useState<Filtros>(crearFiltros);

  const [
    filtrosAplicados,
    setFiltrosAplicados
  ] = useState<Filtros>(crearFiltros);

  const [detalle, setDetalle] =
    useState<Evento | null>(null);

  const [cargando, setCargando] =
    useState(true);

  const [consultando, setConsultando] =
    useState(false);

  const [error, setError] =
    useState('');

  // ==================================================
  // CARGAR HISTORIAL
  // ==================================================

  async function cargar(
    valores: Filtros = filtros
  ) {
    if (
      valores.desde &&
      valores.hasta &&
      valores.desde > valores.hasta
    ) {
      await alertaAdvertencia(
        'La fecha inicial no puede ser posterior a la final.'
      );

      return;
    }

    setCargando(true);
    setError('');

    try {
      const [
        registros,
        indicadores
      ] = await Promise.all([
        api<Evento[]>(
          `/auditoria${crearParametros(valores)}`,
          token
        ),
        api<Resumen>(
          '/auditoria/resumen',
          token
        )
      ]);

      setEventos(registros);
      setResumen(indicadores);

      setFiltrosAplicados({
        ...valores
      });
    } catch (e) {
      const mensaje =
        (e as Error).message;

      setError(mensaje);

      await alertaError(
        mensaje,
        'No se pudo consultar la auditoría'
      );
    } finally {
      setCargando(false);
    }
  }

  // ==================================================
  // CARGA INICIAL
  // ==================================================

  useEffect(() => {
    let activo = true;

    Promise.all([
      api<Evento[]>(
        '/auditoria',
        token
      ),
      api<Resumen>(
        '/auditoria/resumen',
        token
      ),
      api<Catalogos>(
        '/auditoria/catalogos',
        token
      )
    ])
      .then(
        ([
          registros,
          indicadores,
          opciones
        ]) => {
          if (!activo) return;

          setEventos(registros);
          setResumen(indicadores);
          setCatalogos(opciones);
          setError('');
        }
      )
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

  // ==================================================
  // VER DETALLE
  // ==================================================

  async function abrirDetalle(id: number) {
    if (consultando) return;

    setConsultando(true);

    try {
      const registro = await api<Evento>(
        `/auditoria/${id}`,
        token
      );

      setDetalle(registro);
    } catch (e) {
      await alertaError(
        (e as Error).message,
        'No se pudo consultar el evento'
      );
    } finally {
      setConsultando(false);
    }
  }

  // ==================================================
  // FILTROS
  // ==================================================

  function actualizarFiltro<
    K extends keyof Filtros
  >(
    campo: K,
    valor: Filtros[K]
  ) {
    setFiltros(anterior => ({
      ...anterior,
      [campo]: valor
    }));
  }

  function buscar(
    e: FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    void cargar(filtros);
  }

  function limpiar() {
    const vacios = crearFiltros();

    setFiltros(vacios);

    void cargar(vacios);
  }

  // ==================================================
  // EXPORTAR PDF
  // ==================================================

  function exportar() {
    if (cargando) return;

    try {
      generarPDF(
        eventos,
        filtrosAplicados
      );

      void alertaExito(
        'El informe de auditoría se generó correctamente.',
        'Reporte generado'
      );
    } catch (e) {
      void alertaError(
        (e as Error).message,
        'No se pudo generar el PDF'
      );
    }
  }

  // ==================================================
  // INTERFAZ
  // ==================================================

  return (
    <>
      <div className="heading">
        <h1>Gestión de auditoría</h1>

        <p>
          Seguimiento, control y trazabilidad
          de las operaciones del sistema
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
        {[
          {
            titulo: 'Eventos registrados',
            valor: resumen.TotalEventos,
            Icono: ClipboardList
          },
          {
            titulo: 'Inserciones',
            valor: resumen.Inserciones,
            Icono: FilePlus
          },
          {
            titulo: 'Cambios de estado',
            valor: resumen.CambiosEstado,
            Icono: ArrowLeftRight
          },
          {
            titulo: 'Usuarios involucrados',
            valor: resumen.UsuariosInvolucrados,
            Icono: Users
          }
        ].map(item => (
          <div
            key={item.titulo}
            className="panel"
            style={{
              padding: 18,
              display: 'flex',
              alignItems: 'center',
              gap: 12
            }}
          >
            <item.Icono
              size={24}
              color={AZUL}
            />

            <div>
              <div
                style={{
                  color: '#64748b',
                  fontSize: 12
                }}
              >
                {item.titulo}
              </div>

              <strong
                style={{
                  fontSize: 21,
                  color: AZUL
                }}
              >
                {Number(item.valor)}
              </strong>
            </div>
          </div>
        ))}
      </div>

      {/* HISTORIAL */}

      <div className="panel">
        <div className="section-heading">
          <div>
            <h2>
              Registros · Gestión de auditoría
            </h2>

            <p>
              Historial de operaciones almacenado
              en SQL Server
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
              disabled={cargando}
              onClick={() =>
                void cargar(filtrosAplicados)
              }
            >
              <RefreshCw size={16} />
              Actualizar
            </button>

            <button
              type="button"
              className="orange"
              disabled={cargando}
              onClick={exportar}
            >
              <Download size={16} />
              Exportar PDF
            </button>
          </div>
        </div>

        {/* AVISO */}

        <div
          style={{
            padding: 14,
            background: '#f1f5f9',
            borderRadius: 8,
            marginBottom: 17,
            fontSize: 13
          }}
        >
          <ShieldCheck
            size={17}
            style={{
              verticalAlign: 'middle',
              marginRight: 7
            }}
          />

          Los eventos de auditoría son
          de solo lectura y conservan el
          usuario, la fecha y la operación
          registrada. El sistema muestra
          los últimos 500 registros que
          coinciden con los filtros.
        </div>

        {/* FILTROS */}

        <form
          onSubmit={buscar}
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(165px, 1fr))',
            gap: 12,
            marginBottom: 19
          }}
        >
          <label>
            Buscar

            <input
              type="text"
              maxLength={100}
              placeholder="Usuario, detalle o ID"
              value={filtros.q}
              onChange={e =>
                actualizarFiltro(
                  'q',
                  e.target.value
                )
              }
            />
          </label>

          <label>
            Acción

            <select
              value={filtros.accion}
              onChange={e =>
                actualizarFiltro(
                  'accion',
                  e.target.value
                )
              }
            >
              <option value="">
                Todas
              </option>

              {catalogos.acciones.map(accion => (
                <option
                  key={accion}
                  value={accion}
                >
                  {nombreAccion(accion)}
                </option>
              ))}
            </select>
          </label>

          <label>
            Entidad

            <select
              value={filtros.entidad}
              onChange={e =>
                actualizarFiltro(
                  'entidad',
                  e.target.value
                )
              }
            >
              <option value="">
                Todas
              </option>

              {catalogos.entidades.map(entidad => (
                <option
                  key={entidad.Entidad}
                  value={entidad.Entidad}
                >
                  {entidad.Entidad}
                </option>
              ))}
            </select>
          </label>

          <label>
            Usuario

            <select
              value={filtros.usuarioId}
              onChange={e =>
                actualizarFiltro(
                  'usuarioId',
                  e.target.value
                )
              }
            >
              <option value="">
                Todos
              </option>

              {catalogos.usuarios.map(usuario => (
                <option
                  key={usuario.UsuarioID}
                  value={usuario.UsuarioID}
                >
                  {usuario.Nombres}{' '}
                  {usuario.Apellidos}
                </option>
              ))}
            </select>
          </label>

          <label>
            Desde

            <input
              type="date"
              value={filtros.desde}
              onChange={e =>
                actualizarFiltro(
                  'desde',
                  e.target.value
                )
              }
            />
          </label>

          <label>
            Hasta

            <input
              type="date"
              value={filtros.hasta}
              onChange={e =>
                actualizarFiltro(
                  'hasta',
                  e.target.value
                )
              }
            />
          </label>

          <div
            style={{
              display: 'flex',
              alignItems: 'end',
              gap: 8
            }}
          >
            <button
              type="submit"
              className="orange"
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
          </div>
        </form>

        {/* ERRORES */}

        {error && (
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
                <th>Fecha</th>
                <th>Usuario</th>
                <th>Entidad</th>
                <th>Registro ID</th>
                <th>Acción</th>
                <th>Detalle</th>
                <th>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {cargando && (
                <tr>
                  <td colSpan={8}>
                    Cargando auditoría...
                  </td>
                </tr>
              )}

              {!cargando &&
                eventos.map(evento => (
                  <tr
                    key={evento.AuditoriaID}
                  >
                    <td>
                      {evento.AuditoriaID}
                    </td>

                    <td>
                      {fechaTexto(evento.Fecha)}
                    </td>

                    <td>
                      {usuarioTexto(evento)}
                    </td>

                    <td>
                      {evento.Entidad}
                    </td>

                    <td>
                      {evento.RegistroID ?? '-'}
                    </td>

                    <td>
                      <span
                        className={
                          evento.Accion === 'INSERT'
                            ? 'status active'
                            : 'status'
                        }
                      >
                        {evento.Accion}
                      </span>
                    </td>

                    <td
                      style={{
                        maxWidth: 260,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                      title={
                        evento.Detalle || ''
                      }
                    >
                      {evento.Detalle || '-'}
                    </td>

                    <td className="actions">
                      <button
                        type="button"
                        title="Ver detalle"
                        disabled={consultando}
                        onClick={() =>
                          void abrirDetalle(
                            evento.AuditoriaID
                          )
                        }
                      >
                        <Eye size={16} />
                      </button>
                    </td>
                  </tr>
                ))}

              {!cargando &&
                eventos.length === 0 &&
                !error && (
                  <tr>
                    <td colSpan={8}>
                      No existen eventos de auditoría
                      para los filtros seleccionados.
                    </td>
                  </tr>
                )}
            </tbody>
          </table>
        </div>
      </div>

      {/* DETALLE */}

      {detalle && (
        <div className="overlay">
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Detalle de auditoría"
            style={{
              width: '95%',
              maxWidth: 820,
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
          >
            <div className="dialog-head">
              <h2>
                Auditoría #{detalle.AuditoriaID}
              </h2>

              <button
                type="button"
                aria-label="Cerrar"
                onClick={() =>
                  setDetalle(null)
                }
              >
                <X />
              </button>
            </div>

            <div
              style={{
                background: '#f1f5f9',
                padding: 16,
                borderRadius: 9,
                marginBottom: 16
              }}
            >
              <strong
                style={{
                  fontSize: 17,
                  color: AZUL
                }}
              >
                {nombreAccion(detalle.Accion)}
              </strong>

              <p>
                {detalle.Entidad} · Registro{' '}
                {detalle.RegistroID ?? '-'}
              </p>
            </div>

            <div className="table-wrap">
              <table>
                <tbody>
                  <tr>
                    <th>AuditoriaID</th>
                    <td>
                      {detalle.AuditoriaID}
                    </td>
                  </tr>

                  <tr>
                    <th>Fecha y hora</th>
                    <td>
                      {fechaTexto(detalle.Fecha)}
                    </td>
                  </tr>

                  <tr>
                    <th>Usuario</th>
                    <td>
                      {usuarioTexto(detalle)}
                    </td>
                  </tr>

                  <tr>
                    <th>UsuarioID</th>
                    <td>
                      {detalle.UsuarioID ?? '-'}
                    </td>
                  </tr>

                  <tr>
                    <th>Correo</th>
                    <td>
                      {detalle.UsuarioCorreo || '-'}
                    </td>
                  </tr>

                  <tr>
                    <th>Entidad</th>
                    <td>
                      {detalle.Entidad}
                    </td>
                  </tr>

                  <tr>
                    <th>Registro afectado</th>
                    <td>
                      {detalle.RegistroID ?? '-'}
                    </td>
                  </tr>

                  <tr>
                    <th>Acción SQL</th>
                    <td>
                      {detalle.Accion}
                    </td>
                  </tr>

                  <tr>
                    <th>Descripción</th>
                    <td
                      style={{
                        whiteSpace: 'pre-wrap',
                        overflowWrap: 'anywhere'
                      }}
                    >
                      {detalle.Detalle || '-'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p
              style={{
                fontSize: 12,
                color: '#64748b',
                marginTop: 12
              }}
            >
              Este evento pertenece al historial
              de auditoría de SIGET-VÍA.
              No puede modificarse desde
              esta interfaz.
            </p>

            <div className="dialog-actions">
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  setDetalle(null)
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
