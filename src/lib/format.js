/**
 * Utilidades de formato (moneda, fechas, números).
 * Moneda del taller: soles peruanos (PEN).
 */

export const LOCALE = 'es-PE';
export const MONEDA = 'S/';

/** Formatea un número como soles: 12.5 -> "S/ 12.50" */
export function soles(valor) {
  const n = Number(valor ?? 0);
  return `${MONEDA} ${n.toLocaleString(LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Formatea un número con separadores: 1234 -> "1,234" */
export function numero(valor, decimales = 0) {
  return Number(valor ?? 0).toLocaleString(LOCALE, {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
}

/** Formatea un precio unitario mostrando hasta 4 decimales significativos. */
export function precioUnitario(valor) {
  const n = Number(valor ?? 0);
  return n.toLocaleString(LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

/** '2026-10-14' -> '14/10/2026' (sin desfase de zona horaria). */
export function fecha(valor) {
  if (!valor) return '—';
  const iso = String(valor).slice(0, 10);
  const [a, m, d] = iso.split('-');
  if (!a || !m || !d) return String(valor);
  return `${d}/${m}/${a}`;
}

/** Nombre del mes en español a partir del índice (0-11). */
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** '2026-10-14' -> '14 de octubre de 2026' */
export function fechaLarga(valor) {
  if (!valor) return '—';
  const iso = String(valor).slice(0, 10);
  const [a, m, d] = iso.split('-').map(Number);
  if (!a || !m || !d) return String(valor);
  return `${d} de ${MESES[m - 1]} de ${a}`;
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** '2026-10-14' -> 'miércoles 14 de octubre de 2026' */
export function fechaConDia(valor) {
  if (!valor) return '—';
  const iso = String(valor).slice(0, 10);
  const [a, m, d] = iso.split('-').map(Number);
  if (!a || !m || !d) return String(valor);
  const dia = DIAS[new Date(a, m - 1, d).getDay()];
  return `${dia} ${d} de ${MESES[m - 1]} de ${a}`;
}

/** '2026-10-14' -> 'mié 14 oct' */
export function diaCorto(valor) {
  if (!valor) return '—';
  const iso = String(valor).slice(0, 10);
  const [a, m, d] = iso.split('-').map(Number);
  if (!a || !m || !d) return String(valor);
  const dia = DIAS[new Date(a, m - 1, d).getDay()];
  return `${dia.slice(0, 3)} ${d} ${MESES[m - 1].slice(0, 3)}`;
}

/** Fecha de hoy en formato ISO local (YYYY-MM-DD), sin desfase UTC. */
export function hoyISO(base = new Date()) {
  const local = new Date(base.getTime() - base.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/** Suma (o resta) días a una fecha ISO y devuelve ISO. */
export function sumarDias(iso, dias) {
  const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  const f = new Date(a, m - 1, d);
  f.setDate(f.getDate() + dias);
  return hoyISO(f);
}

/** Primer día del mes actual en ISO. */
export function inicioDeMes(base = new Date()) {
  return hoyISO(new Date(base.getFullYear(), base.getMonth(), 1));
}

/** Texto legible del estado de una partida. */
export function estadoPartida(estado) {
  const mapa = {
    en_proceso: 'En proceso',
    terminada: 'Terminada',
    anulada: 'Anulada',
  };
  return mapa[estado] ?? estado ?? '—';
}

/** Clase de color asociada al estado de la partida. */
export function claseEstadoPartida(estado) {
  const mapa = {
    en_proceso: 'info',
    terminada: 'exito',
    anulada: 'peligro',
  };
  return mapa[estado] ?? '';
}

/* --------------------------------------------------------------- horas */

/** '14:30:00' -> '2:30 pm' */
export function hora12(valor) {
  if (!valor) return '—';
  const [h, m] = String(valor).split(':').map(Number);
  if (Number.isNaN(h)) return String(valor);
  const sufijo = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m ?? 0).padStart(2, '0')} ${sufijo}`;
}

/** 270 -> '4 h 30 min' */
export function horasTexto(minutos) {
  const total = Number(minutos) || 0;
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

/** '08:00' -> minutos desde medianoche (para calcular la duración). */
export function minutosDeHora(valor) {
  if (!valor) return 0;
  const [h, m] = String(valor).split(':').map(Number);
  return (Number(h) || 0) * 60 + (Number(m) || 0);
}

/* ------------------------------------------------------- semana del taller */

/**
 * La semana del taller va de sábado a viernes y se paga el sábado siguiente.
 * Devuelve el sábado que inicia la semana a la que pertenece la fecha.
 */
export function inicioSemana(valor) {
  const iso = String(valor).slice(0, 10);
  const [a, m, d] = iso.split('-').map(Number);
  if (!a || !m || !d) return iso;
  const fecha = new Date(a, m - 1, d);
  fecha.setDate(fecha.getDate() - ((fecha.getDay() + 1) % 7));
  return hoyISO(fecha);
}

/** Viernes en que termina la semana de esa fecha. */
export function finSemana(valor) {
  return sumarDias(inicioSemana(valor), 6);
}

/** Sábado en que se paga la semana de esa fecha. */
export function diaDePago(valor) {
  return sumarDias(inicioSemana(valor), 7);
}

/** '10/10/2026 al 16/10/2026' */
export function etiquetaSemana(valor) {
  const inicio = inicioSemana(valor);
  return `${fecha(inicio)} al ${fecha(sumarDias(inicio, 6))}`;
}

/** '10–16 oct' (para gráficos) */
export function etiquetaSemanaCorta(valor) {
  const inicio = inicioSemana(valor);
  const fin = sumarDias(inicio, 6);
  const mes = MESES[Number(inicio.slice(5, 7)) - 1] ?? '';
  return `${inicio.slice(8, 10)}–${fin.slice(8, 10)} ${mes.slice(0, 3)}`;
}
