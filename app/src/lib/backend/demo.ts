// Modo demostración: la misma base de datos (migraciones reales) corriendo en el navegador con PGlite.
// Los datos quedan solo en este navegador. Sirve para probar la app antes de conectar Supabase.
import { PGlite } from '@electric-sql/pglite';
import { createStore, get, set, clear } from 'idb-keyval';
import authStub from '../../../../supabase/local/auth_stub.sql?raw';
import m001 from '../../../../supabase/migrations/001_schema.sql?raw';
import m002 from '../../../../supabase/migrations/002_estado.sql?raw';
import m003 from '../../../../supabase/migrations/003_rls.sql?raw';
import m004 from '../../../../supabase/migrations/004_rpc.sql?raw';
import m005 from '../../../../supabase/migrations/005_consultas.sql?raw';
import m007 from '../../../../supabase/migrations/007_inspeccion_revisa.sql?raw';
import m008 from '../../../../supabase/migrations/008_endurecimiento.sql?raw';
import seed from '../../../../supabase/seed.sql?raw';
import type { Backend, Bucket, NuevoUsuario, UsuarioDemo } from './tipos';

const BASE = 'rscll-demo';
const CLAVE_SESION = 'rscll-demo-usuario';
const CLAVE_VERSION = 'rscll-demo-version';
const SCRIPTS = [authStub, m001, m002, m003, m004, m005, m007, m008, seed];

export const USUARIOS_DEMO: UsuarioDemo[] = [
  { id: '00000000-0000-4000-8000-00000000000a', nombre: 'Calidad', rol: 'admin' },
  { id: '00000000-0000-4000-8000-000000000001', nombre: 'Revisor Terreno 1', rol: 'revisor' },
  { id: '00000000-0000-4000-8000-000000000002', nombre: 'Revisor Terreno 2', rol: 'revisor' },
  { id: '00000000-0000-4000-8000-00000000000f', nombre: 'Inspección Técnica', rol: 'inspeccion' },
];
const [, REV1, REV2, INSP] = USUARIOS_DEMO.map((u) => u.id);

function huella(textos: string[]) {
  let h = 0;
  for (const t of textos) for (let i = 0; i < t.length; i++) h = (Math.imul(31, h) + t.charCodeAt(i)) | 0;
  return String(h);
}

function leer(clave: string) {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}
function escribir(clave: string, valor: string | null) {
  try {
    if (valor === null) localStorage.removeItem(clave);
    else localStorage.setItem(clave, valor);
  } catch {
    /* almacenamiento no disponible */
  }
}

async function borrarBaseNavegador() {
  await new Promise<void>((ok) => {
    const req = indexedDB.deleteDatabase(`/pglite/${BASE}`);
    req.onsuccess = req.onerror = req.onblocked = () => ok();
  });
}

export async function crearBackendDemo(): Promise<Backend> {
  const version = huella(SCRIPTS);
  if (leer(CLAVE_VERSION) !== version) {
    await borrarBaseNavegador();
    escribir(CLAVE_SESION, null);
  }
  let db: PGlite;
  try {
    db = await PGlite.create(`idb://${BASE}`);
  } catch {
    db = await PGlite.create(); // sin IndexedDB (navegación privada): datos solo en memoria
  }
  const fotos = createStore('rscll-demo-fotos', 'fotos');
  const objetos = new Map<string, string>();
  const sesion = new Set<() => void>();
  const datos = new Set<() => void>();
  let actual = leer(CLAVE_SESION);

  async function rpcComo<T>(uid: string | null, fn: string, args: Record<string, unknown> = {}): Promise<T> {
    const claves = Object.keys(args).filter((k) => args[k] !== undefined);
    const valores = claves.map((k) => {
      const v = args[k];
      return v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
    });
    const sql = `select to_jsonb(${fn}(${claves.map((k, i) => `${k} => $${i + 1}`).join(', ')})) as r`;
    return db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? '']);
      const res = await tx.query<{ r: T }>(sql, valores);
      return res.rows[0]?.r as T;
    });
  }

  const existe = await db.query<{ ok: boolean }>(`select to_regclass('public.perfil') is not null as ok`);
  if (!existe.rows[0].ok) {
    for (const s of SCRIPTS) await db.exec(s);
    for (const u of USUARIOS_DEMO) {
      await db.query(
        `insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values ($1, $2, $3, $4)`,
        [u.id, `${u.rol}@demo.rscll`, JSON.stringify({ nombre: u.nombre }), JSON.stringify({ rol: u.rol })],
      );
    }
    await sembrarEjemplo(rpcComo);
    escribir(CLAVE_VERSION, version);
  }

  const avisarSesion = () => sesion.forEach((cb) => cb());
  const avisarDatos = () => datos.forEach((cb) => cb());

  return {
    modo: 'demo',

    async rpc<T>(fn: string, args?: Record<string, unknown>) {
      try {
        return await rpcComo<T>(actual, fn, args);
      } catch (e) {
        throw new Error(e instanceof Error ? e.message : String(e));
      }
    },

    async usuarioId() {
      return actual;
    },

    async iniciarSesion(id: string) {
      actual = id;
      escribir(CLAVE_SESION, id);
      avisarSesion();
    },

    async cerrarSesion() {
      actual = null;
      escribir(CLAVE_SESION, null);
      avisarSesion();
    },

    alCambiarSesion(cb) {
      sesion.add(cb);
      return () => sesion.delete(cb);
    },

    alCambiarDatos(cb) {
      datos.add(cb);
      return () => datos.delete(cb);
    },

    async subirFoto(bucket: Bucket, path: string, blob: Blob) {
      await set(`${bucket}/${path}`, blob, fotos);
    },

    async urlFoto(bucket: Bucket, path: string) {
      const clave = `${bucket}/${path}`;
      const hecha = objetos.get(clave);
      if (hecha) return hecha;
      const blob = await get<Blob>(clave, fotos);
      if (!blob) throw new Error('Foto no disponible en este navegador');
      const url = URL.createObjectURL(blob);
      objetos.set(clave, url);
      return url;
    },

    async crearUsuario(d: NuevoUsuario) {
      const yo = await rpcComo<{ rol: string }>(actual, 'mi_perfil');
      if (yo.rol !== 'admin') throw new Error('Tu rol no permite esta acción');
      const id = crypto.randomUUID();
      await db.query(
        `insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values ($1, $2, $3, $4)`,
        [id, d.email, JSON.stringify({ nombre: d.nombre }), JSON.stringify({ rol: d.rol })],
      );
      await db.query(
        `insert into evento (actor, entidad, entidad_id, accion, despues) values ($1, 'perfil', $2, 'alta_usuario', $3)`,
        [actual, id, JSON.stringify({ nombre: d.nombre, email: d.email, rol: d.rol })],
      );
      avisarDatos();
    },

    async cambiarClave() {
      throw new Error('En el modo demostración no hay claves');
    },

    usuariosDemo: () => USUARIOS_DEMO,

    async reiniciarDemo() {
      await db.close();
      await borrarBaseNavegador();
      await clear(fotos);
      escribir(CLAVE_SESION, null);
      escribir(CLAVE_VERSION, null);
      location.reload();
    },
  };
}

type Rpc = <T>(uid: string | null, fn: string, args?: Record<string, unknown>) => Promise<T>;

// Algunos recintos con avance para que la demostración muestre todos los colores.
async function sembrarEjemplo(rpc: Rpc) {
  async function revisar(uid: string, codigo: string, obs: [string, string][], finalizar = true) {
    const rev = await rpc<string>(uid, 'abrir_revision', { p_recinto: `RSCLL:${codigo}` });
    const ids: string[] = [];
    for (const [esp, desc] of obs) {
      ids.push(await rpc<string>(uid, 'agregar_observacion', { p_revision: rev, p_especialidad: esp, p_descripcion: desc }));
    }
    if (finalizar) await rpc(uid, 'finalizar_revision', { p_revision: rev });
    return ids;
  }
  await revisar(REV1, 'A-01', []);
  await revisar(REV1, 'A-02', [
    ['Pintura', 'Muro norte con manchas bajo ventana'],
    ['Sanitario', 'Lavamanos sin sello perimetral'],
  ]);
  await revisar(REV2, 'A-03', [['Puertas', 'Cerradura no cierra completamente']], false);
  await revisar(REV1, 'A-04', []);
  await rpc(INSP, 'recepcionar', { p_recinto: 'RSCLL:A-04' });
  await revisar(REV2, 'E1', [['Pintura', 'Pasamanos con retoques pendientes en segundo tramo']]);
  const b01 = await revisar(REV1, 'B-01', [['Terminaciones', 'Guardapolvo despegado']]);
  await rpc(REV2, 'marcar_subsanada', { p_observacion: b01[0] });
  const c01 = await revisar(REV1, 'C-01', [['Ventanas', 'Falta burlete en ventana living']]);
  await rpc(REV1, 'marcar_subsanada', { p_observacion: c01[0] });
  await rpc(INSP, 'mantener_pendiente', { p_observacion: c01[0], p_texto: 'El burlete instalado no corresponde al especificado' });
  await revisar(REV2, 'D-03', [['Paisajismo', 'Faltan especies en jardinera de acceso']]);
}
