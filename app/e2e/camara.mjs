// Cámara dentro de la app con una cámara simulada de Chromium: permiso concedido y permiso denegado.
// Uso: VITE_MODO=demo npm run build && npx vite preview --port 4180 ; node e2e/camara.mjs [capturas]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const URL = process.env.URL_APP ?? 'http://localhost:4180';
const dir = process.argv[2] ?? 'e2e/capturas-camara';
mkdirSync(dir, { recursive: true });
let paso = 0;
const ok = (t) => console.log(`✓ ${++paso}. ${t}`);

async function abrirFormulario(permitir, recinto) {
  const b = await chromium.launch({
    channel: process.env.CANAL ?? 'msedge',
    args: ['--use-fake-device-for-media-stream', ...(permitir ? ['--use-fake-ui-for-media-stream'] : [])],
  });
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'es-CL',
    permissions: permitir ? ['camera'] : [],
  });
  const p = await ctx.newPage();
  await p.goto(URL);
  await p.getByText('Modo demostración').waitFor({ timeout: 60_000 });
  await p.getByRole('button', { name: /Revisor Terreno 1/ }).click();
  await p.getByRole('link', { name: /Inicio/ }).waitFor();
  await p.goto(`${URL}/revision/recinto/${recinto}`);
  await p.getByRole('button', { name: 'Iniciar revisión' }).click();
  await p.getByLabel('Especialidad').selectOption('Pintura');
  await p.getByPlaceholder(/Qué se observa/).fill('Prueba de cámara');
  await p.getByRole('button', { name: 'Tomar foto' }).click();
  await p.getByRole('dialog', { name: 'Cámara' }).waitFor();
  return { b, p };
}

try {
  // Permiso concedido
  {
    const { b, p } = await abrirFormulario(true, 'A-27');
    const disparador = p.locator('.camara-disparador');
    await p.waitForFunction(() => {
      const v = document.querySelector('.camara-video');
      return v && v.videoWidth > 0 && !v.paused;
    });
    ok('la app pide la cámara y muestra la imagen en vivo');
    await p.waitForTimeout(300);
    await p.screenshot({ path: join(dir, 'camara_en_vivo.png') });
    await disparador.click();
    await p.getByText('1 foto tomada').waitFor();
    await disparador.click();
    await p.getByText('2 fotos tomadas').waitFor();
    ok('se toman dos fotos seguidas sin salir de la cámara');
    await p.getByRole('button', { name: 'Listo' }).click();
    await p.getByRole('dialog', { name: 'Cámara' }).waitFor({ state: 'detached' });
    const enFormulario = await p.locator('.hoja .foto-mini img').count();
    if (enFormulario !== 2) throw new Error(`se esperaban 2 fotos en el formulario, hay ${enFormulario}`);
    ok('al tocar «Listo» las dos fotos quedan en el formulario (que sigue abierto)');
    const apagada = await p.evaluate(() => !document.querySelector('.camara-video'));
    if (!apagada) throw new Error('la cámara sigue activa');
    await p.getByRole('button', { name: 'Guardar', exact: true }).click();
    await p.locator('article.obs:not(.obs-en-cola)').filter({ hasText: 'Prueba de cámara' }).locator('.fotos img').nth(1).waitFor();
    ok('la observación se guarda con las dos fotos');
    await b.close();
  }
  // Permiso denegado
  {
    const { b, p } = await abrirFormulario(false, 'A-29');
    await p.getByText('La cámara está bloqueada para este sitio').waitFor({ timeout: 15_000 });
    await p.getByRole('button', { name: 'Usar la cámara del teléfono' }).waitFor();
    await p.getByRole('button', { name: 'Intentar de nuevo' }).waitFor();
    ok('sin permiso, la app explica cómo habilitarlo y ofrece la cámara del teléfono');
    await p.screenshot({ path: join(dir, 'camara_bloqueada.png') });
    await b.close();
  }
} catch (e) {
  console.error(`\n✗ ${e.message}`);
  process.exitCode = 1;
}
