// Capturas de todas las pantallas (modo demostración) en teléfono y escritorio, para revisar el diseño.
// Uso: VITE_MODO=demo npm run build && npx vite preview --port 4180
//      URL_APP=http://localhost:4180 node e2e/capturas.mjs <carpeta>
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const URL = process.env.URL_APP ?? 'http://localhost:4180';
const dir = process.argv[2] ?? 'e2e/capturas-diseño';
mkdirSync(dir, { recursive: true });
const b = await chromium.launch({ channel: process.env.CANAL ?? 'msedge' });

async function recorrer(nombre, viewport, usuario) {
  const ctx = await b.newContext({ viewport, deviceScaleFactor: 1, locale: 'es-CL', timezoneId: 'America/Santiago' });
  const p = await ctx.newPage();
  const foto = async (n, full = false) => {
    await p.waitForTimeout(500);
    await p.screenshot({ path: join(dir, `${nombre}_${n}.png`), fullPage: full });
  };
  await p.goto(URL);
  await p.getByText('Modo demostración').waitFor({ timeout: 60_000 });
  await foto('00_ingreso');
  await p.getByRole('button', { name: new RegExp(usuario) }).click();
  await p.locator('path[data-room-id].estado-listo').first().waitFor();
  await foto('01_inicio');
  await p.getByRole('tab', { name: 'Exteriores' }).click();
  await foto('02_exteriores');
  await p.getByRole('link', { name: /Revisión/ }).click();
  await p.locator('.fila-recinto').first().waitFor();
  await foto('03_revision_lista');
  await p.getByRole('tab', { name: 'Planta', exact: true }).click();
  await p.getByRole('tab', { name: 'Piso 1' }).click();
  await p.locator('path[data-room-id]').first().waitFor();
  await foto('04_revision_planta');
  await p.goto(`${URL}/revision/recinto/A-02`);
  await p.getByText('Espera, Módulos').first().waitFor();
  await foto('05_ficha_recinto');
  await foto('05b_ficha_recinto_completa', true);
  await p.goto(`${URL}/revision/recinto/A-25`);
  await p.getByRole('button', { name: 'Iniciar revisión' }).click();
  await p.getByRole('button', { name: 'Pintura' }).waitFor();
  await foto('06_ficha_revision');
  await p.keyboard.press('Escape');
  await foto('06b_ficha_revision_cerrada');
  await p.getByRole('link', { name: /Informes/ }).click();
  await p.locator('.informe-total').filter({ hasText: /\d+ observaci/ }).waitFor();
  await foto('07_informes');
  if (viewport.width >= 1024) {
    await p.getByRole('link', { name: /Base/ }).click();
    await p.locator('.tabla-base tbody tr').first().waitFor();
    await foto('08_base');
  }
  if (await p.getByRole('link', { name: /Historial/ }).count()) {
    await p.getByRole('link', { name: /Historial/ }).click();
    await p.locator('.tabla tbody tr').first().waitFor();
    await foto('09_historial');
  }
  await ctx.close();
}

await recorrer('tel', { width: 390, height: 844 }, 'Calidad');
await recorrer('esc', { width: 1440, height: 900 }, 'Calidad');
await b.close();
console.log('Capturas en', dir);
