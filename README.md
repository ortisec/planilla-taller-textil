# Planilla Taller Textil

Aplicación web para controlar la producción y la planilla de pagos de un taller
textil. Se registran **partidas** (lotes de un pedido) con sus **operaciones y
precios**, se anotan los **paquetes** (talla + cantidad de prendas) y luego el
**trabajo diario** de cada trabajador, calculando automáticamente cuánto se le
debe pagar. Finalmente se **liquidan pagos por rango de fechas**.

- **Frontend:** Astro (sitio estático) — ideal para desplegar en Vercel.
- **Backend:** Supabase (Postgres + API REST autogenerada + RLS).

---

## 1. Cómo funciona el cálculo

| Concepto | Fórmula |
| --- | --- |
| **Precio de la prenda** | suma de los precios de las operaciones de la partida |
| **Total de un paquete** | precio de la prenda × cantidad de prendas del paquete |
| **Total de la partida** | precio de la prenda × total de prendas de la partida |
| **Pago por línea de trabajo** | precio de la operación × cantidad de prendas hechas |

Ejemplo: la partida **123** tiene 24 paquetes y las operaciones *Unir Hombros*
(S/ 0.10), *Cerrar Costados* (S/ 0.12), etc. Si **JOSE ORTIZ** hizo *Unir
Hombros* en el **paquete 3 (talla M, 18 prendas)**, su pago es
`18 × 0.10 = S/ 1.80`.

---

## 2. Puesta en marcha

### 2.1 Requisitos

- Node.js 22 o superior
- Una cuenta y un proyecto en [Supabase](https://supabase.com)

### 2.2 Crear las tablas en Supabase

En el panel de Supabase abre **SQL Editor** y ejecuta, en este orden, el
contenido de:

1. `supabase/migrations/20261014120000_init.sql` → tablas, vistas, funciones y políticas.
2. `supabase/seed.sql` → catálogo de operaciones, personal y partida de ejemplo (opcional).

> También puedes usar la CLI de Supabase:
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
│   │   ├── index.astro           # tablero con indicadores
│   │   ├── trabajo.astro         # registro diario de trabajo
│   │   ├── registros.astro       # consulta y exportación de registros
│   │   ├── personal.astro        # trabajadores
│   │   ├── operaciones.astro     # catálogo de operaciones
│   │   ├── partidas/
│   │   │   ├── index.astro       # listado y creación de partidas
│   │   │   └── detalle.astro     # operaciones, paquetes y trabajo de la partida
│   │   └── pagos/
│   │       ├── index.astro       # liquidación e historial de pagos
│   │       └── comprobante.astro # comprobante imprimible
│   ├── lib/
│   │   ├── supabase.js           # cliente de Supabase
│   │   ├── api.js                # acceso a datos
│   │   ├── format.js             # moneda, fechas y números
│   │   └── ui.js                 # avisos, confirmaciones y utilidades
│   └── styles/
│       └── global.css
├── supabase/
│   ├── migrations/
│   │   └── 20261014120000_init.sql
│   └── seed.sql
├── public/
├── .env.example
├── astro.config.mjs
├── package.json
└── tsconfig.json
```

---

## 5. Flujo de trabajo recomendado

1. **Catálogo** (`/operaciones`): deja las operaciones habituales con su precio por prenda.
2. **Personal** (`/personal`): registra a los trabajadores.
3. **Partidas** (`/partidas`): crea la partida; marca las operaciones (ajustando el precio
   si hace falta) y genera los paquetes con su talla y cantidad.
4. **Registro diario** (`/trabajo`): elige fecha, trabajador, partida y paquete; las
   cantidades se llenan con la cantidad del paquete y las ajustas si el trabajo fue parcial.
5. **Pagos** (`/pagos`): elige trabajador y rango de fechas, revisa la vista previa y
   registra el pago. Se genera un comprobante imprimible.

---

## 6. Modelo de datos

| Tabla | Descripción |
| --- | --- |
| `operaciones` | Catálogo base: nombre y precio por prenda. |
| `trabajadores` | Personal del taller. |
| `partidas` | Número de partida (lote de un pedido). |
| `partida_operaciones` | Copia editable de las operaciones y precios de la partida. |
| `partida_paquetes` | Paquetes de la partida (número, talla, cantidad). |
| `registros_trabajo` | Trabajo hecho: trabajador + partida + paquete + operación + cantidad. |
| `pagos` | Pago liquidado a un trabajador en un rango de fechas. |

Vistas: `v_partida_resumen`, `v_paquete_resumen`, `v_registros_detalle`,
`v_trabajador_resumen`, `v_operacion_uso`.

Funciones: `fn_crear_partida`, `fn_registrar_trabajo`, `fn_registrar_pago`,
`fn_anular_pago`.

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
- **Cantidades parciales:** en el registro diario puedes reducir la cantidad de una
  operación si el trabajo quedó incompleto.
- **Impresión:** los comprobantes de pago y el detalle de partida tienen estilos de impresión.
- **Exportación:** el listado de registros se puede descargar en CSV.
