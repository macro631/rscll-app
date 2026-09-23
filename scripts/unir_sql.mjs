// Une migraciones y catálogo en supabase/instalar.sql, para pegar una sola vez en el editor SQL de Supabase.
// Uso: node scripts/unir_sql.mjs   (ejecutar después de generar_seed.mjs)
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const supabase = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase');
const migraciones = readdirSync(join(supabase, 'migrations')).filter((f) => f.endsWith('.sql')).sort();
const partes = [
  ...migraciones.map((f) => [`migrations/${f}`, readFileSync(join(supabase, 'migrations', f), 'utf8')]),
  ['seed.sql', readFileSync(join(supabase, 'seed.sql'), 'utf8')],
];
const sql = [
  '-- RSCLL · Instalación completa (generado por scripts/unir_sql.mjs). Ejecutar una sola vez en un proyecto nuevo.',
  'begin;',
  ...partes.map(([nombre, texto]) => `\n-- ═══════════ ${nombre} ═══════════\n${texto}`),
  'commit;',
  '',
].join('\n');
writeFileSync(join(supabase, 'instalar.sql'), sql, 'utf8');
console.log(`instalar.sql: ${partes.map(([n]) => n).join(', ')}`);
