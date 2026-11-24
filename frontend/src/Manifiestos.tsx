
import {
  useEffect,
  useState,
  type FormEvent
} from 'react';

import {
  BusFront,
  CalendarDays,
  Search,
  RefreshCw,
  FileDown,
  Users,
  Armchair,
  CheckCircle2,
  AlertCircle,
  ClipboardList,
  ArrowLeft,
  MapPin
} from 'lucide-react';

import { jsPDF } from 'jspdf';

// =====================================================
// SIGET-VÍA - MANIFIESTOS DE PASAJEROS
// PASO 167.3 - RF16
// =====================================================

type Viaje = {
  ViajeID: number;
  RutaID: number;
  BusID: number;
  ConductorID: number;
  Salida: string;
  LlegadaEstimada: string | null;
  Estado: string;
  Tarifa?: number;
  Origen: string;
  Destino: string;
  Placa: string;
  Modelo: string;
  Capacidad?: number;
  TotalPasajeros?: number;
};

type PasajeroManifiesto = {
  ReservaAsientoID: number;
  ReservaID: number;
  ViajeID: number;
  AsientoID: number;
  PasajeroID: number;
  CodigoReserva: string;
  EstadoReserva: string;
  NumeroAsiento: string | number;
  TipoDocumento: string;
  NumeroDocumento: string;
  Nombres: string;
  Apellidos: string;
  EstadoAsiento: string;
};

type ResumenManifiesto = {
  totalPasajeros: number;
  totalAsientos: number;
  asientosDisponibles: number;
};

type DetalleManifiesto = {
  viaje: Viaje;
  pasajeros: PasajeroManifiesto[];
  resumen: ResumenManifiesto;
};

const API =
  import.meta.env.VITE_API_URL ||
  'http://localhost:4000/api';

const AZUL = '#173b63';
// =====================================================
// SERVICIO HTTP
// =====================================================

async function api<T>(
  ruta: string,
  token: string
): Promise<T> {
  const response = await fetch(
    `${API}${ruta}`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  const data: unknown = await response
    .json()
    .catch(() => ({}));

  if (!response.ok) {
    const respuesta = data as {
      error?: string;
    };

    throw new Error(
      respuesta.error ||
      `Error HTTP ${response.status}`
    );
  }

  return data as T;
}

// =====================================================
// FORMATOS
// =====================================================

function fechaTexto(
  valor: string | null | undefined
): string {
  if (!valor) return '-';

  const texto = String(valor);
  const [fecha, hora] = texto
    .replace(' ', 'T')
    .split('T');

  const partes = fecha.split('-');

  if (partes.length !== 3) {
    return texto;
  }

  const [anio, mes, dia] = partes;

  return (
    `${dia}/${mes}/${anio}` +
    (hora ? ` ${hora.slice(0, 5)}` : '')
  );
}

function nombreCompleto(
  pasajero: PasajeroManifiesto
): string {
  return [
    pasajero.Apellidos,
    pasajero.Nombres
  ].filter(Boolean).join(', ');
}

function porcentajeOcupacion(
  resumen: ResumenManifiesto
): number {
  if (resumen.totalAsientos <= 0) {
    return 0;
  }

  return Math.min(
    100,
    (resumen.totalPasajeros /
      resumen.totalAsientos) * 100
  );
}

function textoSeguroPDF(valor: unknown): string {
  return String(valor ?? '-')
    .replace(/\r/g, '')
    .replace(/\n/g, ' ')
    .replace(/[^\x20-\x7EÀ-ÿ]/g, ' ')
    .trim() || '-';
}

// =====================================================
// GENERAR PDF INSTITUCIONAL
// =====================================================

function generarPDF(
  detalle: DetalleManifiesto
) {
  const { viaje, pasajeros, resumen } =
    detalle;

  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

const ANCHO = 297;
const MARGEN = 14;
const LIMITE = 193;

  const AZUL_PDF: [number, number, number] =
    [23, 59, 99];

  const NARANJA_PDF: [number, number, number] =
    [245, 130, 32];

  const GRIS_PDF: [number, number, number] =
    [95, 108, 123];

  const columnas = [
    { titulo: 'N.', ancho: 12 },
    { titulo: 'Asiento', ancho: 22 },
    { titulo: 'Tipo doc.', ancho: 30 },
    { titulo: 'Documento', ancho: 36 },
    { titulo: 'Apellidos y nombres', ancho: 78 },
    { titulo: 'Reserva', ancho: 47 },
    { titulo: 'Estado reserva', ancho: 44 }
  ];

  let y = 0;

  function cabecera() {
    pdf.setFillColor(...AZUL_PDF);
    pdf.rect(
      0,
      0,
      ANCHO,
      35,
      'F'
    );

    pdf.setFillColor(...NARANJA_PDF);
    pdf.rect(
      0,
      35,
      ANCHO,
      2,
      'F'
    );

    pdf.setFont(
      'helvetica',
      'bold'
    );

    pdf.setFontSize(20);
    pdf.setTextColor(255, 255, 255);

    pdf.text(
      'SIGET-VIA',
      MARGEN,
      16
    );

    pdf.setFontSize(8);
    pdf.setFont(
      'helvetica',
      'normal'
    );

    pdf.text(
      'TRANSPORTES VIA S.A.C.',
      MARGEN,
      24
    );

    pdf.setFontSize(15);
    pdf.setFont(
      'helvetica',
      'bold'
    );

    pdf.text(
      'MANIFIESTO DE PASAJEROS',
      ANCHO - MARGEN,
      16,
      { align: 'right' }
    );

    pdf.setFontSize(9);
    pdf.setFont(
      'helvetica',
      'normal'
    );

    pdf.text(
      `VIAJE N. ${viaje.ViajeID}`,
      ANCHO - MARGEN,
      24,
      { align: 'right' }
    );

    y = 44;
  }

  function nuevaPagina() {
    pdf.addPage();
    cabecera();
    dibujarCabeceraTabla();
  }

  function datosViaje() {
    pdf.setFont(
      'helvetica',
      'bold'
    );

    pdf.setFontSize(10);
    pdf.setTextColor(...AZUL_PDF);

    pdf.text(
      'INFORMACION DEL VIAJE',
      MARGEN,
      y
    );

    y += 8;

    pdf.setFont(
      'helvetica',
      'normal'
    );

    pdf.setFontSize(9);
    pdf.setTextColor(...GRIS_PDF);

    const datos = [
      `Ruta: ${viaje.Origen} - ${viaje.Destino}`,
      `Salida: ${fechaTexto(viaje.Salida)}`,
      `Bus: ${viaje.Placa}`,
      `Modelo: ${viaje.Modelo}`,
      `Estado: ${viaje.Estado}`
    ];

    for (const dato of datos) {
      const lineas = pdf.splitTextToSize(
        textoSeguroPDF(dato),
        ANCHO - MARGEN * 2
      ) as string[];

      pdf.text(
        lineas,
        MARGEN,
        y
      );

      y += lineas.length * 4.5 + 1;
    }

    y += 3;

    pdf.setFillColor(244, 248, 251);

    pdf.roundedRect(
      MARGEN,
      y,
      ANCHO - MARGEN * 2,
      14,
      2,
      2,
      'F'
    );

    pdf.setFont(
      'helvetica',
      'bold'
    );

    pdf.setTextColor(...AZUL_PDF);
    pdf.setFontSize(9);

    pdf.text(
      `PASAJEROS: ${resumen.totalPasajeros}`,
      MARGEN + 5,
      y + 9
    );

    pdf.text(
      `ASIENTOS: ${resumen.totalAsientos}`,
      MARGEN + 85,
      y + 9
    );

    pdf.text(
      `DISPONIBLES: ${resumen.asientosDisponibles}`,
      MARGEN + 165,
      y + 9
    );

    y += 22;
  }

  function dibujarCabeceraTabla() {
    pdf.setFillColor(...AZUL_PDF);

    pdf.rect(
      MARGEN,
      y,
      ANCHO - MARGEN * 2,
      11,
      'F'
    );

    pdf.setTextColor(255, 255, 255);

    pdf.setFont(
      'helvetica',
      'bold'
    );

    pdf.setFontSize(8);

    let x = MARGEN;

    for (const columna of columnas) {
      pdf.text(
        columna.titulo,
        x + 2,
        y + 7
      );

      x += columna.ancho;
    }

    y += 11;
  }

  cabecera();
  datosViaje();

  if (y > 170) {
    nuevaPagina();
  } else {
    dibujarCabeceraTabla();
  }

  if (pasajeros.length === 0) {
    pdf.setFont(
      'helvetica',
      'normal'
    );

    pdf.setFontSize(10);
    pdf.setTextColor(...GRIS_PDF);

    pdf.text(
      'Este viaje no tiene pasajeros confirmados registrados.',
      MARGEN + 4,
      y + 12
    );
  }

  pasajeros.forEach((pasajero, indice) => {
    const valores = [
      String(indice + 1),
      String(pasajero.NumeroAsiento),
      pasajero.TipoDocumento,
      pasajero.NumeroDocumento,
      nombreCompleto(pasajero),
      pasajero.CodigoReserva,
      pasajero.EstadoReserva
    ];

    const celdas = valores.map(
      (valor, posicion) =>
        pdf.splitTextToSize(
          textoSeguroPDF(valor),
          columnas[posicion].ancho - 4
        ) as string[]
    );

    const lineasMaximas = Math.max(
      1,
      ...celdas.map(lineas => lineas.length)
    );

    const alto = Math.max(
      10,
      lineasMaximas * 3.5 + 5
    );

    if (y + alto > LIMITE) {
      nuevaPagina();
    }

    if (indice % 2 === 0) {
      pdf.setFillColor(244, 248, 251);

      pdf.rect(
        MARGEN,
        y,
        ANCHO - MARGEN * 2,
        alto,
        'F'
      );
    }

    pdf.setFont(
      'helvetica',
      'normal'
    );

    pdf.setFontSize(7.5);
    pdf.setTextColor(...AZUL_PDF);

    let x = MARGEN;

    celdas.forEach((lineas, posicion) => {
      pdf.text(
        lineas,
        x + 2,
        y + 5
      );

      x += columnas[posicion].ancho;
    });

    pdf.setDrawColor(218, 227, 235);

    pdf.line(
      MARGEN,
      y + alto,
      ANCHO - MARGEN,
      y + alto
    );

    y += alto;
  });

  // Pie de página
  const paginas = pdf.getNumberOfPages();

  for (
    let numero = 1;
    numero <= paginas;
    numero++
  ) {
    pdf.setPage(numero);

    pdf.setDrawColor(218, 227, 235);
    pdf.line(
      MARGEN,
      198,
      ANCHO - MARGEN,
      198
    );

    pdf.setFillColor(...NARANJA_PDF);

    pdf.rect(
      MARGEN,
      198,
      30,
      1,
      'F'
    );

    pdf.setFontSize(7.5);

    pdf.setTextColor(...GRIS_PDF);

    pdf.text(
      'SIGET-VIA | CONTROL OPERATIVO DE PASAJEROS',
      MARGEN,
      205
    );

    pdf.text(
      `Pagina ${numero} de ${paginas}`,
      ANCHO - MARGEN,
      205,
      { align: 'right' }
    );
  }

  const fechaArchivo = new Date()
    .toISOString()
    .slice(0, 10);

  pdf.save(
    `SIGET-VIA-Manifiesto-Viaje-${viaje.ViajeID}-${fechaArchivo}.pdf`
  );
}

// =====================================================
// COMPONENTE PRINCIPAL
// =====================================================

export default function Manifiestos({
  token
}: {
  token: string;
}) {
  const [viajes, setViajes] =
    useState<Viaje[]>([]);

  const [detalle, setDetalle] =
    useState<DetalleManifiesto | null>(
      null
    );

  const [busqueda, setBusqueda] =
    useState('');

  const [fecha, setFecha] =
    useState('');

  const [cargando, setCargando] =
    useState(false);

  const [cargandoDetalle, setCargandoDetalle] =
    useState(false);

  const [error, setError] =
    useState('');

  const [mensaje, setMensaje] =
    useState('');

  // ===================================================
  // CARGAR VIAJES
  // ===================================================

  async function buscarViajes(
    q = busqueda,
    fechaConsulta = fecha
  ) {
    setCargando(true);
    setError('');

    try {
      const params = new URLSearchParams();

      if (q.trim()) {
        params.set(
          'q',
          q.trim()
        );
      }

      if (fechaConsulta) {
        params.set(
          'fecha',
          fechaConsulta
        );
      }

      const query = params.toString();

      const resultado = await api<Viaje[]>(
        `/manifiestos/viajes${
          query ? `?${query}` : ''
        }`,
        token
      );

      setViajes(resultado);
    } catch (e) {
      setError(
        (e as Error).message
      );
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    let activo = true;

    api<Viaje[]>(
      '/manifiestos/viajes',
      token
    )
      .then(resultado => {
        if (activo) {
          setViajes(resultado);
        }
      })
      .catch(e => {
        if (activo) {
          setError(
            (e as Error).message
          );
        }
      });

    return () => {
      activo = false;
    };
  }, [token]);

  // ===================================================
  // ABRIR MANIFIESTO
  // ===================================================

  async function abrirManifiesto(
    viajeId: number
  ) {
    setCargandoDetalle(true);
    setError('');
    setMensaje('');

    try {
      const resultado = await api<DetalleManifiesto>(
        `/manifiestos/${viajeId}`,
        token
      );

      setDetalle(resultado);
    } catch (e) {
      setError(
        (e as Error).message
      );
    } finally {
      setCargandoDetalle(false);
    }
  }

  // ===================================================
  // BUSCAR
  // ===================================================

  function buscar(
    e: FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    void buscarViajes();
  }

  function limpiar() {
    setBusqueda('');
    setFecha('');

    void buscarViajes('', '');
  }

  function regresar() {
    setDetalle(null);
    setError('');
    setMensaje('');
  }

  function descargarPDF() {
    if (!detalle) return;

    try {
      generarPDF(detalle);

      setMensaje(
        'Manifiesto PDF generado correctamente.'
      );
    } catch (e) {
      setError(
        (e as Error).message
      );
    }
  }

  // ===================================================
  // VISTA DEL MANIFIESTO
  // ===================================================

  if (detalle) {
    const { viaje, pasajeros, resumen } =
      detalle;

    const ocupacion =
      porcentajeOcupacion(resumen);

    return (
      <>
        <div className="heading">
          <h1>
            Manifiesto de pasajeros
          </h1>

          <p>
            RF16 · Consulta de pasajeros y
            asientos asignados por viaje
          </p>
        </div>

        <div
          style={{
            marginBottom: 15,
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap'
          }}
        >
          <button
            type="button"
            className="secondary"
            onClick={regresar}
          >
            <ArrowLeft size={16} />
            Volver a viajes
          </button>

          <button
            type="button"
            className="secondary"
            disabled={cargandoDetalle}
            onClick={() =>
              void abrirManifiesto(
                viaje.ViajeID
              )
            }
          >
            <RefreshCw size={16} />
            Actualizar
          </button>

          <button
            type="button"
            className="orange"
            onClick={descargarPDF}
          >
            <FileDown size={16} />
            Descargar PDF
          </button>
        </div>

        {error && (
          <div className="alert">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {mensaje && (
          <div className="success">
            <CheckCircle2 size={16} />
            {mensaje}
          </div>
        )}

        {/* INFORMACIÓN DEL VIAJE */}

        <div
          className="panel"
          style={{
            marginBottom: 16
          }}
        >
          <div className="section-heading">
            <div>
              <h2>
                Viaje N.º {viaje.ViajeID}
              </h2>

              <p>
                Información general del viaje
              </p>
            </div>

            <span className="status active">
              {viaje.Estado}
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(190px, 1fr))',
              gap: 15,
              marginTop: 15
            }}
          >
            <div>
              <strong>Ruta</strong>

              <p>
                <MapPin
                  size={15}
                  style={{
                    verticalAlign: 'middle'
                  }}
                />{' '}
                {viaje.Origen} – {viaje.Destino}
              </p>
            </div>

            <div>
              <strong>Salida</strong>

              <p>
                {fechaTexto(viaje.Salida)}
              </p>
            </div>

            <div>
              <strong>Llegada estimada</strong>

              <p>
                {fechaTexto(
                  viaje.LlegadaEstimada
                )}
              </p>
            </div>

            <div>
              <strong>Bus asignado</strong>

              <p>
                {viaje.Placa} – {viaje.Modelo}
              </p>
            </div>
          </div>
        </div>

        {/* INDICADORES */}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(170px, 1fr))',
            gap: 12,
            marginBottom: 16
          }}
        >
          {[
            {
              titulo: 'Pasajeros',
              valor: resumen.totalPasajeros,
              Icono: Users
            },
            {
              titulo: 'Total asientos',
              valor: resumen.totalAsientos,
              Icono: Armchair
            },
            {
              titulo: 'Disponibles',
              valor: resumen.asientosDisponibles,
              Icono: CheckCircle2
            },
            {
              titulo: 'Ocupación',
              valor: `${ocupacion.toFixed(2)}%`,
              Icono: BusFront
            }
          ].map(item => (
            <div
              key={item.titulo}
              className="panel"
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'center',
                padding: 18
              }}
            >
              <item.Icono
                size={23}
                color={AZUL}
              />

              <div>
                <p
                  style={{
                    color: '#64748b',
                    fontSize: 12
                  }}
                >
                  {item.titulo}
                </p>

                <strong
                  style={{
                    color: AZUL,
                    fontSize: 21
                  }}
                >
                  {item.valor}
                </strong>
              </div>
            </div>
          ))}
        </div>

        {/* LISTADO DE PASAJEROS */}

        <div className="panel">
          <div className="section-heading">
            <div>
              <h2>
                Relación de pasajeros
              </h2>

              <p>
                Pasajeros con reserva vigente y
                asiento activo para este viaje
              </p>
            </div>

            <span
              style={{
                color: AZUL,
                fontWeight: 700
              }}
            >
              {pasajeros.length} registros
            </span>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>N.º</th>
                  <th>Asiento</th>
                  <th>Tipo documento</th>
                  <th>Documento</th>
                  <th>Apellidos y nombres</th>
                  <th>Reserva</th>
                  <th>Estado reserva</th>
                </tr>
              </thead>

              <tbody>
                {pasajeros.map(
                  (pasajero, indice) => (
                    <tr
                      key={
                        pasajero.ReservaAsientoID
                      }
                    >
                      <td>
                        {indice + 1}
                      </td>

                      <td>
                        <strong>
                          {pasajero.NumeroAsiento}
                        </strong>
                      </td>

                      <td>
                        {pasajero.TipoDocumento}
                      </td>

                      <td>
                        {pasajero.NumeroDocumento}
                      </td>

                      <td>
                        {nombreCompleto(
                          pasajero
                        )}
                      </td>

                      <td>
                        {pasajero.CodigoReserva}
                      </td>

                      <td>
                        <span className="status active">
                          {pasajero.EstadoReserva}
                        </span>
                      </td>
                    </tr>
                  )
                )}

                {pasajeros.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      Este viaje todavía no
                      tiene pasajeros con
                      reservas vigentes.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <p
          style={{
            color: '#64748b',
            fontSize: 12,
            marginTop: 14
          }}
        >
          El manifiesto contiene datos de
          identificación personal.
          Su consulta y exportación deben
          utilizarse únicamente para
          fines operativos autorizados.
        </p>
      </>
    );
  }

  // ===================================================
  // VISTA DE BÚSQUEDA DE VIAJES
  // ===================================================

  return (
    <>
      <div className="heading">
        <h1>
          Manifiestos de pasajeros
        </h1>

        <p>
          RF16 · Consulta y generación
          de manifiestos por viaje
        </p>
      </div>

      <div className="panel">
        <div className="section-heading">
          <div>
            <h2>
              Buscar viajes
            </h2>

            <p>
              Selecciona un viaje para
              consultar su manifiesto
            </p>
          </div>

          <button
            type="button"
            className="secondary"
            disabled={cargando}
            onClick={() =>
              void buscarViajes()
            }
          >
            <RefreshCw size={16} />
            Actualizar
          </button>
        </div>

        <form
          onSubmit={buscar}
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(190px, 1fr))',
            gap: 12,
            marginTop: 14,
            marginBottom: 18
          }}
        >
          <label>
            Fecha de salida

            <input
              type="date"
              value={fecha}
              onChange={e =>
                setFecha(e.target.value)
              }
            />
          </label>

          <label>
            Ruta, placa o viaje

            <input
              type="text"
              maxLength={100}
              placeholder="Ej.: Juliaca, ABC-123, 1"
              value={busqueda}
              onChange={e =>
                setBusqueda(e.target.value)
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

        {error && (
          <div className="alert">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <div className="section-heading">
          <div>
            <h2>
              Viajes disponibles
            </h2>

            <p>
              {viajes.length} viajes encontrados
            </p>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Viaje</th>
                <th>Ruta</th>
                <th>Fecha y hora</th>
                <th>Bus</th>
                <th>Estado</th>
                <th>Pasajeros</th>
                <th>Acción</th>
              </tr>
            </thead>

            <tbody>
              {cargando && (
                <tr>
                  <td colSpan={7}>
                    Consultando viajes...
                  </td>
                </tr>
              )}

              {!cargando &&
                viajes.map(viaje => (
                  <tr key={viaje.ViajeID}>
                    <td>
                      <strong>
                        #{viaje.ViajeID}
                      </strong>
                    </td>

                    <td>
                      {viaje.Origen} –{' '}
                      {viaje.Destino}
                    </td>

                    <td>
                      <CalendarDays
                        size={14}
                        style={{
                          verticalAlign: 'middle'
                        }}
                      />{' '}
                      {fechaTexto(viaje.Salida)}
                    </td>

                    <td>
                      {viaje.Placa}
                    </td>

                    <td>
                      {viaje.Estado}
                    </td>

                    <td>
                      {Number(
                        viaje.TotalPasajeros || 0
                      )}
                    </td>

                    <td>
                      <button
                        type="button"
                        className="orange"
                        disabled={
                          cargandoDetalle
                        }
                        onClick={() =>
                          void abrirManifiesto(
                            viaje.ViajeID
                          )
                        }
                      >
                        <ClipboardList size={16} />
                        Ver manifiesto
                      </button>
                    </td>
                  </tr>
                ))}

              {!cargando &&
                viajes.length === 0 &&
                !error && (
                  <tr>
                    <td colSpan={7}>
                      No existen viajes para
                      los filtros seleccionados.
                    </td>
                  </tr>
                )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
