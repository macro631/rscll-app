// Genera informes de varias hojas (modo demostración) para revisar columnas, fotos y encabezados repetidos.
// Uso: VITE_MODO=demo npm run build && npx vite preview --port 4180 ; node e2e/informe-largo.mjs <carpeta> <foto.png|jpg>
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const URL = process.env.URL_APP ?? 'http://localhost:4180';
const dir = process.argv[2] ?? 'e2e/informes';
const foto = process.argv[3] ?? join(process.cwd(), 'public', 'icono-512.png');
mkdirSync(dir, { recursive: true });

const ESPECIALIDADES = ['Pintura', 'Sanitario', 'Puertas', 'Terminaciones', 'Ventanas', 'Cerámico / Porcelanato'];
const TEXTOS = [
  'Muro con fisura sobre el vano de la puerta principal; se aprecia desprendimiento de pintura en un área aproximada de 40 × 20 cm.',
  'Lavamanos sin sello perimetral.',
  'Cerradura no cierra completamente y el marco presenta un descuadre visible en la esquina superior derecha, lo que impide el ajuste de la hoja.',
  'Guardapolvo despegado en el tramo norte.',
];

const b = await chromium.launch({ channel: process.env.CANAL ?? 'msedge' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, locale: 'es-CL', timezoneId: 'America/Santiago' });
const p = await ctx.newPage();
await p.goto(URL);
await p.getByText('Modo demostración').waitFor({ timeout: 60_000 });
await p.getByRole('button', { name: /Revisor Terreno 1/ }).click();
await p.getByRole('link', { name: /Inicio/ }).waitFor();

await p.goto(`${URL}/revision/recinto/A-26`);
await p.getByRole('button', { name: 'Iniciar revisión' }).click();
const total = 12;
for (let i = 0; i < total; i++) {
  await p.getByLabel('Especialidad').selectOption(ESPECIALIDADES[i % ESPECIALIDADES.length]);
  await p.getByPlaceholder(/Qué se observa/).fill(`${TEXTOS[i % TEXTOS.length]} (${i + 1})`);
  if (i % 3 !== 2) {
    await p.locator('input[type=file]:not([capture])').setInputFiles(foto);
    await p.locator('.hoja .foto-mini img').waitFor();
  }
  await p.getByRole('button', { name: 'Guardar y otra' }).click();
  await p.locator('.hoja .nota').filter({ hasText: String(i + 1) }).waitFor();
}
await p.keyboard.press('Escape');
await p.locator('.obs-en-cola').first().waitFor({ state: 'detached', timeout: 60_000 }).catch(() => {});
await p.getByRole('button', { name: 'Finalizar revisión' }).click();
await p.waitForURL(/\/inicio/);
console.log(`${total} observaciones registradas en A-26`);

async function emitir(nombre, preparar) {
  await p.getByRole('link', { name: /Informes/ }).click();
  await p.locator('.informe-total').filter({ hasText: /\d+ observaci/ }).waitFor();
  await preparar();
  await p.waitForTimeout(800);
  const [d] = await Promise.all([p.waitForEvent('download', { timeout: 60_000 }), p.getByRole('button', { name: /Emitir PDF/ }).click()]);
  await d.saveAs(join(dir, nombre));
  console.log('PDF', nombre);
}

await emitir('por_recinto_A-26.pdf', async () => {
  await p.locator('summary', { hasText: 'Filtros' }).click();
  await p.locator('.filtros select').nth(1).selectOption('RSCLL:A-26');
});
await emitir('por_especialidad_todas.pdf', async () => {
  await p.getByRole('tab', { name: 'Por especialidad' }).click();
});
await b.close();
