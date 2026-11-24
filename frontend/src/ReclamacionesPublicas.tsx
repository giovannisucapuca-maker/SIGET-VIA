
import { useState, type FormEvent } from 'react';
import { jsPDF } from 'jspdf';

import {
  FileText,
  Search,
  Send,
  Download,
  ShieldCheck,
  AlertCircle,
  Eye,
  EyeOff
} from 'lucide-react';

// =====================================================
// SIGET-VÍA — LIBRO DE RECLAMACIONES PÚBLICO
// PASO 170.7.6.19
//
// CU011 - Registrar reclamación
// CU012 - Consultar reclamación
//
// RF11, RF12
// RNF5, RNF7, RNF10
//
// MEJORAS:
// - Mostrar respuestas administrativas
// - Consultar historial completo
// - Ocultar o mostrar código privado
// - Código de 8 caracteres alfanuméricos
// - Compatible con códigos anteriores
// - Descargar constancia PDF
// =====================================================

// =====================================================
// CONFIGURACIÓN DE API
// =====================================================

const API =
  import.meta.env.VITE_API_URL ||
  'http://localhost:4000/api';

// =====================================================
// TIPOS
// =====================================================

type Estado =
  | 'REGISTRADO'
  | 'EN_ATENCION'
  | 'RESPONDIDO'
  | 'CERRADO';

type Tipo =
  | 'RECLAMO'
  | 'QUEJA';

type Constancia = {
  ReclamacionID: number;
  NumeroCorrelativo: string;
  TipoSolicitud: Tipo;
  FechaRegistro: string;
  Estado: Estado;
  codigoPrivado: string;
};

type Historial = {
  EstadoNuevo: Estado;
  FechaCambio: string;
};

type Respuesta = {
  Contenido: string;
  FechaRespuesta: string;
};

type Consulta = {
  reclamacion: {
    ReclamacionID: number;
    NumeroCorrelativo: string;
    TipoSolicitud: Tipo;
    FechaRegistro: string;
    Estado: Estado;
  };

  historial: Historial[];

  respuestas: Respuesta[];
};

type Formulario = {
  tipoDocumento: string;
  numeroDocumento: string;
  nombreReclamante: string;
  correoReclamante: string;
  telefonoReclamante: string;
  tipoSolicitud: Tipo;
  descripcion: string;
  pedido: string;
};

// =====================================================
// FORMULARIO INICIAL
// =====================================================

const crearFormulario = (): Formulario => ({
  tipoDocumento: 'DNI',
  numeroDocumento: '',
  nombreReclamante: '',
  correoReclamante: '',
  telefonoReclamante: '',
  tipoSolicitud: 'RECLAMO',
  descripcion: '',
  pedido: ''
});

// =====================================================
// UTILIDADES
// =====================================================

// La BD utiliza DATETIME2 con fecha/hora local.
// SQL Server puede serializarla con sufijo Z.
// Para no desplazar la hora que se guardó,
// se muestran directamente sus componentes.
//
// Este formato corresponde a la hora registrada
// en SQL Server, no a una conversión UTC.

function fechaTexto(valor: string) {
  if (!valor) return '';

  const limpio = valor
    .replace('T', ' ')
    .replace('Z', '')
    .split('.')[0];

  const partes = limpio.split(' ');

  const fecha = partes[0];
  const hora = partes[1] || '';

  const elementos = fecha.split('-');

  if (elementos.length !== 3) {
    return valor;
  }

  const [anio, mes, dia] = elementos;

  return `${dia}/${mes}/${anio} ${hora}`.trim();
}

// =====================================================
// SOLICITUDES HTTP
// =====================================================

async function enviar<T>(
  ruta: string,
  payload: unknown
): Promise<T> {
  const respuesta = await fetch(
    `${API}/reclamaciones/${ruta}`,
    {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json'
      },

      cache: 'no-store',

      body: JSON.stringify(payload)
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
      }>;
    };

    const detalles = error.details
      ?.map(item => item.message)
      .filter(Boolean)
      .join('; ');

    throw new Error(
      detalles ||
      error.error ||
      `Error HTTP ${respuesta.status}`
    );
  }

  return datos as T;
}

// =====================================================
// COMPONENTE PRINCIPAL
// =====================================================

export default function ReclamacionesPublicas() {

  // ===================================================
  // ESTADOS
  // ===================================================

  const [pestana, setPestana] =
    useState<'registro' | 'consulta'>('registro');

  const [form, setForm] =
    useState<Formulario>(crearFormulario);

  const [numero, setNumero] =
    useState('');

  const [codigo, setCodigo] =
    useState('');

  const [mostrarCodigo, setMostrarCodigo] =
    useState(false);

  const [constancia, setConstancia] =
    useState<Constancia | null>(null);

  const [seguimiento, setSeguimiento] =
    useState<Consulta | null>(null);

  const [error, setError] =
    useState('');

  const [ocupado, setOcupado] =
    useState(false);

  // ===================================================
  // ACTUALIZAR FORMULARIO
  // ===================================================

  function actualizarCampo<K extends keyof Formulario>(
    nombre: K,
    valor: Formulario[K]
  ) {
    setForm(actual => ({
      ...actual,
      [nombre]: valor
    }));
  }

  // ===================================================
  // CAMBIAR PESTAÑA
  // ===================================================

  function cambiarPestana(
    nueva: 'registro' | 'consulta'
  ) {
    setPestana(nueva);
    setError('');
    setSeguimiento(null);
    setMostrarCodigo(false);

    // Al cambiar de pantalla, limpiar
    // las credenciales de la consulta.
    //
    // La constancia permanece visible
    // hasta que el consumidor registre otra.

    if (nueva === 'consulta') {
      if (constancia) {
        setNumero(
          constancia.NumeroCorrelativo
        );
      }
    }
  }

  // ===================================================
  // CU011 — REGISTRAR RECLAMACIÓN
  // ===================================================

  async function registrar(
    evento: FormEvent<HTMLFormElement>
  ) {
    evento.preventDefault();

    if (ocupado || constancia) {
      return;
    }

    setError('');
    setOcupado(true);

    try {
      const datos = await enviar<Constancia>(
        'publicas',
        {
          ...form,

          numeroDocumento:
            form.numeroDocumento.trim(),

          nombreReclamante:
            form.nombreReclamante.trim(),

          correoReclamante:
            form.correoReclamante.trim(),

          telefonoReclamante:
            form.telefonoReclamante.trim() || null,

          descripcion:
            form.descripcion.trim(),

          pedido:
            form.pedido.trim()
        }
      );

      setConstancia(datos);

      setNumero(
        datos.NumeroCorrelativo
      );

      setCodigo('');

      setSeguimiento(null);

      setForm(
        crearFormulario()
      );

    } catch (e) {
      setError(
        (e as Error).message
      );

    } finally {
      setOcupado(false);
    }
  }

  // ===================================================
  // CU012 — CONSULTAR RECLAMACIÓN
  // ===================================================

  async function consultar(
    evento: FormEvent<HTMLFormElement>
  ) {
    evento.preventDefault();

    if (ocupado) {
      return;
    }

    setError('');
    setSeguimiento(null);
    setOcupado(true);

    try {
      const datos = await enviar<Consulta>(
        'consulta',
        {
          numeroCorrelativo:
            numero.trim().toUpperCase(),

          codigoPrivado:
            codigo.trim()
        }
      );

      setSeguimiento(datos);

    } catch (e) {
      setError(
        (e as Error).message
      );

    } finally {
      setOcupado(false);
    }
  }

  // ===================================================
  // DESCARGAR CONSTANCIA PDF
  // ===================================================

  function descargarConstancia() {
    if (!constancia) {
      return;
    }

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    // ENCABEZADO

    pdf.setFillColor(23, 59, 99);

    pdf.rect(
      0,
      0,
      210,
      34,
      'F'
    );

    pdf.setTextColor(
      255,
      255,
      255
    );

    pdf.setFont(
      'helvetica',
      'bold'
    );

    pdf.setFontSize(18);

    pdf.text(
      'SIGET-VIA',
      18,
      17
    );

    pdf.setFontSize(10);

    pdf.text(
      'TRANSPORTES VIA S.A.C.',
      18,
      25
    );

    // TÍTULO

    pdf.setTextColor(
      23,
      59,
      99
    );

    pdf.setFontSize(14);

    pdf.text(
      'CONSTANCIA DE RECEPCION',
      18,
      47
    );

    // CONTENIDO

    pdf.setFont(
      'helvetica',
      'normal'
    );

    pdf.setFontSize(11);

    const lineas = [
      `Correlativo: ${constancia.NumeroCorrelativo}`,

      `Tipo: ${constancia.TipoSolicitud}`,

      `Fecha: ${fechaTexto(
        constancia.FechaRegistro
      )}`,

      `Estado: ${constancia.Estado}`,

      '',

      'CODIGO PRIVADO DE CONSULTA:',

      constancia.codigoPrivado,

      '',

      'Conserve esta constancia y su codigo privado.',

      'El codigo se entrega una sola vez.',

      '',

      'La constancia acredita el registro de la',

      'reclamacion, no su resolucion definitiva.',

      '',

      'Prototipo academico SIGET-VIA.'
    ];

    let y = 60;

    for (const linea of lineas) {
      const partes = pdf.splitTextToSize(
        linea,
        172
      ) as string[];

      pdf.text(
        partes,
        18,
        y
      );

      y += Math.max(
        1,
        partes.length
      ) * 7;
    }

    pdf.save(
      `Constancia_${constancia.NumeroCorrelativo}.pdf`
    );
  }

  // ===================================================
  // ESTILOS
  // ===================================================

  const contenedor = {
    maxWidth: 820,
    margin: '24px auto',
    padding: 24,
    background: '#ffffff',
    borderRadius: 12,
    color: '#173b63',
    boxShadow: '0 4px 24px #00000012'
  };

  const rejilla = {
    display: 'grid',

    gridTemplateColumns:
      'repeat(auto-fit,minmax(240px,1fr))',

    gap: 14
  };

  const etiqueta = {
    display: 'grid',
    gap: 6,
    color: '#243b53',
    fontWeight: 600 as const
  };

  const campoEstilo = {
    padding: 11,
    width: '100%',
    border: '1px solid #cbd5e1',
    borderRadius: 7,
    fontSize: 14,
    boxSizing: 'border-box' as const
  };

  const boton = {
    padding: '11px 16px',
    border: 0,
    borderRadius: 7,
    cursor: 'pointer',
    background: '#173b63',
    color: '#ffffff',

    display: 'inline-flex',

    alignItems: 'center' as const,

    justifyContent: 'center' as const,

    gap: 8
  };

  const botonSecundario = {
    ...boton,
    background: '#64748b'
  };

  // ===================================================
  // INTERFAZ
  // ===================================================

  return (
    <main
      style={{
        background: '#f1f5f9',
        minHeight: '100vh',
        padding: 16
      }}
    >
      <section style={contenedor}>

        {/* ENCABEZADO */}

        <h1
          style={{
            marginTop: 0
          }}
        >
          SIGET-VÍA · Libro de Reclamaciones
        </h1>

        <p
          style={{
            color: '#475569'
          }}
        >
          Transportes Vía S.A.C. ·
          Registro y seguimiento del consumidor
        </p>

        {/* PESTAÑAS */}

        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            marginBottom: 20
          }}
        >
          <button
            type="button"
            style={boton}
            onClick={() =>
              cambiarPestana('registro')
            }
          >
            <FileText size={17} />
            Registrar reclamación
          </button>

          <button
            type="button"
            style={boton}
            onClick={() =>
              cambiarPestana('consulta')
            }
          >
            <Search size={17} />
            Consultar estado
          </button>

          <a
            href="/"
            style={{
              alignSelf: 'center',
              marginLeft: 'auto'
            }}
          >
            Volver al inicio
          </a>
        </div>

        {/* ERRORES */}

        {error && (
          <p
            role="alert"
            style={{
              background: '#fee2e2',
              color: '#991b1b',
              padding: 12,
              borderRadius: 6
            }}
          >
            <AlertCircle size={16} />
            {' '}
            {error}
          </p>
        )}

        {/* ===========================================
            CU011 - REGISTRO PÚBLICO
           =========================================== */}

        {pestana === 'registro' && !constancia && (
          <form
            onSubmit={registrar}
            style={{
              display: 'grid',
              gap: 15
            }}
          >

            <div style={rejilla}>

              {/* TIPO DOCUMENTO */}

              <label style={etiqueta}>
                Tipo de documento

                <select
                  value={form.tipoDocumento}
                  onChange={e =>
                    actualizarCampo(
                      'tipoDocumento',
                      e.target.value
                    )
                  }
                  style={campoEstilo}
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

              {/* NUMERO DOCUMENTO */}

              <label style={etiqueta}>
                Número de documento

                <input
                  required
                  minLength={4}
                  maxLength={20}
                  value={form.numeroDocumento}
                  onChange={e =>
                    actualizarCampo(
                      'numeroDocumento',
                      e.target.value
                    )
                  }
                  style={campoEstilo}
                />
              </label>

              {/* NOMBRE */}

              <label style={etiqueta}>
                Nombre completo

                <input
                  required
                  minLength={3}
                  maxLength={220}
                  value={form.nombreReclamante}
                  onChange={e =>
                    actualizarCampo(
                      'nombreReclamante',
                      e.target.value
                    )
                  }
                  style={campoEstilo}
                />
              </label>

              {/* CORREO */}

              <label style={etiqueta}>
                Correo electrónico

                <input
                  required
                  type="email"
                  maxLength={254}
                  value={form.correoReclamante}
                  onChange={e =>
                    actualizarCampo(
                      'correoReclamante',
                      e.target.value
                    )
                  }
                  style={campoEstilo}
                />
              </label>

              {/* TELEFONO */}

              <label style={etiqueta}>
                Teléfono (opcional)

                <input
                  maxLength={20}
                  value={form.telefonoReclamante}
                  onChange={e =>
                    actualizarCampo(
                      'telefonoReclamante',
                      e.target.value
                    )
                  }
                  style={campoEstilo}
                />
              </label>

              {/* TIPO SOLICITUD */}

              <label style={etiqueta}>
                Tipo de solicitud

                <select
                  value={form.tipoSolicitud}
                  onChange={e =>
                    actualizarCampo(
                      'tipoSolicitud',
                      e.target.value as Tipo
                    )
                  }
                  style={campoEstilo}
                >
                  <option value="RECLAMO">
                    Reclamo
                  </option>

                  <option value="QUEJA">
                    Queja
                  </option>
                </select>
              </label>

            </div>

            {/* DESCRIPCION */}

            <label style={etiqueta}>
              Descripción de lo ocurrido

              <textarea
                required
                minLength={10}
                maxLength={5000}
                rows={5}
                value={form.descripcion}
                onChange={e =>
                  actualizarCampo(
                    'descripcion',
                    e.target.value
                  )
                }
                style={campoEstilo}
              />
            </label>

            {/* PEDIDO */}

            <label style={etiqueta}>
              Pedido o solución solicitada

              <textarea
                required
                minLength={5}
                maxLength={5000}
                rows={4}
                value={form.pedido}
                onChange={e =>
                  actualizarCampo(
                    'pedido',
                    e.target.value
                  )
                }
                style={campoEstilo}
              />
            </label>

            <p
              style={{
                color: '#475569',
                fontSize: 13
              }}
            >
              Sus datos se utilizarán para registrar
              y atender esta reclamación.

              El código privado se mostrará al
              completar el registro.
            </p>

            {/* BOTON GUARDAR */}

            <button
              type="submit"
              disabled={ocupado}
              style={boton}
            >
              <Send size={17} />

              {ocupado
                ? 'Registrando...'
                : 'Registrar y obtener constancia'}
            </button>

          </form>
        )}

        {/* ===========================================
            CONSTANCIA DE RECEPCION
           =========================================== */}

        {pestana === 'registro' && constancia && (
          <section
            style={{
              padding: 18,
              border: '1px solid #cbd5e1',
              borderRadius: 8
            }}
          >

            <h2>
              <ShieldCheck size={20} />
              {' '}
              Reclamación recibida
            </h2>

            <p>
              <strong>
                Correlativo:
              </strong>
              {' '}
              {constancia.NumeroCorrelativo}
            </p>

            <p>
              <strong>
                Fecha:
              </strong>
              {' '}
              {fechaTexto(
                constancia.FechaRegistro
              )}
            </p>

            <p>
              <strong>
                Estado:
              </strong>
              {' '}
              {constancia.Estado}
            </p>

            <p>
              <strong>
                Código privado de consulta:
              </strong>
            </p>

            <p
              style={{
                overflowWrap: 'anywhere',
                background: '#eef2ff',
                padding: 12,
                fontFamily: 'monospace',
                fontWeight: 700,
                letterSpacing: 2
              }}
            >
              {constancia.codigoPrivado}
            </p>

            <p>
              Guarda tu constancia. El código privado
              no podrá recuperarse mediante esta pantalla.
            </p>

            <div
              style={{
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap'
              }}
            >
              <button
                type="button"
                onClick={descargarConstancia}
                style={boton}
              >
                <Download size={17} />
                Descargar constancia PDF
              </button>

              <button
                type="button"
                onClick={() => {
                  setConstancia(null);
                  setCodigo('');
                  setNumero('');
                  setSeguimiento(null);
                  setError('');
                  setMostrarCodigo(false);
                }}
                style={botonSecundario}
              >
                Registrar otra
              </button>
            </div>

          </section>
        )}

        {/* ===========================================
            CU012 - CONSULTAR RECLAMACION
           =========================================== */}

        {pestana === 'consulta' && (
          <form
            onSubmit={consultar}
            style={{
              display: 'grid',
              gap: 13
            }}
          >

            {/* CORRELATIVO */}

            <label style={etiqueta}>
              Número correlativo

              <input
                required
                placeholder="REC-0000000004"
                value={numero}
                onChange={e => {
                  setNumero(e.target.value);
                  setSeguimiento(null);
                }}
                style={campoEstilo}
              />
            </label>

            {/* CODIGO PRIVADO */}

            <label style={etiqueta}>
              Código privado recibido en la constancia

              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center'
                }}
              >
                <input
                  required
                  type={
                    mostrarCodigo
                      ? 'text'
                      : 'password'
                  }
                  autoComplete="off"
                  value={codigo}
                  onChange={e => {
                    setCodigo(e.target.value);
                    setSeguimiento(null);
                  }}
                  style={{
                    ...campoEstilo,
                    flex: 1
                  }}
                />

                <button
                  type="button"
                  onClick={() =>
                    setMostrarCodigo(
                      actual => !actual
                    )
                  }
                  title={
                    mostrarCodigo
                      ? 'Ocultar código'
                      : 'Mostrar código'
                  }
                  aria-label={
                    mostrarCodigo
                      ? 'Ocultar código'
                      : 'Mostrar código'
                  }
                  style={boton}
                >
                  {mostrarCodigo
                    ? <EyeOff size={17} />
                    : <Eye size={17} />}
                </button>
              </div>
            </label>

            {/* BOTON CONSULTAR */}

            <button
              type="submit"
              disabled={ocupado}
              style={boton}
            >
              <Search size={17} />

              {ocupado
                ? 'Consultando...'
                : 'Consultar reclamación'}
            </button>

            {/* =======================================
                RESULTADO DE CONSULTA
               ======================================= */}

            {seguimiento && (
              <section
                style={{
                  borderTop: '1px solid #cbd5e1',
                  paddingTop: 15
                }}
              >

                <h2>
                  Estado:{' '}
                  {seguimiento.reclamacion.Estado}
                </h2>

                <p>
                  <strong>
                    Correlativo:
                  </strong>
                  {' '}
                  {seguimiento.reclamacion.NumeroCorrelativo}
                </p>

                <p>
                  <strong>
                    Tipo de solicitud:
                  </strong>
                  {' '}
                  {seguimiento.reclamacion.TipoSolicitud}
                </p>

                <p>
                  <strong>
                    Recepción:
                  </strong>
                  {' '}
                  {fechaTexto(
                    seguimiento.reclamacion.FechaRegistro
                  )}
                </p>

                {/* HISTORIAL */}

                <h3>
                  Historial de seguimiento
                </h3>

                {seguimiento.historial.length === 0 ? (
                  <p>
                    No se encontraron movimientos.
                  </p>
                ) : (
                  <ol
                    style={{
                      paddingLeft: 22,
                      lineHeight: 1.8
                    }}
                  >
                    {seguimiento.historial.map(
                      (item, indice) => (
                        <li
                          key={
                            `${item.EstadoNuevo}-${indice}`
                          }
                        >
                          <strong>
                            {item.EstadoNuevo}
                          </strong>

                          {' · '}

                          {fechaTexto(
                            item.FechaCambio
                          )}
                        </li>
                      )
                    )}
                  </ol>
                )}

                {/* ===================================
                    RESPUESTAS ADMINISTRATIVAS
                   =================================== */}

                {seguimiento.respuestas?.length > 0 && (
                  <section
                    style={{
                      marginTop: 20,
                      borderTop: '1px solid #cbd5e1',
                      paddingTop: 15
                    }}
                  >

                    <h3>
                      Respuesta de Transportes Vía S.A.C.
                    </h3>

                    {seguimiento.respuestas.map(
                      (respuesta, indice) => (
                        <article
                          key={indice}
                          style={{
                            background: '#f1f5f9',
                            padding: 14,
                            borderRadius: 8,
                            marginBottom: 12,
                            borderLeft:
                              '4px solid #173b63'
                          }}
                        >
                          <p
                            style={{
                              whiteSpace: 'pre-wrap',
                              marginTop: 0,
                              lineHeight: 1.7,
                              color: '#243b53'
                            }}
                          >
                            {respuesta.Contenido}
                          </p>

                          <small
                            style={{
                              color: '#64748b'
                            }}
                          >
                            Fecha de respuesta:{' '}

                            {fechaTexto(
                              respuesta.FechaRespuesta
                            )}
                          </small>
                        </article>
                      )
                    )}

                  </section>
                )}

                {/* SIN RESPUESTA TODAVIA */}

                {(!seguimiento.respuestas ||
                  seguimiento.respuestas.length === 0) &&
                  seguimiento.reclamacion.Estado !==
                    'CERRADO' && (
                    <p
                      style={{
                        color: '#64748b',
                        marginTop: 20,
                        fontSize: 13
                      }}
                    >
                      Todavía no se ha registrado
                      una respuesta administrativa.
                    </p>
                  )}

              </section>
            )}

          </form>
        )}

      </section>
    </main>
  );
}
