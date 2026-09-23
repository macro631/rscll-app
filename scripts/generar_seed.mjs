// Genera supabase/seed.sql a partir de data/catalog.json (catálogo validado de 100 unidades lógicas).
// Uso: node scripts/generar_seed.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalogo = JSON.parse(readFileSync(join(raiz, 'data', 'catalog.json'), 'utf8'));

const RETIRADOS = new Set(['A-28', 'A-41', 'B-33']);
const q = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replaceAll("'", "''")}'`);

const recintos = [];
const sectores = [];
const figuras = [];
catalogo.forEach((r, i) => {
  if (RETIRADOS.has(r.code)) throw new Error(`Código retirado en el catálogo: ${r.code}`);
  recintos.push(`(${q(r.id)}, 'RSCLL', ${q(r.code)}, ${q(r.name)}, ${q(r.type)}, ${i + 1})`);
  for (const s of r.sectors) sectores.push(`(${q(r.id)}, ${q(s)}, ${r.areas?.[s] ?? 'null'})`);
  for (const f of r.figures) figuras.push(`(${q(r.id)}, ${q(f.sector)}, ${q(f.elementId)})`);
});

if (recintos.length !== 100) throw new Error(`Se esperaban 100 unidades lógicas, hay ${recintos.length}`);

const sql = `-- Generado por scripts/generar_seed.mjs desde data/catalog.json. No editar a mano.
insert into proyecto (id, codigo, nombre) values ('RSCLL', 'RSCLL', 'Reposición SubComisaría Llay Llay')
on conflict (id) do nothing;

insert into recinto (id, proyecto_id, codigo, nombre, tipo, orden) values
${recintos.join(',\n')}
on conflict (id) do update set nombre = excluded.nombre, tipo = excluded.tipo, orden = excluded.orden;

insert into recinto_sector (recinto_id, sector, superficie) values
${sectores.join(',\n')}
on conflict (recinto_id, sector) do update set superficie = excluded.superficie;

insert into figura (recinto_id, plano, element_id) values
${figuras.join(',\n')}
on conflict (plano, element_id) do update set recinto_id = excluded.recinto_id;
`;

writeFileSync(join(raiz, 'supabase', 'seed.sql'), sql, 'utf8');
console.log(`seed.sql: ${recintos.length} recintos, ${sectores.length} sectores, ${figuras.length} figuras`);
