
import { jsPDF } from 'jspdf';

// ==========================================
// SIGET-VÍA - COMPROBANTE DE RESERVA
// IMPRESIÓN Y DESCARGA PDF
// ==========================================

export type DatosComprobante = {
  ReservaID: number;
  Codigo: string | null;
  Estado: string;
  FechaReserva?: string;
  Origen: string;
  Destino: string;
  Placa: string;
  Modelo: string;
  Salida: string;
  UsuarioNombres?: string;
  UsuarioApellidos?: string;
  Total: number;
  items: Array<{
    Numero: number;
    Nivel: number;
    NumeroDocumento: string;
    Nombres: string;
    Apellidos: string;
    Precio: number;
  }>;
};

function fechaTexto(valor?: string): string {
  if (!valor) return 'No registrada';

  const fecha = valor.slice(0, 10);
  const hora = valor.slice(11, 16);
  const partes = fecha.split('-');

  if (partes.length !== 3) return valor;

  return (
    `${partes[2]}/${partes[1]}/${partes[0]}` +
    (hora ? ` ${hora}` : '')
  );
}

function moneda(valor: number): string {
  return `S/ ${Number(valor).toFixed(2)}`;
}

export function generarComprobanteReserva(
  reserva: DatosComprobante
): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const ancho = 210;
  const margen = 16;
  let y = 20;

  const azul: [number, number, number] =
    [23, 59, 99];

  const naranja: [number, number, number] =
    [245, 130, 32];

  const gris: [number, number, number] =
    [85, 96, 109];

  function encabezado() {
    doc.setFillColor(...azul);
    doc.rect(0, 0, ancho, 35, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(19);
    doc.text('SIGET-VIA', margen, 17);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(
      'TRANSPORTES VIA S.A.C.',
      margen,
      24
    );

    doc.setFontSize(9);
    doc.text(
      'COMPROBANTE DE RESERVA',
      ancho - margen,
      19,
      { align: 'right' }
    );

    doc.setTextColor(...azul);
  }

  function tituloSeccion(texto: string) {
    y += 8;
    doc.setFillColor(241, 245, 249);
    doc.rect(margen, y - 5, 178, 10, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...azul);
    doc.text(texto, margen + 3, y + 1);

    y += 12;
  }

  function dato(
    etiqueta: string,
    valor: string
  ) {
    doc.setFontSize(9);
    doc.setTextColor(...gris);
    doc.setFont('helvetica', 'normal');
    doc.text(etiqueta, margen, y);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...azul);
    doc.text(valor, 68, y);

    y += 7;
  }

  function nuevaPaginaSiEsNecesario(
    espacio: number
  ) {
    if (y + espacio > 275) {
      doc.addPage();
      encabezado();
      y = 47;
    }
  }

  encabezado();
  y = 47;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(
    reserva.Codigo ||
      `RESERVA-${reserva.ReservaID}`,
    margen,
    y
  );

  doc.setFontSize(10);
  doc.setTextColor(...naranja);
  doc.text(
    reserva.Estado,
    ancho - margen,
    y,
    { align: 'right' }
  );

  y += 7;

  tituloSeccion('DATOS DE LA RESERVA');

  dato('Codigo:', reserva.Codigo || '-');
  dato('Fecha:', fechaTexto(reserva.FechaReserva));
  dato('Estado:', reserva.Estado);

  tituloSeccion('INFORMACION DEL VIAJE');

  dato('Origen:', reserva.Origen);
  dato('Destino:', reserva.Destino);

  dato(
    'Bus:',
    `${reserva.Placa} - ${reserva.Modelo}`
      .slice(0, 55)
  );

  dato(
    'Fecha de salida:',
    fechaTexto(reserva.Salida)
  );

  tituloSeccion('PASAJEROS Y ASIENTOS');

  const items = reserva.items || [];

  for (const [indice, item] of items.entries()) {
    const nombreCompleto =
      `${item.Nombres} ${item.Apellidos}`;

    const lineasNombre = doc.splitTextToSize(
      nombreCompleto,
      160
    ) as string[];

    const alto = Math.max(
      24,
      lineasNombre.length * 5 + 18
    );

    nuevaPaginaSiEsNecesario(alto);

    doc.setDrawColor(220, 226, 234);
    doc.setLineWidth(0.25);
    doc.roundedRect(
      margen,
      y - 4,
      178,
      alto - 3,
      2,
      2
    );

    doc.setTextColor(...azul);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);

    doc.text(
      `PASAJERO ${indice + 1}`,
      margen + 4,
      y + 2
    );

    doc.text(
      `Piso ${item.Nivel} - Asiento ${String(
        item.Numero
      ).padStart(2, '0')}`,
      190,
      y + 2,
      { align: 'right' }
    );

    doc.setFont('helvetica', 'normal');
    doc.text(
      lineasNombre,
      margen + 4,
      y + 9
    );

    doc.setTextColor(...gris);
    doc.text(
      `Documento: ${item.NumeroDocumento}`,
      margen + 4,
      y + 10 + lineasNombre.length * 5
    );

    doc.text(
      moneda(item.Precio),
      190,
      y + 10 + lineasNombre.length * 5,
      { align: 'right' }
    );

    y += alto + 3;
  }

  nuevaPaginaSiEsNecesario(42);
  y += 5;

  doc.setFillColor(...azul);
  doc.roundedRect(
    margen,
    y,
    178,
    18,
    3,
    3,
    'F'
  );

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);

  doc.text('TOTAL DE RESERVA', margen + 6, y + 11);

  doc.text(
    moneda(reserva.Total),
    188,
    y + 11,
    { align: 'right' }
  );

  y += 27;

  nuevaPaginaSiEsNecesario(25);

  doc.setTextColor(...gris);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  const nota = doc.splitTextToSize(
    'Documento de reserva generado por SIGET-VIA. ' +
    'No acredita el pago del pasaje y no constituye ' +
    'un comprobante tributario.',
    178
  );

  doc.text(nota, margen, y);

  // Numeracion de paginas.
  const paginas = doc.getNumberOfPages();

  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);

    doc.setDrawColor(220, 226, 234);
    doc.line(16, 284, 194, 284);

    doc.setTextColor(...gris);
    doc.setFontSize(8);

    doc.text(
      `SIGET-VIA | Pagina ${i} de ${paginas}`,
      105,
      290,
      { align: 'center' }
    );
  }

  return doc;
}

export function descargarComprobanteReserva(
  reserva: DatosComprobante
) {
  const doc = generarComprobanteReserva(reserva);

  const codigo =
    (reserva.Codigo ||
      `RESERVA-${reserva.ReservaID}`)
      .replace(/[^A-Za-z0-9_-]/g, '_');

  doc.save(`SIGET-VIA-${codigo}.pdf`);
}

export function imprimirComprobanteReserva(
  reserva: DatosComprobante
) {
  const doc = generarComprobanteReserva(reserva);
  const archivo = doc.output('blob');
  const url = URL.createObjectURL(archivo);

  const ventana = window.open(
    url,
    '_blank'
  );

  if (!ventana) {
    URL.revokeObjectURL(url);

    throw new Error(
      'El navegador bloqueó la ventana de impresión. ' +
      'Permite las ventanas emergentes para SIGET-VÍA.'
    );
  }

  // El visor PDF del navegador permite
  // imprimir o guardar el documento.
  // No eliminamos la URL mientras esté abierta.
}
