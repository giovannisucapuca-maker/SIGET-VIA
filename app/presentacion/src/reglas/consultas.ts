// SIGET-VÍA — VISTA — REGLAS DEL FORMULARIO — Consultas (auditoría, pagos, manifiestos, reportes)
export {
  listarAuditoria, resumenAuditoria, catalogosAuditoria, detalleAuditoria,
  listarPagos, resumenPagos, detallePago,
  listarViajesManifiesto, obtenerManifiesto,
  obtenerReporte, resumenReportes, indicadoresExtra,
  listarMisReservas, detalleMiReserva
} from '../servicios/api/consultas.api';
