// Plantillas de ejemplo descargables (.xlsx) para completar desde cero y luego importar.
// Los encabezados coinciden con los alias que reconoce la importacion (ver excel.js).
import { exportToExcel } from './excel.js';

/** Metadatos de cada plantilla: titulo, descripcion, archivo y filas de ejemplo. */
export const PLANTILLAS = {
  categorias: {
    titulo: 'Categorías',
    icon: 'bi-tags',
    archivo: 'plantilla_categorias',
    descripcion: 'Una fila por categoría. El código es opcional pero recomendado (evita duplicados).',
    filas: [
      { Codigo: '001', Nombre: 'BEBIDAS SIN ALCOHOL', Descripcion: 'Gaseosas, aguas, jugos' },
      { Codigo: '002', Nombre: 'GOLOSINAS', Descripcion: '' },
      { Codigo: '003', Nombre: 'SNACK SALADO', Descripcion: '' },
    ],
  },
  productos: {
    titulo: 'Productos',
    icon: 'bi-box-seam',
    archivo: 'plantilla_productos',
    descripcion: 'Una fila por producto. La categoría se vincula por IdCategoria o NombreCategoria (deben existir). Los códigos de barra van separados por coma.',
    filas: [
      {
        CodigoProducto: '002001', Nombre: 'REF COCA 600CC', IdCategoria: '001',
        NombreCategoria: 'BEBIDAS SIN ALCOHOL', Precio: 90, Stock: 0,
        CodigosBarra: '7790000000001, 7790000000002',
      },
      {
        CodigoProducto: '003001', Nombre: 'CHOCOLATE X 50G', IdCategoria: '002',
        NombreCategoria: 'GOLOSINAS', Precio: 55, Stock: 0, CodigosBarra: '7790000000010',
      },
    ],
  },
  barras: {
    titulo: 'Códigos de barra',
    icon: 'bi-upc-scan',
    archivo: 'plantilla_codigos_barra',
    descripcion: 'Opcional: sólo si preferís cargar los códigos de barra en un archivo aparte. Un producto puede tener varios, separados por coma.',
    filas: [
      { CodigoProducto: '002001', CodigosBarra: '7790000000001, 7790000000002' },
      { CodigoProducto: '003001', CodigosBarra: '7790000000010' },
    ],
  },
  stock: {
    titulo: 'Stock esperado (conteo)',
    icon: 'bi-clipboard-data',
    archivo: 'plantilla_stock_conteo',
    descripcion: 'Stock final por producto que se usará como cantidad esperada del conteo. Los valores con decimales se ignoran.',
    filas: [
      { Codigo: '002001', StockFinal: 120 },
      { Codigo: '003001', StockFinal: 45 },
    ],
  },
};

/** Descarga la plantilla indicada (clave de PLANTILLAS). */
export function descargarPlantilla(clave) {
  const p = PLANTILLAS[clave];
  if (!p) return;
  exportToExcel(p.filas, p.archivo, 'Plantilla');
}
