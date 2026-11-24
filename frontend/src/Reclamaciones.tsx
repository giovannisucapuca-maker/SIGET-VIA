
import {
  useEffect,
  useState,
  type FormEvent
} from 'react';

import {
  MessageSquareWarning,
  Plus,
  Search,
  RefreshCw,
  Eye,
  Download,
  X,
  Send,
  ArrowLeftRight,
  ClipboardList,
  Clock3,
  CheckCircle2
} from 'lucide-react';

import { jsPDF } from 'jspdf';

// ================================================
// SIGET-VÍA — GESTIÓN DE RECLAMACIONES
// PASO 165.2
// RF11, RF12 Y RF13
// ================================================

type Estado =
  | 'REGISTRADO'
  | 'EN_ATENCION'
  | 'RESPONDIDO'
  | 'CERRADO';

type TipoSolicitud = 'RECLAMO' | 'QUEJA';

type Reclamacion = {
  ReclamacionID: number;
  NumeroCorrelativo: string | null;
  UsuarioID: number | null;
  ReservaID: number | null;
  TipoDocumento: string;
  NumeroDocumento: string;
  NombreReclamante: string;
  CorreoReclamante: string;
  TelefonoReclamante: string | null;
  TipoSolicitud: TipoSolicitud;
  Descripcion: string;
  Pedido: string;
  FechaRegistro: string;
  Estado: Estado;
};

type Respuesta = {
  RespuestaID: number;
  ReclamacionID: number;
  ResponsableID: number;
  Contenido: string;
  FechaRespuesta: string;
  ResponsableNombres: string | null;
  ResponsableApellidos: string | null;
};

type Historial = {
  HistorialID: number;
  ReclamacionID: number;
  ResponsableID: number | null;
  EstadoAnterior: string | null;
  EstadoNuevo: string;
  Observacion: string | null;
  FechaCambio: string;
  ResponsableNombres: string | null;
  ResponsableApellidos: string | null;
};

type Detalle = {
  reclamacion: Reclamacion;
  respuestas: Respuesta[];
  historial: Historial[];
};

type Resumen = {
  Total: number;
  Registrados: number;
  EnAtencion: number;
  Respondidos: number;
  Cerrados: number;
};

type Formulario = {
  usuarioId: string;
  reservaId: string;
  tipoDocumento: string;
  numeroDocumento: string;
  nombreReclamante: string;
  correoReclamante: string;
  telefonoReclamante: string;
  tipoSolicitud: TipoSolicitud;
  descripcion: string;
  pedido: string;
};

const API =
  import.meta.env.VITE_API_URL ||
  'http://localhost:4000/api';

const AZUL = '#173b63';
const NARANJA = '#f58220';

const crearFormulario = (): Formulario => ({
  usuarioId: '',
  reservaId: '',
  tipoDocumento: 'DNI',
  numeroDocumento: '',
  nombreReclamante: '',
  correoReclamante: '',
  telefonoReclamante: '',
  tipoSolicitud: 'RECLAMO',
  descripcion: '',
  pedido: ''
});

const resumenVacio: Resumen = {
  Total: 0,
  Registrados: 0,
  EnAtencion: 0,
  Respondidos: 0,
  Cerrados: 0
};

// ================================================
// API
// ================================================

async function api<T>(
  ruta: string,
  token: string,
  opciones: RequestInit = {}
): Promise<T> {
  const respuesta = await fetch(
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

  const datos: unknown = await respuesta
    .json()
    .catch(() => ({}));

  if (!respuesta.ok) {
    const error = datos as {
      error?: string;
      details?: Array<{
        message?: string;
        path?: Array<string | number>;
      }>;
    };

    const detalle = error.details
      ?.map(
        item =>
          `${(item.path || []).join('.')}: ` +
          `${item.message || 'Dato inválido'}`
      )
      .join('; ');

    throw new Error(
      detalle ||
      error.error ||
      `Error HTTP ${respuesta.status}`
    );
  }

  return datos as T;
}

// ================================================
// UTILIDADES
// ================================================

function fechaTexto(valor?: string | null) {
  if (!valor) return '-';

  const normal = valor
    .replace(' ', 'T')
    .slice(0, 19);

  const [fecha, hora] = normal.split('T');
  const [anio, mes, dia] = fecha.split('-');

  if (!anio || !mes || !dia) {
    return valor;
  }

  return `${dia}/${mes}/${anio} ${hora || ''}`;
}

function codigoReclamo(r: Reclamacion) {
  return (
    r.NumeroCorrelativo ||
    `Registro #${r.ReclamacionID}`
  );
}

function etiquetaEstado(estado: Estado) {
  switch (estado) {
    case 'REGISTRADO':
      return 'Registrado';
    case 'EN_ATENCION':
      return 'En atención';
    case 'RESPONDIDO':
      return 'Respondido';
    case 'CERRADO':
      return 'Cerrado';
    default:
      return estado;
  }
}

function nombreResponsable(
  valor: {
    ResponsableNombres: string | null;
    ResponsableApellidos: string | null;
  }
) {
  const nombre = [
    valor.ResponsableNombres,
    valor.ResponsableApellidos
  ].filter(Boolean).join(' ');

  return nombre || 'Personal autorizado';
}

function numeroOpcional(valor: string) {
  return valor.trim()
    ? Number(valor)
    : null;
}

// ================================================
// PDF — CONSTANCIA DE RECEPCIÓN
// ================================================

function generarConstancia(reclamo: Reclamacion) {
  const doc = new jsPDF({
    unit: 'mm',
    format: 'a4',
    orientation: 'portrait'
  });

  const ancho = 210;
  const margen = 17;
  const area = ancho - margen * 2;

  const azul = [23, 59, 99] as const;
  const naranja = [245, 130, 32] as const;
  const gris = [90, 105, 120] as const;

  let y = 45;

  function nuevaPagina() {
    doc.addPage();
    y = 25;
  }

  function asegurarEspacio(alto: number) {
    if (y + alto > 267) {
      nuevaPagina();
    }
  }

  function bloque(
    titulo: string,
    contenido: string
  ) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);

    const lineas = doc.splitTextToSize(
      contenido || '-',
      area - 12
    ) as string[];

    const alto = 14 + lineas.length * 5;

    asegurarEspacio(alto);

    doc.setFillColor(245, 248, 251);
    doc.roundedRect(
      margen,
      y,
      area,
      alto,
      2,
      2,
      'F'
    );

    doc.setTextColor(...azul);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(titulo, margen + 6, y + 7);

    doc.setTextColor(45, 55, 70);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);

    doc.text(
      lineas,
      margen + 6,
      y + 14
    );

    y += alto + 5;
  }

  doc.setFillColor(...azul);
  doc.rect(0, 0, ancho, 34, 'F');

  doc.setFillColor(...naranja);
  doc.rect(0, 34, ancho, 2, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);

  doc.text('SIGET-VIA', margen, 15);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  doc.text(
    'TRANSPORTES VIA S.A.C.',
    margen,
    23
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);

  doc.text(
    'CONSTANCIA DE RECEPCION',
    ancho - margen,
    18,
    { align: 'right' }
  );

  doc.setTextColor(...azul);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);

  doc.text(
    'LIBRO DE RECLAMACIONES',
    margen,
    y
  );

  y += 10;

  doc.setFillColor(255, 244, 235);
  doc.roundedRect(
    margen,
    y,
    area,
    21,
    2,
    2,
    'F'
  );

  doc.setTextColor(...azul);
  doc.setFontSize(12);

  doc.text(
    `Numero: ${codigoReclamo(reclamo)}`,
    margen + 6,
    y + 9
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  doc.text(
    `Recepcion: ${fechaTexto(reclamo.FechaRegistro)}`,
    margen + 6,
    y + 16
  );

  y += 29;

  bloque(
    'TIPO DE SOLICITUD',
    reclamo.TipoSolicitud
  );

  bloque(
    'DATOS DEL RECLAMANTE',
    `${reclamo.NombreReclamante}\n` +
    `${reclamo.TipoDocumento}: ` +
    `${reclamo.NumeroDocumento}\n` +
    `Correo: ${reclamo.CorreoReclamante}\n` +
    `Telefono: ${
      reclamo.TelefonoReclamante || '-'
    }`
  );

  bloque(
    'DESCRIPCION DE LOS HECHOS',
    reclamo.Descripcion
  );

  bloque(
    'PEDIDO DEL RECLAMANTE',
    reclamo.Pedido
  );

  asegurarEspacio(25);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...azul);

  doc.text(
    'ESTADO INICIAL: REGISTRADO',
    margen,
    y + 4
  );

  y += 12;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...gris);

  const nota = doc.splitTextToSize(
    'Esta constancia acredita el registro de la ' +
    'solicitud en el prototipo academico SIGET-VIA. ' +
    'No acredita una respuesta ni resolucion definitiva.',
    area
  ) as string[];

  asegurarEspacio(nota.length * 5 + 5);

  doc.text(
    nota,
    margen,
    y
  );

  const paginas = doc.getNumberOfPages();

  for (
    let pagina = 1;
    pagina <= paginas;
    pagina++
  ) {
    doc.setPage(pagina);

    doc.setDrawColor(210, 220, 230);
    doc.line(margen, 281, ancho - margen, 281);

    doc.setFontSize(8);
    doc.setTextColor(...gris);

    doc.text(
      'SIGET-VIA | Documento de prueba academica',
      margen,
      287
    );

    doc.text(
      `Pagina ${pagina} de ${paginas}`,
      ancho - margen,
      287,
      { align: 'right' }
    );
  }

  doc.save(
    `SIGET-VIA-Constancia-${reclamo.ReclamacionID}.pdf`
  );
}

// ================================================
// COMPONENTE PRINCIPAL
// ================================================

export default function Reclamaciones({
  token
}: {
  token: string;
}) {
  const [registros, setRegistros] =
    useState<Reclamacion[]>([]);

  const [resumen, setResumen] =
    useState<Resumen>(resumenVacio);

  const [buscarTexto, setBuscarTexto] =
    useState('');

  const [filtroEstado, setFiltroEstado] =
    useState('');

  const [filtroTipo, setFiltroTipo] =
    useState('');

  const [cargando, setCargando] =
    useState(true);

  const [ocupado, setOcupado] =
    useState(false);

  const [error, setError] =
    useState('');

  const [mensaje, setMensaje] =
    useState('');

  const [nuevo, setNuevo] =
    useState(false);

  const [formulario, setFormulario] =
    useState<Formulario>(crearFormulario);

  const [detalle, setDetalle] =
    useState<Detalle | null>(null);

  const [respuesta, setRespuesta] =
    useState('');

  const [observacion, setObservacion] =
    useState('');

  // ==============================================
  // CARGAR LISTADO Y RESUMEN
  // ==============================================

  async function cargar(
    q = buscarTexto,
    estado = filtroEstado,
    tipo = filtroTipo
  ) {
    setCargando(true);
    setError('');

    try {
      const params = new URLSearchParams();

      if (q.trim()) {
        params.set('q', q.trim());
      }

      if (estado) {
        params.set('estado', estado);
      }

      if (tipo) {
        params.set('tipo', tipo);
      }

      const cadena = params.toString();

      const [lista, indicadores] =
        await Promise.all([
          api<Reclamacion[]>(
            `/reclamaciones${
              cadena ? `?${cadena}` : ''
            }`,
            token
          ),
          api<Resumen>(
            '/reclamaciones/resumen',
            token
          )
        ]);

      setRegistros(lista);
      setResumen(indicadores);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    let activo = true;

    Promise.all([
      api<Reclamacion[]>(
        '/reclamaciones',
        token
      ),
      api<Resumen>(
        '/reclamaciones/resumen',
        token
      )
    ])
      .then(([lista, indicadores]) => {
        if (!activo) return;

        setRegistros(lista);
        setResumen(indicadores);
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

  // ==============================================
  // CONSULTAR DETALLE
  // ==============================================

  async function abrirDetalle(
    id: number
  ) {
    setOcupado(true);
    setError('');
    setMensaje('');

    try {
      const datos = await api<Detalle>(
        `/reclamaciones/${id}`,
        token
      );

      setDetalle(datos);
      setRespuesta('');
      setObservacion('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  // ==============================================
  // GUARDAR RECLAMACIÓN
  // ==============================================

  async function guardar(
    e: FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    if (ocupado) return;

    setOcupado(true);
    setError('');
    setMensaje('');

    try {
      const d = formulario;

      if (
        d.usuarioId &&
        (!Number.isSafeInteger(Number(d.usuarioId)) ||
          Number(d.usuarioId) <= 0)
      ) {
        throw new Error(
          'El ID del usuario vinculado no es válido.'
        );
      }

      if (
        d.reservaId &&
        (!Number.isSafeInteger(Number(d.reservaId)) ||
          Number(d.reservaId) <= 0)
      ) {
        throw new Error(
          'El ID de reserva no es válido.'
        );
      }

      const resultado = await api<{
        ReclamacionID: number;
        NumeroCorrelativo: string | null;
        mensaje: string;
      }>(
        '/reclamaciones',
        token,
        {
          method: 'POST',
          body: JSON.stringify({
            usuarioId: numeroOpcional(
              d.usuarioId
            ),
            reservaId: numeroOpcional(
              d.reservaId
            ),
            tipoDocumento: d.tipoDocumento,
            numeroDocumento:
              d.numeroDocumento.trim(),
            nombreReclamante:
              d.nombreReclamante.trim(),
            correoReclamante:
              d.correoReclamante.trim(),
            telefonoReclamante:
              d.telefonoReclamante.trim() ||
              null,
            tipoSolicitud: d.tipoSolicitud,
            descripcion:
              d.descripcion.trim(),
            pedido: d.pedido.trim()
          })
        }
      );

      setNuevo(false);
      setFormulario(crearFormulario());

      await cargar();

      setMensaje(
        `Reclamación registrada: ${
          resultado.NumeroCorrelativo ||
          `#${resultado.ReclamacionID}`
        }. Puedes descargar su constancia desde el detalle.`
      );

      await abrirDetalle(
        resultado.ReclamacionID
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  // ==============================================
  // CAMBIAR ESTADO
  // ==============================================

  async function cambiarEstado(
    nuevoEstado: Estado
  ) {
    if (!detalle || ocupado) return;

    const registro = detalle.reclamacion;

    const confirmado = window.confirm(
      `¿Cambiar la reclamación ${codigoReclamo(registro)} ` +
      `a ${etiquetaEstado(nuevoEstado)}?`
    );

    if (!confirmado) return;

    setOcupado(true);
    setError('');
    setMensaje('');

    try {
      await api(
        `/reclamaciones/${registro.ReclamacionID}/estado`,
        token,
        {
          method: 'PATCH',
          body: JSON.stringify({
            estado: nuevoEstado,
            observacion:
              observacion.trim() ||
              `Cambio administrativo a ${nuevoEstado}.`
          })
        }
      );

      const datos = await api<Detalle>(
        `/reclamaciones/${registro.ReclamacionID}`,
        token
      );

      setDetalle(datos);
      setObservacion('');

      await cargar();

      setMensaje(
        'Estado actualizado y registrado en el historial.'
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  // ==============================================
  // REGISTRAR RESPUESTA
  // ==============================================

  async function enviarRespuesta(
    e: FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    if (!detalle || ocupado) return;

    const id =
      detalle.reclamacion.ReclamacionID;

    if (respuesta.trim().length < 10) {
      setError(
        'La respuesta debe contener al menos 10 caracteres.'
      );
      return;
    }

    if (
      !window.confirm(
        '¿Registrar esta respuesta y marcar la reclamación como RESPONDIDO?'
      )
    ) {
      return;
    }

    setOcupado(true);
    setError('');
    setMensaje('');

    try {
      await api(
        `/reclamaciones/${id}/respuestas`,
        token,
        {
          method: 'POST',
          body: JSON.stringify({
            contenido: respuesta.trim()
          })
        }
      );

      const datos = await api<Detalle>(
        `/reclamaciones/${id}`,
        token
      );

      setDetalle(datos);
      setRespuesta('');

      await cargar();

      setMensaje(
        'Respuesta registrada y reclamación marcada como RESPONDIDO.'
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  function actualizarFormulario<
    K extends keyof Formulario
  >(
    campo: K,
    valor: Formulario[K]
  ) {
    setFormulario(actual => ({
      ...actual,
      [campo]: valor
    }));
  }

  function cerrarVentanas() {
    if (ocupado) return;

    setNuevo(false);
    setDetalle(null);
  }

  // ==============================================
  // INTERFAZ
  // ==============================================

  return (
    <>
      <div className="heading">
        <h1>Gestión de reclamaciones</h1>

        <p>
          Libro de Reclamaciones virtual ·
          Registro, seguimiento y atención
        </p>
      </div>

      {/* INDICADORES */}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(165px, 1fr))',
          gap: 14,
          marginBottom: 18
        }}
      >
        {[
          {
            titulo: 'Total',
            valor: resumen.Total,
            Icono: ClipboardList
          },
          {
            titulo: 'Registrados',
            valor: resumen.Registrados,
            Icono: MessageSquareWarning
          },
          {
            titulo: 'En atención',
            valor: resumen.EnAtencion,
            Icono: Clock3
          },
          {
            titulo: 'Respondidos',
            valor: resumen.Respondidos,
            Icono: Send
          },
          {
            titulo: 'Cerrados',
            valor: resumen.Cerrados,
            Icono: CheckCircle2
          }
        ].map(item => (
          <div
            key={item.titulo}
            className="panel"
            style={{
              padding: 17,
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
                  fontSize: 22,
                  color: AZUL
                }}
              >
                {Number(item.valor)}
              </strong>
            </div>
          </div>
        ))}
      </div>

      {/* MENSAJES */}

      {error && (
        <div className="alert">
          {error}
        </div>
      )}

      {mensaje && (
        <div className="success">
          {mensaje}
        </div>
      )}

      {/* LISTADO */}

      <div className="panel">
        <div className="section-heading">
          <div>
            <h2>Libro de Reclamaciones</h2>

            <p>
              Reclamaciones almacenadas en SQL Server
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
              disabled={cargando || ocupado}
              onClick={() => void cargar()}
            >
              <RefreshCw size={16} />
              Actualizar
            </button>

            <button
              type="button"
              className="orange"
              disabled={ocupado}
              onClick={() => {
                setError('');
                setMensaje('');
                setFormulario(crearFormulario());
                setNuevo(true);
              }}
            >
              <Plus size={16} />
              Nueva reclamación
            </button>
          </div>
        </div>

        <form
          onSubmit={e => {
            e.preventDefault();
            void cargar();
          }}
          style={{
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap',
            marginBottom: 18
          }}
        >
          <input
            value={buscarTexto}
            onChange={e =>
              setBuscarTexto(e.target.value)
            }
            placeholder="Código, reclamante o documento"
            maxLength={100}
            style={{
              flex: '2 1 210px'
            }}
          />

          <select
            value={filtroEstado}
            onChange={e =>
              setFiltroEstado(e.target.value)
            }
            style={{
              flex: '1 1 150px'
            }}
          >
            <option value="">
              Todos los estados
            </option>

            <option value="REGISTRADO">
              Registrado
            </option>

            <option value="EN_ATENCION">
              En atención
            </option>

            <option value="RESPONDIDO">
              Respondido
            </option>

            <option value="CERRADO">
              Cerrado
            </option>
          </select>

          <select
            value={filtroTipo}
            onChange={e =>
              setFiltroTipo(e.target.value)
            }
            style={{
              flex: '1 1 140px'
            }}
          >
            <option value="">
              Reclamos y quejas
            </option>

            <option value="RECLAMO">
              Reclamos
            </option>

            <option value="QUEJA">
              Quejas
            </option>
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
            onClick={() => {
              setBuscarTexto('');
              setFiltroEstado('');
              setFiltroTipo('');

              void cargar('', '', '');
            }}
          >
            Limpiar
          </button>
        </form>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Fecha</th>
                <th>Reclamante</th>
                <th>Documento</th>
                <th>Tipo</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {cargando && (
                <tr>
                  <td colSpan={7}>
                    Cargando reclamaciones...
                  </td>
                </tr>
              )}

              {!cargando &&
                registros.map(registro => (
                  <tr
                    key={registro.ReclamacionID}
                  >
                    <td>
                      <strong>
                        {codigoReclamo(registro)}
                      </strong>
                    </td>

                    <td>
                      {fechaTexto(
                        registro.FechaRegistro
                      )}
                    </td>

                    <td>
                      {registro.NombreReclamante}
                    </td>

                    <td>
                      {registro.TipoDocumento}{' '}
                      {registro.NumeroDocumento}
                    </td>

                    <td>
                      {registro.TipoSolicitud}
                    </td>

                    <td>
                      <span
                        className={
                          registro.Estado === 'CERRADO'
                            ? 'status active'
                            : 'status'
                        }
                      >
                        {etiquetaEstado(
                          registro.Estado
                        )}
                      </span>
                    </td>

                    <td className="actions">
                      <button
                        type="button"
                        title="Ver detalle"
                        disabled={ocupado}
                        onClick={() =>
                          void abrirDetalle(
                            registro.ReclamacionID
                          )
                        }
                      >
                        <Eye size={16} />
                      </button>

                      <button
                        type="button"
                        title="Constancia PDF"
                        onClick={() =>
                          generarConstancia(registro)
                        }
                      >
                        <Download size={16} />
                      </button>
                    </td>
                  </tr>
                ))}

              {!cargando &&
                registros.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      No existen reclamaciones con
                      los filtros seleccionados.
                    </td>
                  </tr>
                )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL NUEVA RECLAMACIÓN */}

      {nuevo && (
        <div className="overlay">
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Registrar reclamación"
            style={{
              width: '95%',
              maxWidth: 900,
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
          >
            <div className="dialog-head">
              <h2>
                Registrar reclamación
              </h2>

              <button
                type="button"
                onClick={cerrarVentanas}
                disabled={ocupado}
                aria-label="Cerrar"
              >
                <X />
              </button>
            </div>

            <form onSubmit={guardar}>
              <div className="fields">
                <label>
                  Tipo de solicitud

                  <select
                    required
                    value={formulario.tipoSolicitud}
                    onChange={e =>
                      actualizarFormulario(
                        'tipoSolicitud',
                        e.target.value as TipoSolicitud
                      )
                    }
                  >
                    <option value="RECLAMO">
                      Reclamo
                    </option>

                    <option value="QUEJA">
                      Queja
                    </option>
                  </select>
                </label>

                <label>
                  Tipo de documento

                  <select
                    value={formulario.tipoDocumento}
                    onChange={e =>
                      actualizarFormulario(
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

                <label>
                  Número de documento

                  <input
                    required
                    minLength={4}
                    maxLength={20}
                    value={
                      formulario.numeroDocumento
                    }
                    onChange={e =>
                      actualizarFormulario(
                        'numeroDocumento',
                        e.target.value
                      )
                    }
                    placeholder="Documento del reclamante"
                  />
                </label>

                <label>
                  Nombres y apellidos

                  <input
                    required
                    minLength={3}
                    maxLength={220}
                    value={
                      formulario.nombreReclamante
                    }
                    onChange={e =>
                      actualizarFormulario(
                        'nombreReclamante',
                        e.target.value
                      )
                    }
                    placeholder="Nombre completo"
                  />
                </label>

                <label>
                  Correo electrónico

                  <input
                    required
                    type="email"
                    maxLength={254}
                    value={
                      formulario.correoReclamante
                    }
                    onChange={e =>
                      actualizarFormulario(
                        'correoReclamante',
                        e.target.value
                      )
                    }
                  />
                </label>

                <label>
                  Teléfono (opcional)

                  <input
                    type="tel"
                    maxLength={20}
                    value={
                      formulario.telefonoReclamante
                    }
                    onChange={e =>
                      actualizarFormulario(
                        'telefonoReclamante',
                        e.target.value
                      )
                    }
                  />
                </label>

                <label>
                  UsuarioID (opcional)

                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={
                      formulario.usuarioId
                    }
                    onChange={e =>
                      actualizarFormulario(
                        'usuarioId',
                        e.target.value
                      )
                    }
                    placeholder="ID registrado en el sistema"
                  />
                </label>

                <label>
                  ReservaID (opcional)

                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={
                      formulario.reservaId
                    }
                    onChange={e =>
                      actualizarFormulario(
                        'reservaId',
                        e.target.value
                      )
                    }
                    placeholder="ID de la reserva"
                  />
                </label>
              </div>

              <div
                style={{
                  display: 'grid',
                  gap: 12,
                  marginTop: 15
                }}
              >
                <label>
                  Descripción de los hechos

                  <textarea
                    required
                    rows={5}
                    minLength={10}
                    maxLength={5000}
                    value={
                      formulario.descripcion
                    }
                    onChange={e =>
                      actualizarFormulario(
                        'descripcion',
                        e.target.value
                      )
                    }
                    placeholder="Describe lo ocurrido..."
                  />
                </label>

                <label>
                  Pedido del reclamante

                  <textarea
                    required
                    rows={4}
                    minLength={5}
                    maxLength={5000}
                    value={
                      formulario.pedido
                    }
                    onChange={e =>
                      actualizarFormulario(
                        'pedido',
                        e.target.value
                      )
                    }
                    placeholder="Indica qué solución solicita..."
                  />
                </label>
              </div>

              {error && (
                <div className="alert">
                  {error}
                </div>
              )}

              <p
                style={{
                  fontSize: 12,
                  color: '#64748b',
                  marginTop: 12
                }}
              >
                El correlativo y la fecha se generan
                automáticamente en SQL Server.
                Este registro pertenece al prototipo
                académico SIGET-VÍA.
              </p>

              <div className="dialog-actions">
                <button
                  type="submit"
                  className="orange"
                  disabled={ocupado}
                >
                  {ocupado
                    ? 'Guardando...'
                    : 'Registrar reclamación'}
                </button>

                <button
                  type="button"
                  className="secondary"
                  disabled={ocupado}
                  onClick={cerrarVentanas}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DETALLE */}

      {detalle && (
        <div className="overlay">
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Detalle de reclamación"
            style={{
              width: '95%',
              maxWidth: 940,
              maxHeight: '92vh',
              overflowY: 'auto'
            }}
          >
            <div className="dialog-head">
              <h2>
                {codigoReclamo(
                  detalle.reclamacion
                )}
              </h2>

              <button
                type="button"
                disabled={ocupado}
                onClick={cerrarVentanas}
                aria-label="Cerrar"
              >
                <X />
              </button>
            </div>

            <div
              style={{
                background: '#f1f5f9',
                padding: 17,
                borderRadius: 9,
                marginBottom: 17
              }}
            >
              <strong
                style={{
                  color: AZUL,
                  fontSize: 17
                }}
              >
                {detalle.reclamacion.TipoSolicitud}
              </strong>

              <p>
                {detalle.reclamacion.NombreReclamante}
              </p>

              <p>
                Estado:{' '}
                <strong>
                  {etiquetaEstado(
                    detalle.reclamacion.Estado
                  )}
                </strong>
              </p>

              <button
                type="button"
                className="secondary"
                onClick={() =>
                  generarConstancia(
                    detalle.reclamacion
                  )
                }
              >
                <Download size={16} />
                Descargar constancia PDF
              </button>
            </div>

            {/* DATOS */}

            <h3>
              Información de la reclamación
            </h3>

            <div className="table-wrap">
              <table>
                <tbody>
                  <tr>
                    <th>Fecha de registro</th>
                    <td>
                      {fechaTexto(
                        detalle.reclamacion.FechaRegistro
                      )}
                    </td>
                  </tr>

                  <tr>
                    <th>Documento</th>
                    <td>
                      {
                        detalle.reclamacion.TipoDocumento
                      }{' '}
                      {
                        detalle.reclamacion.NumeroDocumento
                      }
                    </td>
                  </tr>

                  <tr>
                    <th>Correo</th>
                    <td>
                      {
                        detalle.reclamacion.CorreoReclamante
                      }
                    </td>
                  </tr>

                  <tr>
                    <th>Teléfono</th>
                    <td>
                      {
                        detalle.reclamacion.TelefonoReclamante ||
                        '-'
                      }
                    </td>
                  </tr>

                  <tr>
                    <th>Reserva vinculada</th>
                    <td>
                      {
                        detalle.reclamacion.ReservaID ??
                        'Sin reserva vinculada'
                      }
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
                      {
                        detalle.reclamacion.Descripcion
                      }
                    </td>
                  </tr>

                  <tr>
                    <th>Pedido</th>
                    <td
                      style={{
                        whiteSpace: 'pre-wrap',
                        overflowWrap: 'anywhere'
                      }}
                    >
                      {
                        detalle.reclamacion.Pedido
                      }
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* CAMBIOS DE ESTADO */}

            {detalle.reclamacion.Estado ===
              'REGISTRADO' && (
              <div
                className="panel"
                style={{
                  marginTop: 16
                }}
              >
                <h3>
                  Iniciar atención
                </h3>

                <label>
                  Observación (opcional)

                  <textarea
                    rows={2}
                    maxLength={500}
                    value={observacion}
                    onChange={e =>
                      setObservacion(
                        e.target.value
                      )
                    }
                  />
                </label>

                <button
                  type="button"
                  className="orange"
                  disabled={ocupado}
                  onClick={() =>
                    void cambiarEstado(
                      'EN_ATENCION'
                    )
                  }
                >
                  <ArrowLeftRight size={16} />
                  Pasar a En atención
                </button>
              </div>
            )}

            {/* REGISTRAR RESPUESTA */}

            {detalle.reclamacion.Estado ===
              'EN_ATENCION' && (
              <div
                className="panel"
                style={{
                  marginTop: 16
                }}
              >
                <h3>
                  Registrar respuesta al reclamante
                </h3>

                <form
                  onSubmit={enviarRespuesta}
                >
                  <label>
                    Contenido de la respuesta

                    <textarea
                      required
                      rows={5}
                      minLength={10}
                      maxLength={5000}
                      value={respuesta}
                      onChange={e =>
                        setRespuesta(
                          e.target.value
                        )
                      }
                      placeholder="Redacta la respuesta al reclamo o queja..."
                    />
                  </label>

                  <div
                    style={{
                      marginTop: 12
                    }}
                  >
                    <button
                      type="submit"
                      className="orange"
                      disabled={ocupado}
                    >
                      <Send size={16} />
                      Registrar respuesta
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* CERRAR */}

            {detalle.reclamacion.Estado ===
              'RESPONDIDO' && (
              <div
                className="panel"
                style={{
                  marginTop: 16
                }}
              >
                <h3>
                  Finalizar seguimiento
                </h3>

                <label>
                  Observación de cierre

                  <textarea
                    rows={2}
                    maxLength={500}
                    value={observacion}
                    onChange={e =>
                      setObservacion(
                        e.target.value
                      )
                    }
                  />
                </label>

                <button
                  type="button"
                  className="orange"
                  disabled={ocupado}
                  onClick={() =>
                    void cambiarEstado(
                      'CERRADO'
                    )
                  }
                >
                  <CheckCircle2 size={16} />
                  Cerrar reclamación
                </button>
              </div>
            )}

            {/* RESPUESTAS */}

            <h3
              style={{
                marginTop: 21
              }}
            >
              Respuestas registradas
            </h3>

            {detalle.respuestas.length === 0 ? (
              <p>
                Todavía no existe una respuesta registrada.
              </p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Responsable</th>
                      <th>Respuesta</th>
                    </tr>
                  </thead>

                  <tbody>
                    {detalle.respuestas.map(item => (
                      <tr key={item.RespuestaID}>
                        <td>
                          {fechaTexto(
                            item.FechaRespuesta
                          )}
                        </td>

                        <td>
                          {nombreResponsable(item)}
                        </td>

                        <td
                          style={{
                            whiteSpace: 'pre-wrap',
                            overflowWrap: 'anywhere'
                          }}
                        >
                          {item.Contenido}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* HISTORIAL */}

            <h3
              style={{
                marginTop: 21
              }}
            >
              Historial de seguimiento
            </h3>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Responsable</th>
                    <th>Estado anterior</th>
                    <th>Estado nuevo</th>
                    <th>Observación</th>
                  </tr>
                </thead>

                <tbody>
                  {detalle.historial.map(item => (
                    <tr key={item.HistorialID}>
                      <td>
                        {fechaTexto(
                          item.FechaCambio
                        )}
                      </td>

                      <td>
                        {nombreResponsable(item)}
                      </td>

                      <td>
                        {item.EstadoAnterior || '-'}
                      </td>

                      <td>
                        {item.EstadoNuevo}
                      </td>

                      <td>
                        {item.Observacion || '-'}
                      </td>
                    </tr>
                  ))}

                  {detalle.historial.length === 0 && (
                    <tr>
                      <td colSpan={5}>
                        Sin eventos de seguimiento.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {error && (
              <div className="alert">
                {error}
              </div>
            )}

            {mensaje && (
              <div className="success">
                {mensaje}
              </div>
            )}

            <div className="dialog-actions">
              <button
                type="button"
                className="secondary"
                disabled={ocupado}
                onClick={cerrarVentanas}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      <p
        style={{
          color: '#64748b',
          fontSize: 12,
          marginTop: 14
        }}
      >
        <MessageSquareWarning
          size={14}
          color={NARANJA}
          style={{
            verticalAlign: 'middle',
            marginRight: 6
          }}
        />
        Prototipo académico. El registro y la
        respuesta se almacenan en SQL Server;
        no se realizan notificaciones externas.
      </p>
    </>
  );
}
