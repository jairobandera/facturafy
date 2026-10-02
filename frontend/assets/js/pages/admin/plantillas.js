// Pagina de descarga de plantillas de ejemplo (.xlsx) para completar e importar.
import { h } from '../../core/dom.js';
import { renderShell } from '../../core/layout.js';
import { pageHeader } from '../../components/page.js';
import { PLANTILLAS, descargarPlantilla } from '../../components/plantillas.js';

const ORDEN = ['categorias', 'productos', 'barras', 'stock'];

export function gestionarPlantillas() {
  const content = renderShell('Plantillas');

  content.append(pageHeader(
    'Plantillas',
    'Descargá una plantilla de ejemplo, completala con tus datos y luego importala desde la sección correspondiente.',
  ));

  const cards = ORDEN.map((clave) => {
    const p = PLANTILLAS[clave];
    return h('div', { class: 'col-12 col-md-6 col-xl-3' }, [
      h('div', { class: 'card h-100 shadow-sm' }, [
        h('div', { class: 'card-body d-flex flex-column' }, [
          h('div', { class: 'd-flex align-items-center gap-2 mb-2' }, [
            h('i', { class: `bi ${p.icon} fs-4 text-primary` }),
            h('h5', { class: 'card-title mb-0' }, p.titulo),
          ]),
          h('p', { class: 'card-text text-muted small flex-grow-1' }, p.descripcion),
          h('button', {
            class: 'btn btn-outline-primary w-100',
            onClick: () => descargarPlantilla(clave),
          }, [h('i', { class: 'bi bi-file-earmark-arrow-down me-1' }), 'Descargar plantilla']),
        ]),
      ]),
    ]);
  });

  content.append(h('div', { class: 'row g-3' }, cards));
}
