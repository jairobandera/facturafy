import { createCrud } from '../../core/crud.js';

export const reporteCrud = createCrud({
  table: 'reporte',
  entityLabel: 'Reporte',
  fields: [
    { col: 'fecha_generacion', field: 'fechaGeneracion' },
    { col: 'total_faltante', field: 'totalFaltante' },
    { col: 'total_sobrante', field: 'totalSobrante' },
    { col: 'diferencia_monetaria', field: 'diferenciaMonetaria' },
  ],
});

export const reporteService = reporteCrud.service;
export const reporteRoutes = reporteCrud.buildRoutes();
