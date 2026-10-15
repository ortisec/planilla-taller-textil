/**
 * Cliente de Supabase para el navegador.
 *
 * Las variables PUBLIC_* se incrustan en el bundle en tiempo de compilación,
 * así que deben estar definidas en el entorno de build (Vercel -> Settings ->
 * Environment Variables) y en el archivo .env para desarrollo local.
 */

import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.PUBLIC_SUPABASE_URL ?? '';
const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY ?? '';

/** ¿Están definidas las credenciales? Se usa para mostrar un aviso en la UI. */
export const supabaseConfigurado = Boolean(url && anonKey);

export const SUPABASE_URL = url;

if (!supabaseConfigurado) {
  console.warn(
    '[supabase] Falta configurar PUBLIC_SUPABASE_URL y PUBLIC_SUPABASE_ANON_KEY.\n' +
      'Copia .env.example a .env y completa tus credenciales del proyecto Supabase.'
  );
}

// Se usa una URL de relleno para que createClient no rompa el render de la
// página cuando todavía no hay credenciales; la app muestra un aviso.
export const supabase = createClient(url || 'https://placeholder.supabase.co', anonKey || 'placeholder', {
  auth: { persistSession: false, autoRefreshToken: false },
});
