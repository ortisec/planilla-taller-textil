/**
 * Planilla por trabajador.
 *
 * Arma un documento limpio con el detalle de lo que hizo el trabajador y lo
 * que se le debe (o se le pagó) y lo muestra en un modal, desde donde se puede
 * descargar en PDF o como imagen (PNG), o imprimir. Nunca se abre otra pestaña.
 *
 * Las librerías de captura (html2canvas-pro y jspdf) se cargan solo cuando el
 * usuario pide una descarga, así no pesan en el resto de la aplicación.
 */

import { soles, precioUnitario, numero, fecha, fechaConDia, hora12, horasTexto, hoyISO } from './format.js';
import { esc, toast } from './ui.js';

/* ------------------------------------------------------------------ helpers */

/**
 * Agrupa el trabajo por día (prendas y horas), del más antiguo al más nuevo.
 */
export function agruparPorDia(prendas = [], horas = []) {
  const dias = new Map();

  const asegurar = (fecha) => {
    if (!dias.has(fecha)) dias.set(fecha, { fecha, prendas: [], horas: [] });
    return dias.get(fecha);
  };

  prendas.forEach((registro) => asegurar(registro.fecha).prendas.push(registro));
  horas.forEach((hora) => asegurar(hora.fecha).horas.push(hora));

  return [...dias.values()]
    .map((dia) => ({
      ...dia,
      prendas: dia.prendas.sort(
        (a, b) =>
          String(a.partida_codigo).localeCompare(String(b.partida_codigo)) ||
          Number(a.paquete_numero) - Number(b.paquete_numero)
      ),
      horas: dia.horas.sort((a, b) => String(a.hora_inicio).localeCompare(String(b.hora_inicio))),
      total: sumaImportes(dia.prendas) + sumaImportes(dia.horas),
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export const sumaImportes = (filas = []) => filas.reduce((s, f) => s + Number(f.subtotal ?? 0), 0);
export const sumaCantidades = (filas = []) => filas.reduce((s, f) => s + Number(f.cantidad ?? 0), 0);
export const sumaMinutos = (filas = []) => filas.reduce((s, f) => s + Number(f.minutos ?? 0), 0);
export const contarDias = (prendas = [], horas = []) =>
  new Set([...prendas.map((r) => r.fecha), ...horas.map((h) => h.fecha)]).size;

/** Nombre de archivo seguro: "planilla-jose-ortiz-2026-10-18". */
export function nombreArchivo(etiqueta, nombre, fechaDocumento = hoyISO()) {
  const limpiar = (texto) =>
    String(texto ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

  return [limpiar(etiqueta), limpiar(nombre), fechaDocumento].filter(Boolean).join('-');
}

/* --------------------------------------------------------------- documento */

/**
 * Devuelve el HTML del documento (colores en hexadecimal, sin utilidades de
 * Tailwind, para que la captura a imagen/PDF salga siempre igual).
 */
export function renderDocumento({
  tituloDocumento = 'Planilla de trabajo',
  subtitulo = 'Control de producción',
  trabajador = '',
  documento = null,
  prendas = [],
  horas = [],
  etiquetaTotal = 'Total a pagar',
  notas = null,
  emitido = hoyISO(),
  firmas = true,
}) {
  const dias = agruparPorDia(prendas, horas);
  const total = sumaImportes(prendas) + sumaImportes(horas);
  const totalPrendas = sumaCantidades(prendas);
  const totalMinutos = sumaMinutos(horas);
  const periodo = dias.length
    ? `${fecha(dias[0].fecha)} → ${fecha(dias[dias.length - 1].fecha)}`
    : '—';

  const tablaPrendas = (dia) =>
    dia.prendas.length === 0
      ? ''
      : `
        <table>
          <thead>
            <tr>
              <th>Operación</th>
              <th>Partida</th>
              <th>Paquete</th>
              <th class="c">Cant.</th>
              <th class="c">P. unit.</th>
              <th class="r">Importe</th>
            </tr>
          </thead>
          <tbody>
            ${dia.prendas
              .map(
                (r) => `
              <tr>
                <td>${esc(r.operacion)}</td>
                <td>${esc(r.partida_codigo)}</td>
                <td>Paquete ${esc(r.paquete_numero)} · ${esc(r.paquete_talla)}</td>
                <td class="c">${esc(numero(r.cantidad))}</td>
                <td class="c">${esc(precioUnitario(r.precio_unitario))}</td>
                <td class="r">${esc(soles(r.subtotal))}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>`;

  const tablaHoras = (dia) =>
    dia.horas.length === 0
      ? ''
      : `
        <table>
          <thead>
            <tr>
              <th>Horario</th>
              <th class="c">Horas</th>
              <th class="c">Pago por hora</th>
              <th class="r">Importe</th>
            </tr>
          </thead>
          <tbody>
            ${dia.horas
              .map(
                (h) => `
              <tr>
                <td>${esc(hora12(h.hora_inicio))} – ${esc(hora12(h.hora_fin))}${
                  h.notas ? ` · ${esc(h.notas)}` : ''
                }</td>
                <td class="c">${esc(horasTexto(h.minutos))}</td>
                <td class="c">${esc(soles(h.tarifa))}</td>
                <td class="r">${esc(soles(h.subtotal))}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>`;

  const bloques = dias
    .map(
      (dia) => `
      <div class="doc-dia" data-corte>
        <div class="doc-dia-cabecera">
          <span>${esc(fechaConDia(dia.fecha))}</span>
          <span>${esc(soles(dia.total))}</span>
        </div>
        ${tablaPrendas(dia)}
        ${tablaHoras(dia)}
      </div>`
    )
    .join('');

  return `
  <div class="planilla-doc">
    <div class="doc-cabecera" data-corte>
      <div class="doc-marca">
        <div class="doc-logo">TT</div>
        <div>
          <div class="doc-titulo">${esc(tituloDocumento)}</div>
          <div class="doc-subtitulo">${esc(subtitulo)}</div>
        </div>
      </div>
      <div class="doc-emitido">
        Emitido el<br /><strong>${esc(fecha(emitido))}</strong>
      </div>
    </div>

    <div class="doc-datos" data-corte>
      <div class="doc-dato">
        <span>Trabajador</span>
        <strong>${esc(trabajador)}</strong>
      </div>
      ${
        documento
          ? `<div class="doc-dato"><span>Documento</span><strong>${esc(documento)}</strong></div>`
          : ''
      }
      <div class="doc-dato">
        <span>Periodo</span>
        <strong>${esc(periodo)}</strong>
      </div>
      <div class="doc-dato">
        <span>Días trabajados</span>
        <strong>${esc(numero(contarDias(prendas, horas)))}</strong>
      </div>
      <div class="doc-dato">
        <span>Prendas</span>
        <strong>${esc(numero(totalPrendas))}</strong>
      </div>
      ${
        totalMinutos > 0
          ? `<div class="doc-dato"><span>Horas</span><strong>${esc(horasTexto(totalMinutos))}</strong></div>`
          : ''
      }
    </div>

    ${bloques || '<p class="doc-vacio">No hay trabajo registrado en este periodo.</p>'}

    <div class="doc-totales" data-corte>
      <div>
        <div class="doc-total-etiqueta">${esc(etiquetaTotal)}</div>
        <div class="doc-total-detalle">
          ${esc(numero(contarDias(prendas, horas)))} día(s) · ${esc(numero(totalPrendas))} prenda(s) · ${esc(
            numero(prendas.length)
          )} operación(es)${totalMinutos > 0 ? ` · ${esc(horasTexto(totalMinutos))}` : ''}
        </div>
      </div>
      <div class="doc-monto">${esc(soles(total))}</div>
    </div>

    ${
      notas
        ? `<div class="doc-notas" data-corte><span>Observaciones</span><p>${esc(notas)}</p></div>`
        : ''
    }

    ${
      firmas
        ? `<div class="doc-firmas" data-corte>
            <div class="doc-firma">Recibí conforme</div>
            <div class="doc-firma">Administración</div>
          </div>`
        : ''
    }

    <div class="doc-pie">Documento generado el ${esc(fecha(emitido))}</div>
  </div>`;
}

/* ------------------------------------------------------------- descargas */

/**
 * Captura el documento como canvas usando html-to-image.
 *
 * html-to-image no interpreta los colores: clona el nodo con los estilos ya
 * calculados, los mete en un SVG y deja que el navegador lo dibuje. Así
 * funciona igual con los colores modernos (oklch, color-mix) de Tailwind v4.
 *
 * El clon se monta en un contenedor neutro (fuera de pantalla, sin scroll) para
 * que ningún contenedor lo recorte, y se devuelven también los puntos de corte
 * por día, medidos sobre el clon que se dibuja.
 */
async function capturar(nodo) {
  const { toCanvas } = await import('html-to-image');

  const contenedor = document.createElement('div');
  contenedor.setAttribute('aria-hidden', 'true');
  contenedor.style.cssText =
    'position:absolute;top:0;left:-100000px;width:760px;background:#ffffff;';

  const clon = nodo.cloneNode(true);
  contenedor.appendChild(clon);
  document.body.appendChild(contenedor);

  try {
    const rect = clon.getBoundingClientRect();
    const alto = Math.max(rect.height, 1);

    // Suficiente nitidez (~200 dpi en A4) sin pasarse del tamaño máximo de
    // canvas del navegador ni del peso del archivo.
    const pixelRatio = Math.max(1, Math.min(2, 15000 / alto));

    const canvas = await toCanvas(clon, {
      pixelRatio,
      backgroundColor: '#ffffff',
      skipFonts: true, // solo se usan fuentes del sistema
      cacheBust: true,
    });

    const factor = canvas.width / Math.max(rect.width, 1);
    const cortes = [...clon.querySelectorAll('[data-corte]')]
      .map((bloque) => Math.round((bloque.getBoundingClientRect().bottom - rect.top) * factor))
      .filter((corte) => corte > 0 && corte < canvas.height);

    return { canvas, cortes };
  } finally {
    contenedor.remove();
  }
}

function descargarDataUrl(dataUrl, nombre) {
  const enlace = document.createElement('a');
  enlace.href = dataUrl;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
}

/** Genera un PDF A4 cortando el documento por días (varias páginas si hace falta). */
async function descargarPdf(canvas, cortes, nombre) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

  const margen = 8;
  const anchoPagina = pdf.internal.pageSize.getWidth();
  const altoPagina = pdf.internal.pageSize.getHeight();
  const anchoContenido = anchoPagina - margen * 2;
  const altoContenido = altoPagina - margen * 2;
  const pxPorMm = canvas.width / anchoContenido;

  const limites = [...cortes, canvas.height].sort((a, b) => a - b);
  const altoPaginaPx = Math.floor(altoContenido * pxPorMm);

  const paginas = [];
  let inicio = 0;
  let ultimo = 0;

  for (const corte of limites) {
    while (corte - inicio > altoPaginaPx) {
      const fin = ultimo > inicio ? ultimo : Math.min(inicio + altoPaginaPx, canvas.height);
      paginas.push([inicio, fin]);
      inicio = fin;
      if (paginas.length > 60) break;
    }
    ultimo = corte;
  }
  if (inicio < canvas.height) paginas.push([inicio, canvas.height]);

  paginas.forEach(([desde, hasta], indice) => {
    const alto = hasta - desde;
    if (alto <= 0) return;

    const trozo = document.createElement('canvas');
    trozo.width = canvas.width;
    trozo.height = alto;
    const ctx = trozo.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, trozo.width, trozo.height);
    ctx.drawImage(canvas, 0, desde, canvas.width, alto, 0, 0, canvas.width, alto);

    if (indice > 0) pdf.addPage();
    // El PNG se guarda comprimido; sin esto el PDF pesa decenas de MB.
    pdf.addImage(
      trozo.toDataURL('image/png'),
      'PNG',
      margen,
      margen,
      anchoContenido,
      alto / pxPorMm,
      undefined,
      'FAST'
    );
  });

  pdf.save(`${nombre}.pdf`);
}

/* ------------------------------------------------------------------ modal */

/**
 * Imprime solo el documento: se copia en una zona dedicada y el CSS de
 * impresión oculta todo lo demás (app, modal y avisos).
 */
function imprimirDocumento(nodo) {
  const zona = document.createElement('div');
  zona.className = 'zona-impresion';
  zona.appendChild(nodo.cloneNode(true));
  document.body.appendChild(zona);
  document.body.classList.add('imprimiendo-planilla');

  let hecho = false;
  const limpiar = () => {
    if (hecho) return;
    hecho = true;
    window.removeEventListener('afterprint', limpiar);
    document.body.classList.remove('imprimiendo-planilla');
    zona.remove();
  };

  window.addEventListener('afterprint', limpiar);
  setTimeout(() => window.print(), 80); // deja que el navegador aplique los estilos
  setTimeout(limpiar, 60000); // respaldo si el navegador no dispara afterprint
}

const ICONO_CERRAR =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

/**
 * Abre el modal con el documento y conecta las descargas.
 * @param {object} opciones ver renderDocumento() + { titulo, subtituloCabecera, etiquetaArchivo }
 */
export function abrirPlanilla(opciones = {}) {
  const etiqueta = opciones.etiquetaArchivo ?? 'planilla';
  const archivo = nombreArchivo(etiqueta, opciones.trabajador, opciones.emitido);

  const fondo = document.createElement('div');
  fondo.className = 'modal-fondo';
  fondo.innerHTML = `
    <div class="modal ancho" role="dialog" aria-modal="true" aria-label="${esc(opciones.titulo ?? 'Planilla')}">
      <div class="modal-cabecera">
        <div class="fila separado">
          <div>
            <strong>${esc(opciones.titulo ?? 'Planilla')}</strong>
            <p class="pista">Revisa el detalle y descarga el PDF o la imagen.</p>
          </div>
          <button type="button" class="boton icono" data-cerrar title="Cerrar">${ICONO_CERRAR}</button>
        </div>
      </div>

      <div class="modal-cuerpo planilla-cuerpo">
        ${renderDocumento(opciones)}
      </div>

      <div class="modal-pie">
        <button type="button" class="boton sutil" data-cerrar>Cerrar</button>
        <button type="button" class="boton secundario" data-imprimir>Imprimir</button>
        <button type="button" class="boton secundario" data-imagen>Descargar imagen</button>
        <button type="button" class="boton" data-pdf>Descargar PDF</button>
      </div>
    </div>`;

  const nodo = fondo.querySelector('.planilla-doc');

  const cerrar = () => {
    document.removeEventListener('keydown', alTeclear);
    document.body.classList.remove('imprimiendo-planilla');
    fondo.remove();
  };

  const alTeclear = (evento) => {
    if (evento.key === 'Escape') cerrar();
  };

  async function conBoton(boton, texto, tarea) {
    const contenido = boton.innerHTML;
    boton.disabled = true;
    boton.textContent = texto;

    try {
      await tarea();
    } catch (error) {
      console.error('[planilla] no se pudo generar el archivo', error);
      toast(
        'No se pudo generar el archivo. Usa el botón «Imprimir» y elige "Guardar como PDF".',
        'error',
        9000
      );
    } finally {
      boton.disabled = false;
      boton.innerHTML = contenido;
    }
  }

  fondo.querySelectorAll('[data-cerrar]').forEach((boton) => boton.addEventListener('click', cerrar));
  fondo.addEventListener('click', (evento) => {
    if (evento.target === fondo) cerrar();
  });
  document.addEventListener('keydown', alTeclear);

  const botonImagen = fondo.querySelector('[data-imagen]');
  botonImagen.addEventListener('click', () =>
    conBoton(botonImagen, 'Generando…', async () => {
      const { canvas } = await capturar(nodo);
      descargarDataUrl(canvas.toDataURL('image/png'), `${archivo}.png`);
      toast('Imagen descargada.', 'exito');
    })
  );

  const botonPdf = fondo.querySelector('[data-pdf]');
  botonPdf.addEventListener('click', () =>
    conBoton(botonPdf, 'Generando…', async () => {
      const { canvas, cortes } = await capturar(nodo);
      await descargarPdf(canvas, cortes, archivo);
      toast('PDF descargado.', 'exito');
    })
  );

  const botonImprimir = fondo.querySelector('[data-imprimir]');
  botonImprimir.addEventListener('click', () => imprimirDocumento(nodo));

  document.body.appendChild(fondo);
  botonPdf.focus();

  return { cerrar };
}
