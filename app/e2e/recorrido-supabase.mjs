// Recorrido contra Supabase real: cuentas (Edge Function), fotos (Storage), tiempo real y recepción.
// Crea cuentas y datos de prueba; límpielos después (ver README).
// Uso: URL_APP=... ADMIN_EMAIL=... ADMIN_CLAVE=... node e2e/recorrido-supabase.mjs [capturas]
import { chromium } from 'playwright-core';
import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const URL = process.env.URL_APP ?? 'http://localhost:4180';
const capturas = process.argv[2] ?? 'e2e/capturas-supabase';
mkdirSync(capturas, { recursive: true });
const icono = join(process.cwd(), 'public', 'icono-512.png');
const CLAVE_PRUEBA = 'Prueba-RSCLL-2026';
const REVISOR = { nombre: 'Prueba Revisor', email: 'prueba.revisor@rscll-prueba.cl', rol: 'revisor' };
const INSPECCION = { nombre: 'Prueba Inspección', email: 'prueba.inspeccion@rscll-prueba.cl', rol: 'inspeccion' };
const RECINTO = process.env.RECINTO ?? 'A-30';

const navegador = await chromium.launch({ channel: process.env.CANAL ?? 'msedge' });
const errores = [];
let paso = 0;
const ok = (t) => console.log(`✓ ${++paso}. ${t}`);

async function sesion(email, clave, viewport = { width: 390, height: 844 }) {
  const ctx = await navegador.newContext({ viewport, acceptDownloads: true, locale: 'es-CL', timezoneId: 'America/Santiago' });
  const p = await ctx.newPage();
  p.on('console', (m) => m.type() === 'error' && errores.push(`${email}: ${m.text()}`));
  p.on('pageerror', (e) => errores.push(`${email}: ${e}`));
  await p.goto(URL);
  await p.getByLabel('Correo').fill(email);
  await p.getByLabel('Clave').fill(clave);
  await p.getByRole('button', { name: 'Ingresar' }).click();
  await p.getByRole('link', { name: /Inicio/ }).waitFor({ timeout: 30_000 });
  return p;
}

async function crearCuenta(p, u) {
  const form = p.locator('form.formulario-linea');
  await form.getByPlaceholder('Nombre').fill(u.nombre);
  await form.getByPlaceholder('Correo').fill(u.email);
  await form.getByPlaceholder(/Clave inicial/).fill(CLAVE_PRUEBA);
  await form.locator('select').selectOption(u.rol);
  await form.getByRole('button', { name: 'Crear cuenta' }).click();
  await p.locator('.aviso').filter({ hasText: /Cuenta creada|already|registered/ }).waitFor({ timeout: 20_000 });
}

try {
  // Administrador en escritorio
  const admin = await sesion(process.env.ADMIN_EMAIL, process.env.ADMIN_CLAVE, { width: 1440, height: 900 });
  await admin.locator('path[data-room-id]').first().waitFor();
  ok('Administrador ingresa con Supabase Auth y ve la planta');
  await admin.getByRole('link', { name: /Historial/ }).click();
  await admin.getByRole('tab', { name: 'Usuarios' }).click();
  await crearCuenta(admin, REVISOR);
  await crearCuenta(admin, INSPECCION);
  await admin.locator('tr', { hasText: INSPECCION.email }).locator('select').waitFor();
  const rolInsp = await admin.locator('tr', { hasText: INSPECCION.email }).locator('select').inputValue();
  if (rolInsp !== 'inspeccion') throw new Error(`Rol asignado incorrecto: ${rolInsp}`);
  ok('la Edge Function crea cuentas con su rol');
  await admin.screenshot({ path: join(capturas, '01_usuarios.png') });
  await admin.getByRole('link', { name: /Inicio/ }).click();
  await admin.getByRole('tab', { name: 'Piso 1' }).click();
  await admin.locator(`path[data-room-id="RSCLL:${RECINTO}"]`).waitFor();

  // Revisor en teléfono
  const rev = await sesion(REVISOR.email, CLAVE_PRUEBA);
  ok('la cuenta nueva de Revisor ingresa');
  await rev.goto(`${URL}/revision/recinto/${RECINTO}`);
  await rev.getByRole('button', { name: /Iniciar revisión|Continuar mi revisión/ }).click();
  await admin.locator(`path[data-room-id="RSCLL:${RECINTO}"].estado-en_revision`).waitFor({ timeout: 15_000 });
  ok('tiempo real: la planta del Administrador pasa a azul sin recargar');
  if (!(await rev.locator('.hoja').count())) await rev.getByRole('button', { name: 'Observación' }).click();
  await rev.getByLabel('Especialidad').selectOption('Pintura');
  await rev.getByPlaceholder(/Qué se observa/).fill('Prueba: muro con mancha');
  await rev.locator('input[type=file]:not([capture])').setInputFiles(icono);
  await rev.locator('.hoja .foto-mini img').waitFor();
  await rev.getByRole('button', { name: 'Guardar', exact: true }).click();
  await rev.locator('.hoja').waitFor({ state: 'detached' });
  await rev.locator('article.obs:not(.obs-en-cola)').filter({ hasText: 'Prueba: muro con mancha' }).waitFor({ timeout: 30_000 });
  await rev.locator('article.obs:not(.obs-en-cola) .fotos img').first().waitFor({ timeout: 30_000 });
  ok('observación con foto subida a Storage y mostrada con URL firmada');
  await rev.screenshot({ path: join(capturas, '02_revision.png'), fullPage: true });
  await rev.getByRole('button', { name: 'Finalizar revisión' }).click();
  await rev.waitForURL(/\/inicio/);
  await admin.locator(`path[data-room-id="RSCLL:${RECINTO}"].estado-pendiente`).waitFor({ timeout: 15_000 });
  ok('tiempo real: el recinto pasa a ámbar en la planta del Administrador');

  // Inspección
  const insp = await sesion(INSPECCION.email, CLAVE_PRUEBA);
  await insp.goto(`${URL}/revision/recinto/${RECINTO}`);
  await insp.getByRole('button', { name: /Marcar subsanada/ }).first().click();
  await insp.getByRole('button', { name: /Recepcionar/ }).click();
  await insp.getByText(/Recepcionado por Prueba Inspección/).waitFor({ timeout: 15_000 });
  await admin.locator(`path[data-room-id="RSCLL:${RECINTO}"].estado-recepcionado`).waitFor({ timeout: 15_000 });
  ok('Inspección subsana y recepciona; el Administrador lo ve en verde oscuro');
  if ((await rev.getByRole('button', { name: /Recepcionar/ }).count()) !== 0) throw new Error('Revisor ve Recepcionar');

  // Informe con foto
  await insp.getByRole('link', { name: /Informes/ }).click();
  await insp.locator('summary', { hasText: 'Filtros' }).click();
  await insp.locator('.filtros select').nth(1).selectOption(`RSCLL:${RECINTO}`);
  await insp.locator('.informe-total').filter({ hasText: /^1 observación/ }).waitFor({ timeout: 15_000 });
  const [pdf] = await Promise.all([insp.waitForEvent('download', { timeout: 60_000 }), insp.getByRole('button', { name: /Emitir PDF/ }).click()]);
  const ruta = join(capturas, pdf.suggestedFilename());
  await pdf.saveAs(ruta);
  if (statSync(ruta).size < 20_000) throw new Error('El PDF no parece incluir la foto');
  ok(`PDF del recinto con foto desde Storage (${Math.round(statSync(ruta).size / 1024)} KB)`);

  await admin.getByRole('link', { name: /Historial/ }).click();
  await admin.locator('td', { hasText: /^Recepción$/ }).first().waitFor();
  ok('Historial registra la recepción');

  console.log(errores.length ? `\nErrores de consola:\n${errores.join('\n')}` : '\nSin errores de consola.');
} catch (e) {
  console.error(`\n✗ ${e.message}`);
  if (errores.length) console.error(`Errores de consola:\n${errores.join('\n')}`);
  process.exitCode = 1;
} finally {
  await navegador.close();
}
