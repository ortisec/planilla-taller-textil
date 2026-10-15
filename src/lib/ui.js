/**
 * Pequeñas utilidades de interfaz: selectores, avisos (toast),
 * diálogo de confirmación y estado de botones.
 */

export const qs = (selector, raiz = document) => raiz.querySelector(selector);
export const qsa = (selector, raiz = document) => Array.from(raiz.querySelectorAll(selector));

/** Escapa texto para insertarlo de forma segura dentro de HTML. */
export function esc(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Muestra un aviso flotante. tipo: 'exito' | 'error' | 'aviso' | 'info' */
export function toast(mensaje, tipo = 'info', ms = 3800) {
  let contenedor = qs('#toasts');
  if (!contenedor) {
    contenedor = document.createElement('div');
    contenedor.id = 'toasts';
    contenedor.className = 'toasts';
    document.body.appendChild(contenedor);
  }

  const el = document.createElement('div');
  el.className = `toast ${tipo}`;
  el.textContent = mensaje;
  contenedor.appendChild(el);

  setTimeout(() => {
    el.style.transition = 'opacity .2s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 220);
  }, ms);
}

export const avisoError = (error) => toast(mensajeDeError(error), 'error', 5200);

/** Extrae un mensaje legible de un error desconocido. */
export function mensajeDeError(error) {
  if (!error) return 'Ocurrió un error inesperado.';
  if (typeof error === 'string') return error;
  return error.message || 'Ocurrió un error inesperado.';
}

/**
 * Diálogo de confirmación. Devuelve una promesa que resuelve true/false.
 * Usa el <dialog> nativo si está disponible.
 */
export function confirmar({
  titulo = 'Confirmar acción',
  mensaje = '',
  textoAceptar = 'Confirmar',
  textoCancelar = 'Cancelar',
  peligro = false,
} = {}) {
  return new Promise((resolver) => {
    const fondo = document.createElement('div');
    fondo.className = 'modal-fondo';
    fondo.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-cabecera">${esc(titulo)}</div>
        <div class="modal-cuerpo"><p>${esc(mensaje)}</p></div>
        <div class="modal-pie">
          <button type="button" class="boton secundario" data-cancelar>${esc(textoCancelar)}</button>
          <button type="button" class="boton ${peligro ? 'peligro' : ''}" data-aceptar>${esc(textoAceptar)}</button>
        </div>
      </div>`;

    const cerrar = (resultado) => {
      document.removeEventListener('keydown', alTeclear);
      fondo.remove();
      resolver(resultado);
    };

    const alTeclear = (e) => {
      if (e.key === 'Escape') cerrar(false);
    };

    fondo.querySelector('[data-cancelar]').addEventListener('click', () => cerrar(false));
    fondo.querySelector('[data-aceptar]').addEventListener('click', () => cerrar(true));
    fondo.addEventListener('click', (e) => {
      if (e.target === fondo) cerrar(false);
    });
    document.addEventListener('keydown', alTeclear);
    document.body.appendChild(fondo);
    fondo.querySelector('[data-aceptar]').focus();
  });
}

/** Activa o desactiva el estado "cargando" de un botón (conserva su contenido). */
export function cargando(boton, activo, textoCargando = 'Guardando…') {
  if (!boton) return;
  if (activo) {
    boton.dataset.htmlOriginal = boton.innerHTML;
    boton.disabled = true;
    boton.textContent = textoCargando;
  } else {
    boton.disabled = false;
    if (boton.dataset.htmlOriginal) {
      boton.innerHTML = boton.dataset.htmlOriginal;
      delete boton.dataset.htmlOriginal;
    }
  }
}
