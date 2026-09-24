// Respaldo completo del proyecto en este computador: todas las tablas (JSON) y todas las fotos.
// El plan gratuito de Supabase no guarda respaldos: ejecútelo al menos una vez por semana.
// Uso (desde prototipo/): node scripts/respaldo.mjs
// Requiere SUPABASE_URL y SUPABASE_SECRET_KEY en .env.supabase.local (nunca se sube a GitHub).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  readFileSync(join(raiz, '.env.supabase.local'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const URL = env.SUPABASE_URL;
const CLAVE = env.SUPABASE_SECRET_KEY;
if (!URL || !CLAVE) throw new Error('Faltan SUPABASE_URL o SUPABASE_SECRET_KEY en .env.supabase.local');
const cab = { apikey: CLAVE, Authorization: `Bearer ${CLAVE}` };

const ahora = new Date();
const p = (n) => String(n).padStart(2, '0');
const carpeta = join(raiz, 'respaldos', `${ahora.getFullYear()}${p(ahora.getMonth() + 1)}${p(ahora.getDate())}_${p(ahora.getHours())}${p(ahora.getMinutes())}`);
mkdirSync(carpeta, { recursive: true });

const TABLAS = ['proyecto', 'recinto', 'recinto_sector', 'figura', 'perfil', 'revision', 'observacion', 'foto', 'comentario', 'recepcion', 'evento'];
const datos = { generado: ahora.toISOString() };
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
  console.log(`${t}: ${filas.length}`);
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
      const destino = join(carpeta, bucket, ruta);
      mkdirSync(dirname(destino), { recursive: true });
      writeFileSync(destino, Buffer.from(await r.arrayBuffer()));
      archivos++;
    }
  }
}
console.log(`fotos: ${archivos} archivos`);
console.log(`Respaldo en ${carpeta}`);
