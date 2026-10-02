// Utilidades de interfaz: alertas, confirmaciones, toasts y formateo.
const Swal = window.Swal;

export const ui = {
  toast(message, icon = 'success') {
    Swal.fire({
      toast: true, position: 'top-end', timer: 2600, showConfirmButton: false,
      icon, title: message,
    });
  },
  success(message) { this.toast(message, 'success'); },
  error(message) {
    Swal.fire({ icon: 'error', title: 'Error', text: message });
  },
  info(title, html) { Swal.fire({ icon: 'info', title, html }); },

  async confirm(message, { title = '¿Estas seguro?', confirmText = 'Si, confirmar', cancelText = 'Cancelar', danger = true } = {}) {
    const result = await Swal.fire({
      title, text: message, icon: 'warning',
      showCancelButton: true, confirmButtonText: confirmText, cancelButtonText: cancelText,
      confirmButtonColor: danger ? '#dc2626' : '#2563eb', cancelButtonColor: '#64748b',
    });
    return result.isConfirmed;
  },

  loading(title = 'Procesando...') {
    Swal.fire({ title, allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  },
  close() { Swal.close(); },
};

export const fmt = {
  money(value) {
    const n = Number(value || 0);
    return n.toLocaleString('es-UY', { style: 'currency', currency: 'UYU', minimumFractionDigits: 2 });
  },
  number(value) { return Number(value || 0).toLocaleString('es-UY'); },
  date(value) {
    if (!value) return '-';
    const texto = String(value);
    // "YYYY-MM-DD" a secas lo interpreta el navegador como UTC y, al mostrarlo en
    // hora local (UTC-3), caia un dia antes. Se arma como fecha local.
    const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
    const d = soloFecha
      ? new Date(Number(soloFecha[1]), Number(soloFecha[2]) - 1, Number(soloFecha[3]))
      : new Date(texto.replace(' ', 'T'));
    if (isNaN(d)) return texto;
    return d.toLocaleDateString('es-UY');
  },
  dateTime(value) {
    if (!value) return '-';
    const d = new Date(String(value).replace(' ', 'T'));
    if (isNaN(d)) return String(value);
    return d.toLocaleString('es-UY');
  },
};
