
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  ArrowRight,
  Armchair,
  BookOpen,
  BusFront,
  CalendarDays,
  Camera,
  CheckCircle2,
  ClipboardList,
  Mail,
  MapPin,
  Save,
  Search,
  ShieldCheck,
  Ticket,
  Trash2,
  UserRound,
  X
} from 'lucide-react';
import { Link } from 'react-router-dom';
import './ClienteInicio.css';

import {
  obtenerPerfil,
  actualizarPerfil,
  obtenerFoto,
  subirFoto as enviarFoto,
  eliminarFoto as borrarFoto
} from '../reglas/perfil';

import { leerToken } from '../reglas/sesion';
// =====================================================
// SIGET-VÍA — PASO 174.5.3
// PORTAL DEL CLIENTE — PERFIL EDITABLE Y FOTOGRAFÍA
// =====================================================
type Cliente = {
  UsuarioID: number;
  Nombres: string;
  Apellidos: string;
  Correo: string;
  Rol: string;
  Telefono?: string | null;
};
type Props = {
  cliente: Cliente;
};
type Perfil = {
  UsuarioID: number;
  Nombres: string;
  Apellidos: string;
  Correo: string;
  Telefono: string | null;
  Estado?: string;
  tieneFoto?: boolean;
};
type Formulario = {
  nombres: string;
  apellidos: string;
  correo: string;
  telefono: string;
};
function formularioDe(perfil: Perfil): Formulario {
  return {
    nombres: perfil.Nombres || '',
    apellidos: perfil.Apellidos || '',
    correo: perfil.Correo || '',
    telefono: perfil.Telefono || ''
  };
}
async function convertirFotoJpg(archivo: File): Promise<Blob> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(archivo.type)) {
    throw new Error('Selecciona una imagen JPG, PNG o WEBP.');
  }
  if (archivo.size > 10 * 1024 * 1024) {
    throw new Error('La imagen original no puede superar 10 MB.');
  }
  const imagen = await createImageBitmap(archivo);
  try {
    const escala = Math.min(1, 900 / Math.max(imagen.width, imagen.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(imagen.width * escala));
    canvas.height = Math.max(1, Math.round(imagen.height * escala));
    const contexto = canvas.getContext('2d');
    if (!contexto) {
      throw new Error('No se pudo procesar la imagen.');
    }
    contexto.fillStyle = '#ffffff';
    contexto.fillRect(0, 0, canvas.width, canvas.height);
    contexto.drawImage(imagen, 0, 0, canvas.width, canvas.height);
    for (const calidad of [0.85, 0.7, 0.5]) {
      const blob = await new Promise<Blob | null>(resolve => {
        canvas.toBlob(resolve, 'image/jpeg', calidad);
      });
      if (blob && blob.size <= 1024 * 1024) {
        return blob;
      }
    }
    throw new Error('No fue posible reducir la fotografía a 1 MB.');
  } finally {
    imagen.close();
  }
}
export default function ClienteInicio({ cliente }: Props) {
  const [perfil, setPerfil] = useState<Perfil>({
    UsuarioID: cliente.UsuarioID,
    Nombres: cliente.Nombres,
    Apellidos: cliente.Apellidos,
    Correo: cliente.Correo,
    Telefono: cliente.Telefono || null
  });
  const [formulario, setFormulario] = useState<Formulario>(
    formularioDe({
      UsuarioID: cliente.UsuarioID,
      Nombres: cliente.Nombres,
      Apellidos: cliente.Apellidos,
      Correo: cliente.Correo,
      Telefono: cliente.Telefono || null
    })
  );
  const [mostrarPerfil, setMostrarPerfil] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [foto, setFoto] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const archivoRef = useRef<HTMLInputElement | null>(null);
  const fotoUrlRef = useRef<string | null>(null);
  const token = leerToken();
  const primerNombre = perfil.Nombres.trim().split(/\s+/)[0] || 'Cliente';
  const nombreCompleto = `${perfil.Nombres} ${perfil.Apellidos}`.trim();
  function actualizarFoto(url: string | null) {
    if (fotoUrlRef.current) {
      URL.revokeObjectURL(fotoUrlRef.current);
    }
    fotoUrlRef.current = url;
    setFoto(url);
  }
  async function cargarFoto() {
    if (!token) return;
    const blob = await obtenerFoto(token);
    if (!blob) {
      actualizarFoto(null);
      return;
    }
    actualizarFoto(URL.createObjectURL(blob));
  }
  async function cargarPerfil() {
    if (!token) {
      setError('Inicia sesión nuevamente.');
      return;
    }
    setCargando(true);
    setError('');
    try {
      const datos = await obtenerPerfil<Perfil>(token);
      setPerfil(datos);
      setFormulario(formularioDe(datos));
      await cargarFoto();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }
  useEffect(() => {
    return () => {
      if (fotoUrlRef.current) {
        URL.revokeObjectURL(fotoUrlRef.current);
      }
    };
  }, []);
  async function abrirPerfil() {
    setMostrarPerfil(true);
    setMensaje('');
    setError('');
    await cargarPerfil();
  }
  function cambiar(campo: keyof Formulario, valor: string) {
    setFormulario(prev => ({ ...prev, [campo]: valor }));
    setMensaje('');
  }
  async function guardarPerfil(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (guardando || subiendoFoto) return;
    const nombres = formulario.nombres.trim();
    const apellidos = formulario.apellidos.trim();
    const correo = formulario.correo.trim().toLowerCase();
    const telefono = formulario.telefono.trim();
    if (nombres.length < 2 || apellidos.length < 2) {
      setError('Los nombres y apellidos deben tener al menos 2 caracteres.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      setError('Ingresa un correo electrónico válido.');
      return;
    }
    if (telefono && !/^[0-9+()\s-]{6,20}$/.test(telefono)) {
      setError('El teléfono tiene un formato inválido.');
      return;
    }
    setGuardando(true);
    setError('');
    setMensaje('');
    try {
      const respuesta = await actualizarPerfil<{
        usuario: Perfil;
        mensaje: string;
      }>(token, {
        nombres,
        apellidos,
        correo,
        telefono: telefono || null
      });
      setPerfil(prev => ({
        ...prev,
        ...respuesta.usuario
      }));
      setFormulario(formularioDe(respuesta.usuario));
      setMensaje('Datos personales actualizados correctamente.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }
  async function subirFoto(e: ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo || subiendoFoto) return;
    setSubiendoFoto(true);
    setError('');
    setMensaje('');
    try {
      const jpg = await convertirFotoJpg(archivo);
      await enviarFoto(token, jpg);
      await cargarFoto();
      setMensaje('Fotografía guardada correctamente.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubiendoFoto(false);
      if (archivoRef.current) archivoRef.current.value = '';
    }
  }
  async function eliminarFoto() {
    if (subiendoFoto || !foto) return;
    if (!window.confirm('¿Deseas eliminar tu fotografía de perfil?')) return;
    setSubiendoFoto(true);
    setError('');
    setMensaje('');
    try {
      await borrarFoto(token);
      actualizarFoto(null);
      setMensaje('Fotografía eliminada correctamente.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubiendoFoto(false);
    }
  }
  const estiloCampo: React.CSSProperties = {
    width: '100%',
    padding: '11px 12px',
    border: '1px solid #cbd5e1',
    borderRadius: 8,
    fontSize: 14,
    boxSizing: 'border-box'
  };
  const estiloEtiqueta: React.CSSProperties = {
    display: 'grid',
    gap: 6,
    color: '#173b63',
    fontSize: 13,
    fontWeight: 600
  };
  return (
    <div className="cliente-inicio">
      {/* BIENVENIDA */}
      <section className="cliente-hero">
        <div className="cliente-hero-contenido">
          <span className="cliente-hero-etiqueta">
            <CheckCircle2 size={15} />
            PORTAL DEL CLIENTE
          </span>
          <h1>¡Bienvenido, {primerNombre}!</h1>
          <p>
            Descubre tus próximos destinos y viaja de manera
            cómoda y segura con Transportes Vía S.A.C.
          </p>
          <Link to="/viajes/publico" className="cliente-boton-principal">
            <Search size={19} />
            Buscar un viaje
            <ArrowRight size={18} />
          </Link>
        </div>
        <div className="cliente-hero-icono">
          <BusFront size={85} strokeWidth={1.3} />
        </div>
      </section>
      {/* SERVICIOS */}
      <section className="cliente-seccion">
        <div className="cliente-seccion-titulo">
          <div>
            <h2>¿Qué deseas hacer hoy?</h2>
            <p>Accede rápidamente a los servicios disponibles para tu cuenta.</p>
          </div>
        </div>
        <div className="cliente-servicios">
          <Link to="/viajes/publico" className="cliente-servicio">
            <span className="cliente-servicio-icono azul">
              <Search size={26} />
            </span>
            <h3>Buscar viajes</h3>
            <p>Consulta destinos, horarios, precios y disponibilidad.</p>
            <span className="cliente-servicio-enlace">
              Consultar viajes <ArrowRight size={16} />
            </span>
          </Link>
          <Link to="/mis-reservas" className="cliente-servicio">
            <span className="cliente-servicio-icono naranja">
              <Ticket size={26} />
            </span>
            <h3>Mis reservas</h3>
            <p>Consulta tus reservas, pasajeros, asientos e importes.</p>
            <span className="cliente-servicio-enlace">
              Ver mis reservas <ArrowRight size={16} />
            </span>
          </Link>
          <button
            type="button"
            className="cliente-servicio"
            onClick={() => void abrirPerfil()}
            style={{
              width: '100%',
              textAlign: 'left',
              font: 'inherit',
              color: 'inherit',
              cursor: 'pointer'
            }}
          >
            <span className="cliente-servicio-icono verde">
              <UserRound size={26} />
            </span>
            <h3>Mi perfil</h3>
            <p>Edita tus datos personales y agrega una fotografía.</p>
            <span className="cliente-servicio-enlace">
              Editar mi perfil <ArrowRight size={16} />
            </span>
          </button>
          <Link to="/politicas" className="cliente-servicio">
            <span className="cliente-servicio-icono morado">
              <BookOpen size={26} />
            </span>
            <h3>Políticas del servicio</h3>
            <p>Revisa las condiciones vigentes antes de reservar.</p>
            <span className="cliente-servicio-enlace">
              Ver políticas <ArrowRight size={16} />
            </span>
          </Link>
        </div>
      </section>
      {/* PROCESO DE RESERVA */}
      <section className="cliente-proceso">
        <div className="cliente-seccion-titulo">
          <div>
            <h2>¿Cómo reservar un pasaje?</h2>
            <p>Sigue estos cuatro pasos para registrar tu reserva.</p>
          </div>
        </div>
        <div className="cliente-pasos">
          <div className="cliente-paso">
            <span className="cliente-paso-numero">1</span>
            <MapPin size={23} />
            <h3>Busca tu destino</h3>
            <p>Selecciona origen, destino y fecha del viaje.</p>
          </div>
          <div className="cliente-paso">
            <span className="cliente-paso-numero">2</span>
            <CalendarDays size={23} />
            <h3>Elige tu horario</h3>
            <p>Revisa las salidas y tarifas disponibles.</p>
          </div>
          <div className="cliente-paso">
            <span className="cliente-paso-numero">3</span>
            <Armchair size={23} />
            <h3>Selecciona asientos</h3>
            <p>Visualiza los pisos del bus y elige dónde viajar.</p>
          </div>
          <div className="cliente-paso">
            <span className="cliente-paso-numero">4</span>
            <ClipboardList size={23} />
            <h3>Confirma la reserva</h3>
            <p>Registra pasajeros y acepta las condiciones del servicio.</p>
          </div>
        </div>
        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <Link
            to="/viajes/publico"
            className="cliente-boton-principal"
            style={{ display: 'inline-flex', gap: 10 }}
          >
            <Search size={18} />
            Reservar un pasaje
            <ArrowRight size={17} />
          </Link>
        </div>
      </section>
      {/* CUENTA ACTIVA */}
      <section className="cliente-cuenta">
        <div className="cliente-cuenta-icono">
          <ShieldCheck size={28} />
        </div>
        <div className="cliente-cuenta-texto">
          <h3>Tu sesión está activa</h3>
          <p>Has iniciado sesión como cliente de Transportes Vía S.A.C.</p>
          <span>
            <CheckCircle2 size={15} />
            Perfil: {cliente.Rol}
          </span>
        </div>
      </section>
      <footer className="cliente-pie">
        SIGET-VÍA · Sistema Integrado de Gestión de Transporte Interprovincial
      </footer>
      {/* VENTANA EDITABLE DEL PERFIL */}
      {mostrarPerfil && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(10,25,45,.7)',
            padding: 16
          }}
          onMouseDown={e => {
            if (e.target === e.currentTarget && !guardando && !subiendoFoto) {
              setMostrarPerfil(false);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Editar perfil del cliente"
            style={{
              background: '#fff',
              width: '100%',
              maxWidth: 540,
              maxHeight: '92vh',
              overflowY: 'auto',
              borderRadius: 16,
              padding: 24,
              boxShadow: '0 20px 60px rgba(0,0,0,.22)'
            }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 20
            }}>
              <h2 style={{ margin: 0, color: '#173b63' }}>
                Mi perfil
              </h2>
              <button
                type="button"
                aria-label="Cerrar perfil"
                disabled={guardando || subiendoFoto}
                onClick={() => setMostrarPerfil(false)}
                style={{
                  border: 0,
                  borderRadius: 8,
                  padding: 8,
                  cursor: 'pointer'
                }}
              >
                <X size={20} />
              </button>
            </div>
            {/* FOTO */}
            <div style={{
              textAlign: 'center',
              borderRadius: 12,
              padding: 20,
              background: '#f3f7fb',
              marginBottom: 20
            }}>
              <div style={{
                width: 116,
                height: 116,
                borderRadius: '50%',
                overflow: 'hidden',
                margin: '0 auto 12px',
                border: '4px solid #fff',
                boxShadow: '0 2px 14px #0002',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                background: '#e2e8f0'
              }}>
                {foto ? (
                  <img
                    src={foto}
                    alt="Fotografía del cliente"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover'
                    }}
                  />
                ) : (
                  <UserRound size={54} color="#173b63" />
                )}
              </div>
              <h3 style={{ margin: '0 0 6px', color: '#173b63' }}>
                {nombreCompleto}
              </h3>
              <p style={{ margin: '0 0 14px', color: '#64748b' }}>
                Cuenta de cliente
              </p>
              <input
                ref={archivoRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={e => void subirFoto(e)}
                style={{ display: 'none' }}
              />
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                gap: 8,
                flexWrap: 'wrap'
              }}>
                <button
                  type="button"
                  disabled={subiendoFoto || cargando}
                  onClick={() => archivoRef.current?.click()}
                  style={{
                    border: 0,
                    borderRadius: 8,
                    padding: '10px 14px',
                    background: '#f58220',
                    color: 'white',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    gap: 7,
                    alignItems: 'center'
                  }}
                >
                  <Camera size={17} />
                  {subiendoFoto ? 'Procesando...' : 'Subir foto'}
                </button>
                {foto && (
                  <button
                    type="button"
                    disabled={subiendoFoto}
                    onClick={() => void eliminarFoto()}
                    style={{
                      border: '1px solid #fecaca',
                      borderRadius: 8,
                      padding: '10px 14px',
                      background: '#fff',
                      color: '#b91c1c',
                      cursor: 'pointer',
                      display: 'flex',
                      gap: 7,
                      alignItems: 'center'
                    }}
                  >
                    <Trash2 size={17} />
                    Eliminar
                  </button>
                )}
              </div>
              <small style={{
                display: 'block',
                marginTop: 9,
                color: '#64748b'
              }}>
                JPG, PNG o WEBP · Se convierte a JPG de máximo 1 MB
              </small>
            </div>
            {/* MENSAJES */}
            {error && (
              <div role="alert" style={{
                padding: 12,
                borderRadius: 8,
                background: '#fee2e2',
                color: '#991b1b',
                marginBottom: 12
              }}>
                {error}
              </div>
            )}
            {mensaje && (
              <div role="status" style={{
                padding: 12,
                borderRadius: 8,
                background: '#dcfce7',
                color: '#166534',
                marginBottom: 12
              }}>
                {mensaje}
              </div>
            )}
            {/* FORMULARIO */}
            <form onSubmit={e => void guardarPerfil(e)}>
              <div style={{
                display: 'grid',
                gap: 15
              }}>
                <label style={estiloEtiqueta}>
                  Nombres
                  <input
                    required
                    minLength={2}
                    maxLength={100}
                    value={formulario.nombres}
                    disabled={cargando || guardando}
                    onChange={e => cambiar('nombres', e.target.value)}
                    style={estiloCampo}
                  />
                </label>
                <label style={estiloEtiqueta}>
                  Apellidos
                  <input
                    required
                    minLength={2}
                    maxLength={120}
                    value={formulario.apellidos}
                    disabled={cargando || guardando}
                    onChange={e => cambiar('apellidos', e.target.value)}
                    style={estiloCampo}
                  />
                </label>
                <label style={estiloEtiqueta}>
                  <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7
                  }}>
                    <Mail size={16} />
                    Correo electrónico
                  </span>
                  <input
                    type="email"
                    required
                    maxLength={254}
                    value={formulario.correo}
                    disabled={cargando || guardando}
                    onChange={e => cambiar('correo', e.target.value)}
                    style={estiloCampo}
                  />
                </label>
                <label style={estiloEtiqueta}>
                  Teléfono
                  <input
                    type="tel"
                    maxLength={20}
                    value={formulario.telefono}
                    disabled={cargando || guardando}
                    onChange={e => cambiar('telefono', e.target.value)}
                    placeholder="Número de contacto"
                    style={estiloCampo}
                  />
                </label>
                <div style={{
                  padding: 12,
                  background: '#eff6ff',
                  color: '#173b63',
                  borderRadius: 8,
                  fontSize: 13
                }}>
                  <ShieldCheck size={16} style={{
                    display: 'inline',
                    verticalAlign: 'middle',
                    marginRight: 6
                  }} />
                  Usuario ID: {perfil.UsuarioID} · Rol: {cliente.Rol}
                </div>
              </div>
              <div style={{
                display: 'flex',
                gap: 10,
                marginTop: 22
              }}>
                <button
                  type="button"
                  onClick={() => setMostrarPerfil(false)}
                  disabled={guardando || subiendoFoto}
                  style={{
                    flex: 1,
                    padding: 12,
                    border: '1px solid #cbd5e1',
                    background: '#fff',
                    borderRadius: 8,
                    cursor: 'pointer'
                  }}
                >
                  Cerrar
                </button>
                <button
                  type="submit"
                  disabled={cargando || guardando || subiendoFoto}
                  style={{
                    flex: 1,
                    padding: 12,
                    border: 0,
                    background: '#173b63',
                    color: '#fff',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8
                  }}
                >
                  <Save size={17} />
                  {guardando ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
