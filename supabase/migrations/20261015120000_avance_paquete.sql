-- ============================================================================
--  Control de avance por paquete y operación
--  ---------------------------------------------------------------------------
--  Evita pagar dos veces por la misma prenda:
--   * v_paquete_operacion_avance  -> cuántas prendas ya se registraron por
--     operación en cada paquete y cuántas faltan.
--   * fn_registrar_trabajo ahora rechaza (errcode P0002) el registro que
--     supere lo pendiente, salvo que se llame con p_permitir_exceso = true
--     (la app pide confirmación al usuario antes de reintentar).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Avance por paquete + operación
-- ----------------------------------------------------------------------------
create or replace view public.v_paquete_operacion_avance
with (security_invoker = true) as
select
  q.id                                                      as paquete_id,
  q.partida_id                                              as partida_id,
  q.numero                                                  as paquete_numero,
  q.talla                                                   as paquete_talla,
  q.cantidad                                                as cantidad_paquete,
  op.id                                                     as partida_operacion_id,
  op.nombre                                                 as operacion,
  op.precio                                                 as precio,
  op.orden                                                  as orden,
  coalesce(sum(r.cantidad), 0)::int                         as realizadas,
  greatest(q.cantidad - coalesce(sum(r.cantidad), 0), 0)::int as pendientes
from public.partida_paquetes q
join public.partida_operaciones op on op.partida_id = q.partida_id
left join public.registros_trabajo r
  on r.paquete_id = q.id
 and r.partida_operacion_id = op.id
group by q.id, q.partida_id, q.numero, q.talla, q.cantidad, op.id, op.nombre, op.precio, op.orden;

comment on view public.v_paquete_operacion_avance is
  'Avance por paquete y operación: prendas ya registradas (realizadas) y prendas que faltan (pendientes).';

grant select on public.v_paquete_operacion_avance to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Registro de trabajo con validación de exceso
--   Si alguna línea supera las prendas pendientes de esa operación en el
--   paquete, se lanza un error con SQLSTATE P0002 indicando qué operaciones
--   se pasaron. Con p_permitir_exceso = true se registra igualmente (la app
--   lo usa después de que el usuario confirma).
-- ----------------------------------------------------------------------------

-- Se elimina la versión anterior (sin validación) para no dejar sobrecargas.
drop function if exists public.fn_registrar_trabajo(date, uuid, uuid, uuid, jsonb, text);

create or replace function public.fn_registrar_trabajo(
  p_fecha            date,
  p_trabajador_id    uuid,
  p_partida_id       uuid,
  p_paquete_id       uuid,
  p_lineas           jsonb,
  p_notas            text default null,
  p_permitir_exceso  boolean default false
) returns setof uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paquete    partida_paquetes%rowtype;
  v_linea      jsonb;
  v_op         partida_operaciones%rowtype;
  v_cantidad   int;
  v_realizadas int;
  v_reg_id     uuid;
  v_ids        uuid[] := '{}';
  v_excesos    text[] := '{}';
begin
  if p_trabajador_id is null then
    raise exception 'Debes indicar el trabajador';
  end if;

  select * into v_paquete from partida_paquetes where id = p_paquete_id;
  if not found then
    raise exception 'El paquete indicado no existe';
  end if;
  if v_paquete.partida_id <> p_partida_id then
    raise exception 'El paquete no pertenece a la partida indicada';
  end if;

  -- 1) Validación: no se puede registrar más de lo que falta por operación.
  if not p_permitir_exceso then
    for v_linea in select * from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb))
    loop
      v_cantidad := coalesce((v_linea ->> 'cantidad')::int, 0);
      continue when v_cantidad <= 0;

      select * into v_op
      from partida_operaciones
      where id = (v_linea ->> 'partida_operacion_id')::uuid
        and partida_id = p_partida_id;

      if not found then
        raise exception 'La operación indicada no pertenece a la partida';
      end if;

      select coalesce(sum(cantidad), 0)
        into v_realizadas
      from registros_trabajo
      where paquete_id = p_paquete_id
        and partida_operacion_id = v_op.id;

      if v_realizadas + v_cantidad > v_paquete.cantidad then
        v_excesos := array_append(
          v_excesos,
          format(
            '%s (faltan %s de %s prendas)',
            v_op.nombre,
            greatest(v_paquete.cantidad - v_realizadas, 0),
            v_paquete.cantidad
          )
        );
      end if;
    end loop;

    if coalesce(array_length(v_excesos, 1), 0) > 0 then
      raise exception 'La cantidad supera lo pendiente en: %', array_to_string(v_excesos, ', ')
        using errcode = 'P0002';
    end if;
  end if;

  -- 2) Inserción de las líneas con el precio de la partida.
  for v_linea in select * from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb))
  loop
    v_cantidad := coalesce((v_linea ->> 'cantidad')::int, 0);
    continue when v_cantidad <= 0;

    select * into v_op
    from partida_operaciones
    where id = (v_linea ->> 'partida_operacion_id')::uuid
      and partida_id = p_partida_id;

    if not found then
      raise exception 'La operación indicada no pertenece a la partida';
    end if;

    insert into registros_trabajo (
      fecha, trabajador_id, partida_id, paquete_id,
      partida_operacion_id, cantidad, precio_unitario, notas
    ) values (
      p_fecha, p_trabajador_id, p_partida_id, p_paquete_id,
      v_op.id, v_cantidad, v_op.precio, p_notas
    ) returning id into v_reg_id;

    v_ids := array_append(v_ids, v_reg_id);
  end loop;

  return query select unnest(v_ids);
end;
$$;

comment on function public.fn_registrar_trabajo is
  'Registra las operaciones hechas por un trabajador en un paquete. Rechaza (P0002) el exceso sobre lo pendiente salvo que p_permitir_exceso sea true.';

grant execute on function public.fn_registrar_trabajo(date, uuid, uuid, uuid, jsonb, text, boolean) to anon, authenticated;
