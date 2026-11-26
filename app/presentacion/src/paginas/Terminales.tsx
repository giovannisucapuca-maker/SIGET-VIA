// =====================================================
// SIGET-VÍA — CAPA DE PRESENTACIÓN
// Gestión de terminales terrestres (administrador)
// Los terminales se asignan como punto de embarque y llegada de las rutas.
// =====================================================
import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Eye, MapPin, Pencil, Plus, Search, X } from 'lucide-react';

import { alertaError, alertaExito, confirmarAccion } from '../componentes/alertas';
import {
  listarTerminales, crearTerminal, editarTerminal, cambiarEstadoTerminal
} from '../reglas/terminales';
import { normalizarCiudad } from '../reglas/rutas';

type Estado = 'ACTIVO' | 'INACTIVO';

type Terminal = {
  TerminalID: number;
  Nombre: string;
  Ciudad: string;
  Direccion: string;
  Referencia: string | null;
  Telefono: string | null;
  Estado: Estado;
  RutasActivas: number;
};

type Formulario = {
  nombre: string;
  ciudad: string;
  direccion: string;
  referencia: string;
  telefono: string;
  estado: Estado;
};

type Modal = 'new' | 'edit' | 'view' | null;

const vacio = (): Formulario => ({
  nombre: '', ciudad: '', direccion: '', referencia: '', telefono: '', estado: 'ACTIVO'
});

export default function Terminales({ token }: { token: string }) {
  const [terminales, setTerminales] = useState<Terminal[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [modal, setModal] = useState<Modal>(null);
  const [seleccionado, setSeleccionado] = useState<Terminal | null>(null);
  const [form, setForm] = useState<Formulario>(vacio);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  async function cargar(q = '') {
    setCargando(true);
    try {
      setTerminales(await listarTerminales<Terminal[]>(token, q));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    let activo = true;
    listarTerminales<Terminal[]>(token)
      .then(d => { if (activo) setTerminales(d); })
      .catch(e => { if (activo) setError((e as Error).message); })
      .finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; };
  }, [token]);

  function abrir(tipo: Exclude<Modal, null>, t?: Terminal) {
    setSeleccionado(t || null);
    setForm(t ? {
      nombre: t.Nombre, ciudad: t.Ciudad, direccion: t.Direccion,
      referencia: t.Referencia || '', telefono: t.Telefono || '', estado: t.Estado
    } : vacio());
    setError('');
    setModal(tipo);
  }

  const actualizar = <K extends keyof Formulario>(k: K, v: Formulario[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (guardando || modal === 'view') return;
    if (form.nombre.trim().length < 3) return setError('El nombre del terminal debe tener al menos 3 caracteres.');
    if (!form.ciudad.trim()) return setError('Ingresa la ciudad del terminal.');
    if (form.direccion.trim().length < 5) return setError('Ingresa la dirección del terminal.');

    const datos = {
      nombre: form.nombre.trim(),
      ciudad: normalizarCiudad(form.ciudad),
      direccion: form.direccion.trim(),
      referencia: form.referencia.trim() || null,
      telefono: form.telefono.trim() || null,
      estado: form.estado
    };

    setGuardando(true);
    try {
      if (modal === 'edit' && seleccionado) await editarTerminal(token, seleccionado.TerminalID, datos);
      else await crearTerminal(token, datos);
      setModal(null);
      await alertaExito(
        modal === 'edit' ? 'Los datos del terminal se actualizaron.' : 'El terminal fue registrado.',
        modal === 'edit' ? 'Terminal actualizado' : 'Terminal registrado'
      );
      await cargar(busqueda);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarEstado(t: Terminal) {
    const nuevo: Estado = t.Estado === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
    const ok = await confirmarAccion(
      `¿Cambiar el terminal «${t.Nombre}» a ${nuevo}?`,
      'Cambiar estado'
    );
    if (!ok) return;
    try {
      await cambiarEstadoTerminal(token, t.TerminalID, nuevo);
      await alertaExito(`El terminal quedó ${nuevo}.`, 'Estado actualizado');
      await cargar(busqueda);
    } catch (err) {
      await alertaError((err as Error).message);
    }
  }

  const soloLectura = modal === 'view';

  return (
    <>
      <div className="heading">
        <h1>Terminales terrestres</h1>
        <p>Puntos de embarque y llegada de los viajes de Transportes Vía S.A.C.</p>
      </div>

      <div className="panel">
        <div className="section-heading">
          <div>
            <h2><MapPin size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} />Terminales</h2>
            <p>Se asignan a las rutas como terminal de origen y de destino.</p>
          </div>
          <button type="button" className="orange" onClick={() => abrir('new')}>
            <Plus size={17} /> Nuevo
          </button>
        </div>

        <form className="search-form" onSubmit={e => { e.preventDefault(); void cargar(busqueda); }}>
          <input
            type="text"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, ciudad o dirección"
          />
          <button type="submit" className="secondary"><Search size={16} /> Buscar</button>
        </form>

        {!modal && error && <div className="alert">{error}</div>}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Terminal</th><th>Ciudad</th><th>Dirección</th>
                <th>Rutas activas</th><th>Estado</th><th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cargando && <tr><td colSpan={6}>Cargando terminales...</td></tr>}
              {!cargando && terminales.length === 0 && !error && (
                <tr><td colSpan={6}>No hay terminales registrados. Usa «Nuevo» para agregar el primero.</td></tr>
              )}
              {!cargando && terminales.map(t => (
                <tr key={t.TerminalID}>
                  <td><strong>{t.Nombre}</strong></td>
                  <td>{t.Ciudad}</td>
                  <td>{t.Direccion}</td>
                  <td>{t.RutasActivas}</td>
                  <td><span className={t.Estado === 'ACTIVO' ? 'status active' : 'status'}>{t.Estado}</span></td>
                  <td className="actions">
                    <button type="button" title="Ver detalle" onClick={() => abrir('view', t)}><Eye size={16} /></button>
                    <button type="button" title="Editar terminal" onClick={() => abrir('edit', t)}><Pencil size={16} /></button>
                    <button type="button" title="Cambiar estado" onClick={() => void cambiarEstado(t)}><CheckCircle2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="overlay">
          <div className="dialog" role="dialog" aria-modal="true" aria-label="Terminal"
            style={{ width: '95%', maxWidth: 700, maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="dialog-head">
              <h2>
                {modal === 'new' ? 'Registrar terminal' : modal === 'edit' ? 'Editar terminal' : 'Detalle del terminal'}
              </h2>
              <button type="button" aria-label="Cerrar" disabled={guardando} onClick={() => setModal(null)}><X /></button>
            </div>

            <form onSubmit={guardar} autoComplete="off" noValidate>
              <div className="fields">
                <label>
                  Nombre del terminal
                  <input type="text" maxLength={120} required disabled={soloLectura}
                    value={form.nombre} onChange={e => actualizar('nombre', e.target.value)}
                    placeholder="Ej.: Terminal Lima Centro" />
                </label>
                <label>
                  Ciudad
                  <input type="text" maxLength={120} required disabled={soloLectura}
                    value={form.ciudad} onChange={e => actualizar('ciudad', e.target.value)}
                    placeholder="Ej.: LIMA" />
                </label>
                <label style={{ gridColumn: '1 / -1' }}>
                  Dirección
                  <input type="text" maxLength={250} required disabled={soloLectura}
                    value={form.direccion} onChange={e => actualizar('direccion', e.target.value)}
                    placeholder="Ej.: Av. Ejemplo 123, distrito" />
                </label>
                <label>
                  Referencia (opcional)
                  <input type="text" maxLength={250} disabled={soloLectura}
                    value={form.referencia} onChange={e => actualizar('referencia', e.target.value)}
                    placeholder="Ej.: frente al parque" />
                </label>
                <label>
                  Teléfono (opcional)
                  <input type="tel" maxLength={20} disabled={soloLectura}
                    value={form.telefono} onChange={e => actualizar('telefono', e.target.value)} />
                </label>
                <label>
                  Estado
                  <select value={form.estado} disabled={soloLectura}
                    onChange={e => actualizar('estado', e.target.value as Estado)}>
                    <option value="ACTIVO">ACTIVO</option>
                    <option value="INACTIVO">INACTIVO</option>
                  </select>
                </label>
                {seleccionado && (
                  <label>
                    Rutas activas que lo usan
                    <input type="text" disabled value={seleccionado.RutasActivas} />
                  </label>
                )}
              </div>

              {error && <div className="alert">{error}</div>}

              <div className="dialog-actions">
                {modal !== 'view' && (
                  <button type="submit" className="orange" disabled={guardando}>
                    {guardando ? 'Guardando...' : 'Guardar'}
                  </button>
                )}
                <button type="button" className="secondary" disabled={guardando} onClick={() => setModal(null)}>
                  {modal === 'view' ? 'Cerrar' : 'Cancelar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
