/**
 * Capa de acceso a datos. Todas las páginas hablan con Supabase a través de
 * estas funciones para mantener una sola convención de nombres y errores.
 */

import { supabase } from './supabase.js';

// --------------------------------------------------------------- utilidades

function traducirError(error) {
  const mensaje = error?.message ?? '';
  const codigo = error?.code;

  if (codigo === '23505' || /duplicate key/i.test(mensaje)) {
    if (/partidas_codigo_key/i.test(mensaje)) return 'Ya existe una partida con ese número.';
    if (/partida_operaciones_unica/i.test(mensaje)) return 'Esa operación ya está en la lista de esta partida.';
    if (/partida_paquetes_unico/i.test(mensaje)) return 'Ese número de paquete ya existe en la partida.';
    if (/operaciones_nombre_key/i.test(mensaje)) return 'Ya existe una operación con ese nombre en el catálogo.';
    if (/trabajadores_nombre_doc_idx/i.test(mensaje)) return 'Ya existe un trabajador con ese nombre y documento.';
    return 'Ya existe un registro con esos datos.';
  }
  if (codigo === '23503' || /foreign key/i.test(mensaje)) {
    return 'No se puede completar: hay registros relacionados.';
  }
  if (codigo === '23514' || /check constraint/i.test(mensaje)) {
    return 'Alguno de los valores no es válido (revisa cantidades y precios).';
  }
  if (codigo === 'P0001' || codigo === 'P0002') return mensaje; // excepciones lanzadas por nuestras funciones
  if (/Failed to fetch|NetworkError|fetch failed|Load failed/i.test(mensaje)) {
    return 'No se pudo conectar con Supabase. Verifica tu conexión y las credenciales del .env.';
  }
  return mensaje || 'Ocurrió un error inesperado.';
}

/** Error con el SQLSTATE original para poder reaccionar a casos concretos. */
export class ErrorApi extends Error {
  constructor(mensaje, codigo) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.codigo = codigo ?? null;
  }
}

function unwrap({ data, error }) {
  if (error) throw new ErrorApi(traducirError(error), error.code);
  return data;
}

const aNumero = (valor) => (valor === '' || valor === null || valor === undefined ? null : Number(valor));

// --------------------------------------------------------------- partidas

/** Todas las partidas con su resumen económico. */
export async function listarPartidas() {
  return unwrap(
    await supabase
      .from('v_partida_resumen')
      .select('*')
      .order('fecha', { ascending: false })
      .order('codigo', { ascending: false })
  );
}

export async function obtenerPartida(id) {
  return unwrap(await supabase.from('v_partida_resumen').select('*').eq('id', id).maybeSingle());
}

/**
 * Crea una partida con sus operaciones y paquetes en una sola transacción.
 * @param {{codigo:string, descripcion?:string, cliente?:string, fecha?:string,
 *          notas?:string, operaciones:Array, paquetes:Array}} datos
 */
export async function crearPartida(datos) {
  return unwrap(
    await supabase.rpc('fn_crear_partida', {
      p_codigo: datos.codigo,
      p_descripcion: datos.descripcion ?? null,
      p_cliente: datos.cliente ?? null,
      p_fecha: datos.fecha ?? new Date().toISOString().slice(0, 10),
      p_operaciones: datos.operaciones ?? [],
      p_paquetes: datos.paquetes ?? [],
      p_notas: datos.notas ?? null,
    })
  );
}

export async function actualizarPartida(id, cambios) {
  return unwrap(await supabase.from('partidas').update(cambios).eq('id', id).select().single());
}

export async function eliminarPartida(id) {
  return unwrap(await supabase.from('partidas').delete().eq('id', id));
}

// --------------------------------------------------- operaciones de partida

export async function listarPartidaOperaciones(partidaId) {
  return unwrap(
    await supabase
      .from('partida_operaciones')
      .select('*')
      .eq('partida_id', partidaId)
      .order('orden', { ascending: true })
      .order('nombre', { ascending: true })
  );
}

export async function crearPartidaOperacion(partidaId, { nombre, precio, operacion_id = null }) {
  const { data: ultimo } = await supabase
    .from('partida_operaciones')
    .select('orden')
    .eq('partida_id', partidaId)
    .order('orden', { ascending: false })
    .limit(1)
    .maybeSingle();

  return unwrap(
    await supabase
      .from('partida_operaciones')
      .insert({
        partida_id: partidaId,
        nombre: nombre.trim(),
        precio: aNumero(precio) ?? 0,
        operacion_id,
        orden: (ultimo?.orden ?? 0) + 1,
      })
      .select()
      .single()
  );
}

export async function actualizarPartidaOperacion(id, cambios) {
  const limpio = { ...cambios };
  if ('precio' in limpio) limpio.precio = aNumero(limpio.precio) ?? 0;
  return unwrap(await supabase.from('partida_operaciones').update(limpio).eq('id', id).select().single());
}

export async function eliminarPartidaOperacion(id) {
  return unwrap(await supabase.from('partida_operaciones').delete().eq('id', id));
}

/** Importa al catálogo de la partida las operaciones que todavía no tiene. */
export async function importarCatalogoApartida(partidaId) {
  const [catalogo, actuales] = await Promise.all([
    listarCatalogo(),
    listarPartidaOperaciones(partidaId),
  ]);

  const nombresActuales = new Set(actuales.map((o) => o.nombre.toLowerCase()));
  const nuevos = catalogo
    .filter((o) => o.activa && !nombresActuales.has(o.nombre.toLowerCase()))
    .map((o, i) => ({
      partida_id: partidaId,
      operacion_id: o.id,
      nombre: o.nombre,
      precio: o.precio_base,
      orden: actuales.length + i + 1,
    }));

  if (nuevos.length === 0) return [];
  return unwrap(await supabase.from('partida_operaciones').insert(nuevos).select());
}

// ------------------------------------------------------------- paquetes

export async function listarPaquetes(partidaId) {
  return unwrap(
    await supabase
      .from('v_paquete_resumen')
      .select('*')
      .eq('partida_id', partidaId)
      .order('numero', { ascending: true })
  );
}

/**
 * Avance de un paquete operación por operación: cuántas prendas ya se
 * registraron (realizadas) y cuántas faltan (pendientes).
 */
export async function listarAvancePaquete(paqueteId) {
  return unwrap(
    await supabase
      .from('v_paquete_operacion_avance')
      .select('*')
      .eq('paquete_id', paqueteId)
      .order('orden', { ascending: true })
      .order('operacion', { ascending: true })
  );
}

export async function crearPaquete(partidaId, { numero, talla, cantidad }) {
  return unwrap(
    await supabase
      .from('partida_paquetes')
      .insert({
        partida_id: partidaId,
        numero: aNumero(numero) ?? 1,
        talla: String(talla).trim(),
        cantidad: aNumero(cantidad) ?? 1,
      })
      .select()
      .single()
  );
}

export async function crearPaquetes(partidaId, paquetes) {
  const filas = paquetes.map((p) => ({
    partida_id: partidaId,
    numero: aNumero(p.numero) ?? 1,
    talla: String(p.talla).trim(),
    cantidad: aNumero(p.cantidad) ?? 1,
  }));
  return unwrap(await supabase.from('partida_paquetes').insert(filas).select());
}

export async function actualizarPaquete(id, cambios) {
  const limpio = { ...cambios };
  if ('numero' in limpio) limpio.numero = aNumero(limpio.numero) ?? 1;
  if ('cantidad' in limpio) limpio.cantidad = aNumero(limpio.cantidad) ?? 1;
  if ('talla' in limpio) limpio.talla = String(limpio.talla).trim();
  return unwrap(await supabase.from('partida_paquetes').update(limpio).eq('id', id).select().single());
}

export async function eliminarPaquete(id) {
  return unwrap(await supabase.from('partida_paquetes').delete().eq('id', id));
}

// ------------------------------------------------------- catálogo base

export async function listarCatalogo() {
  const [operaciones, uso] = await Promise.all([
    supabase.from('operaciones').select('*').order('nombre'),
    supabase.from('v_operacion_uso').select('*'),
  ]);

  const filas = unwrap(operaciones);
  const usos = new Map(unwrap(uso).map((f) => [f.operacion_id, f.usos]));

  return filas.map((o) => ({ ...o, usos: usos.get(o.id) ?? 0 }));
}

export async function crearOperacionCatalogo({ nombre, precio_base }) {
  return unwrap(
    await supabase
      .from('operaciones')
      .insert({ nombre: nombre.trim(), precio_base: aNumero(precio_base) ?? 0 })
      .select()
      .single()
  );
}

export async function actualizarOperacionCatalogo(id, cambios) {
  const limpio = { ...cambios };
  if ('precio_base' in limpio) limpio.precio_base = aNumero(limpio.precio_base) ?? 0;
  return unwrap(await supabase.from('operaciones').update(limpio).eq('id', id).select().single());
}

export async function eliminarOperacionCatalogo(id) {
  return unwrap(await supabase.from('operaciones').delete().eq('id', id));
}

// ----------------------------------------------------------- trabajadores

export async function listarTrabajadores({ soloActivos = false } = {}) {
  let consulta = supabase.from('trabajadores').select('*').order('nombre');
  if (soloActivos) consulta = consulta.eq('activo', true);
  return unwrap(await consulta);
}

/** Trabajadores con totales de registrado / pagado / pendiente. */
export async function listarTrabajadoresResumen() {
  return unwrap(await supabase.from('v_trabajador_resumen').select('*').order('nombre'));
}

export async function crearTrabajador({ nombre, documento, telefono }) {
  return unwrap(
    await supabase
      .from('trabajadores')
      .insert({ nombre: nombre.trim(), documento: documento ?? null, telefono: telefono ?? null })
      .select()
      .single()
  );
}

export async function actualizarTrabajador(id, cambios) {
  return unwrap(await supabase.from('trabajadores').update(cambios).eq('id', id).select().single());
}

export async function eliminarTrabajador(id) {
  return unwrap(await supabase.from('trabajadores').delete().eq('id', id));
}

// --------------------------------------------------- registros de trabajo

/**
 * Registra el trabajo de un trabajador en un paquete. El precio de cada
 * operación se toma automáticamente de la lista de la partida.
 *
 * Si alguna cantidad supera lo pendiente del paquete, Supabase responde con
 * `error.codigo === 'P0002'`; la app avisa al usuario y, si confirma, vuelve a
 * llamar con `permitirExceso: true`.
 *
 * @param {{fecha:string, trabajadorId:string, partidaId:string, paqueteId:string,
 *          lineas:Array<{partida_operacion_id:string, cantidad:number}>, notas?:string}} datos
 * @param {{permitirExceso?: boolean}} opciones
 */
export async function registrarTrabajo(datos, { permitirExceso = false } = {}) {
  const lineas = (datos.lineas ?? []).filter((l) => Number(l.cantidad) > 0);
  if (lineas.length === 0) throw new Error('Ingresa al menos una cantidad mayor a cero.');

  return unwrap(
    await supabase.rpc('fn_registrar_trabajo', {
      p_fecha: datos.fecha,
      p_trabajador_id: datos.trabajadorId,
      p_partida_id: datos.partidaId,
      p_paquete_id: datos.paqueteId,
      p_lineas: lineas.map((l) => ({
        partida_operacion_id: l.partida_operacion_id,
        cantidad: Number(l.cantidad),
      })),
      p_notas: datos.notas ?? null,
      p_permitir_exceso: permitirExceso,
    })
  );
}

/** ¿El error corresponde al control de "más prendas de las pendientes"? */
export function esErrorDeExceso(error) {
  if (!error) return false;
  return error.codigo === 'P0002' || /supera lo pendiente/i.test(error.message ?? '');
}

/** Detalle de registros con filtros opcionales. */
export async function listarRegistros(filtros = {}) {
  let consulta = supabase.from('v_registros_detalle').select('*');

  if (filtros.desde) consulta = consulta.gte('fecha', filtros.desde);
  if (filtros.hasta) consulta = consulta.lte('fecha', filtros.hasta);
  if (filtros.trabajadorId) consulta = consulta.eq('trabajador_id', filtros.trabajadorId);
  if (filtros.partidaId) consulta = consulta.eq('partida_id', filtros.partidaId);
  if (filtros.paqueteId) consulta = consulta.eq('paquete_id', filtros.paqueteId);
  if (filtros.estado === 'pendiente') consulta = consulta.is('pago_id', null);
  if (filtros.estado === 'pagado') consulta = consulta.not('pago_id', 'is', null);

  return unwrap(
    await consulta
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(filtros.limite ?? 800)
  );
}

export async function actualizarRegistro(id, cambios) {
  const limpio = { ...cambios };
  if ('cantidad' in limpio) limpio.cantidad = aNumero(limpio.cantidad) ?? 1;
  return unwrap(await supabase.from('registros_trabajo').update(limpio).eq('id', id).select().single());
}

export async function eliminarRegistro(id) {
  return unwrap(await supabase.from('registros_trabajo').delete().eq('id', id));
}

// ------------------------------------------------------------------ pagos

/** Líneas pendientes de pago de un trabajador (para calcular rangos). */
export async function registrosPendientes(trabajadorId) {
  return unwrap(
    await supabase
      .from('v_registros_detalle')
      .select('*')
      .eq('trabajador_id', trabajadorId)
      .is('pago_id', null)
      .order('fecha', { ascending: true })
  );
}

/** Crea el pago del trabajo pendiente en el rango y lo marca como pagado. */
export async function registrarPago({ trabajadorId, desde, hasta, fechaPago, notas }) {
  return unwrap(
    await supabase.rpc('fn_registrar_pago', {
      p_trabajador_id: trabajadorId,
      p_desde: desde,
      p_hasta: hasta,
      p_fecha_pago: fechaPago ?? new Date().toISOString().slice(0, 10),
      p_notas: notas ?? null,
    })
  );
}

export async function listarPagos(filtros = {}) {
  let consulta = supabase
    .from('pagos')
    .select('id, trabajador_id, fecha_inicio, fecha_fin, fecha_pago, monto, notas, created_at, trabajadores (nombre, documento)');

  if (filtros.trabajadorId) consulta = consulta.eq('trabajador_id', filtros.trabajadorId);
  if (filtros.desde) consulta = consulta.gte('fecha_pago', filtros.desde);
  if (filtros.hasta) consulta = consulta.lte('fecha_pago', filtros.hasta);

  return unwrap(await consulta.order('fecha_pago', { ascending: false }).order('created_at', { ascending: false }));
}

export async function obtenerPago(id) {
  return unwrap(
    await supabase
      .from('pagos')
      .select('id, trabajador_id, fecha_inicio, fecha_fin, fecha_pago, monto, notas, created_at, trabajadores (nombre, documento)')
      .eq('id', id)
      .maybeSingle()
  );
}

/** Líneas incluidas en un pago. */
export async function lineasDePago(pagoId) {
  return unwrap(
    await supabase
      .from('v_registros_detalle')
      .select('*')
      .eq('pago_id', pagoId)
      .order('fecha', { ascending: true })
  );
}

export async function anularPago(pagoId) {
  return unwrap(await supabase.rpc('fn_anular_pago', { p_pago_id: pagoId }));
}

// --------------------------------------------------------------- tablero

/** Datos agregados para el tablero principal. */
export async function resumenTablero() {
  const [partidas, trabajadores, pagos] = await Promise.all([
    listarPartidas(),
    listarTrabajadoresResumen(),
    listarPagos({}),
  ]);

  const activas = partidas.filter((p) => p.estado === 'en_proceso');
  const total = (lista, campo) => lista.reduce((suma, fila) => suma + Number(fila[campo] ?? 0), 0);

  return {
    partidas,
    trabajadores,
    pagos,
    kpis: {
      partidasActivas: activas.length,
      prendasEnProceso: total(activas, 'total_prendas'),
      totalPartidas: partidas.length,
      manoObraRegistrada: total(partidas, 'monto_registrado'),
      pendientePorPagar: total(trabajadores, 'monto_pendiente'),
      pagadoHistorico: total(trabajadores, 'monto_pagado'),
    },
  };
}
