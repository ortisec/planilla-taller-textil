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
