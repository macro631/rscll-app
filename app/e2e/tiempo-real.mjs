// Dos personas revisan el mismo recinto contra Supabase real: cada una ve al instante lo que registra la otra.
// Uso: URL_APP=... CLAVE=... EMAIL_A=... EMAIL_B=... RECINTO=A-33 node e2e/tiempo-real.mjs [capturas]
// Crea datos de prueba: bórrelos después (actividad de las dos cuentas de prueba).
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const URL = process.env.URL_APP ?? 'http://localhost:4180';
const RECINTO = process.env.RECINTO ?? 'A-33';
const dir = process.argv[2] ?? 'e2e/capturas-tiempo-real';
mkdirSync(dir, { recursive: true });

const b = await chromium.launch({ channel: process.env.CANAL ?? 'msedge' });
const errores = [];
let paso = 0;
const ok = (t) => console.log(`✓ ${++paso}. ${t}`);

async function entrar(email) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CL', timezoneId: 'America/Santiago' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errores.push(`${email}: ${e}`));
  await p.goto(URL);
  await p.getByLabel('Correo').fill(email);
  await p.getByLabel('Clave').fill(process.env.CLAVE);
  await p.getByRole('button', { name: 'Ingresar' }).click();
  await p.getByRole('link', { name: /Inicio/ }).waitFor({ timeout: 30_000 });
  await p.goto(`${URL}/revision/recinto/${RECINTO}`);
  await p.getByRole('button', { name: /Iniciar revisión|Continuar mi revisión/ }).click();
  await p.getByLabel('Especialidad').waitFor();
  await p.keyboard.press('Escape'); // cierra el formulario que se abre solo en una ficha vacía
  return p;
}

async function registrar(p, especialidad, texto) {
  await p.getByRole('button', { name: 'Observación', exact: true }).click();
  await p.getByLabel('Especialidad').selectOption(especialidad);
  await p.getByPlaceholder(/Qué se observa/).fill(texto);
  await p.getByRole('button', { name: 'Guardar', exact: true }).click();
  await p.locator('.hoja').waitFor({ state: 'detached' });
}

try {
  const a = await entrar(process.env.EMAIL_A);
  const bb = await entrar(process.env.EMAIL_B);
  await a.getByText(/También revisando ahora/).waitFor({ timeout: 15_000 });
  ok('A ve que B también está revisando el recinto');

  const inicio = Date.now();
  await registrar(a, 'Pintura', 'Prueba: mancha en muro sur');
  await bb.locator('section', { hasText: 'De otras personas' }).getByText('Prueba: mancha en muro sur').first().waitFor({ timeout: 15_000 });
  ok(`B ve la observación de A sin recargar (${((Date.now() - inicio) / 1000).toFixed(1)} s)`);
  await bb.locator('.aviso', { hasText: /registró N°/ }).waitFor({ timeout: 5_000 });
  ok('B recibe un aviso de la observación nueva');
  await bb.screenshot({ path: join(dir, 'b_ve_a.png'), fullPage: true });

  await bb.getByRole('button', { name: 'Observación', exact: true }).click();
  await bb.getByLabel('Especialidad').selectOption('Pintura');
  await bb.locator('.ya-registradas').getByText('Prueba: mancha en muro sur').first().waitFor({ timeout: 5_000 });
  ok('al elegir Pintura, B ve que esa observación ya existe');
  await bb.waitForTimeout(400); // fin de la animación de apertura
  await bb.screenshot({ path: join(dir, 'b_formulario.png') });
  await bb.keyboard.press('Escape');

  await registrar(bb, 'Puertas', 'Prueba: bisagra suelta');
  await a.locator('section', { hasText: 'De otras personas' }).getByText('Prueba: bisagra suelta').first().waitFor({ timeout: 15_000 });
  ok('A ve la observación de B sin recargar');

  for (const p of [a, bb]) {
    await p.getByRole('button', { name: 'Finalizar revisión' }).click();
    await p.waitForURL(/\/inicio/);
  }
  ok('ambos finalizan sus fichas');
  console.log(errores.length ? `\nErrores:\n${errores.join('\n')}` : '\nSin errores de página.');
} catch (e) {
  console.error(`\n✗ ${e.message}`);
  if (errores.length) console.error(errores.join('\n'));
  process.exitCode = 1;
} finally {
  await b.close();
}
