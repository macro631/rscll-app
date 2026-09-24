// Base PGlite con las mismas migraciones de Supabase, para pruebas en Node.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SUPABASE = join(__dirname, '..', '..', '..', 'supabase');
export const SCRIPTS = [
  'local/auth_stub.sql',
  'migrations/001_schema.sql',
  'migrations/002_estado.sql',
  'migrations/003_rls.sql',
  'migrations/004_rpc.sql',
  'migrations/005_consultas.sql',
  'migrations/007_inspeccion_revisa.sql',
  'seed.sql',
];

export async function crearBase() {
  const db = await PGlite.create();
  for (const s of SCRIPTS) {
    await db.exec(readFileSync(join(SUPABASE, s), 'utf8'));
  }
  return db;
}

export async function crearUsuario(db: PGlite, id: string, nombre: string, rol: string) {
  await db.query(
    `insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values ($1, $2, $3, $4)`,
    [id, `${nombre.toLowerCase().replace(/\s+/g, '.')}@rscll.cl`, { nombre }, { rol }],
  );
}

export function cliente(db: PGlite) {
  let actual = '';
  return {
    como(uid: string) {
      actual = uid;
    },
    async rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
      const claves = Object.keys(args);
      const sql = `select to_jsonb(${fn}(${claves.map((k, i) => `${k} => $${i + 1}`).join(', ')})) as r`;
      await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [actual]);
      const res = await db.query<{ r: T }>(sql, claves.map((k) => args[k]));
      return res.rows[0]?.r as T;
    },
  };
}
