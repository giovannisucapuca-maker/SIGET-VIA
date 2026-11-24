
import { useCallback, useEffect, useState } from 'react';
import {
  CalendarClock,
  Ticket,
  Receipt,
  Wallet,
  MessageSquareWarning,
  RefreshCw,
  CheckCircle2,
  Ban,
  TrendingUp,
  AlertCircle,
  Users,
  BusFront,
  UserRoundCog
} from 'lucide-react';
// =====================================================
// SIGET-VÍA — PASO 176.3
// DASHBOARD ADMINISTRATIVO CON INDICADORES REALES
// =====================================================
// RF14 — Reportes
// RF7 — Viajes
// RF8 — Buses
// RF9 — Conductores
// RF4 — Reservas
// RF5 — Ventas
// RF11 — Reclamaciones
// RF15 — Pasajeros
// =====================================================
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
type ResumenExtra = {
  TotalPasajeros: number;
  TotalBuses: number;
  BusesActivos: number;
  BusesInactivos: number;
  TotalConductores: number;
  ConductoresActivos: number;
};
type Props = {
  token: string;
};
const API = (
  import.meta.env.VITE_API_URL ||
  'http://localhost:4000/api'
).replace(/\/$/, '');
const numero = (valor: number) =>
  Number(valor || 0).toLocaleString('es-PE');
const dinero = (valor: number) =>
  Number(valor || 0).toLocaleString('es-PE', {
    style: 'currency',
    currency: 'PEN'
  });
// =====================================================
// CONSULTA SEGURA A LA API
// =====================================================
async function consultar<T>(
  ruta: string,
  token: string,
  signal?: AbortSignal
): Promise<T> {
  const respuesta = await fetch(`${API}${ruta}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`
    },
    cache: 'no-store',
    signal
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
// =====================================================
// COMPONENTE PRINCIPAL
// =====================================================
export default function DashboardAdmin({ token }: Props) {
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [extra, setExtra] = useState<ResumenExtra | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [errorExtra, setErrorExtra] = useState('');
  // ===================================================
  // CARGAR INDICADORES DESDE SQL SERVER
  // ===================================================
  const cargar = useCallback(async (signal?: AbortSignal) => {
    setCargando(true);
    setError('');
    setErrorExtra('');
    try {
      const resultados = await Promise.allSettled([
        consultar<Resumen>('/reportes/resumen', token, signal),
        consultar<ResumenExtra>('/reportes/dashboard-extra', token, signal)
      ]);
      if (signal?.aborted) return;
      const principal = resultados[0];
      const adicional = resultados[1];
      if (principal.status === 'fulfilled') {
        if (typeof principal.value.TotalReservas !== 'undefined') {
          setResumen(principal.value);
        } else {
          setResumen(null);
          setError('La API no devolvió los indicadores generales esperados.');
        }
      } else {
        setResumen(null);
        setError(
          principal.reason instanceof Error
            ? principal.reason.message
            : 'No se pudo consultar el resumen general.'
        );
      }
      if (adicional.status === 'fulfilled') {
        if (typeof adicional.value.TotalBuses !== 'undefined') {
          setExtra(adicional.value);
        } else {
          setExtra(null);
          setErrorExtra('La API no devolvió los indicadores complementarios.');
        }
      } else {
        setExtra(null);
        setErrorExtra(
          adicional.reason instanceof Error
            ? adicional.reason.message
            : 'No se pudieron consultar los indicadores complementarios.'
        );
      }
    } finally {
      if (!signal?.aborted) {
        setCargando(false);
      }
    }
  }, [token]);
  useEffect(() => {
    const controller = new AbortController();
    void cargar(controller.signal);
    return () => controller.abort();
  }, [cargar]);
  // ===================================================
  // TARJETAS DE INDICADORES
  // ===================================================
  const tarjetas = [
    ...(resumen ? [
      {
        titulo: 'Total de reservas',
        valor: numero(resumen.TotalReservas),
        detalle: `${numero(resumen.ReservasCanceladas)} canceladas`,
        Icono: Ticket,
        color: '#173b63',
        fondo: '#eaf2fb'
      },
      {
        titulo: 'Reservas no canceladas',
        valor: numero(Math.max(
          0,
          resumen.TotalReservas - resumen.ReservasCanceladas
        )),
        detalle: 'Total menos canceladas',
        Icono: CheckCircle2,
        color: '#15803d',
        fondo: '#dcfce7'
      },
      {
        titulo: 'Viajes registrados',
        valor: numero(resumen.TotalViajes),
        detalle: `${numero(resumen.ViajesProgramados)} programados`,
        Icono: CalendarClock,
        color: '#7c3aed',
        fondo: '#f3e8ff'
      },
      {
        titulo: 'Ventas registradas',
        valor: numero(resumen.VentasRegistradas),
        detalle: `${numero(resumen.VentasAnuladas)} anuladas`,
        Icono: Receipt,
        color: '#c2410c',
        fondo: '#ffedd5'
      },
      {
        titulo: 'Importe de ventas vigentes',
        valor: dinero(resumen.TotalVentasVigentes),
        detalle: 'Ventas simuladas en estado REGISTRADA',
        Icono: Wallet,
        color: '#15803d',
        fondo: '#dcfce7'
      },
      {
        titulo: 'Total de reclamaciones',
        valor: numero(resumen.TotalReclamaciones),
        detalle: `${numero(resumen.ReclamacionesCerradas)} cerradas`,
        Icono: MessageSquareWarning,
        color: '#a16207',
        fondo: '#fef9c3'
      },
      {
        titulo: 'Reclamaciones pendientes',
        valor: numero(resumen.ReclamacionesPendientes),
        detalle: 'Registradas o en atención',
        Icono: AlertCircle,
        color: '#b91c1c',
        fondo: '#fee2e2'
      },
      {
        titulo: 'Total de ventas',
        valor: numero(resumen.TotalVentas),
        detalle: 'Incluye ventas de todos los estados',
        Icono: TrendingUp,
        color: '#0369a1',
        fondo: '#e0f2fe'
      }
    ] : []),
    ...(extra ? [
      {
        titulo: 'Total de pasajeros',
        valor: numero(extra.TotalPasajeros),
        detalle: 'Pasajeros registrados en el sistema',
        Icono: Users,
        color: '#0369a1',
        fondo: '#e0f2fe'
      },
      {
        titulo: 'Total de buses',
        valor: numero(extra.TotalBuses),
        detalle: `${numero(extra.BusesActivos)} activos`,
        Icono: BusFront,
        color: '#173b63',
        fondo: '#eaf2fb'
      },
      {
        titulo: 'Buses activos',
        valor: numero(extra.BusesActivos),
        detalle: 'Unidades en estado ACTIVO',
        Icono: BusFront,
        color: '#15803d',
        fondo: '#dcfce7'
      },
      {
        titulo: 'Buses inactivos',
        valor: numero(extra.BusesInactivos),
        detalle: 'Unidades en estado INACTIVO',
        Icono: Ban,
        color: '#b91c1c',
        fondo: '#fee2e2'
      },
      {
        titulo: 'Total de conductores',
        valor: numero(extra.TotalConductores),
        detalle: 'Conductores registrados',
        Icono: UserRoundCog,
        color: '#7c3aed',
        fondo: '#f3e8ff'
      },
      {
        titulo: 'Conductores activos',
        valor: numero(extra.ConductoresActivos),
        detalle: 'Conductores en estado ACTIVO',
        Icono: CheckCircle2,
        color: '#15803d',
        fondo: '#dcfce7'
      }
    ] : [])
  ];
  // ===================================================
  // INTERFAZ PRINCIPAL
  // ===================================================
  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <div className="heading">
        <h1>Dashboard administrativo</h1>
        <p>
          SIGET-VÍA · Indicadores registrados en SQL Server
        </p>
      </div>
      {/* CABECERA */}
      <section
        className="panel"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap'
        }}
      >
        <div>
          <h2 style={{
            color: '#173b63',
            margin: '0 0 5px',
            fontSize: 19
          }}>
            Resumen general del sistema
          </h2>
          <p style={{ margin: 0, color: '#64748b' }}>
            Indicadores acumulados desde el inicio de operaciones.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void cargar()}
          disabled={cargando}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: '#173b63',
            color: '#fff',
            border: 0,
            borderRadius: 8,
            padding: '11px 16px',
            fontWeight: 700,
            cursor: cargando ? 'wait' : 'pointer'
          }}
        >
          <RefreshCw size={17} />
          {cargando ? 'Actualizando...' : 'Actualizar datos'}
        </button>
      </section>
      {/* ERRORES */}
      {error && (
        <div
          role="alert"
          style={{
            background: '#fee2e2',
            color: '#991b1b',
            border: '1px solid #fecaca',
            borderRadius: 10,
            padding: 16
          }}
        >
          <strong>No se pudo cargar el resumen general.</strong>
          <p style={{ margin: '7px 0 0' }}>{error}</p>
        </div>
      )}
      {errorExtra && (
        <div
          role="alert"
          style={{
            background: '#fff7ed',
            color: '#9a3412',
            border: '1px solid #fed7aa',
            borderRadius: 10,
            padding: 16
          }}
        >
          <strong>No se pudieron cargar los nuevos indicadores.</strong>
          <p style={{ margin: '7px 0 0' }}>{errorExtra}</p>
        </div>
      )}
      {cargando && !resumen && !extra && (
        <div className="panel">
          Consultando indicadores de SQL Server...
        </div>
      )}
      {/* TARJETAS */}
      {tarjetas.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))',
          gap: 16
        }}>
          {tarjetas.map(t => (
            <article
              key={t.titulo}
              style={{
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: 14,
                padding: 20,
                boxShadow: '0 4px 14px rgba(15,23,42,.05)',
                minWidth: 0
              }}
            >
              <div style={{
                width: 45,
                height: 45,
                borderRadius: 10,
                background: t.fondo,
                color: t.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 15
              }}>
                <t.Icono size={24} />
              </div>
              <p style={{
                fontSize: 13,
                color: '#64748b',
                margin: '0 0 8px'
              }}>
                {t.titulo}
              </p>
              <strong style={{
                display: 'block',
                fontSize: 26,
                color: '#173b63',
                overflowWrap: 'anywhere'
              }}>
                {t.valor}
              </strong>
              <p style={{
                color: '#64748b',
                fontSize: 12,
                margin: '9px 0 0'
              }}>
                {t.detalle}
              </p>
            </article>
          ))}
        </div>
      )}
      {/* TABLA DE OPERACIONES */}
      {resumen && (
        <section className="panel">
          <h2 style={{
            color: '#173b63',
            fontSize: 19,
            marginTop: 0
          }}>
            Estado general de operaciones
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              textAlign: 'left'
            }}>
              <thead>
                <tr>
                  <th>Operación</th>
                  <th>Total</th>
                  <th>Estado principal</th>
                  <th>Cantidad</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Reservas</td>
                  <td>{numero(resumen.TotalReservas)}</td>
                  <td>Canceladas</td>
                  <td>{numero(resumen.ReservasCanceladas)}</td>
                </tr>
                <tr>
                  <td>Viajes</td>
                  <td>{numero(resumen.TotalViajes)}</td>
                  <td>Programados</td>
                  <td>{numero(resumen.ViajesProgramados)}</td>
                </tr>
                <tr>
                  <td>Ventas</td>
                  <td>{numero(resumen.TotalVentas)}</td>
                  <td>Registradas</td>
                  <td>{numero(resumen.VentasRegistradas)}</td>
                </tr>
                <tr>
                  <td>Reclamaciones</td>
                  <td>{numero(resumen.TotalReclamaciones)}</td>
                  <td>Pendientes</td>
                  <td>{numero(resumen.ReclamacionesPendientes)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}
      {/* TABLA DE RECURSOS */}
      {extra && (
        <section className="panel">
          <h2 style={{
            color: '#173b63',
            fontSize: 19,
            marginTop: 0
          }}>
            Estado de recursos operativos
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              textAlign: 'left'
            }}>
              <thead>
                <tr>
                  <th>Recurso</th>
                  <th>Total</th>
                  <th>Activos</th>
                  <th>Inactivos</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Buses</td>
                  <td>{numero(extra.TotalBuses)}</td>
                  <td>{numero(extra.BusesActivos)}</td>
                  <td>{numero(extra.BusesInactivos)}</td>
                </tr>
                <tr>
                  <td>Conductores</td>
                  <td>{numero(extra.TotalConductores)}</td>
                  <td>{numero(extra.ConductoresActivos)}</td>
                  <td>
                    {numero(Math.max(
                      0,
                      extra.TotalConductores - extra.ConductoresActivos
                    ))}
                  </td>
                </tr>
                <tr>
                  <td>Pasajeros</td>
                  <td>{numero(extra.TotalPasajeros)}</td>
                  <td>—</td>
                  <td>—</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}
      {/* INFORMACIÓN DE SEGURIDAD */}
      {(resumen || extra) && (
        <section style={{
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: 10,
          padding: 16,
          color: '#173b63',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12
        }}>
          <Ban size={20} style={{ flexShrink: 0 }} />
          <p style={{ margin: 0, fontSize: 13 }}>
            Este Dashboard es de solo lectura.
            Los importes representan ventas simuladas
            registradas y no ingresos bancarios reales.
            Para consultar información detallada,
            utiliza el módulo Reportes.
          </p>
        </section>
      )}
    </div>
  );
}
