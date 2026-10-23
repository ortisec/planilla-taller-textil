-- ============================================================================
--  LIMPIAR LA BASE DE DATOS  ·  dejar el sistema en cero para producción
--  ---------------------------------------------------------------------------
--  ⚠️  BORRA TODOS LOS DATOS Y NO SE PUEDE DESHACER.
--      Úsalo una sola vez, antes de empezar a trabajar de verdad.
--
--  Qué hace:
--    · Vacía todas las tablas (partidas, paquetes, registros, pagos, personal
--      y catálogo de operaciones).
--    · NO borra la estructura: tablas, vistas, funciones y políticas quedan
--      igual, así que la aplicación sigue funcionando pero vacía.
--
--  Cómo usarlo: pega TODO el contenido en el SQL Editor de Supabase y pulsa Run.
-- ============================================================================

begin;

truncate table
  public.registros_horas,
  public.registros_trabajo,
  public.pagos,
  public.partida_operaciones,
  public.partida_paquetes,
  public.partidas,
  public.trabajadores,
  public.operaciones
restart identity
cascade;

commit;

-- ============================================================================
--  Comprobación: todas las tablas deben quedar en 0.
-- ============================================================================
select 'operaciones'        as tabla, count(*) as filas from public.operaciones
union all select 'trabajadores',        count(*) from public.trabajadores
union all select 'partidas',            count(*) from public.partidas
union all select 'partida_operaciones', count(*) from public.partida_operaciones
union all select 'partida_paquetes',    count(*) from public.partida_paquetes
union all select 'registros_trabajo',   count(*) from public.registros_trabajo
union all select 'registros_horas',     count(*) from public.registros_horas
union all select 'pagos',               count(*) from public.pagos
order by tabla;

-- ============================================================================
--  (OPCIONAL) Dejar listo el catálogo base de operaciones
--  ---------------------------------------------------------------------------
--  Si quieres arrancar con las operaciones típicas del taller, descomenta este
--  bloque (quita los "--" del inicio de cada línea) y vuelve a ejecutar.
--
--  También puedes cargarlas desde la aplicación:
--  catálogo → botón "Cargar operaciones sugeridas".
-- ============================================================================
-- insert into public.operaciones (nombre, precio_base) values
--   ('Unir Hombros',    0.10),
--   ('Cerrar Costados', 0.12),
--   ('Pegar Mangas',    0.15),
--   ('Ruedo de Manga',  0.08),
--   ('Ruedo de Basta',  0.08),
--   ('Pegar Cuello',    0.18),
--   ('Pegar Etiqueta',  0.05),
--   ('Hacer Ojal',      0.05),
--   ('Pegar Botón',     0.05),
--   ('Atraque',         0.06),
--   ('Planchado',       0.10),
--   ('Empaquetado',     0.05)
-- on conflict (nombre) do nothing;

-- ============================================================================
--  IMPORTANTE ANTES DE ABRIR LA APLICACIÓN AL PÚBLICO
--  ---------------------------------------------------------------------------
--  La aplicación todavía NO tiene inicio de sesión: las políticas RLS permiten
--  el acceso anónimo, así que cualquiera con la dirección del sitio puede leer
--  y escribir datos usando la clave pública que viaja en el navegador.
--
--  Antes de usarla con información real conviene activar Supabase Auth (correo
--  y contraseña) y cerrar las políticas. Está explicado en el README, sección
--  "Seguridad — pendiente antes de usar en producción".
-- ============================================================================
