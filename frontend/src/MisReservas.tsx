import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Download, Eye, RefreshCw, Ticket, X } from 'lucide-react';
import { jsPDF } from 'jspdf';
const API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
type Reserva = {
  ReservaID: number; Codigo: string | null; FechaReserva: string; Estado: string;
  Total: number; ViajeID: number; Salida: string; LlegadaEstimada: string;
  Origen: string; Destino: string; Placa: string; Modelo: string;
  TipoServicio: string | null; CantidadAsientos?: number;
};
type Pasajero = {
  ReservaAsientoID: number; Numero: number; Nivel: number; Estado: string;
  Precio: number; TipoDocumento: string; NumeroDocumento: string;
  Nombres: string; Apellidos: string;
};
type Detalle = Reserva & { items: Pasajero[] };
function fecha(valor: string) {
  if (!valor) return '-';
  const iso = valor.replace(' ', 'T').slice(0, 16);
  const [dia, hora] = iso.split('T');
  const [a, m, d] = dia.split('-');
  return `${d}/${m}/${a} ${hora || ''}`;
}
function soles(n: number) {
  return `S/ ${Number(n).toFixed(2)}`;
}
async function solicitar<T>(ruta: string, token: string): Promise<T> {
  const res = await fetch(`${API}${ruta}`, {
    cache: 'no-store', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
  });
  const cuerpo = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(cuerpo.error || `Error HTTP ${res.status}`);
  return cuerpo as T;
}
function pdfReserva(r: Detalle) {
  const doc = new jsPDF();
  let y = 20;
  const margen = 16;
  const asegurar = (n = 12) => { if (y + n > 278) { doc.addPage(); y = 22; } };
  const linea = (etiqueta: string, valor: string) => {
    asegurar(); doc.setFont('helvetica', 'bold'); doc.text(etiqueta, margen, y);
    doc.setFont('helvetica', 'normal');
    const lineas = doc.splitTextToSize(valor, 115) as string[];
    doc.text(lineas, 72, y); y += Math.max(9, lineas.length * 6);
  };
  doc.setFontSize(17); doc.setFont('helvetica', 'bold');
  doc.text('SIGET-VIA', margen, y); y += 10;
  doc.setFontSize(11); doc.text('CONSTANCIA DE RESERVA (NO ES COMPROBANTE DE PAGO)', margen, y); y += 15;
  doc.setFontSize(10);
  linea('Codigo:', r.Codigo || `RESERVA-${r.ReservaID}`);
  linea('Estado:', r.Estado);
  linea('Registro:', fecha(r.FechaReserva));
  linea('Ruta:', `${r.Origen} - ${r.Destino}`);
  linea('Salida:', fecha(r.Salida));
  linea('Bus:', `${r.Placa} - ${r.Modelo}`);
  linea('Servicio:', r.TipoServicio || 'Sin asignar');
  y += 7;
  doc.setFont('helvetica', 'bold'); doc.text('PASAJEROS Y ASIENTOS', margen, y); y += 10;
  r.items.forEach((p, i) => {
    asegurar(32);
    linea(`Pasajero ${i + 1}:`, `${p.Nombres} ${p.Apellidos}`);
    linea('Documento:', `${p.TipoDocumento}: ${p.NumeroDocumento}`);
    linea('Asiento:', `Piso ${p.Nivel}, N. ${p.Numero}, ${p.Estado}`);
    y += 4;
  });
  asegurar(25); y += 4; doc.setFont('helvetica', 'bold');
  doc.text(`TOTAL REGISTRADO: ${soles(r.Total)}`, margen, y);
  y += 12; doc.setFontSize(8); doc.setFont('helvetica', 'normal');
  doc.text('Este documento acredita una reserva, no el pago ni la emisión de boleto tributario.', margen, y);
  doc.save(`SIGET-VIA-${(r.Codigo || `RESERVA-${r.ReservaID}`).replace(/[^A-Za-z0-9_-]/g, '_')}.pdf`);
}
export default function MisReservas({ token }: { token: string }) {
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [error, setError] = useState('');
  async function cargar() {
    setCargando(true); setError('');
    try { setReservas(await solicitar<Reserva[]>('/cliente/mis-reservas', token)); }
    catch (e) { setError((e as Error).message); }
    finally { setCargando(false); }
  }
  useEffect(() => {
    let activo = true;
    solicitar<Reserva[]>('/cliente/mis-reservas', token)
      .then(data => { if (activo) setReservas(data); })
      .catch(e => { if (activo) setError((e as Error).message); })
      .finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; };
  }, [token]);
  async function ver(id: number) {
    setCargandoDetalle(true); setError('');
    try { setDetalle(await solicitar<Detalle>(`/cliente/mis-reservas/${id}`, token)); }
    catch (e) { setError((e as Error).message); }
    finally { setCargandoDetalle(false); }
  }
  return (
    <div>
      <div className="heading"><h1>Mis reservas</h1><p>Consulta tus reservas y descarga sus constancias.</p></div>
      <div className="panel">
        <div className="section-heading">
          <div><h2><Ticket size={18} style={{ verticalAlign: 'middle', marginRight: 7 }} />Historial de mis reservas</h2><p>Solo aparecen las reservas de tu cuenta.</p></div>
          <button type="button" className="secondary" disabled={cargando} onClick={() => void cargar()}><RefreshCw size={16} /> Actualizar</button>
        </div>
        {error && <div className="alert" role="alert">{error}</div>}
        <div className="table-wrap"><table><thead><tr><th>Código</th><th>Ruta</th><th>Salida</th><th>Bus</th><th>Asientos</th><th>Total</th><th>Estado</th><th>Acción</th></tr></thead>
          <tbody>
            {cargando ? <tr><td colSpan={8}>Consultando reservas...</td></tr> : reservas.length === 0 ? <tr><td colSpan={8}>Todavía no tienes reservas registradas. <Link to="/viajes/publico">Buscar viajes</Link></td></tr> : reservas.map(r => (
              <tr key={r.ReservaID}><td>{r.Codigo || `#${r.ReservaID}`}</td><td>{r.Origen} - {r.Destino}</td><td>{fecha(r.Salida)}</td><td>{r.Placa}</td><td>{r.CantidadAsientos ?? '-'}</td><td>{soles(r.Total)}</td><td><span className={r.Estado === 'CANCELADA' ? 'status' : 'status active'}>{r.Estado}</span></td><td><button type="button" title="Ver detalle" disabled={cargandoDetalle} onClick={() => void ver(r.ReservaID)}><Eye size={17} /> Ver</button></td></tr>
            ))}
          </tbody></table></div>
        <div style={{ marginTop: 18 }}><Link to="/viajes/publico"><ArrowLeft size={15} style={{ verticalAlign: 'middle' }} /> Buscar otro viaje</Link></div>
      </div>
      {detalle && <div className="overlay"><div className="dialog" role="dialog" aria-modal="true" aria-label="Detalle de mi reserva" style={{ maxWidth: 780, width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="dialog-head"><h2>Reserva {detalle.Codigo || `#${detalle.ReservaID}`}</h2><button type="button" aria-label="Cerrar" onClick={() => setDetalle(null)}><X size={20} /></button></div>
        <div style={{ padding: 20 }}>
          <p><strong>Estado:</strong> {detalle.Estado} · <strong>Fecha:</strong> {fecha(detalle.FechaReserva)}</p>
          <p><strong>Ruta:</strong> {detalle.Origen} - {detalle.Destino}</p>
          <p><strong>Salida:</strong> {fecha(detalle.Salida)} · <strong>Bus:</strong> {detalle.Placa} ({detalle.Modelo})</p>
          <p><strong>Tipo de servicio:</strong> {detalle.TipoServicio || 'Sin asignar'}</p>
          <div className="table-wrap"><table><thead><tr><th>Pasajero</th><th>Documento</th><th>Piso</th><th>Asiento</th><th>Estado</th><th>Precio</th></tr></thead>
            <tbody>{detalle.items.map(p => <tr key={p.ReservaAsientoID}><td>{p.Nombres} {p.Apellidos}</td><td>{p.TipoDocumento} {p.NumeroDocumento}</td><td>{p.Nivel}</td><td>{p.Numero}</td><td>{p.Estado}</td><td>{soles(p.Precio)}</td></tr>)}</tbody></table></div>
          <p style={{ fontWeight: 700, textAlign: 'right', marginTop: 16 }}>Total: {soles(detalle.Total)}</p>
          <p style={{ color: '#64748b', fontSize: 12 }}>La constancia acredita la reserva, no constituye comprobante de pago.</p>
          <div className="dialog-actions"><button type="button" className="orange" onClick={() => pdfReserva(detalle)}><Download size={16} /> Descargar constancia PDF</button><button type="button" className="secondary" onClick={() => setDetalle(null)}>Cerrar</button></div>
        </div>
      </div></div>}
    </div>
  );
}
