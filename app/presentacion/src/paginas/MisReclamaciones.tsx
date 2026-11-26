// =====================================================
// SIGET-VÍA — CAPA DE PRESENTACIÓN
// CU012 — Mis reclamaciones (cliente autenticado)
// Lista las reclamaciones registradas con la cuenta del cliente,
// su estado (Registrado, En atención, Respondido, Cerrado),
// el historial, las respuestas y la constancia de recepción.
// =====================================================
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2, Circle, Download, Eye, MessageSquareWarning, Plus, RefreshCw, X
} from 'lucide-react';

import {
  listarMisReclamaciones,
  detalleMiReclamacion,
  ETAPAS_RECLAMACION,
  nombreEtapa
} from '../reglas/reclamaciones';
import {
  descargarConstanciaReclamacion,
  fechaReclamacion
} from '../componentes/constanciaReclamacion';

type Resumen = {
  ReclamacionID: number;
  NumeroCorrelativo: string | null;
  TipoSolicitud: string;
  FechaRegistro: string;
  Estado: string;
  Resumen: string;
};

type Detalle = {
  reclamacion: Resumen & {
    TipoDocumento: string;
    NumeroDocumento: string;
    NombreReclamante: string;
    CorreoReclamante: string;
    TelefonoReclamante: string | null;
    Descripcion: string;
    Pedido: string;
  };
  historial: { EstadoNuevo: string; Observacion: string | null; FechaCambio: string }[];
  respuestas: { Contenido: string; FechaRespuesta: string }[];
};

const numero = (r: { NumeroCorrelativo: string | null; ReclamacionID: number }) =>
  r.NumeroCorrelativo || `#${r.ReclamacionID}`;

export default function MisReclamaciones({ token }: { token: string }) {
  const [lista, setLista] = useState<Resumen[]>([]);
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [abriendo, setAbriendo] = useState(false);
  const [error, setError] = useState('');

  async function cargar() {
    setCargando(true);
    setError('');
    try {
      setLista(await listarMisReclamaciones<Resumen[]>(token));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    let activo = true;
    listarMisReclamaciones<Resumen[]>(token)
      .then(datos => { if (activo) setLista(datos); })
      .catch(e => { if (activo) setError((e as Error).message); })
      .finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; };
  }, [token]);

  async function ver(id: number) {
    setAbriendo(true);
    setError('');
    try {
      setDetalle(await detalleMiReclamacion<Detalle>(token, id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAbriendo(false);
    }
  }

  const etapaActual = detalle
    ? ETAPAS_RECLAMACION.indexOf(detalle.reclamacion.Estado as typeof ETAPAS_RECLAMACION[number])
    : -1;

  return (
    <div>
      <div className="heading">
        <h1>Mis reclamaciones</h1>
        <p>Consulta el estado y las respuestas de las reclamaciones registradas con tu cuenta.</p>
      </div>

      <div className="panel">
        <div className="section-heading">
          <div>
            <h2>
              <MessageSquareWarning size={18} style={{ verticalAlign: 'middle', marginRight: 7 }} />
              Libro de reclamaciones
            </h2>
            <p>Solo aparecen las reclamaciones registradas con tu sesión iniciada.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="secondary" disabled={cargando} onClick={() => void cargar()}>
              <RefreshCw size={16} /> Actualizar
            </button>
            <Link to="/reclamaciones/publico" className="orange" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
              <Plus size={16} /> Nueva reclamación
            </Link>
          </div>
        </div>

        {error && <div className="alert" role="alert">{error}</div>}

        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>N.º</th><th>Tipo</th><th>Fecha</th><th>Detalle</th><th>Estado</th><th>Acción</th></tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr><td colSpan={6}>Consultando reclamaciones...</td></tr>
              ) : lista.length === 0 ? (
                <tr><td colSpan={6}>
                  No tienes reclamaciones registradas con tu cuenta.{' '}
                  <Link to="/reclamaciones/publico">Registrar una reclamación</Link>
                </td></tr>
              ) : lista.map(r => (
                <tr key={r.ReclamacionID}>
                  <td><strong>{numero(r)}</strong></td>
                  <td>{r.TipoSolicitud}</td>
                  <td>{fechaReclamacion(r.FechaRegistro)}</td>
                  <td style={{ maxWidth: 320 }}>{r.Resumen}</td>
                  <td><span className={r.Estado === 'CERRADO' ? 'status' : 'status active'}>{nombreEtapa(r.Estado)}</span></td>
                  <td>
                    <button type="button" disabled={abriendo} onClick={() => void ver(r.ReclamacionID)}>
                      <Eye size={17} /> Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p style={{ color: '#64748b', fontSize: 12, marginTop: 14 }}>
          Las reclamaciones registradas sin iniciar sesión se consultan en el Libro de reclamaciones
          con su número correlativo y su código privado.
        </p>
      </div>

      {detalle && (
        <div className="overlay">
          <div className="dialog" role="dialog" aria-modal="true" aria-label="Detalle de mi reclamación"
            style={{ maxWidth: 780, width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="dialog-head">
              <h2>Reclamación {numero(detalle.reclamacion)}</h2>
              <button type="button" aria-label="Cerrar" onClick={() => setDetalle(null)}><X size={20} /></button>
            </div>

            <div style={{ padding: 20 }}>
              {/* Etapas de atención (RF12) */}
              <ol className="etapas-reclamo">
                {ETAPAS_RECLAMACION.map((etapa, i) => (
                  <li key={etapa} className={i <= etapaActual ? 'hecha' : ''}>
                    {i <= etapaActual ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                    {nombreEtapa(etapa)}
                  </li>
                ))}
              </ol>

              <p><strong>Tipo:</strong> {detalle.reclamacion.TipoSolicitud} · <strong>Fecha:</strong> {fechaReclamacion(detalle.reclamacion.FechaRegistro)}</p>
              <p><strong>Reclamante:</strong> {detalle.reclamacion.NombreReclamante} ({detalle.reclamacion.TipoDocumento} {detalle.reclamacion.NumeroDocumento})</p>
              <p><strong>Detalle:</strong> {detalle.reclamacion.Descripcion}</p>
              <p><strong>Pedido:</strong> {detalle.reclamacion.Pedido}</p>

              <h3 style={{ marginTop: 18 }}>Respuestas de la empresa</h3>
              {detalle.respuestas.length === 0 ? (
                <p style={{ color: '#64748b' }}>Todavía no hay respuestas registradas.</p>
              ) : detalle.respuestas.map((r, i) => (
                <div key={i} className="dashboard-note" style={{ display: 'block' }}>
                  <small style={{ color: '#64748b' }}>{fechaReclamacion(r.FechaRespuesta)}</small>
                  <p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{r.Contenido}</p>
                </div>
              ))}

              <h3 style={{ marginTop: 18 }}>Historial</h3>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Fecha</th><th>Estado</th><th>Observación</th></tr></thead>
                  <tbody>
                    {detalle.historial.map((h, i) => (
                      <tr key={i}>
                        <td>{fechaReclamacion(h.FechaCambio)}</td>
                        <td>{nombreEtapa(h.EstadoNuevo)}</td>
                        <td>{h.Observacion || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="dialog-actions">
                <button type="button" className="orange" onClick={() => descargarConstanciaReclamacion(detalle.reclamacion)}>
                  <Download size={16} /> Descargar constancia PDF
                </button>
                <button type="button" className="secondary" onClick={() => setDetalle(null)}>Cerrar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
