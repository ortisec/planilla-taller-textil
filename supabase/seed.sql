-- ============================================================================
--  Datos de ejemplo — Planilla Taller Textil
--  Se puede ejecutar varias veces sin duplicar información.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Catálogo base de operaciones (precio por prenda en soles)
-- ----------------------------------------------------------------------------
insert into public.operaciones (nombre, precio_base) values
  ('Unir Hombros',      0.1000),
  ('Cerrar Costados',   0.1200),
  ('Pegar Mangas',      0.1500),
  ('Ruedo de Manga',    0.0800),
  ('Ruedo de Basta',    0.0800),
  ('Pegar Cuello',      0.1800),
  ('Pegar Etiqueta',    0.0500),
  ('Hacer Ojal',        0.0500),
  ('Pegar Botón',       0.0500),
  ('Atraque',           0.0600),
  ('Planchado',         0.1000),
  ('Empaquetado',       0.0500)
on conflict (nombre) do nothing;

-- ----------------------------------------------------------------------------
-- Personal del taller
-- ----------------------------------------------------------------------------
insert into public.trabajadores (nombre, documento) values
  ('JOSE ORTIZ',     '45128763'),
  ('MARIA QUISPE',   '41239087'),
  ('LUIS HUAMAN',    '43980125'),
  ('ROSA MENDOZA',   '40231456')
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- Partida de ejemplo: 123 — 24 paquetes
-- ----------------------------------------------------------------------------
do $$
declare
  v_partida_id uuid;
  v_ops        jsonb;
  v_paquetes   jsonb;
  v_jose       uuid;
  v_op_hombros uuid;
  v_paquete_3  uuid;
begin
  if exists (select 1 from public.partidas where codigo = '123') then
    return;
  end if;

  select jsonb_agg(
           jsonb_build_object('nombre', nombre, 'precio', precio_base, 'operacion_id', id)
           order by nombre
         )
    into v_ops
  from public.operaciones
  where activa;

  select jsonb_agg(
           jsonb_build_object(
             'numero', n,
             'talla', (array['S', 'M', 'L', 'XL'])[1 + ((n - 1) % 4)],
             'cantidad', 12 + ((n - 1) % 3) * 6
           )
           order by n
         )
    into v_paquetes
  from generate_series(1, 24) as n;

  v_partida_id := public.fn_crear_partida(
    p_codigo      => '123',
    p_descripcion => 'Polo básico manga corta',
    p_cliente     => 'Textiles del Norte SAC',
    p_fecha       => current_date,
    p_operaciones => v_ops,
    p_paquetes    => v_paquetes,
    p_notas       => 'Partida de ejemplo con 24 paquetes.'
  );

  -- Un pequeño avance de trabajo para que el tablero no esté vacío.
  select id into v_jose   from public.trabajadores where nombre = 'JOSE ORTIZ' limit 1;
  select id into v_paquete_3 from public.partida_paquetes
    where partida_id = v_partida_id and numero = 3;

  if v_jose is not null and v_paquete_3 is not null then
    select id into v_op_hombros from public.partida_operaciones
      where partida_id = v_partida_id and nombre = 'Unir Hombros' limit 1;

    if v_op_hombros is not null then
      perform public.fn_registrar_trabajo(
        p_fecha         => current_date,
        p_trabajador_id => v_jose,
        p_partida_id    => v_partida_id,
        p_paquete_id    => v_paquete_3,
        p_lineas        => jsonb_build_array(
                             jsonb_build_object('partida_operacion_id', v_op_hombros, 'cantidad', 18)
                           ),
        p_notas         => 'Ejemplo: paquete 3 talla M.'
      );
    end if;
  end if;
end;
$$;
