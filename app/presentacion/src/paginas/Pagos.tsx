
import {
  useEffect,
  useState,
  type FormEvent
} from 'react';

import {
  Search,
  Eye,
  RefreshCw,
  X,
  CreditCard,
  CheckCircle2,
  Ban,
  Wallet,
  ShieldCheck,
  FileText
} from 'lucide-react';

import {
  alertaError,
  alertaAdvertencia
} from '../componentes/alertas';

import {
  listarPagos,
  resumenPagos,
  detallePago
} from '../reglas/consultas';

// ==============================================
// SIGET-VÍA - GESTIÓN DE PAGOS SIMULADOS
// PASO 159
// ==============================================

type Metodo =
  | 'EFECTIVO'
  | 'TARJETA'
  | 'TRANSFERENCIA'
  | 'OTRO';

type EstadoPago =
  | 'REGISTRADO'
  | 'ANULADO';

type Pago = {
  PagoID: number;
  VentaID: number;
  Metodo: Metodo;
  ReferenciaSimulada: string | null;
  Monto: number;
  FechaPago: string;
  Estado: EstadoPago;
  EsSimulado: boolean | number;

  CodigoComprobante: string;
  EstadoVenta: string;
  TotalVenta: number;
  FechaVenta: string;

  ReservaID: number;
  CodigoReserva: string;

  VendedorID: number;
  VendedorNombres: string;
  VendedorApellidos: string;

  Origen: string;
  Destino: string;
  Salida: string;
};

type Auditoria = {
  AuditoriaID: number;
  UsuarioID: number | null;
  Entidad: string;
  RegistroID: number | null;
  Accion: string;
  Detalle: string | null;
  Fecha: string;
  UsuarioNombres: string | null;
  UsuarioApellidos: string | null;
};

type PagoDetalle = Pago & {
  auditoria: Auditoria[];
};

type Resumen = {
  TotalPagos: number;
  PagosRegistrados: number;
  PagosAnulados: number;
  TotalRegistrado: number;
  TotalAnulado: number;
};

type Filtros = {
  q: string;
  estado: string;
  metodo: string;
  desde: string;
  hasta: string;
};

const AZUL = '#173b63';

const filtrosVacios = (): Filtros => ({
  q: '',
  estado: '',
  metodo: '',
  desde: '',
  hasta: ''
});

const resumenVacio = (): Resumen => ({
  TotalPagos: 0,
  PagosRegistrados: 0,
  PagosAnulados: 0,
  TotalRegistrado: 0,
  TotalAnulado: 0
});

// ==============================================
// PETICIONES
// ==============================================

function soles(valor: number): string {
  return (
    'S/ ' +
    Number(valor || 0).toLocaleString(
      'es-PE',
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }
    )
  );
}

function fechaTexto(valor: string): string {
  if (!valor) return '-';

  const normalizada = valor
    .replace(' ', 'T')
    .slice(0, 16);

  const partes = normalizada.split('T');

  if (partes.length !== 2) {
    return valor;
  }

  const [anio, mes, dia] =
    partes[0].split('-');

  return `${dia}/${mes}/${anio} ${partes[1]}`;
}

function descripcionMetodo(
  metodo: Metodo
): string {
  switch (metodo) {
    case 'EFECTIVO':
      return 'Efectivo';
    case 'TARJETA':
      return 'Tarjeta';
    case 'TRANSFERENCIA':
      return 'Transferencia';
    case 'OTRO':
      return 'Otro';
    default:
      return metodo;
  }
}

function parametros(
  filtros: Filtros
): string {
  const query = new URLSearchParams();

  if (filtros.q.trim()) {
    query.set('q', filtros.q.trim());
  }

  if (filtros.estado) {
    query.set('estado', filtros.estado);
  }

  if (filtros.metodo) {
    query.set('metodo', filtros.metodo);
  }

  if (filtros.desde) {
    query.set('desde', filtros.desde);
  }

  if (filtros.hasta) {
    query.set('hasta', filtros.hasta);
  }

  const cadena = query.toString();

  return cadena ? `?${cadena}` : '';
}

// ==============================================
// COMPONENTE PRINCIPAL
// ==============================================

export default function Pagos({
  token
}: {
  token: string;
}) {
  const [pagos, setPagos] =
    useState<Pago[]>([]);

  const [resumen, setResumen] =
    useState<Resumen>(resumenVacio);

  const [filtros, setFiltros] =
    useState<Filtros>(filtrosVacios);

  const [detalle, setDetalle] =
    useState<PagoDetalle | null>(null);

  const [cargando, setCargando] =
    useState(true);

  const [consultando, setConsultando] =
    useState(false);

  const [error, setError] =
    useState('');

  // ============================================
  // CARGAR PAGOS
  // ============================================

  async function cargar(
    valores: Filtros = filtros
  ) {
    if (
      valores.desde &&
      valores.hasta &&
      valores.desde > valores.hasta
    ) {
      await alertaAdvertencia(
        'La fecha inicial no puede ser posterior ' +
        'a la fecha final.'
      );
      return;
    }

    setCargando(true);
    setError('');

    try {
      const [registros, estadisticas] =
        await Promise.all([
          listarPagos<Pago[]>(token, parametros(valores)),
          resumenPagos<Resumen>(token)
        ]);

      setPagos(registros);
      setResumen(estadisticas);
    } catch (e) {
      const mensaje =
        (e as Error).message;

      setError(mensaje);

      await alertaError(
        mensaje,
        'No se pudieron cargar los pagos'
      );
    } finally {
      setCargando(false);
    }
  }

  // ============================================
  // CARGA INICIAL
  // ============================================

  useEffect(() => {
    let activo = true;

    Promise.all([
      listarPagos<Pago[]>(token),
      resumenPagos<Resumen>(token)
    ])
      .then(([registros, estadisticas]) => {
        if (!activo) return;

        setPagos(registros);
        setResumen(estadisticas);
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

  // ============================================
  // VER DETALLE Y AUDITORÍA
  // ============================================

  async function abrirDetalle(id: number) {
    if (consultando) return;

    setConsultando(true);

    try {
      const datos = await detallePago<PagoDetalle>(token, id);

      setDetalle(datos);
    } catch (e) {
      await alertaError(
        (e as Error).message,
        'No se pudo consultar el pago'
      );
    } finally {
      setConsultando(false);
    }
  }

  function cerrar() {
    if (consultando) return;
    setDetalle(null);
  }

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
    void cargar();
  }

  function limpiarFiltros() {
    const nuevos = filtrosVacios();

    setFiltros(nuevos);
    void cargar(nuevos);
  }

  // ============================================
  // INTERFAZ PRINCIPAL
  // ============================================

  return (
    <>
      <div className="heading">
        <h1>Gestión de pagos</h1>

        <p>
          Historial de pagos simulados,
          estados y trazabilidad
        </p>
      </div>

      {/* =====================================
          INDICADORES GENERALES
      ===================================== */}

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
            titulo: 'Total de pagos',
            valor: String(resumen.TotalPagos),
            Icono: CreditCard
          },
          {
            titulo: 'Registrados',
            valor: String(resumen.PagosRegistrados),
            Icono: CheckCircle2
          },
          {
            titulo: 'Anulados',
            valor: String(resumen.PagosAnulados),
            Icono: Ban
          },
          {
            titulo: 'Monto registrado vigente',
            valor: soles(resumen.TotalRegistrado),
            Icono: Wallet
          }
        ].map(indicador => (
          <div
            key={indicador.titulo}
            className="panel"
            style={{
              padding: 18,
              display: 'flex',
              alignItems: 'center',
              gap: 13
            }}
          >
            <indicador.Icono
              size={25}
              color={AZUL}
            />

            <div>
              <div
                style={{
                  fontSize: 12,
                  color: '#64748b'
                }}
              >
                {indicador.titulo}
              </div>

              <strong
                style={{
                  fontSize: 20,
                  color: AZUL
                }}
              >
                {indicador.valor}
              </strong>
            </div>
          </div>
        ))}
      </div>

      {/* =====================================
          HISTORIAL
      ===================================== */}

      <div className="panel">
        <div className="section-heading">
          <div>
            <h2>
              Registros · Gestión de pagos
            </h2>

            <p>
              Consulta de pagos vinculados a ventas
            </p>
          </div>

          <button
            type="button"
            className="secondary"
            disabled={cargando}
            onClick={() =>
              void cargar()
            }
          >
            <RefreshCw size={16} />
            Actualizar
          </button>
        </div>

        <div
          style={{
            padding: 14,
            background: '#f1f5f9',
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 13
          }}
        >
          Los pagos son simulados. El registro
          y la anulación se realizan desde
          <strong> Gestión de Ventas</strong>.
          Este módulo permite consultar su historial
          y los eventos de auditoría existentes.
        </div>

        {/* FILTROS */}

        <form
          onSubmit={buscar}
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(170px, 1fr))',
            gap: 12,
            marginBottom: 20
          }}
        >
          <label>
            Buscar

            <input
              type="text"
              value={filtros.q}
              maxLength={100}
              placeholder="Comprobante, reserva o ruta"
              onChange={e =>
                actualizarFiltro(
                  'q',
                  e.target.value
                )
              }
            />
          </label>

          <label>
            Estado

            <select
              value={filtros.estado}
              onChange={e =>
                actualizarFiltro(
                  'estado',
                  e.target.value
                )
              }
            >
              <option value="">
                Todos
              </option>

              <option value="REGISTRADO">
                Registrado
              </option>

              <option value="ANULADO">
                Anulado
              </option>
            </select>
          </label>

          <label>
            Método

            <select
              value={filtros.metodo}
              onChange={e =>
                actualizarFiltro(
                  'metodo',
                  e.target.value
                )
              }
            >
              <option value="">
                Todos
              </option>

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
              onClick={limpiarFiltros}
            >
              Limpiar
            </button>
          </div>
        </form>

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
                <th>Comprobante</th>
                <th>Reserva</th>
                <th>Fecha de pago</th>
                <th>Método</th>
                <th>Monto</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {cargando && (
                <tr>
                  <td colSpan={8}>
                    Cargando pagos...
                  </td>
                </tr>
              )}

              {!cargando && pagos.map(p => (
                <tr key={p.PagoID}>
                  <td>{p.PagoID}</td>

                  <td>
                    {p.CodigoComprobante || '-'}
                  </td>

                  <td>{p.CodigoReserva}</td>

                  <td>
                    {fechaTexto(p.FechaPago)}
                  </td>

                  <td>
                    {descripcionMetodo(p.Metodo)}
                  </td>

                  <td>
                    {soles(p.Monto)}
                  </td>

                  <td>
                    <span
                      className={
                        p.Estado === 'REGISTRADO'
                          ? 'status active'
                          : 'status'
                      }
                    >
                      {p.Estado}
                    </span>
                  </td>

                  <td className="actions">
                    <button
                      type="button"
                      title="Ver detalle del pago"
                      disabled={consultando}
                      onClick={() =>
                        void abrirDetalle(p.PagoID)
                      }
                    >
                      <Eye size={16} />
                    </button>
                  </td>
                </tr>
              ))}

              {!cargando &&
                pagos.length === 0 &&
                !error && (
                  <tr>
                    <td colSpan={8}>
                      No se encontraron pagos
                      con los filtros seleccionados.
                    </td>
                  </tr>
                )}
            </tbody>
          </table>
        </div>
      </div>

      {/* =====================================
          DETALLE DE PAGO
      ===================================== */}

      {detalle && (
        <div className="overlay">
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Detalle de pago simulado"
            style={{
              width: '95%',
              maxWidth: 900,
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
          >
            <div className="dialog-head">
              <h2>
                Detalle de pago #{detalle.PagoID}
              </h2>

              <button
                type="button"
                aria-label="Cerrar"
                onClick={cerrar}
              >
                <X />
              </button>
            </div>

            <div
              style={{
                padding: 16,
                background: '#f3f6fa',
                borderRadius: 10,
                marginBottom: 18
              }}
            >
              <strong
                style={{
                  fontSize: 17,
                  color: AZUL
                }}
              >
                {detalle.CodigoComprobante}
              </strong>

              <p>
                Reserva: {detalle.CodigoReserva}
              </p>

              <p>
                Ruta: {detalle.Origen}
                {' - '}{detalle.Destino}
              </p>

              <p>
                Salida: {fechaTexto(detalle.Salida)}
              </p>

              <p>
                Vendedor: {detalle.VendedorNombres}
                {' '}{detalle.VendedorApellidos}
              </p>
            </div>

            <h3 style={{ color: AZUL }}>
              Información del pago
            </h3>

            <div className="table-wrap">
              <table>
                <tbody>
                  <tr>
                    <th>Fecha</th>
                    <td>
                      {fechaTexto(detalle.FechaPago)}
                    </td>
                  </tr>

                  <tr>
                    <th>Método</th>
                    <td>
                      {descripcionMetodo(
                        detalle.Metodo
                      )}
                    </td>
                  </tr>

                  <tr>
                    <th>Referencia</th>
                    <td>
                      {detalle.ReferenciaSimulada ||
                        'Sin referencia'}
                    </td>
                  </tr>

                  <tr>
                    <th>Monto</th>
                    <td>
                      {soles(detalle.Monto)}
                    </td>
                  </tr>

                  <tr>
                    <th>Estado del pago</th>
                    <td>{detalle.Estado}</td>
                  </tr>

                  <tr>
                    <th>Estado de la venta</th>
                    <td>{detalle.EstadoVenta}</td>
                  </tr>

                  <tr>
                    <th>Simulado</th>
                    <td>
                      {Boolean(detalle.EsSimulado)
                        ? 'Sí'
                        : 'No'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* AUDITORÍA */}

            <h3
              style={{
                color: AZUL,
                marginTop: 22,
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <ShieldCheck size={19} />
              Auditoría de la operación
            </h3>

            {detalle.auditoria.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Usuario</th>
                      <th>Entidad</th>
                      <th>Acción</th>
                      <th>Detalle</th>
                    </tr>
                  </thead>

                  <tbody>
                    {detalle.auditoria.map(a => (
                      <tr key={a.AuditoriaID}>
                        <td>
                          {fechaTexto(a.Fecha)}
                        </td>

                        <td>
                          {[
                            a.UsuarioNombres,
                            a.UsuarioApellidos
                          ].filter(Boolean).join(' ') ||
                            'Sistema'}
                        </td>

                        <td>{a.Entidad}</td>
                        <td>{a.Accion}</td>

                        <td>
                          {a.Detalle || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div
                style={{
                  padding: 15,
                  border: '1px solid #d9e2ec',
                  borderRadius: 9,
                  color: '#64748b'
                }}
              >
                No existen eventos de auditoría
                registrados para esta operación.
                Los pagos anteriores a la
                implementación de auditoría no
                tendrán eventos históricos
                inventados.
              </div>
            )}

            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                marginTop: 16,
                fontSize: 12,
                color: '#64748b'
              }}
            >
              <FileText size={17} />
              Esta operación es simulada y
              no representa un cobro bancario real.
            </div>

            <div className="dialog-actions">
              <button
                type="button"
                className="secondary"
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
