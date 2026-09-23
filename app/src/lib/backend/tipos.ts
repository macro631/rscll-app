import type { Rol } from '../tipos';

export type Bucket = 'fotos-original' | 'fotos-ligera';

export interface NuevoUsuario {
  nombre: string;
  email: string;
  clave: string;
  rol: Rol;
}

export interface UsuarioDemo {
  id: string;
  nombre: string;
  rol: Rol;
}

/** Operaciones que la interfaz necesita del servidor. Supabase en producción; PGlite en demostración. */
export interface Backend {
  modo: 'supabase' | 'demo';
  rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T>;
  usuarioId(): Promise<string | null>;
  iniciarSesion(email: string, clave: string): Promise<void>;
  cerrarSesion(): Promise<void>;
  alCambiarSesion(cb: () => void): () => void;
  alCambiarDatos(cb: () => void): () => void;
  subirFoto(bucket: Bucket, path: string, blob: Blob): Promise<void>;
  urlFoto(bucket: Bucket, path: string, segundos?: number): Promise<string>;
  crearUsuario(datos: NuevoUsuario): Promise<void>;
  cambiarClave(usuario: string, clave: string): Promise<void>;
  usuariosDemo?(): UsuarioDemo[];
  reiniciarDemo?(): Promise<void>;
}
