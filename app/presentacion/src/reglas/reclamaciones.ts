// SIGET-VÍA — VISTA — REGLAS DEL FORMULARIO — Libro de reclamaciones (RF11, RF12, RF13)
export {
  listarReclamaciones, resumenReclamaciones, detalleReclamacion, registrarReclamacion,
  cambiarEstadoReclamacion, responderReclamacion,
  registrarReclamacionPublica, consultarReclamacionPublica,
  listarMisReclamaciones, detalleMiReclamacion
} from '../servicios/api/reclamaciones.api';

// Etapas del libro de reclamaciones (RF12), en orden.
export const ETAPAS_RECLAMACION = ['REGISTRADO', 'EN_ATENCION', 'RESPONDIDO', 'CERRADO'] as const;

export function nombreEtapa(estado: string): string {
  return ({
    REGISTRADO: 'Registrado',
    EN_ATENCION: 'En atención',
    RESPONDIDO: 'Respondido',
    CERRADO: 'Cerrado'
  } as Record<string, string>)[estado] || estado;
}
