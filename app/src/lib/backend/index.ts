import type { Backend } from './tipos';

export type { Backend, Bucket, NuevoUsuario, UsuarioDemo } from './tipos';

const URL_SUPABASE = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const CLAVE_SUPABASE = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Sin variables de Supabase (o con `vite --mode demo`) la app arranca en modo demostración. */
export const MODO_DEMO =
  !URL_SUPABASE || !CLAVE_SUPABASE || import.meta.env.VITE_MODO === 'demo' || import.meta.env.MODE === 'demo';

let backend: Backend | null = null;
let cargando: Promise<Backend> | null = null;

export function iniciarBackend(): Promise<Backend> {
  if (!cargando) {
    cargando = (
      MODO_DEMO
        ? import('./demo').then((m) => m.crearBackendDemo())
        : import('./supabase').then((m) => m.crearBackendSupabase(URL_SUPABASE!, CLAVE_SUPABASE!))
    ).then((b) => (backend = b));
  }
  return cargando;
}

export function api(): Backend {
  if (!backend) throw new Error('Backend no iniciado');
  return backend;
}
