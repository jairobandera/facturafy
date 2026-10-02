import { createCrud } from '../../core/crud.js';

export const empresaCrud = createCrud({
  table: 'empresa',
  entityLabel: 'Empresa',
  fields: [
    { col: 'nombre', field: 'nombre' },
    { col: 'rut', field: 'rut' },
    { col: 'direccion', field: 'direccion' },
    { col: 'telefono', field: 'telefono' },
  ],
});

export const empresaService = empresaCrud.service;
export const empresaRoutes = empresaCrud.buildRoutes();
