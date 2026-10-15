-- ============================================================================
--  Verificación del esquema
--  Ejecuta este archivo en el SQL Editor para ver qué objetos ya existen.
--  Compara el resultado con lo que debería haber:
--
--    TABLAS   : operaciones, trabajadores, partidas, partida_operaciones,
--               partida_paquetes, registros_trabajo, pagos
--    VISTAS   : v_operacion_uso, v_paquete_operacion_avance, v_paquete_resumen,
--               v_partida_resumen, v_registros_detalle, v_trabajador_resumen
--    FUNCIONES: fn_anular_pago, fn_crear_partida, fn_registrar_pago,
--               fn_registrar_trabajo, fn_set_updated_at
-- ============================================================================

select tipo, objeto
from (
  select 'TABLA' as tipo, table_name as objeto
    from information_schema.tables
   where table_schema = 'public'
     and table_type = 'BASE TABLE'

  union all

  select 'VISTA', table_name
    from information_schema.views
   where table_schema = 'public'

  union all

  select 'FUNCION', p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
) as objetos
order by tipo, objeto;

-- Cantidad de filas por tabla (para saber si ya cargaste el seed).
select 'operaciones' as tabla, count(*) as filas from public.operaciones
union all select 'trabajadores', count(*) from public.trabajadores
union all select 'partidas', count(*) from public.partidas
union all select 'partida_operaciones', count(*) from public.partida_operaciones
union all select 'partida_paquetes', count(*) from public.partida_paquetes
union all select 'registros_trabajo', count(*) from public.registros_trabajo
union all select 'pagos', count(*) from public.pagos
order by tabla;
