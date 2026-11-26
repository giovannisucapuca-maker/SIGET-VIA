// SIGET-VÍA — CAPA DE PRESENTACIÓN
// Constancia de recepción de una reclamación en PDF (CU011 / CU012).
import { jsPDF } from 'jspdf';

export type DatosConstanciaReclamacion = {
  NumeroCorrelativo: string | null;
  ReclamacionID: number;
  TipoSolicitud: string;
  FechaRegistro: string;
  Estado: string;
  NombreReclamante?: string;
  TipoDocumento?: string;
  NumeroDocumento?: string;
  Descripcion?: string;
  Pedido?: string;
};

// Muestra la fecha tal como se guardó en SQL Server (sin convertir a UTC).
export function fechaReclamacion(valor: string): string {
  if (!valor) return '';
  const [fecha, hora = ''] = valor.replace('T', ' ').replace('Z', '').split('.')[0].split(' ');
  const partes = fecha.split('-');
  if (partes.length !== 3) return valor;
  return `${partes[2]}/${partes[1]}/${partes[0]} ${hora.slice(0, 5)}`.trim();
}

// jsPDF con la fuente estándar no admite todos los caracteres con tilde.
const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '');

export function descargarConstanciaReclamacion(r: DatosConstanciaReclamacion) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const numero = r.NumeroCorrelativo || `#${r.ReclamacionID}`;

  pdf.setFillColor(23, 59, 99);
  pdf.rect(0, 0, 210, 34, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.text('SIGET-VIA', 18, 17);
  pdf.setFontSize(10);
  pdf.text('TRANSPORTES VIA S.A.C. - LIBRO DE RECLAMACIONES', 18, 25);

  pdf.setTextColor(23, 59, 99);
  pdf.setFontSize(14);
  pdf.text('CONSTANCIA DE RECEPCION', 18, 47);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.setTextColor(30, 41, 59);

  const lineas = [
    `Numero correlativo: ${numero}`,
    `Tipo de solicitud: ${r.TipoSolicitud}`,
    `Fecha de registro: ${fechaReclamacion(r.FechaRegistro)}`,
    `Estado actual: ${r.Estado}`,
    r.NombreReclamante ? `Reclamante: ${r.NombreReclamante}` : '',
    r.NumeroDocumento ? `Documento: ${r.TipoDocumento || ''} ${r.NumeroDocumento}` : '',
    '',
    r.Descripcion ? `Detalle: ${r.Descripcion}` : '',
    r.Pedido ? `Pedido: ${r.Pedido}` : '',
    '',
    'La constancia acredita el registro de la reclamacion,',
    'no su resolucion definitiva.',
    '',
    'Prototipo academico SIGET-VIA.'
  ];

  let y = 60;
  for (const linea of lineas) {
    if (!linea) { y += 4; continue; }
    const partes = pdf.splitTextToSize(sinTildes(linea), 172) as string[];
    if (y + partes.length * 6 > 285) { pdf.addPage(); y = 20; }
    pdf.text(partes, 18, y);
    y += partes.length * 6 + 1;
  }

  pdf.save(`Constancia_${numero}.pdf`);
}
