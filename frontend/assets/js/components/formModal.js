// Modal de formulario reutilizable construido con Bootstrap.
// Devuelve una promesa que resuelve con los valores o null si se cancela.
import { h } from '../core/dom.js';

/**
 * @param {object} opts
 * @param {string} opts.title
 * @param {Array} opts.fields  [{ name, label, type, options, required, value, help, min, step, colClass }]
 *   type: text (por defecto) | number | date | password | textarea | select | searchselect |
 *         multiselect | checkbox | checkboxgroup | tags | image.
 *   searchselect: como select pero con buscador, para listas largas.
 * @param {string} [opts.submitText]
 * @param {(values)=>string|null} [opts.validate]  Devuelve mensaje de error o null.
 */
export function formModal({ title, fields, submitText = 'Guardar', validate }) {
  return new Promise((resolve) => {
    const inputs = {};
    const errorBox = h('div', { class: 'alert alert-danger d-none py-2', role: 'alert' });

    // Permite que un campo repueble las opciones de otro (campos en cascada).
    // Funciona con select y con checkboxgroup (por ejemplo: sucursal -> categorias).
    const setOptions = (name, options, selected, placeholder) => {
      const el = inputs[name];
      if (!el) return;
      if (el.classList?.contains('sk-checkgroup')) { rebuildCheckgroup(el, options, name); return; }
      if (el.tagName !== 'SELECT') return;
      el.innerHTML = '';
      if (placeholder !== undefined) el.append(new Option(placeholder, ''));
      for (const o of options || []) {
        const opt = new Option(o.label, String(o.value));
        if (selected != null && String(o.value) === String(selected)) opt.selected = true;
        el.append(opt);
      }
    };

    const controls = fields.map((f) => buildField(f, inputs, setOptions));

    // autocomplete off: evita que el navegador rellene usuario/contraseña guardados.
    const form = h('form', { class: 'row g-3', autocomplete: 'off' }, controls);

    const modalEl = h('div', { class: 'modal fade', tabindex: '-1' }, [
      h('div', { class: 'modal-dialog modal-dialog-centered modal-lg' }, [
        h('div', { class: 'modal-content' }, [
          h('div', { class: 'modal-header' }, [
            h('h5', { class: 'modal-title' }, title),
            h('button', { type: 'button', class: 'btn-close', 'data-bs-dismiss': 'modal' }),
          ]),
          h('div', { class: 'modal-body' }, [errorBox, form]),
          h('div', { class: 'modal-footer' }, [
            h('button', { type: 'button', class: 'btn btn-secondary', 'data-bs-dismiss': 'modal' }, 'Cancelar'),
            h('button', { type: 'button', class: 'btn btn-primary', id: 'sk-form-submit' }, submitText),
          ]),
        ]),
      ]),
    ]);

    document.body.append(modalEl);
    const modal = new bootstrap.Modal(modalEl);
    let submitted = false;

    modalEl.querySelector('#sk-form-submit').addEventListener('click', () => {
      const values = collectValues(fields, inputs);
      const requiredError = checkRequired(fields, values);
      const customError = requiredError || (validate ? validate(values) : null);
      if (customError) {
        errorBox.textContent = customError;
        errorBox.classList.remove('d-none');
        return;
      }
      submitted = true;
      modal.hide();
      resolve(values);
    });

    modalEl.addEventListener('hidden.bs.modal', () => {
      try { modal.dispose(); } catch { /* ignore */ }
      modalEl.remove();
      // Limpieza defensiva: backdrops huérfanos y estado del body que, si quedan,
      // dejan una capa transparente que impide reabrir el modal.
      if (!document.querySelector('.modal.show')) {
        document.querySelectorAll('.modal-backdrop').forEach((b) => b.remove());
        document.body.classList.remove('modal-open');
        document.body.style.removeProperty('overflow');
        document.body.style.removeProperty('padding-right');
      }
      if (!submitted) resolve(null);
    });

    form.addEventListener('submit', (e) => e.preventDefault());
    modal.show();
  });
}

function buildField(f, inputs, setOptions) {
  const id = `fld_${f.name}`;
  const col = h('div', { class: f.colClass || 'col-12' });

  if (f.type === 'checkbox') {
    const input = h('input', { class: 'form-check-input', type: 'checkbox', id, checked: !!f.value });
    inputs[f.name] = input;
    col.append(h('div', { class: 'form-check mt-2' }, [
      input, h('label', { class: 'form-check-label', for: id }, f.label),
    ]));
    if (f.help) col.append(h('div', { class: 'form-text' }, f.help));
    return col;
  }

  // Select con buscador: para listas largas (productos) donde un <select> obliga
  // a scrollear cientos de opciones. Se escribe parte del nombre y se elige.
  if (f.type === 'searchselect') {
    const labelBuscador = h('label', { class: 'form-label', for: `${id}_texto` }, [
      f.label, f.required ? h('span', { class: 'text-danger' }, ' *') : null,
    ]);
    const { wrap, hidden } = buildSearchSelect(f, id);
    inputs[f.name] = hidden;
    const help = f.help ? h('div', { class: 'form-text' }, f.help) : null;
    for (const node of [labelBuscador, wrap, help]) if (node) col.append(node);
    return col;
  }

  const label = h('label', { class: 'form-label', for: id }, [
    f.label, f.required ? h('span', { class: 'text-danger' }, ' *') : null,
  ]);
  let input;
  if (f.type === 'multiselect') {
    input = h('select', { class: 'form-select', id, multiple: true, size: Math.min(6, (f.options || []).length || 3) },
      (f.options || []).map((o) => h('option', {
        value: String(o.value),
        selected: Array.isArray(f.value) && f.value.map(String).includes(String(o.value)),
      }, o.label)));
  } else if (f.type === 'checkboxgroup') {
    const opts = f.options || [];
    const boxes = opts.map((o, i) => {
      const cbId = `${id}_${i}`;
      return h('div', { class: 'form-check' }, [
        h('input', {
          class: 'form-check-input', type: 'checkbox', id: cbId, value: String(o.value),
          checked: Array.isArray(f.value) && f.value.map(String).includes(String(o.value)),
        }),
        h('label', { class: 'form-check-label', for: cbId }, o.label),
      ]);
    });
    const list = h('div', { class: 'border rounded p-2 sk-checkgroup', style: { maxHeight: '220px', overflowY: 'auto' } }, boxes);

    // "Seleccionar todas" (solo si hay mas de una opcion)
    let allWrap = null;
    if (opts.length > 1) {
      const allId = `${id}_all`;
      const allBox = h('input', { class: 'form-check-input', type: 'checkbox', id: allId });
      allBox.addEventListener('change', () => {
        list.querySelectorAll('input[type=checkbox]').forEach((cb) => { cb.checked = allBox.checked; });
      });
      list.addEventListener('change', () => {
        const all = list.querySelectorAll('input[type=checkbox]');
        const marcadas = list.querySelectorAll('input[type=checkbox]:checked');
        allBox.checked = all.length > 0 && all.length === marcadas.length;
      });
      allWrap = h('div', { class: 'form-check mb-2 border-bottom pb-2' }, [
        allBox, h('label', { class: 'form-check-label fw-semibold', for: allId }, 'Seleccionar todas'),
      ]);
    }

    inputs[f.name] = list;
    const help = f.help ? h('div', { class: 'form-text' }, f.help) : null;
    for (const node of [label, allWrap, list, help]) if (node) col.append(node);
    return col;
  } else if (f.type === 'tags') {
    input = h('input', { class: 'form-control', id, type: 'text',
      value: Array.isArray(f.value) ? f.value.join(', ') : (f.value ?? ''),
      placeholder: f.placeholder || 'Separar con comas' });
  } else if (f.type === 'image') {
    const preview = h('img', { src: f.value || '', class: f.value ? 'mt-2 rounded border' : 'd-none',
      style: { maxHeight: '90px' } });
    const hidden = h('input', { type: 'hidden', id, value: f.value || '' });
    const file = h('input', { class: 'form-control', type: 'file', accept: 'image/png,image/jpeg' });
    file.addEventListener('change', () => {
      const f0 = file.files[0];
      if (!f0) return;
      const reader = new FileReader();
      reader.onload = (e) => { hidden.value = e.target.result; preview.src = e.target.result; preview.classList.remove('d-none'); };
      reader.readAsDataURL(f0);
    });
    inputs[f.name] = hidden;
    col.append(label, file, preview);
    return col;
  } else if (f.type === 'select') {
    input = h('select', { class: 'form-select', id }, [
      f.placeholder ? h('option', { value: '' }, f.placeholder) : null,
      ...(f.options || []).map((o) => h('option', { value: String(o.value), selected: String(o.value) === String(f.value ?? '') }, o.label)),
    ]);
    if (typeof f.onChange === 'function') {
      input.addEventListener('change', () => f.onChange(input.value, { setOptions }));
    }
  } else if (f.type === 'textarea') {
    input = h('textarea', { class: 'form-control', id, rows: f.rows || 3 }, f.value ?? '');
  } else {
    input = h('input', {
      class: 'form-control', id, type: f.type || 'text',
      value: f.value ?? '', min: f.min, step: f.step, placeholder: f.placeholder || '',
      autocomplete: f.autocomplete ?? (f.type === 'password' ? 'new-password' : 'off'),
    });
  }
  inputs[f.name] = input;
  const help = f.help ? h('div', { class: 'form-text' }, f.help) : null;
  for (const node of [label, input, help]) if (node) col.append(node);
  return col;
}

const MAX_SUGERENCIAS = 50;

/** Quita acentos y mayusculas para que "cafe" encuentre "CAFÉ". */
function normalizar(texto) {
  return String(texto ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Combobox con buscador. Devuelve { wrap, hidden }: el input oculto guarda el
 * value de la opcion elegida (vacio mientras no se elija ninguna).
 */
function buildSearchSelect(f, id) {
  const opciones = (f.options || []).map((o) => ({ ...o, busqueda: normalizar(o.label) }));
  const elegida = opciones.find((o) => String(o.value) === String(f.value ?? ''));

  const hidden = h('input', { type: 'hidden', id, value: elegida ? String(elegida.value) : '' });
  const texto = h('input', {
    class: 'form-control', type: 'text', id: `${id}_texto`, autocomplete: 'off',
    value: elegida ? elegida.label : '',
    placeholder: f.placeholder || 'Escribí para buscar...',
  });
  const lista = h('div', {
    class: 'list-group position-absolute w-100 shadow d-none',
    style: { zIndex: '1080', maxHeight: '240px', overflowY: 'auto' },
  });
  const wrap = h('div', { class: 'position-relative' }, [texto, hidden, lista]);

  let visibles = [];
  let marcado = -1;

  const cerrar = () => { lista.classList.add('d-none'); marcado = -1; };

  const elegir = (opcion) => {
    hidden.value = String(opcion.value);
    texto.value = opcion.label;
    cerrar();
    if (typeof f.onChange === 'function') f.onChange(hidden.value);
  };

  function pintar() {
    const term = normalizar(texto.value);
    // Si lo que hay escrito es exactamente la opcion elegida, se muestran todas.
    const filtradas = term ? opciones.filter((o) => o.busqueda.includes(term)) : opciones;
    visibles = filtradas.slice(0, MAX_SUGERENCIAS);
    lista.innerHTML = '';

    if (visibles.length === 0) {
      lista.append(h('div', { class: 'list-group-item text-muted small' }, 'Sin resultados'));
    } else {
      visibles.forEach((o, i) => {
        const item = h('button', {
          type: 'button',
          class: `list-group-item list-group-item-action py-2${i === marcado ? ' active' : ''}`,
          // mousedown se dispara antes del blur del input, que cerraria la lista.
          onMousedown: (e) => { e.preventDefault(); elegir(o); },
        }, o.label);
        lista.append(item);
      });
      if (filtradas.length > visibles.length) {
        lista.append(h('div', { class: 'list-group-item text-muted small' },
          `Se muestran ${visibles.length} de ${filtradas.length}. Seguí escribiendo para afinar.`));
      }
    }
    lista.classList.remove('d-none');
  }

  texto.addEventListener('input', () => {
    hidden.value = ''; // mientras no se elija de la lista, no hay seleccion valida
    marcado = -1;
    pintar();
  });
  texto.addEventListener('focus', () => { marcado = -1; pintar(); });
  texto.addEventListener('blur', () => {
    cerrar();
    // Texto suelto sin seleccion: se limpia para no dejar un nombre que no existe.
    if (!hidden.value) texto.value = '';
  });
  texto.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (lista.classList.contains('d-none')) { pintar(); return; }
      marcado += e.key === 'ArrowDown' ? 1 : -1;
      if (marcado < 0) marcado = visibles.length - 1;
      if (marcado >= visibles.length) marcado = 0;
      pintar();
      lista.children[marcado]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opcion = visibles[marcado >= 0 ? marcado : 0];
      if (opcion && !lista.classList.contains('d-none')) elegir(opcion);
    } else if (e.key === 'Escape') {
      cerrar();
    }
  });

  return { wrap, hidden };
}

/** Repuebla las casillas de un checkboxgroup (se usa desde setOptions). */
function rebuildCheckgroup(list, options, name) {
  list.innerHTML = '';
  if (!options || options.length === 0) {
    list.append(h('div', { class: 'text-muted small' }, 'Sin opciones disponibles.'));
    return;
  }
  options.forEach((o, i) => {
    const cbId = `fld_${name}_${i}`;
    list.append(h('div', { class: 'form-check' }, [
      h('input', { class: 'form-check-input', type: 'checkbox', id: cbId, value: String(o.value) }),
      h('label', { class: 'form-check-label', for: cbId }, o.label),
    ]));
  });
}

function collectValues(fields, inputs) {
  const values = {};
  for (const f of fields) {
    const el = inputs[f.name];
    if (f.type === 'checkbox') values[f.name] = el.checked;
    else if (f.type === 'searchselect') values[f.name] = el.value === '' ? null : el.value;
    else if (f.type === 'number') values[f.name] = el.value === '' ? null : Number(el.value);
    else if (f.type === 'multiselect') values[f.name] = Array.from(el.selectedOptions).map((o) => o.value);
    else if (f.type === 'checkboxgroup') values[f.name] = Array.from(el.querySelectorAll('input[type=checkbox]:checked')).map((cb) => cb.value);
    else if (f.type === 'tags') values[f.name] = el.value.split(',').map((s) => s.trim()).filter(Boolean);
    else values[f.name] = el.value;
  }
  return values;
}

function checkRequired(fields, values) {
  for (const f of fields) {
    if (!f.required) continue;
    const v = values[f.name];
    const empty = v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
    if (empty) return `El campo "${f.label}" es obligatorio.`;
  }
  return null;
}
