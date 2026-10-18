-- ============================================================================
--  Trabajo manual por horas + liquidación semanal
--  ---------------------------------------------------------------------------
--  El taller tiene dos formas de trabajo:
--    * por prendas  -> registros_trabajo (operación + paquete + cantidad)
--    * manual/horas -> registros_horas   (rango horario por día + tarifa/hora)
--
--  La semana del taller va de SÁBADO a VIERNES y se paga el sábado siguiente:
--    sábado 10/10 ... viernes 16/10  ->  se paga el sábado 17/10
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tarifa por hora habitual del trabajador (se puede cambiar en cada registro)
-- ----------------------------------------------------------------------------
alter table public.trabajadores
  add column if not exists tarifa_hora numeric(10, 2);

comment on column public.trabajadores.tarifa_hora is
  'Pago por hora habitual del trabajador (soles). Se usa como valor sugerido al anotar horas.';

-- ----------------------------------------------------------------------------
-- Sábado de la semana a la que pertenece una fecha
-- ----------------------------------------------------------------------------
create or replace function public.fn_sabado_semana(p_fecha date)
returns date
language sql
immutable
as $$
  select p_fecha - ((extract(dow from p_fecha)::int + 1) % 7)
$$;

comment on function public.fn_sabado_semana is
  'Devuelve el sábado que inicia la semana del taller a la que pertenece la fecha.';

-- ----------------------------------------------------------------------------
-- Registros de horas trabajadas
-- ----------------------------------------------------------------------------
create table if not exists public.registros_horas (
  id            uuid primary key default gen_random_uuid(),
  fecha         date not null default current_date,
  trabajador_id uuid not null references public.trabajadores (id) on delete restrict,
  hora_inicio   time not null,
  hora_fin      time not null,
  minutos       integer not null check (minutos > 0 and minutos <= 1440),
  tarifa        numeric(10, 2) not null check (tarifa >= 0),
  horas         numeric(6, 2) generated always as (round(minutos / 60.0, 2)) stored,
  subtotal      numeric(12, 2) generated always as (round(minutos / 60.0 * tarifa, 2)) stored,
  pago_id       uuid references public.pagos (id) on delete set null,
  notas         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint registros_horas_rango check (hora_fin > hora_inicio)
);

comment on table public.registros_horas is
  'Trabajo manual pagado por hora: cada fila es un rango horario de un día (ej. 8:00 a 12:00).';
comment on column public.registros_horas.subtotal is 'minutos / 60 × tarifa.';

create index if not exists registros_horas_fecha_idx on public.registros_horas (fecha);
create index if not exists registros_horas_trabajador_idx on public.registros_horas (trabajador_id, pago_id);

drop trigger if exists trg_registros_horas_updated_at on public.registros_horas;
create trigger trg_registros_horas_updated_at
  before update on public.registros_horas
  for each row execute function public.fn_set_updated_at();

-- ----------------------------------------------------------------------------
-- Semana a la que corresponde cada pago (cuando el rango es una semana exacta)
-- ----------------------------------------------------------------------------
alter table public.pagos
  add column if not exists semana date;

comment on column public.pagos.semana is
  'Sábado de la semana pagada, cuando el rango coincide exactamente con una semana del taller.';

-- ============================================================================
--  Vistas
-- ============================================================================

-- Detalle de horas con el nombre del trabajador y su semana.
create or replace view public.v_horas_detalle
with (security_invoker = true) as
select
  h.id,
  h.fecha,
  h.hora_inicio,
  h.hora_fin,
  h.minutos,
  h.horas,
  h.tarifa,
  h.subtotal,
  h.pago_id,
  (h.pago_id is null) as pendiente,
  h.notas,
  h.created_at,
  t.id     as trabajador_id,
  t.nombre as trabajador,
  public.fn_sabado_semana(h.fecha) as semana
from public.registros_horas h
join public.trabajadores t on t.id = h.trabajador_id;

comment on view public.v_horas_detalle is 'Horas trabajadas con nombre del trabajador y semana.';

-- Resumen semanal del taller (prendas + horas), con lo pagado y lo pendiente.
create or replace view public.v_semana_resumen
with (security_invoker = true) as
with movimientos as (
  select
    public.fn_sabado_semana(r.fecha) as semana,
    r.trabajador_id,
    r.subtotal,
    r.pago_id,
    'prendas'::text as tipo
  from public.registros_trabajo r

  union all

  select
    public.fn_sabado_semana(h.fecha),
    h.trabajador_id,
    h.subtotal,
    h.pago_id,
    'horas'::text
  from public.registros_horas h
)
select
  semana,
  semana + 6                                        as fin_semana,
  semana + 7                                        as fecha_pago,
  count(*)::int                                     as movimientos,
  count(distinct trabajador_id)::int                as trabajadores,
  coalesce(sum(subtotal), 0)::numeric(14, 2)        as total,
  coalesce(sum(subtotal) filter (where pago_id is not null), 0)::numeric(14, 2) as pagado,
  coalesce(sum(subtotal) filter (where pago_id is null), 0)::numeric(14, 2)     as pendiente,
  coalesce(sum(subtotal) filter (where tipo = 'prendas'), 0)::numeric(14, 2)    as total_prendas,
  coalesce(sum(subtotal) filter (where tipo = 'horas'), 0)::numeric(14, 2)      as total_horas
from movimientos
group by semana;

comment on view public.v_semana_resumen is
  'Por semana del taller (sábado a viernes): total producido, pagado y pendiente.';

-- Totales por trabajador (prendas + horas).
drop view if exists public.v_trabajador_resumen;

create view public.v_trabajador_resumen
with (security_invoker = true) as
with movimientos as (
  select trabajador_id, fecha, subtotal, pago_id from public.registros_trabajo
  union all
  select trabajador_id, fecha, subtotal, pago_id from public.registros_horas
)
select
  t.id,
  t.nombre,
  t.documento,
  t.telefono,
  t.activo,
  t.tarifa_hora,
  coalesce(r.monto_total, 0)::numeric(14, 2)     as monto_total,
  coalesce(r.monto_pagado, 0)::numeric(14, 2)    as monto_pagado,
  coalesce(r.monto_pendiente, 0)::numeric(14, 2) as monto_pendiente,
  coalesce(r.dias_trabajados, 0)::int            as dias_trabajados,
  coalesce(r.lineas, 0)::int                     as lineas
from public.trabajadores t
left join (
  select
    trabajador_id,
    sum(subtotal)                                    as monto_total,
    sum(subtotal) filter (where pago_id is not null) as monto_pagado,
    sum(subtotal) filter (where pago_id is null)     as monto_pendiente,
    count(distinct fecha)                            as dias_trabajados,
    count(*)                                         as lineas
  from movimientos
  group by trabajador_id
) r on r.trabajador_id = t.id;

comment on view public.v_trabajador_resumen is
  'Totales por trabajador (prendas + horas): registrado, pagado y pendiente.';

-- ============================================================================
--  Funciones
-- ============================================================================

-- Registra un rango de horas trabajadas y calcula los minutos automáticamente.
create or replace function public.fn_registrar_horas(
  p_fecha         date,
  p_trabajador_id uuid,
  p_hora_inicio   time,
  p_hora_fin      time,
  p_tarifa        numeric,
  p_notas         text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_minutos int;
  v_id      uuid;
begin
  if p_trabajador_id is null then
    raise exception 'Debes indicar el trabajador';
  end if;
  if p_hora_inicio is null or p_hora_fin is null then
    raise exception 'Debes indicar la hora de inicio y la hora de fin';
  end if;
  if p_hora_fin <= p_hora_inicio then
    raise exception 'La hora de fin debe ser mayor que la hora de inicio';
  end if;

  v_minutos := round(extract(epoch from (p_hora_fin - p_hora_inicio)) / 60)::int;

  insert into registros_horas (fecha, trabajador_id, hora_inicio, hora_fin, minutos, tarifa, notas)
  values (p_fecha, p_trabajador_id, p_hora_inicio, p_hora_fin, v_minutos, coalesce(p_tarifa, 0), p_notas)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.fn_registrar_horas is
  'Anota un rango de horas trabajadas, calculando los minutos y el importe.';

-- Liquida el trabajo pendiente (prendas + horas) de un trabajador en un rango.
drop function if exists public.fn_registrar_pago(uuid, date, date, date, text);

create or replace function public.fn_registrar_pago(
  p_trabajador_id uuid,
  p_desde         date,
  p_hasta         date,
  p_fecha_pago    date default current_date,
  p_notas         text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago_id uuid;
  v_monto   numeric(14, 2);
  v_count   int;
  v_semana  date;
begin
  if p_hasta < p_desde then
    raise exception 'La fecha final no puede ser anterior a la fecha inicial';
  end if;

  select coalesce(sum(subtotal), 0), count(*)
    into v_monto, v_count
  from (
    select subtotal from public.registros_trabajo
     where trabajador_id = p_trabajador_id
       and pago_id is null
       and fecha between p_desde and p_hasta

    union all

    select subtotal from public.registros_horas
     where trabajador_id = p_trabajador_id
       and pago_id is null
       and fecha between p_desde and p_hasta
  ) pendientes;

  if v_count = 0 then
    raise exception 'No hay trabajo pendiente de pago en ese rango de fechas';
  end if;

  -- Si el rango es exactamente una semana del taller, se guarda cuál.
  if p_desde = public.fn_sabado_semana(p_desde) and p_hasta = p_desde + 6 then
    v_semana := p_desde;
  end if;

  insert into public.pagos (trabajador_id, fecha_inicio, fecha_fin, fecha_pago, monto, notas, semana)
  values (p_trabajador_id, p_desde, p_hasta, p_fecha_pago, v_monto, p_notas, v_semana)
  returning id into v_pago_id;

  update public.registros_trabajo set pago_id = v_pago_id
   where trabajador_id = p_trabajador_id
     and pago_id is null
     and fecha between p_desde and p_hasta;

  update public.registros_horas set pago_id = v_pago_id
   where trabajador_id = p_trabajador_id
     and pago_id is null
     and fecha between p_desde and p_hasta;

  return v_pago_id;
end;
$$;

comment on function public.fn_registrar_pago is
  'Paga el trabajo pendiente (prendas + horas) de un trabajador en un rango de fechas.';

-- Anula un pago y libera sus líneas (prendas y horas).
create or replace function public.fn_anular_pago(p_pago_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.registros_trabajo set pago_id = null where pago_id = p_pago_id;
  update public.registros_horas set pago_id = null where pago_id = p_pago_id;
  delete from public.pagos where id = p_pago_id;
end;
$$;

comment on function public.fn_anular_pago is 'Anula un pago y devuelve sus líneas al estado pendiente.';

-- ============================================================================
--  Seguridad
-- ============================================================================
alter table public.registros_horas enable row level security;

drop policy if exists acceso_taller on public.registros_horas;
create policy acceso_taller on public.registros_horas
  for all to anon, authenticated using (true) with check (true);

grant all on public.registros_horas to anon, authenticated;
grant select on public.v_horas_detalle to anon, authenticated;
grant select on public.v_semana_resumen to anon, authenticated;
grant select on public.v_trabajador_resumen to anon, authenticated;
grant execute on function public.fn_sabado_semana(date) to anon, authenticated;
grant execute on function public.fn_registrar_horas(date, uuid, time, time, numeric, text) to anon, authenticated;
grant execute on function public.fn_registrar_pago(uuid, date, date, date, text) to anon, authenticated;
grant execute on function public.fn_anular_pago(uuid) to anon, authenticated;
