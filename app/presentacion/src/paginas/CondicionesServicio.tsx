// =====================================================
// SIGET-VÍA — CAPA DE PRESENTACIÓN
// CU017 — Condiciones y políticas del servicio (página pública)
// Muestra las políticas activas y vigentes sin iniciar sesión.
// Si una sección no está configurada, se indica en lugar de
// mostrar información inexistente (paso alternativo 5a).
// =====================================================
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, BookOpen, BusFront, RefreshCw } from 'lucide-react';

import { condicionesPublicas, SECCIONES_CONDICIONES } from '../reglas/politicas';

type Politica = {
  PoliticaID: number;
  Tipo: string;
  Titulo: string;
  Contenido: string;
  Version: string;
  VigenteDesde: string;
  VigenteHasta: string | null;
};

const fecha = (v: string | null) => (v ? v.slice(0, 10).split('-').reverse().join('/') : '');

export default function CondicionesServicio() {
  const [politicas, setPoliticas] = useState<Politica[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let activo = true;
    setCargando(true);
    setError('');
    condicionesPublicas<Politica[]>()
      .then(d => { if (activo) setPoliticas(d); })
      .catch(e => { if (activo) setError((e as Error).message); })
      .finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; };
  }, [intento]);

  return (
    <div className="registro-pagina">
      <header className="registro-cabecera">
        <div className="registro-marca">
          <BusFront size={27} />
          <div>
            <strong>SIGET-VÍA</strong>
            <small>Transportes Vía S.A.C.</small>
          </div>
        </div>
        <Link to="/" className="registro-volver">
          <ArrowLeft size={17} />
          Volver al inicio
        </Link>
      </header>

      <main className="condiciones">
        <h1><BookOpen size={26} /> Condiciones del servicio</h1>
        <p className="condiciones-intro">
          Revisa las condiciones de contratación y las políticas de reserva, cancelación y
          reprogramación antes de comprar tu pasaje. Al confirmar una reserva se te pedirá aceptarlas.
        </p>

        {cargando && <p>Cargando condiciones...</p>}

        {error && (
          <div className="alert" role="alert">
            No se pudieron cargar las condiciones: {error}{' '}
            <button type="button" className="secondary" onClick={() => setIntento(i => i + 1)}>
              <RefreshCw size={15} /> Intentar nuevamente
            </button>
          </div>
        )}

        {!cargando && !error && (
          <>
            <nav className="condiciones-indice">
              {SECCIONES_CONDICIONES.map(([tipo, titulo]) => (
                <a key={tipo} href={`#cond-${tipo}`}>{titulo}</a>
              ))}
            </nav>

            {SECCIONES_CONDICIONES.map(([tipo, titulo]) => {
              const delTipo = politicas.filter(p => p.Tipo === tipo);
              if (tipo === 'OTRA' && delTipo.length === 0) return null;
              return (
                <section key={tipo} id={`cond-${tipo}`} className="condiciones-seccion">
                  <h2>{titulo}</h2>
                  {delTipo.length === 0 ? (
                    <p className="condiciones-vacio">Esta sección todavía no está publicada.</p>
                  ) : delTipo.map(p => (
                    <article key={p.PoliticaID}>
                      <h3>{p.Titulo}</h3>
                      <small>
                        Versión {p.Version} · vigente desde {fecha(p.VigenteDesde)}
                        {p.VigenteHasta ? ` hasta ${fecha(p.VigenteHasta)}` : ''}
                      </small>
                      <p>{p.Contenido}</p>
                    </article>
                  ))}
                </section>
              );
            })}

            <div className="condiciones-acciones">
              <Link to="/viajes/publico" className="registro-boton">Buscar viajes</Link>
            </div>

            <p className="condiciones-nota">
              Políticas referenciales del prototipo académico SIGET-VÍA.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
