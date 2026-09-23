import { createClient } from '@supabase/supabase-js';
import type { Backend, Bucket, NuevoUsuario } from './tipos';

export function crearBackendSupabase(url: string, clave: string): Backend {
  const sb = createClient(url, clave, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'rscll-sesion' },
  });

  const urls = new Map<string, { url: string; vence: number }>();

  async function invocarAdmin(body: Record<string, unknown>) {
    const { data, error } = await sb.functions.invoke('admin-usuarios', { body });
    if (error) {
      let mensaje = error.message;
      try {
        const detalle = await (error as { context?: Response }).context?.json();
        if (detalle?.error) mensaje = detalle.error;
      } catch {
        /* respuesta sin cuerpo JSON */
      }
      throw new Error(mensaje);
    }
    return data;
  }

  return {
    modo: 'supabase',

    async rpc<T>(fn: string, args: Record<string, unknown> = {}) {
      const { data, error } = await sb.rpc(fn, args);
      if (error) throw new Error(error.message);
      return data as T;
    },

    async usuarioId() {
      const { data } = await sb.auth.getSession();
      return data.session?.user.id ?? null;
    },

    async iniciarSesion(email, clave) {
      const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: clave });
      if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Correo o clave incorrectos' : error.message);
    },

    async cerrarSesion() {
      await sb.auth.signOut();
    },

    alCambiarSesion(cb) {
      const { data } = sb.auth.onAuthStateChange((evento) => {
        if (evento !== 'TOKEN_REFRESHED') cb();
      });
      return () => data.subscription.unsubscribe();
    },

    alCambiarDatos(cb) {
      let espera: ReturnType<typeof setTimeout> | undefined;
      const avisar = () => {
        clearTimeout(espera);
        espera = setTimeout(cb, 400);
      };
      const canal = sb.channel('rscll-cambios');
      for (const tabla of ['revision', 'observacion', 'recepcion', 'comentario', 'foto']) {
        canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla }, avisar);
      }
      canal.subscribe();
      return () => {
        clearTimeout(espera);
        void sb.removeChannel(canal);
      };
    },

    async subirFoto(bucket: Bucket, path: string, blob: Blob) {
      const { error } = await sb.storage.from(bucket).upload(path, blob, {
        upsert: false,
        contentType: blob.type || 'image/jpeg',
        cacheControl: '31536000',
      });
      // Reintento desde la cola: el archivo ya había llegado.
      if (error && !/exists|duplicate/i.test(error.message)) throw new Error(error.message);
    },

    async urlFoto(bucket: Bucket, path: string, segundos = 3600) {
      const clave = `${bucket}/${path}/${segundos}`;
      const guardada = urls.get(clave);
      if (guardada && guardada.vence > Date.now()) return guardada.url;
      const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, segundos);
      if (error || !data) throw new Error(error?.message ?? 'No se pudo obtener la foto');
      urls.set(clave, { url: data.signedUrl, vence: Date.now() + (segundos - 60) * 1000 });
      return data.signedUrl;
    },

    async crearUsuario(datos: NuevoUsuario) {
      await invocarAdmin({ accion: 'crear', ...datos });
    },

    async cambiarClave(usuario: string, clave: string) {
      await invocarAdmin({ accion: 'clave', usuario, clave });
    },
  };
}
