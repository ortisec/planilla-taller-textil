-- ============================================================================
--  Planilla Taller Textil — Esquema inicial
--  ---------------------------------------------------------------------------
--  Modelo de datos
--    operaciones        -> catálogo base de operaciones y su precio por prenda
--    trabajadores       -> personal del taller
--    partidas           -> número de partida (lote de un pedido)
--    partida_operaciones-> lista de operaciones de una partida (copia editable)
--    partida_paquetes   -> paquetes de una partida (talla + cantidad de prendas)
--    registros_trabajo  -> trabajo diario hecho por un trabajador (base del pago)
--    pagos              -> pagos liquidados a un trabajador en un rango de fechas
--
--  Reglas de cálculo
--    precio_prenda  = suma de los precios de las operaciones de la partida
--    total_paquete  = precio_prenda * cantidad de prendas del paquete
--    total_partida  = precio_prenda * total de prendas de la partida
--    pago de línea  = precio de la operación * cantidad de prendas hechas
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Utilidad: mantener updated_at al día
-- ----------------------------------------------------------------------------
create or replace function public.fn_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Catálogo de operaciones
-- ----------------------------------------------------------------------------
create table if not exists public.operaciones (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  precio_base numeric(12, 4) not null default 0 check (precio_base >= 0),
  activa      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint operaciones_nombre_key unique (nombre)
);

comment on table public.operaciones is 'Catálogo base de operaciones (nombre + precio por prenda).';
comment on column public.operaciones.precio_base is 'Precio por prenda en soles.';

drop trigger if exists trg_operaciones_updated_at on public.operaciones;
create trigger trg_operaciones_updated_at
  before update on public.operaciones
  for each row execute function public.fn_set_updated_at();

-- ----------------------------------------------------------------------------
-- Personal del taller
-- ----------------------------------------------------------------------------
create table if not exists public.trabajadores (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  documento  text,
  telefono   text,
  activo     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.trabajadores is 'Personal del taller que realiza las operaciones.';

create unique index if not exists trabajadores_nombre_doc_idx
  on public.trabajadores (lower(nombre), coalesce(documento, ''));

drop trigger if exists trg_trabajadores_updated_at on public.trabajadores;
create trigger trg_trabajadores_updated_at
  before update on public.trabajadores
  for each row execute function public.fn_set_updated_at();

-- ----------------------------------------------------------------------------
-- Partidas (número de partida = lote de un pedido)
-- ----------------------------------------------------------------------------
create table if not exists public.partidas (
  id          uuid primary key default gen_random_uuid(),
  codigo      text not null,
  descripcion text,
  cliente     text,
  fecha       date not null default current_date,
  estado      text not null default 'en_proceso'
                check (estado in ('en_proceso', 'terminada', 'anulada')),
  notas       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint partidas_codigo_key unique (codigo)
);

comment on table public.partidas is 'Número de partida: lote de prendas de un pedido.';

drop trigger if exists trg_partidas_updated_at on public.partidas;
create trigger trg_partidas_updated_at
  before update on public.partidas
  for each row execute function public.fn_set_updated_at();

-- ----------------------------------------------------------------------------
-- Operaciones de una partida (copia editable, no afecta a otras partidas)
-- ----------------------------------------------------------------------------
create table if not exists public.partida_operaciones (
  id           uuid primary key default gen_random_uuid(),
  partida_id   uuid not null references public.partidas (id) on delete cascade,
  operacion_id uuid references public.operaciones (id) on delete set null,
  nombre       text not null,
  precio       numeric(12, 4) not null default 0 check (precio >= 0),
  orden        integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint partida_operaciones_unica unique (partida_id, nombre)
);

comment on table public.partida_operaciones is
  'Lista de operaciones de una partida con su precio por prenda. Es una copia del catálogo, editable sin afectar otras partidas.';

create index if not exists partida_operaciones_partida_idx
  on public.partida_operaciones (partida_id);

drop trigger if exists trg_partida_operaciones_updated_at on public.partida_operaciones;
create trigger trg_partida_operaciones_updated_at
  before update on public.partida_operaciones
  for each row execute function public.fn_set_updated_at();

-- ----------------------------------------------------------------------------
-- Paquetes de una partida (talla + cantidad de prendas)
-- ----------------------------------------------------------------------------
create table if not exists public.partida_paquetes (
  id         uuid primary key default gen_random_uuid(),
  partida_id uuid not null references public.partidas (id) on delete cascade,
  numero     integer not null check (numero > 0),
  talla      text not null,
  cantidad   integer not null check (cantidad > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partida_paquetes_unico unique (partida_id, numero)
);

comment on table public.partida_paquetes is
  'Paquetes de la partida. Cada paquete tiene una talla y una cantidad de prendas.';

create index if not exists partida_paquetes_partida_idx
  on public.partida_paquetes (partida_id);

drop trigger if exists trg_partida_paquetes_updated_at on public.partida_paquetes;
create trigger trg_partida_paquetes_updated_at
  before update on public.partida_paquetes
  for each row execute function public.fn_set_updated_at();

-- ----------------------------------------------------------------------------
-- Pagos liquidados (rango de fechas por trabajador)
-- ----------------------------------------------------------------------------
create table if not exists public.pagos (
  id            uuid primary key default gen_random_uuid(),
  trabajador_id uuid not null references public.trabajadores (id) on delete cascade,
  fecha_inicio  date not null,
  fecha_fin     date not null,
  fecha_pago    date not null default current_date,
  monto         numeric(14, 2) not null default 0,
  notas         text,
  created_at    timestamptz not null default now(),
  constraint pagos_rango_valido check (fecha_fin >= fecha_inicio)
);

comment on table public.pagos is 'Pago liquidado a un trabajador por el trabajo pendiente en un rango de fechas.';

create index if not exists pagos_trabajador_idx on public.pagos (trabajador_id);

-- ----------------------------------------------------------------------------
-- Registros de trabajo (detalle diario, base del cálculo del pago)
-- ----------------------------------------------------------------------------
create table if not exists public.registros_trabajo (
  id                   uuid primary key default gen_random_uuid(),
  fecha                date not null default current_date,
  trabajador_id        uuid not null references public.trabajadores (id) on delete restrict,
  partida_id           uuid not null references public.partidas (id) on delete cascade,
  paquete_id           uuid not null references public.partida_paquetes (id) on delete cascade,
  partida_operacion_id uuid not null references public.partida_operaciones (id) on delete cascade,
  cantidad             integer not null check (cantidad > 0),
  precio_unitario      numeric(12, 4) not null check (precio_unitario >= 0),
  subtotal             numeric(14, 2) generated always as (round(cantidad * precio_unitario, 2)) stored,
  pago_id              uuid references public.pagos (id) on delete set null,
  notas                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table public.registros_trabajo is
  'Trabajo realizado: trabajador + partida + paquete + operación + cantidad. El subtotal es el monto a pagar por esa línea.';
comment on column public.registros_trabajo.precio_unitario is
  'Precio por prenda al momento del registro (copia del precio de la operación).';
comment on column public.registros_trabajo.pago_id is
  'Pago en el que se liquidó esta línea. NULL = pendiente de pago.';

create index if not exists registros_trabajo_fecha_idx on public.registros_trabajo (fecha);
create index if not exists registros_trabajo_trabajador_idx on public.registros_trabajo (trabajador_id, pago_id);
create index if not exists registros_trabajo_partida_idx on public.registros_trabajo (partida_id);
create index if not exists registros_trabajo_paquete_idx on public.registros_trabajo (paquete_id);

drop trigger if exists trg_registros_trabajo_updated_at on public.registros_trabajo;
create trigger trg_registros_trabajo_updated_at
  before update on public.registros_trabajo
  for each row execute function public.fn_set_updated_at();

-- ============================================================================
--  Vistas de consulta
-- ============================================================================

-- Resumen económico de cada partida.
create or replace view public.v_partida_resumen
with (security_invoker = true) as
select
  p.id,
  p.codigo,
  p.descripcion,
  p.cliente,
  p.fecha,
  p.estado,
  p.notas,
  coalesce(o.num_operaciones, 0)::int                                        as num_operaciones,
  coalesce(o.precio_prenda, 0)::numeric(12, 4)                               as precio_prenda,
  coalesce(q.num_paquetes, 0)::int                                           as num_paquetes,
  coalesce(q.total_prendas, 0)::int                                          as total_prendas,
  round(coalesce(o.precio_prenda, 0) * coalesce(q.total_prendas, 0), 2)      as total_partida,
  coalesce(r.monto_registrado, 0)::numeric(14, 2)                            as monto_registrado,
  coalesce(r.monto_pendiente, 0)::numeric(14, 2)                             as monto_pendiente
from public.partidas p
left join (
  select partida_id, count(*) as num_operaciones, sum(precio) as precio_prenda
  from public.partida_operaciones
  group by partida_id
) o on o.partida_id = p.id
left join (
  select partida_id, count(*) as num_paquetes, sum(cantidad) as total_prendas
  from public.partida_paquetes
  group by partida_id
) q on q.partida_id = p.id
left join (
  select
    partida_id,
    sum(subtotal)                                        as monto_registrado,
    sum(subtotal) filter (where pago_id is null)         as monto_pendiente
  from public.registros_trabajo
  group by partida_id
) r on r.partida_id = p.id;

comment on view public.v_partida_resumen is 'Resumen de costos y avance de cada partida.';

-- Precio y total por paquete.
create or replace view public.v_paquete_resumen
with (security_invoker = true) as
select
  q.id,
  q.partida_id,
  q.numero,
  q.talla,
  q.cantidad,
  coalesce(o.precio_prenda, 0)::numeric(12, 4)                          as precio_prenda,
  round(coalesce(o.precio_prenda, 0) * q.cantidad, 2)                    as total_paquete,
  coalesce(r.monto_registrado, 0)::numeric(14, 2)                        as monto_registrado,
  coalesce(r.lineas, 0)::int                                             as lineas_registradas
from public.partida_paquetes q
left join (
  select partida_id, sum(precio) as precio_prenda
  from public.partida_operaciones
  group by partida_id
) o on o.partida_id = q.partida_id
left join (
  select paquete_id, sum(subtotal) as monto_registrado, count(*) as lineas
  from public.registros_trabajo
  group by paquete_id
) r on r.paquete_id = q.id;

comment on view public.v_paquete_resumen is 'Precio de la prenda y total por paquete.';

-- Detalle plano de los registros de trabajo (para listados y exportación).
create or replace view public.v_registros_detalle
with (security_invoker = true) as
select
  r.id,
  r.fecha,
  r.cantidad,
  r.precio_unitario,
  r.subtotal,
  r.pago_id,
  (r.pago_id is null)          as pendiente,
  r.notas,
  r.created_at,
  t.id                         as trabajador_id,
  t.nombre                     as trabajador,
  p.id                         as partida_id,
  p.codigo                     as partida_codigo,
  p.descripcion                as partida_descripcion,
  q.id                         as paquete_id,
  q.numero                     as paquete_numero,
  q.talla                      as paquete_talla,
  op.id                        as operacion_id,
  op.nombre                    as operacion
from public.registros_trabajo r
join public.trabajadores t on t.id = r.trabajador_id
join public.partidas p on p.id = r.partida_id
join public.partida_paquetes q on q.id = r.paquete_id
join public.partida_operaciones op on op.id = r.partida_operacion_id;

comment on view public.v_registros_detalle is 'Registros de trabajo con nombres listos para mostrar.';

-- Totales por trabajador (registrado / pagado / pendiente).
create or replace view public.v_trabajador_resumen
with (security_invoker = true) as
select
  t.id,
  t.nombre,
  t.documento,
  t.activo,
  coalesce(r.monto_total, 0)::numeric(14, 2)      as monto_total,
  coalesce(r.monto_pagado, 0)::numeric(14, 2)     as monto_pagado,
  coalesce(r.monto_pendiente, 0)::numeric(14, 2)  as monto_pendiente,
  coalesce(r.dias_trabajados, 0)::int             as dias_trabajados,
  coalesce(r.lineas, 0)::int                      as lineas
from public.trabajadores t
left join (
  select
    trabajador_id,
    sum(subtotal)                                 as monto_total,
    sum(subtotal) filter (where pago_id is not null) as monto_pagado,
    sum(subtotal) filter (where pago_id is null)     as monto_pendiente,
    count(distinct fecha)                            as dias_trabajados,
    count(*)                                         as lineas
  from public.registros_trabajo
  group by trabajador_id
) r on r.trabajador_id = t.id;

comment on view public.v_trabajador_resumen is 'Totales por trabajador: registrado, pagado y pendiente.';

-- Cuántas partidas usan cada operación del catálogo.
create or replace view public.v_operacion_uso
with (security_invoker = true) as
select
  operacion_id,
  count(*)::int as usos
from public.partida_operaciones
where operacion_id is not null
group by operacion_id;

comment on view public.v_operacion_uso is 'Número de partidas que usan cada operación del catálogo.';

-- ============================================================================
--  Funciones de apoyo
-- ============================================================================

-- Crea una partida completa (datos + operaciones + paquetes) en una sola
-- transacción.
--   p_operaciones: [{"nombre":"Unir Hombros","precio":0.10,"operacion_id":null}, ...]
--   p_paquetes:    [{"numero":1,"talla":"M","cantidad":24}, ...]
create or replace function public.fn_crear_partida(
  p_codigo      text,
  p_descripcion text default null,
  p_cliente     text default null,
  p_fecha       date default current_date,
  p_operaciones jsonb default '[]'::jsonb,
  p_paquetes    jsonb default '[]'::jsonb,
  p_notas       text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partida_id uuid;
begin
  if coalesce(trim(p_codigo), '') = '' then
    raise exception 'El número de partida es obligatorio';
  end if;

  insert into partidas (codigo, descripcion, cliente, fecha, notas)
  values (trim(p_codigo), p_descripcion, p_cliente, p_fecha, p_notas)
  returning id into v_partida_id;

  insert into partida_operaciones (partida_id, operacion_id, nombre, precio, orden)
  select
    v_partida_id,
    nullif(elem ->> 'operacion_id', '')::uuid,
    elem ->> 'nombre',
    coalesce((elem ->> 'precio')::numeric, 0),
    coalesce((ord - 1)::int, 0)
  from jsonb_array_elements(coalesce(p_operaciones, '[]'::jsonb)) with ordinality as t(elem, ord);

  insert into partida_paquetes (partida_id, numero, talla, cantidad)
  select
    v_partida_id,
    (elem ->> 'numero')::int,
    elem ->> 'talla',
    (elem ->> 'cantidad')::int
  from jsonb_array_elements(coalesce(p_paquetes, '[]'::jsonb)) as t(elem);

  return v_partida_id;
end;
$$;

comment on function public.fn_crear_partida is 'Crea una partida con sus operaciones y paquetes en una sola transacción.';

-- Registra el trabajo de un trabajador para un paquete y calcula los precios
-- automáticamente con la lista de operaciones de la partida.
--   p_lineas: [{"partida_operacion_id": "...", "cantidad": 24}, ...]
create or replace function public.fn_registrar_trabajo(
  p_fecha        date,
  p_trabajador_id uuid,
  p_partida_id   uuid,
  p_paquete_id   uuid,
  p_lineas       jsonb,
  p_notas        text default null
) returns setof uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paquete  partida_paquetes%rowtype;
  v_linea    jsonb;
  v_op       partida_operaciones%rowtype;
  v_cantidad int;
  v_reg_id   uuid;
  v_ids      uuid[] := '{}';
begin
  select * into v_paquete from partida_paquetes where id = p_paquete_id;
  if not found then
    raise exception 'El paquete indicado no existe';
  end if;
  if v_paquete.partida_id <> p_partida_id then
    raise exception 'El paquete no pertenece a la partida indicada';
  end if;

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

comment on function public.fn_registrar_trabajo is 'Registra las operaciones hechas por un trabajador en un paquete, calculando el precio según la partida.';

-- Liquida el trabajo pendiente de un trabajador en un rango de fechas.
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
begin
  if p_hasta < p_desde then
    raise exception 'La fecha final no puede ser anterior a la fecha inicial';
  end if;

  select coalesce(sum(subtotal), 0), count(*)
    into v_monto, v_count
  from registros_trabajo
  where trabajador_id = p_trabajador_id
    and pago_id is null
    and fecha between p_desde and p_hasta;

  if v_count = 0 then
    raise exception 'No hay trabajo pendiente de pago en ese rango de fechas';
  end if;

  insert into pagos (trabajador_id, fecha_inicio, fecha_fin, fecha_pago, monto, notas)
  values (p_trabajador_id, p_desde, p_hasta, p_fecha_pago, v_monto, p_notas)
  returning id into v_pago_id;

  update registros_trabajo
    set pago_id = v_pago_id
  where trabajador_id = p_trabajador_id
    and pago_id is null
    and fecha between p_desde and p_hasta;

  return v_pago_id;
end;
$$;

comment on function public.fn_registrar_pago is 'Crea el pago del trabajo pendiente de un trabajador en un rango de fechas y lo marca como pagado.';

-- Elimina un pago y libera sus líneas (vuelven a quedar pendientes).
create or replace function public.fn_anular_pago(p_pago_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update registros_trabajo set pago_id = null where pago_id = p_pago_id;
  delete from pagos where id = p_pago_id;
end;
$$;

comment on function public.fn_anular_pago is 'Anula un pago y devuelve sus líneas al estado pendiente.';

-- ============================================================================
--  Seguridad (RLS)
--  ---------------------------------------------------------------------------
--  IMPORTANTE: la app no tiene login todavía, por eso el acceso anónimo está
--  abierto. Antes de usar esto en producción con datos reales, agrega
--  Supabase Auth y reemplaza estas políticas por reglas basadas en el usuario.
-- ============================================================================
do $$
declare
  t text;
  tablas text[] := array[
    'operaciones', 'trabajadores', 'partidas',
    'partida_operaciones', 'partida_paquetes',
    'registros_trabajo', 'pagos'
  ];
begin
  foreach t in array tablas loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists acceso_taller on public.%I;', t);
    execute format(
      'create policy acceso_taller on public.%I for all to anon, authenticated using (true) with check (true);',
      t
    );
  end loop;
end;
$$;

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;
