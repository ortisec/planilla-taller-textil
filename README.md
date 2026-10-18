# Planilla Taller Textil

Aplicación web para controlar la producción y la planilla de pagos de un taller
textil. Se registran **partidas** (lotes de un pedido) con sus **operaciones y
precios**, se anotan los **paquetes** (talla + cantidad de prendas) y luego el
**trabajo diario** de cada trabajador, calculando automáticamente cuánto se le
debe pagar. Finalmente se **liquidan pagos por rango de fechas**.

- **Frontend:** Astro (sitio estático) — ideal para desplegar en Vercel.
- **Estilos:** Tailwind CSS v4 (tema y capas `base`/`components` en `src/styles/global.css`).
- **PDF e imagen:** `html-to-image` + `jsPDF`, cargados solo al descargar.
- **Backend:** Supabase (Postgres + API REST autogenerada + RLS).

---

## 1. Cómo funciona el cálculo

El taller tiene **dos formas de trabajo**:

| Forma | Cómo se paga |
| --- | --- |
| **Por prendas** | por operación hecha en un paquete |
| **Manual (por horas)** | por hora trabajada, en turnos (ej. 8:00–12:00 y 14:00–19:00) |

| Concepto | Fórmula |
| --- | --- |
| **Precio de la prenda** | suma de los precios de las operaciones de la partida |
| **Total de un paquete** | precio de la prenda × cantidad de prendas del paquete |
| **Total de la partida** | precio de la prenda × total de prendas de la partida |
| **Pago por prendas** | precio de la operación × cantidad de prendas hechas |
| **Pago por horas** | (minutos trabajados ÷ 60) × pago por hora |

Ejemplo por prendas: la partida **123** tiene 24 paquetes y las operaciones *Unir
Hombros* (S/ 0.10), *Cerrar Costados* (S/ 0.12), etc. Si **JOSE ORTIZ** hizo
*Unir Hombros* en el **paquete 3 (talla M, 18 prendas)**, su pago es
`18 × 0.10 = S/ 1.80`.

Ejemplo por horas: **JOSE ORTIZ** trabajó de 8:00 a 12:00 (4 h) y de 14:00 a
19:00 (5 h) con pago de **S/ 7.00 por hora** → `9 h × 7 = S/ 63.00` ese día.

### La semana del taller

La semana va de **sábado a viernes** y se paga el **sábado siguiente**:

```
   sábado 10/10 .................................. viernes 16/10   ->  se paga el sábado 17/10
   sábado 17/10 .................................. viernes 23/10   ->  se paga el sábado 24/10
```

En la **Planilla** el trabajo pendiente se agrupa por semana, indicando el rango y
la fecha de pago, y se puede pagar una semana concreta o todo lo pendiente. El
**Tablero** muestra un **histograma** de las últimas 6 semanas: dos barras por
semana (verde = ya pagado, ámbar = falta pagar) con su escala en soles.

### Reglas de control

- **Nadie cobra dos veces la misma prenda.** Por cada paquete y operación, la
  suma de lo registrado por todos los trabajadores no puede superar la cantidad
  de prendas del paquete. Si se intenta registrar más, el sistema avisa y pide
  confirmación explícita antes de guardar (pago extra).
- **El registro diario descuenta lo hecho.** La columna *Falta* y los campos de
  cantidad muestran las prendas pendientes de ese paquete/operación, no el total
  del paquete, y se indica qué trabajador ya hizo cada operación.
- **Las horas se piden con hora de inicio y de fin.** El sistema calcula los
  minutos y el importe; si el turno ya estaba anotado, avisa antes de duplicarlo.

---

## 2. Puesta en marcha

### 2.1 Requisitos

- Node.js 22 o superior
- Una cuenta y un proyecto en [Supabase](https://supabase.com)

### 2.2 Crear las tablas en Supabase

En el panel de Supabase abre **SQL Editor** y ejecuta, **en este orden**, el
contenido de cada archivo:

1. `supabase/migrations/20261014120000_init.sql` → tablas, vistas, funciones y políticas.
2. `supabase/migrations/20261015120000_avance_paquete.sql` → control de avance por paquete.
3. `supabase/migrations/20261018120000_trabajo_horas.sql` → trabajo por horas y semanas.
4. `supabase/seed.sql` → catálogo de operaciones, personal y partida de ejemplo (opcional).

> Recuerda pegar el **contenido** del archivo, no la ruta. El SQL Editor no lee
> archivos del repositorio.
>
> Los tres scripts son **re-ejecutables** (puedes volver a pasarlos sin romper
> nada). Si quieres comprobar qué objetos ya existen y cuántas filas hay por
> tabla, ejecuta `supabase/verificar.sql`.
>
> `seed.sql` es idempotente: si lo corres dos veces no duplica nada.

> También puedes usar la CLI de Supabase (ya está `supabase/config.toml`):
> ```bash
> supabase link --project-ref TU_PROJECT_REF
> supabase db push
> ```
> y luego pegar `supabase/seed.sql` en el SQL Editor.

### 2.3 Configurar el frontend

```bash
npm install
cp .env.example .env   # en Windows: copy .env.example .env
```

Edita `.env` con los datos de **Project Settings → API**:

```
PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
PUBLIC_SUPABASE_ANON_KEY=tu-clave-anon-publica
```

### 2.4 Desarrollo

```bash
npm run dev          # http://localhost:4321
npm run build        # genera dist/
npm run preview      # sirve la build
```

---

## 3. Despliegue en Vercel

1. Sube el repositorio a GitHub.
2. En Vercel: **Add New → Project** e importa el repositorio.
3. Framework preset: **Astro** (se detecta solo). Build: `npm run build`. Output: `dist`.
4. En **Settings → Environment Variables** agrega `PUBLIC_SUPABASE_URL` y
   `PUBLIC_SUPABASE_ANON_KEY` (para *Production*, *Preview* y *Development*).
5. Deploy.

> Las variables `PUBLIC_*` se incrustan durante el build, así que si las cambias
> debes volver a desplegar.

---

## 4. Estructura del proyecto

```
planilla-taller-textil/
├── src/
│   ├── components/
│   │   └── Icon.astro            # iconos SVG en línea
│   ├── layouts/
│   │   └── Layout.astro          # navegación y estructura general
│   ├── pages/
│   │   ├── index.astro           # tablero con indicadores y gráfico semanal
│   │   ├── trabajo.astro         # registro diario por prendas
│   │   ├── horas.astro           # registro de turnos de trabajo manual
│   │   ├── registros.astro       # consulta y exportación de registros
│   │   ├── personal.astro        # trabajadores
│   │   ├── operaciones.astro     # catálogo de operaciones
│   │   ├── partidas/
│   │   │   ├── index.astro       # listado y creación de partidas
│   │   │   └── detalle.astro     # operaciones, paquetes y trabajo de la partida
│   │   └── pagos/
│   │       └── index.astro       # planilla: deuda por trabajador y detalle por día
│   ├── lib/
│   │   ├── supabase.js           # cliente de Supabase
│   │   ├── api.js                # acceso a datos
│   │   ├── format.js             # moneda, fechas y números
│   │   ├── planilla-doc.js       # documento de planilla + modal y descargas
│   │   └── ui.js                 # avisos, confirmaciones y utilidades
│   └── styles/
│       └── global.css            # Tailwind v4: tema + capas base/components
├── supabase/
│   ├── migrations/
│   │   ├── 20261014120000_init.sql
│   │   ├── 20261015120000_avance_paquete.sql
│   │   └── 20261018120000_trabajo_horas.sql
│   ├── config.toml
│   ├── seed.sql
│   └── verificar.sql
├── public/
├── .env.example
├── astro.config.mjs              # Tailwind v4 vía @tailwindcss/vite
├── package.json
└── tsconfig.json
```

---

## 5. Flujo de trabajo recomendado

1. **Catálogo** (`/operaciones`): deja las operaciones habituales con su precio por prenda.
2. **Personal** (`/personal`): registra a los trabajadores.
3. **Partidas** (`/partidas`): crea la partida; marca las operaciones (ajustando el precio
   si hace falta) y genera los paquetes con su talla y cantidad.
4. **Registro diario** (`/trabajo`): elige el día, la partida, el paquete y quién trabajó.
   Aparece la lista de operaciones y cada una indica cuántas prendas **faltan** y quién las
   hizo ya. Las cantidades llegan puestas con lo que falta: si el paquete se hizo completo
   solo pulsas **Guardar**; si hizo menos, cambias el número. Abajo se ve el **total a pagar**.
   Si anotas más prendas de las que faltan, el sistema avisa antes de guardar.
5. **Trabajo por horas** (`/horas`): para el trabajo manual. Elige a la persona, el día, y
   desde qué hora hasta qué hora trabajó (hay botones rápidos para *Mañana 8:00–12:00* y
   *Tarde 2:00–7:00*). El pago por hora viene sugerido desde el Personal y se puede cambiar.
   Abajo te dice a qué semana pertenece el día y cuándo se paga.
6. **Planilla** (`/pagos`): muestra el **total que se le debe a cada trabajador**, agrupado
   **por semana** (con el rango de sábado a viernes y la fecha de pago). Cada semana se puede
   pagar por separado, o todo lo pendiente.
   El botón **Planilla** abre, sin salir de la página, un **modal** con el documento ordenado
   de lo que hizo (prendas y horas) y lo que se le paga, listo para **descargar en PDF**,
   **descargar como imagen (PNG)** o **imprimir**. Lo mismo desde *Ya pagado* para los pagos
   ya entregados.
7. **Tablero** (`/`): además de los indicadores, muestra un **histograma de las últimas 6
   semanas**: dos barras por semana (verde = ya pagado, ámbar = falta pagar), con la escala
   en soles y el total de cada semana encima de sus barras.

---

## 6. Modelo de datos

| Tabla | Descripción |
| --- | --- |
| `operaciones` | Catálogo base: nombre y precio por prenda. |
| `trabajadores` | Personal del taller. |
| `partidas` | Número de partida (lote de un pedido). |
| `partida_operaciones` | Copia editable de las operaciones y precios de la partida. |
| `partida_paquetes` | Paquetes de la partida (número, talla, cantidad). |
| `registros_trabajo` | Trabajo por prendas: trabajador + partida + paquete + operación + cantidad. |
| `registros_horas` | Trabajo manual: trabajador + día + hora de inicio y fin + pago por hora. |
| `pagos` | Pago liquidado a un trabajador en un rango de fechas (y su semana, si aplica). |

Vistas: `v_partida_resumen`, `v_paquete_resumen`, `v_paquete_operacion_avance`,
`v_registros_detalle`, `v_horas_detalle`, `v_trabajador_resumen`, `v_semana_resumen`,
`v_operacion_uso`.

Funciones: `fn_crear_partida`, `fn_registrar_trabajo`, `fn_registrar_horas`,
`fn_registrar_pago`, `fn_anular_pago`, `fn_sabado_semana`.

---

## 7. Seguridad — pendiente antes de usar en producción

La aplicación **todavía no tiene inicio de sesión**: las políticas RLS permiten
el acceso anónimo para que puedas probarla. La clave `anon` queda expuesta en el
navegador, así que cualquiera con la URL puede leer y escribir datos.

Antes de usarla con información real:

1. Activa **Supabase Auth** (correo/contraseña) y crea el usuario administrador.
2. Cambia las políticas de la tabla correspondiente en
   `supabase/migrations/20261014120000_init.sql` (bloque `acceso_taller`) por
   reglas basadas en `auth.uid()`, por ejemplo:
   ```sql
   create policy solo_admin on public.partidas
     for all to authenticated using (true) with check (true);
   ```
3. Deja `anon` sin permisos.

---

## 8. Detalles útiles

- **Moneda:** soles peruanos (`S/`), dos decimales en totales y hasta cuatro en precios unitarios.
- **Fechas:** se guardan como fecha local (`YYYY-MM-DD`), sin desfase por zona horaria.
- **Semanas:** la semana del taller va de **sábado a viernes** (`fn_sabado_semana`), y se paga
  el sábado siguiente. Si el rango pagado coincide exactamente con una semana, el pago queda
  etiquetado con esa semana.
- **Cantidades parciales:** en el registro diario puedes reducir la cantidad de una
  operación si el trabajo quedó incompleto.
- **Entrega de la planilla:** el documento del trabajador (lo que hizo + lo que se le paga)
  se abre en un modal y se puede descargar en **PDF** o **PNG**, o imprimir. El PDF se arma
  en A4 y, si es largo, reparte el contenido en varias páginas cortando al final de cada día.
- **Impresión:** el detalle de partida también tiene estilos de impresión.
- **Exportación:** el listado de registros se puede descargar en CSV.
