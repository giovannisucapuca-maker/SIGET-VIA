
import { useEffect, useState, type FormEvent } from 'react';
import {
  Plus, Search, Eye, X, Download,
  Printer, Ban, RefreshCw
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import Swal from 'sweetalert2';
import {
  alertaError,
  alertaExito,
  alertaAdvertencia
} from './utils/alertas';

// SIGET-VÍA - VENTAS Y PAGOS SIMULADOS
// Constancias internas sin validez tributaria.

type Metodo =
  | 'EFECTIVO'
  | 'TARJETA'
  | 'TRANSFERENCIA'
  | 'OTRO';

type EstadoVenta = 'REGISTRADA' | 'ANULADA';

type ReservaDisponible = {
  ReservaID: number;
  Codigo: string;
  Estado: string;
  Total: number;
  Salida: string;
  EstadoViaje: string;
  Origen: string;
  Destino: string;
  CantidadAsientos: number;
};

type Venta = {
  VentaID: number;
  ReservaID: number;
  VendedorID: number;
  FechaVenta: string;
  Total: number;
  Estado: EstadoVenta;
  CodigoComprobante: string | null;
  CodigoReserva: string;
  Origen: string;
  Destino: string;
  Salida: string;
  Metodo: Metodo | null;
  MontoPago: number | null;
  EstadoPago: string | null;
};

type Pago = {
  PagoID: number;
  VentaID: number;
  Metodo: Metodo;
  ReferenciaSimulada: string | null;
  Monto: number;
  FechaPago: string;
  Estado: string;
  EsSimulado: boolean | number;
};

type Pasajero = {
  ReservaAsientoID: number;
  Numero: number;
  Nivel: number;
  NumeroDocumento: string;
  Nombres: string;
  Apellidos: string;
  Precio: number;
};

type VentaDetalle = Venta & {
  EstadoReserva: string;
  VendedorNombres: string;
  VendedorApellidos: string;
  Placa: string;
  Modelo: string;
  pagos: Pago[];
  pasajeros: Pasajero[];
};

const API =
  import.meta.env.VITE_API_URL ||
  'http://localhost:4000/api';

const AZUL = '#173b63';
const NARANJA = '#f58220';

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

  const datos = await respuesta.json().catch(() => ({}));

  if (!respuesta.ok) {
    throw new Error(
      typeof datos.error === 'string'
        ? datos.error
        : `Error HTTP ${respuesta.status}`
    );
  }

  return datos as T;
}

function soles(valor: number): string {
  return `S/ ${Number(valor).toLocaleString('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function fechaTexto(valor: string): string {
  if (!valor) return '-';

  const [fecha, hora] = valor.slice(0, 16).split('T');
  const p = fecha?.split('-');

  return p?.length === 3
    ? `${p[2]}/${p[1]}/${p[0]} ${hora || ''}`
    : valor;
}

// ==========================================
// CONSTANCIA PDF
// ==========================================

function generarConstancia(detalle: VentaDetalle): jsPDF {
  const doc = new jsPDF({
    unit: 'mm',
    format: 'a4'
  });

  const x = 16;
  let y = 19;

  const cabecera = () => {
    doc.setFillColor(23, 59, 99);
    doc.rect(0, 0, 210, 36, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(19);
    doc.text('SIGET-VIA', x, 16);

    doc.setFontSize(9);
    doc.text('TRANSPORTES VIA S.A.C.', x, 24);

    doc.text(
      'CONSTANCIA DE VENTA SIMULADA',
      194,
      21,
      { align: 'right' }
    );

    doc.setTextColor(23, 59, 99);
  };

  const espacio = (alto: number) => {
    if (y + alto > 275) {
      doc.addPage();
      cabecera();
      y = 48;
    }
  };

  const linea = (nombre: string, valor: string) => {
    espacio(12);

    doc.setTextColor(95, 105, 118);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(nombre, x, y);

    doc.setTextColor(23, 59, 99);
    doc.setFont('helvetica', 'bold');

    const textos = doc.splitTextToSize(
      valor || '-',
      120
    ) as string[];

    doc.text(textos, 65, y);
    y += Math.max(8, textos.length * 5 + 2);
  };

  const seccion = (nombre: string) => {
    espacio(24);
    y += 5;

    doc.setFillColor(241, 245, 249);
    doc.rect(x, y - 6, 178, 10, 'F');

    doc.setTextColor(23, 59, 99);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(nombre, x + 3, y + 1);

    y += 14;
  };

  cabecera();
  y = 49;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(
    detalle.CodigoComprobante ||
      `VENTA-${detalle.VentaID}`,
    x,
    y
  );

  doc.setFontSize(10);
  doc.text(
    detalle.Estado,
    194,
    y,
    { align: 'right' }
  );

  seccion('DATOS DE LA VENTA');
  linea(
    'Comprobante:',
    detalle.CodigoComprobante || '-'
  );
  linea('Reserva:', detalle.CodigoReserva);
  linea('Fecha:', fechaTexto(detalle.FechaVenta));
  linea(
    'Vendedor:',
    `${detalle.VendedorNombres} ${detalle.VendedorApellidos}`
  );

  seccion('VIAJE');
  linea(
    'Ruta:',
    `${detalle.Origen} - ${detalle.Destino}`
  );
  linea('Salida:', fechaTexto(detalle.Salida));
  linea(
    'Bus:',
    `${detalle.Placa} - ${detalle.Modelo}`
  );

  seccion('PASAJEROS Y ASIENTOS');

  detalle.pasajeros.forEach((p, i) => {
    linea(
      `Pasajero ${i + 1}:`,
      `${p.Nombres} ${p.Apellidos}`
    );
    linea(
      'DNI / asiento:',
      `${p.NumeroDocumento} · Piso ${p.Nivel}, asiento ${String(p.Numero).padStart(2, '0')}`
    );
  });

  seccion('PAGO SIMULADO');

  detalle.pagos.forEach(p => {
    linea('Método:', p.Metodo);
    linea(
      'Referencia:',
      p.ReferenciaSimulada || '-'
    );
    linea('Estado:', p.Estado);
    linea('Monto:', soles(p.Monto));
  });

  espacio(42);
  y += 3;

  doc.setFillColor(23, 59, 99);
  doc.roundedRect(x, y, 178, 17, 3, 3, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.text('TOTAL DE LA VENTA', x + 6, y + 11);
  doc.text(
    soles(detalle.Total),
    188,
    y + 11,
    { align: 'right' }
  );

  y += 28;
  doc.setTextColor(90, 100, 115);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  const aviso = doc.splitTextToSize(
    'OPERACION SIMULADA - DOCUMENTO INTERNO DE PRUEBAS ACADEMICAS. No acredita un cobro real ni constituye comprobante de pago tributario.',
    175
  );

  espacio(aviso.length * 5 + 5);
  doc.text(aviso, x, y);

  for (
    let i = 1;
    i <= doc.getNumberOfPages();
    i++
  ) {
    doc.setPage(i);
    doc.setDrawColor(215, 224, 233);
    doc.line(16, 284, 194, 284);

    doc.setTextColor(100, 110, 120);
    doc.setFontSize(8);

    doc.text(
      `SIGET-VIA | Página ${i} de ${doc.getNumberOfPages()}`,
      105,
      290,
      { align: 'center' }
    );
  }

  return doc;
}

function descargar(detalle: VentaDetalle) {
  const nombre = (
    detalle.CodigoComprobante ||
    `VENTA-${detalle.VentaID}`
  ).replace(/[^a-zA-Z0-9_-]/g, '_');

  generarConstancia(detalle).save(
    `SIGET-VIA-${nombre}.pdf`
  );
}

function imprimir(detalle: VentaDetalle) {
  const url = URL.createObjectURL(
    generarConstancia(detalle).output('blob')
  );

  const ventana = window.open(url, '_blank');

  if (!ventana) {
    URL.revokeObjectURL(url);
    throw new Error(
      'Permite las ventanas emergentes para abrir e imprimir el PDF.'
    );
  }
}

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================

export default function Ventas({
  token
}: {
  token: string;
}) {
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [reservas, setReservas] =
    useState<ReservaDisponible[]>([]);

  const [busqueda, setBusqueda] = useState('');

  const [modal, setModal] =
    useState<'new' | 'view' | null>(null);

  const [detalle, setDetalle] =
    useState<VentaDetalle | null>(null);

  const [reservaId, setReservaId] = useState(0);
  const [metodo, setMetodo] =
    useState<Metodo>('EFECTIVO');

  const [referencia, setReferencia] = useState('');
  const [cargando, setCargando] = useState(true);

  const [cargandoReservas, setCargandoReservas] =
    useState(false);

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const seleccionada = reservas.find(
    r => Number(r.ReservaID) === reservaId
  );

  async function cargar(q = '') {
    setCargando(true);

    try {
      const datos = await api<Venta[]>(
        `/ventas?q=${encodeURIComponent(q)}`,
        token
      );

      setVentas(datos);
      setError('');
    } catch (e) {
      setError((e as Error).message);

      await alertaError(
        (e as Error).message,
        'No se pudieron consultar las ventas'
      );
    } finally {
      setCargando(false);
    }
  }

  async function cargarReservas() {
    setCargandoReservas(true);

    try {
      const datos = await api<{
        reservas: ReservaDisponible[];
      }>('/ventas/catalogos', token);

      setReservas(datos.reservas || []);
    } catch (e) {
      await alertaError(
        (e as Error).message,
        'No se pudieron consultar las reservas'
      );
    } finally {
      setCargandoReservas(false);
    }
  }

  useEffect(() => {
    let activo = true;

    api<Venta[]>('/ventas', token)
      .then(datos => {
        if (activo) setVentas(datos);
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

  function abrirNueva() {
    setReservaId(0);
    setMetodo('EFECTIVO');
    setReferencia('');
    setDetalle(null);
    setError('');
    setModal('new');

    void cargarReservas();
  }

  function cerrar() {
    if (guardando) return;

    setModal(null);
    setDetalle(null);
    setError('');
  }

  async function abrirDetalle(id: number) {
    try {
      const datos = await api<VentaDetalle>(
        `/ventas/${id}`,
        token
      );

      setDetalle(datos);
      setError('');
      setModal('view');
    } catch (e) {
      await alertaError(
        (e as Error).message,
        'No se pudo consultar la venta'
      );
    }
  }

  // ========================================
  // GUARDAR VENTA Y PAGO
  // ========================================

  async function guardar(
    e: FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    if (guardando) return;

    if (!seleccionada) {
      await alertaAdvertencia(
        'Selecciona una reserva disponible.'
      );
      return;
    }

    if (!(Number(seleccionada.Total) > 0)) {
      await alertaAdvertencia(
        'El total de la reserva no es válido.'
      );
      return;
    }

    const confirmado = await Swal.fire({
      title: 'Confirmar venta simulada',
      text:
        `¿Registrar ${seleccionada.Codigo} ` +
        `por ${soles(seleccionada.Total)} ` +
        `con ${metodo}?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, registrar',
      cancelButtonText: 'Volver',
      confirmButtonColor: NARANJA,
      cancelButtonColor: AZUL
    });

    if (!confirmado.isConfirmed) return;

    setGuardando(true);

    try {
      const creada = await api<{
        VentaID: number;
        CodigoComprobante: string | null;
      }>('/ventas', token, {
        method: 'POST',
        body: JSON.stringify({
          reservaId,
          metodo,
          referenciaSimulada:
            referencia.trim() || null
        })
      });

      setModal(null);
      setError('');

      await alertaExito(
        `Venta simulada ${
          creada.CodigoComprobante ||
          `#${creada.VentaID}`
        } registrada.`,
        'Venta registrada'
      );

      await cargar(busqueda);
      await abrirDetalle(creada.VentaID);
    } catch (e) {
      setError((e as Error).message);

      await alertaError(
        (e as Error).message,
        'No se pudo registrar la venta'
      );

      await cargarReservas();
    } finally {
      setGuardando(false);
    }
  }

  // ========================================
  // ANULAR SIN BORRAR REGISTROS
  // ========================================

  async function anular(v: VentaDetalle) {
    if (
      guardando ||
      v.Estado !== 'REGISTRADA'
    ) {
      return;
    }

    const confirmado = await Swal.fire({
      title: 'Anular venta simulada',
      text:
        `Se anularán la venta ${
          v.CodigoComprobante ||
          `#${v.VentaID}`
        } y su pago simulado. ` +
        'La reserva y sus asientos permanecerán intactos.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, anular',
      cancelButtonText: 'Volver',
      confirmButtonColor: '#c24132',
      cancelButtonColor: AZUL
    });

    if (!confirmado.isConfirmed) return;

    setGuardando(true);

    try {
      await api(
        `/ventas/${v.VentaID}/anular`,
        token,
        { method: 'PATCH' }
      );

      const actualizada = await api<VentaDetalle>(
        `/ventas/${v.VentaID}`,
        token
      );

      setDetalle(actualizada);

      await alertaExito(
        'Venta y pago simulado anulados, sin eliminar registros.',
        'Anulación realizada'
      );

      await cargar(busqueda);
    } catch (e) {
      await alertaError(
        (e as Error).message,
        'No se pudo anular la venta'
      );
    } finally {
      setGuardando(false);
    }
  }

  // ========================================
  // INTERFAZ
  // ========================================

  return (
    <>
      <div className="heading">
        <h1>Gestión de ventas</h1>
        <p>
          Ventas de pasajes, pagos simulados
          y constancias internas
        </p>
      </div>

      <div className="panel">
        <div className="section-heading">
          <div>
            <h2>Registros · Gestión de ventas</h2>
            <p>
              Operaciones simuladas vinculadas a reservas
            </p>
          </div>

          <button
            type="button"
            className="orange"
            onClick={abrirNueva}
          >
            <Plus size={17} />
            Nueva venta
          </button>
        </div>

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
            placeholder={
              'Buscar comprobante, reserva, ruta o estado'
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
          <div className="alert">{error}</div>
        )}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Comprobante</th>
                <th>Reserva</th>
                <th>Ruta</th>
                <th>Fecha</th>
                <th>Método</th>
                <th>Total</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {cargando && (
                <tr>
                  <td colSpan={9}>
                    Cargando ventas...
                  </td>
                </tr>
              )}

              {!cargando && ventas.map(v => (
                <tr key={v.VentaID}>
                  <td>{v.VentaID}</td>
                  <td>{v.CodigoComprobante || '-'}</td>
                  <td>{v.CodigoReserva}</td>

                  <td>
                    {v.Origen} - {v.Destino}
                  </td>

                  <td>{fechaTexto(v.FechaVenta)}</td>
                  <td>{v.Metodo || '-'}</td>
                  <td>{soles(v.Total)}</td>

                  <td>
                    <span
                      className={
                        v.Estado === 'REGISTRADA'
                          ? 'status active'
                          : 'status'
                      }
                    >
                      {v.Estado}
                    </span>
                  </td>

                  <td className="actions">
                    <button
                      type="button"
                      title="Ver venta"
                      onClick={() =>
                        void abrirDetalle(v.VentaID)
                      }
                    >
                      <Eye size={16} />
                    </button>
                  </td>
                </tr>
              ))}

              {!cargando &&
                !ventas.length &&
                !error && (
                  <tr>
                    <td colSpan={9}>
                      Todavía no existen ventas registradas.
                    </td>
                  </tr>
                )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ======================================
          MODAL NUEVA VENTA
      ====================================== */}

      {modal === 'new' && (
        <div className="overlay">
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Nueva venta simulada"
            style={{
              width: '95%',
              maxWidth: 850,
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
          >
            <div className="dialog-head">
              <h2>
                Registrar venta y pago simulado
              </h2>

              <button
                type="button"
                disabled={guardando}
                onClick={cerrar}
                aria-label="Cerrar"
              >
                <X />
              </button>
            </div>

            <form onSubmit={guardar} noValidate>
              <div style={{
                background: '#f1f5f9',
                borderRadius: 8,
                padding: 14,
                marginBottom: 16
              }}>
                Esta operación es una{' '}
                <strong>simulación académica</strong>.
                No se procesa ningún pago real.
              </div>

              <div className="fields">
                <label style={{
                  gridColumn: '1 / -1'
                }}>
                  Reserva disponible

                  <select
                    value={reservaId}
                    disabled={
                      guardando ||
                      cargandoReservas
                    }
                    onChange={e =>
                      setReservaId(
                        Number(e.target.value)
                      )
                    }
                  >
                    <option value={0}>
                      {cargandoReservas
                        ? 'Cargando reservas...'
                        : 'Selecciona una reserva'}
                    </option>

                    {reservas.map(r => (
                      <option
                        key={r.ReservaID}
                        value={r.ReservaID}
                      >
                        {r.Codigo}
                        {' | '}{r.Origen} - {r.Destino}
                        {' | '}{fechaTexto(r.Salida)}
                        {' | '}{soles(r.Total)}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Método de pago simulado

                  <select
                    value={metodo}
                    disabled={guardando}
                    onChange={e =>
                      setMetodo(
                        e.target.value as Metodo
                      )
                    }
                  >
                    <option value="EFECTIVO">
                      Efectivo
                    </option>
                    <option value="TARJETA">
                      Tarjeta
                    </option>
                    <option value="TRANSFERENCIA">
                      Transferencia
                    </option>
                    <option value="OTRO">
                      Otro
                    </option>
                  </select>
                </label>

                <label>
                  Referencia simulada (opcional)

                  <input
                    maxLength={100}
                    value={referencia}
                    disabled={guardando}
                    onChange={e =>
                      setReferencia(e.target.value)
                    }
                    placeholder="Ej.: SIM-TRANSFER-001"
                  />
                </label>
              </div>

              {seleccionada ? (
                <div style={{
                  marginTop: 16,
                  background: '#f4f7fb',
                  border: '1px solid #d6dde7',
                  padding: 18,
                  borderRadius: 10,
                  display: 'flex',
                  gap: 16,
                  flexWrap: 'wrap',
                  justifyContent: 'space-between'
                }}>
                  <div>
                    <strong>
                      {seleccionada.Codigo}
                    </strong>

                    <p>
                      {seleccionada.Origen} -{' '}
                      {seleccionada.Destino}
                    </p>

                    <p>
                      Salida:{' '}
                      {fechaTexto(seleccionada.Salida)}
                    </p>

                    <p>
                      Asientos:{' '}
                      {seleccionada.CantidadAsientos}
                    </p>
                  </div>

                  <div>
                    <strong style={{
                      color: AZUL,
                      fontSize: 20
                    }}>
                      Total:{' '}
                      {soles(seleccionada.Total)}
                    </strong>

                    <p>Pago simulado del 100 %</p>
                  </div>
                </div>
              ) : !cargandoReservas &&
                reservas.length === 0 ? (
                <div className="alert">
                  No hay reservas aptas para vender.
                  Comprueba que exista una reserva
                  sin venta y con viaje PROGRAMADO
                  futuro.
                </div>
              ) : null}

              {error && (
                <div className="alert">{error}</div>
              )}

              <div className="dialog-actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={
                    guardando ||
                    cargandoReservas
                  }
                  onClick={() =>
                    void cargarReservas()
                  }
                >
                  <RefreshCw size={16} />
                  Actualizar reservas
                </button>

                <button
                  type="submit"
                  className="orange"
                  disabled={
                    guardando ||
                    cargandoReservas ||
                    !seleccionada
                  }
                >
                  {guardando
                    ? 'Registrando...'
                    : 'Registrar venta y pago'}
                </button>

                <button
                  type="button"
                  className="secondary"
                  disabled={guardando}
                  onClick={cerrar}
                >
                  Cerrar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================
          MODAL DETALLE DE VENTA
      ====================================== */}

      {modal === 'view' && detalle && (
        <div className="overlay">
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Detalle de venta"
            style={{
              width: '95%',
              maxWidth: 920,
              maxHeight: '92vh',
              overflowY: 'auto'
            }}
          >
            <div className="dialog-head">
              <h2>
                Venta{' '}
                {detalle.CodigoComprobante ||
                  `#${detalle.VentaID}`}
              </h2>

              <button
                type="button"
                disabled={guardando}
                onClick={cerrar}
                aria-label="Cerrar"
              >
                <X />
              </button>
            </div>

            <div style={{
              padding: 16,
              background: '#f5f8fc',
              borderRadius: 9,
              marginBottom: 15
            }}>
              <strong>
                Estado: {detalle.Estado}
              </strong>

              <p>
                Reserva: {detalle.CodigoReserva}
                {' · '}{detalle.Origen} -{' '}
                {detalle.Destino}
              </p>

              <p>
                Salida:{' '}
                {fechaTexto(detalle.Salida)}
                {' · '}Bus: {detalle.Placa}
                {' - '}{detalle.Modelo}
              </p>

              <p>
                Vendedor:{' '}
                {detalle.VendedorNombres}{' '}
                {detalle.VendedorApellidos}
              </p>

              <p>
                Fecha de venta:{' '}
                {fechaTexto(detalle.FechaVenta)}
              </p>
            </div>

            <h3 style={{ color: AZUL }}>
              Pasajeros y asientos
            </h3>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>DNI</th>
                    <th>Pasajero</th>
                    <th>Piso</th>
                    <th>Asiento</th>
                    <th>Precio</th>
                  </tr>
                </thead>

                <tbody>
                  {detalle.pasajeros.map(p => (
                    <tr key={p.ReservaAsientoID}>
                      <td>{p.NumeroDocumento}</td>

                      <td>
                        {p.Nombres} {p.Apellidos}
                      </td>

                      <td>{p.Nivel}</td>

                      <td>
                        {String(p.Numero).padStart(2, '0')}
                      </td>

                      <td>{soles(p.Precio)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 style={{
              marginTop: 18,
              color: AZUL
            }}>
              Pagos simulados
            </h3>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Método</th>
                    <th>Referencia</th>
                    <th>Fecha</th>
                    <th>Monto</th>
                    <th>Estado</th>
                  </tr>
                </thead>

                <tbody>
                  {detalle.pagos.map(p => (
                    <tr key={p.PagoID}>
                      <td>{p.Metodo}</td>

                      <td>
                        {p.ReferenciaSimulada || '-'}
                      </td>

                      <td>
                        {fechaTexto(p.FechaPago)}
                      </td>

                      <td>{soles(p.Monto)}</td>
                      <td>{p.Estado}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{
              marginTop: 18,
              padding: 15,
              borderRadius: 8,
              background: AZUL,
              color: 'white',
              textAlign: 'right'
            }}>
              <strong style={{ fontSize: 19 }}>
                TOTAL: {soles(detalle.Total)}
              </strong>
            </div>

            <p style={{
              marginTop: 12,
              fontSize: 12,
              color: '#64748b'
            }}>
              Documento interno. Los pagos y
              constancias de este módulo son
              simulados y no tienen validez
              tributaria.
            </p>

            <div
              className="dialog-actions"
              style={{ flexWrap: 'wrap' }}
            >
              <button
                type="button"
                className="secondary"
                disabled={guardando}
                onClick={() => {
                  try {
                    imprimir(detalle);
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
                className="secondary"
                disabled={guardando}
                onClick={() =>
                  descargar(detalle)
                }
              >
                <Download size={16} />
                Descargar PDF
              </button>

              <button
                type="button"
                className="orange"
                disabled={
                  guardando ||
                  detalle.Estado !== 'REGISTRADA'
                }
                onClick={() =>
                  void anular(detalle)
                }
              >
                <Ban size={16} />
                Anular venta
              </button>

              <button
                type="button"
                className="secondary"
                disabled={guardando}
                onClick={cerrar}
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
