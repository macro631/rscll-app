// Respaldo completo del proyecto: todas las tablas (datos.json) y todas las fotos.
// El plan gratuito de Supabase no guarda respaldos. Una tarea de Windows lo ejecuta dos veces por semana
// (ver scripts/programar_respaldo.ps1); también se puede ejecutar a mano.
//
// Uso (desde prototipo/): node scripts/respaldo.mjs
// Lee de .env.supabase.local (nunca se sube a GitHub):
//   SUPABASE_URL, SUPABASE_SECRET_KEY   obligatorias
//   RSCLL_RESPALDOS                     opcional: carpeta de destino (p. ej. una carpeta de OneDrive)
//   RSCLL_RESPALDOS_CONSERVAR           opcional: cuántos respaldos guardar (por defecto 10)
import { appendFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  readFileSync(join(raiz, '.env.supabase.local'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const destino = env.RSCLL_RESPALDOS || join(raiz, 'respaldos');
const conservar = Number(env.RSCLL_RESPALDOS_CONSERVAR || 10);
mkdirSync(destino, { recursive: true });

const registro = (texto) => {
  const linea = `${new Date().toISOString()}  ${texto}`;
  console.log(linea);
  appendFileSync(join(destino, 'registro.log'), `${linea}\n`);
};

async function respaldar() {
  const URL = env.SUPABASE_URL;
  const CLAVE = env.SUPABASE_SECRET_KEY;
  if (!URL || !CLAVE) throw new Error('Faltan SUPABASE_URL o SUPABASE_SECRET_KEY en .env.supabase.local');
  const cab = { apikey: CLAVE, Authorization: `Bearer ${CLAVE}` };

  const ahora = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const nombre = `${ahora.getFullYear()}${p(ahora.getMonth() + 1)}${p(ahora.getDate())}_${p(ahora.getHours())}${p(ahora.getMinutes())}`;
  const carpeta = join(destino, nombre);
  mkdirSync(carpeta, { recursive: true });

  const TABLAS = ['proyecto', 'recinto', 'recinto_sector', 'figura', 'perfil', 'revision', 'observacion', 'foto', 'comentario', 'recepcion', 'evento'];
  const datos = { generado: ahora.toISOString() };
  const conteo = {};
  for (const t of TABLAS) {
    const filas = [];
    for (let desde = 0; ; desde += 1000) {
      const r = await fetch(`${URL}/rest/v1/${t}?select=*`, { headers: { ...cab, Range: `${desde}-${desde + 999}` } });
      if (!r.ok) throw new Error(`${t}: ${r.status} ${await r.text()}`);
      const lote = await r.json();
      filas.push(...lote);
      if (lote.length < 1000) break;
    }
    datos[t] = filas;
    conteo[t] = filas.length;
  }
  writeFileSync(join(carpeta, 'datos.json'), JSON.stringify(datos, null, 2));

  // Fotos: cada observación es una carpeta dentro del bucket.
  async function listar(bucket, prefijo) {
    const r = await fetch(`${URL}/storage/v1/object/list/${bucket}`, {
      method: 'POST',
      headers: { ...cab, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: prefijo, limit: 1000 }),
    });
    if (!r.ok) throw new Error(`listar ${bucket}/${prefijo}: ${r.status}`);
    return r.json();
  }
  let archivos = 0;
  for (const bucket of ['fotos-original', 'fotos-ligera']) {
    for (const dir of await listar(bucket, '')) {
      for (const f of await listar(bucket, `${dir.name}/`)) {
        const ruta = `${dir.name}/${f.name}`;
        const r = await fetch(`${URL}/storage/v1/object/${bucket}/${ruta}`, { headers: cab });
        if (!r.ok) throw new Error(`descargar ${bucket}/${ruta}: ${r.status}`);
        const archivo = join(carpeta, bucket, ruta);
        mkdirSync(dirname(archivo), { recursive: true });
        writeFileSync(archivo, Buffer.from(await r.arrayBuffer()));
        archivos++;
      }
    }
  }
  registro(
    `OK ${nombre}: ${conteo.observacion} observaciones, ${conteo.revision} fichas, ${conteo.evento} eventos, ${archivos} archivos de foto`,
  );

  // Retención: se conservan los respaldos más recientes.
  const respaldos = readdirSync(destino, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{8}_\d{4}$/.test(d.name))
    .map((d) => d.name)
    .sort();
  for (const viejo of respaldos.slice(0, Math.max(0, respaldos.length - conservar))) {
    rmSync(join(destino, viejo), { recursive: true, force: true });
    registro(`Eliminado respaldo antiguo ${viejo}`);
  }
  console.log(`Respaldo en ${carpeta}`);
}

try {
  await respaldar();
} catch (e) {
  registro(`ERROR ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
