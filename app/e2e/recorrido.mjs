// Recorrido de humo en el navegador (modo demostración) con Edge o Chrome instalado.
// Uso: npm run build:demo && npm run preview   (en otra terminal)
//      node e2e/recorrido.mjs [carpeta_capturas]
import { chromium } from 'playwright-core';
import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const URL = process.env.URL_APP ?? 'http://localhost:4180';
const capturas = process.argv[2] ?? 'e2e/capturas';
mkdirSync(capturas, { recursive: true });
const icono = join(process.cwd(), 'public', 'icono-512.png');

const navegador = await chromium.launch({ channel: process.env.CANAL ?? 'msedge' });
const errores = [];
let paso = 0;
function ok(texto) {
  console.log(`✓ ${++paso}. ${texto}`);
}
function esperar(cond, texto) {
  if (!cond) throw new Error(`Falló: ${texto}`);
  ok(texto);
}

async function nuevaPagina(viewport) {
  const ctx = await navegador.newContext({ viewport, acceptDownloads: true, locale: 'es-CL', timezoneId: 'America/Santiago' });
  const p = await ctx.newPage();
  p.on('console', (m) => m.type() === 'error' && errores.push(m.text()));
  p.on('pageerror', (e) => errores.push(String(e)));
  return p;
}

async function entrarComo(p, nombre) {
  await p.getByRole('button', { name: new RegExp(nombre) }).click();
  await p.getByRole('link', { name: /Inicio/ }).waitFor();
}

function buscar(p) {
  return p.getByRole('searchbox', { name: 'Buscar recinto por código o nombre' });
}

async function salir(p) {
  await p.getByRole('button', { name: /Cuenta de/ }).click();
  await p.getByRole('menuitem', { name: 'Cerrar sesión' }).click();
  await p.getByText('Modo demostración').waitFor();
}

async function estadoFigura(p, id, clase) {
  if (clase) await p.locator(`.planta-contenido[class*=modo-] path[data-room-id="${id}"].${clase}`).first().waitFor({ timeout: 10_000 }).catch(() => {});
  return p.locator(`.planta-contenido[class*=modo-] path[data-room-id="${id}"]`).first().getAttribute('class');
}

try {
  // ── Teléfono: Revisor ──
  const tel = await nuevaPagina({ width: 390, height: 844 });
  await tel.goto(URL);
  await tel.getByText('Modo demostración').waitFor({ timeout: 60_000 });
  ok('pantalla de ingreso en modo demostración');
  await tel.screenshot({ path: join(capturas, '01_ingreso.png') });

  await entrarComo(tel, 'Revisor Terreno 1');
  await tel.locator('.planta-contenido[class*=modo-] path[data-room-id]').first().waitFor();
  esperar((await tel.locator('.planta-contenido[class*=modo-] path[data-room-id]').count()) === 44, 'Piso 1 muestra 44 figuras');
  esperar((await estadoFigura(tel, 'RSCLL:E1', 'estado-pendiente')).includes('estado-pendiente'), 'E1 en ámbar en Piso 1');
  esperar((await estadoFigura(tel, 'RSCLL:A-04', 'estado-recepcionado')).includes('estado-recepcionado'), 'A-04 recepcionado (verde oscuro)');
  await tel.screenshot({ path: join(capturas, '02_inicio_piso1.png') });

  await tel.getByRole('tab', { name: 'Piso 2' }).click();
  await tel.locator('.planta-contenido[class*=modo-] path[data-room-id="RSCLL:E1"]').waitFor();
  esperar((await estadoFigura(tel, 'RSCLL:E1', 'estado-pendiente')).includes('estado-pendiente'), 'E1 con el mismo estado en Piso 2');
  await tel.locator('.planta-contenido[class*=modo-] path[data-room-id="RSCLL:E2"]').dispatchEvent('pointerdown', { clientX: 0, clientY: 0 });
  await tel.locator('.planta-contenido[class*=modo-] path[data-room-id="RSCLL:E2"]').dispatchEvent('pointerup', { clientX: 0, clientY: 0 });
  await tel.locator('.planta-ficha').getByText('Escalera 02').waitFor();
  ok('tocar una figura muestra código, nombre y estado sin abrir la ficha');

  await tel.getByRole('tab', { name: 'Exteriores' }).click();
  esperar((await tel.locator('.exteriores .fila-recinto').count()) === 9, 'Exteriores lista 9 unidades');
  await tel.screenshot({ path: join(capturas, '03_inicio_exteriores.png') });

  // Revisión completa con foto
  await tel.getByRole('link', { name: /Revisión/ }).click();
  await buscar(tel).fill('A-20');
  await tel.locator('.lista-recintos .fila-recinto').first().click();
  await tel.getByRole('button', { name: 'Iniciar revisión' }).click();
  // La ficha vacía abre directamente el formulario de observación.
  await tel.getByLabel('Especialidad').selectOption('Pintura');
  await tel.getByPlaceholder(/Qué se observa/).fill('Muro con fisura sobre puerta');
  await tel.locator('input[type=file]:not([capture])').setInputFiles(icono);
  await tel.locator('.hoja .foto-mini img').waitFor();
  await tel.screenshot({ path: join(capturas, '04_ficha_ingreso.png') });
  await tel.getByRole('button', { name: 'Guardar y otra' }).click();
  await tel.getByText('1 observación guardada').waitFor();
  await tel.locator('article.obs:not(.obs-en-cola)').filter({ hasText: 'Muro con fisura' }).waitFor();
  await tel.locator('article.obs .fotos img').first().waitFor();
  ok('observación con foto guardada y sincronizada');
  await tel.getByLabel('Especialidad').selectOption('Terminaciones');
  await tel.getByPlaceholder(/Qué se observa/).fill('Guardapolvo suelto');
  await tel.getByRole('button', { name: 'Guardar', exact: true }).click();
  await tel.locator('.hoja').waitFor({ state: 'detached' });
  await tel.locator('article.obs:not(.obs-en-cola)').filter({ hasText: 'Guardapolvo suelto' }).waitFor();
  ok('segunda observación en la misma ficha sin volver a elegir recinto');
  await tel.screenshot({ path: join(capturas, '05_ficha_observaciones.png'), fullPage: true });
  await tel.getByRole('button', { name: 'Finalizar revisión' }).click();
  await tel.waitForURL(/\/inicio/);
  ok('finalizar vuelve a Inicio');
  await tel.getByRole('tab', { name: 'Piso 1' }).click();
  await tel.locator('.planta-contenido[class*=modo-] path[data-room-id="RSCLL:A-20"]').waitFor();
  esperar((await estadoFigura(tel, 'RSCLL:A-20', 'estado-pendiente')).includes('estado-pendiente'), 'A-20 queda ámbar');

  // Comprobación de subsanación por otro revisor
  await salir(tel);
  await entrarComo(tel, 'Revisor Terreno 2');
  await tel.goto(`${URL}/revision/recinto/A-20`);
  const botones = tel.getByRole('button', { name: /Marcar subsanada/ });
  await botones.first().waitFor();
  const n = await botones.count();
  for (let i = n; i > 0; i--) {
    await botones.first().click();
    await tel.waitForFunction((k) => document.querySelectorAll('.obs .boton-ok').length < k, i);
  }
  await tel.getByText('Listo para Inspección').first().waitFor();
  ok('al subsanar la última pendiente el recinto pasa a verde claro');

  // Inspección
  await salir(tel);
  await entrarComo(tel, 'Inspección Técnica');
  await tel.getByRole('link', { name: /Revisión/ }).click();
  await tel.getByRole('tab', { name: /Listos para inspeccionar/ }).waitFor();
  await buscar(tel).fill('A-20');
  await tel.locator('.lista-recintos .fila-recinto').first().click();
  await tel.getByRole('button', { name: /Recepcionar/ }).click();
  await tel.getByText(/Recepcionado por Inspección Técnica/).waitFor();
  ok('Inspección recepciona el recinto');
  await tel.locator('summary', { hasText: 'Subsanadas' }).click();
  await tel.getByRole('button', { name: 'Devolver a pendiente' }).first().click();
  await tel.getByLabel('Comentario de Inspección').fill('La fisura reaparece');
  await tel.getByRole('button', { name: 'Mantener pendiente' }).click();
  await tel.getByText('Revisado con pendientes').first().waitFor();
  ok('devolución de Inspección vuelve el recinto a ámbar');
  await tel.screenshot({ path: join(capturas, '06_ficha_inspeccion.png'), fullPage: true });
  esperar((await tel.getByRole('link', { name: /Historial/ }).count()) === 0, 'Inspección no ve Historial');

  // Inspección también revisa
  await tel.goto(`${URL}/revision/recinto/A-21`);
  await tel.getByRole('button', { name: 'Iniciar revisión' }).click();
  await tel.getByLabel('Especialidad').selectOption('Climatización');
  await tel.getByPlaceholder(/Qué se observa/).fill('Rejilla de retorno sin fijar');
  await tel.getByRole('button', { name: 'Guardar', exact: true }).click();
  await tel.locator('article.obs:not(.obs-en-cola)').filter({ hasText: 'Rejilla de retorno' }).waitFor();
  await tel.getByRole('button', { name: 'Finalizar revisión' }).click();
  await tel.waitForURL(/\/inicio/);
  await tel.getByRole('tab', { name: 'Piso 1' }).click();
  esperar((await estadoFigura(tel, 'RSCLL:A-21', 'estado-pendiente')).includes('estado-pendiente'), 'Inspección también revisa: registra una observación y A-21 queda ámbar');

  // Informes PDF desde el teléfono
  await tel.getByRole('link', { name: /Informes/ }).click();
  await tel.locator('summary', { hasText: 'Filtros' }).click();
  await tel.locator('.filtros select').nth(2).selectOption('Pintura');
  await tel.getByRole('button', { name: 'Solo pendientes' }).click();
  await tel.locator('.informe-total').filter({ hasText: /\d+ observaci/ }).waitFor();
  const [pdf] = await Promise.all([tel.waitForEvent('download'), tel.getByRole('button', { name: /Emitir PDF/ }).click()]);
  const rutaPdf = join(capturas, pdf.suggestedFilename());
  await pdf.saveAs(rutaPdf);
  esperar(statSync(rutaPdf).size > 5000, `PDF emitido (${pdf.suggestedFilename()})`);
  await tel.screenshot({ path: join(capturas, '07_informes.png') });

  // ── Escritorio: Administrador ──
  const esc = await nuevaPagina({ width: 1440, height: 900 });
  await esc.goto(URL);
  await esc.getByText('Modo demostración').waitFor({ timeout: 60_000 });
  await entrarComo(esc, 'Calidad');
  await esc.locator('.planta-contenido[class*=modo-] path[data-room-id]').first().waitFor();
  await esc.screenshot({ path: join(capturas, '08_escritorio_inicio.png') });
  await esc.getByRole('link', { name: /Base/ }).click();
  await esc.locator('.tabla-base tbody tr').first().waitFor();
  const [xlsx] = await Promise.all([esc.waitForEvent('download'), esc.getByRole('button', { name: 'Excel completo' }).click()]);
  const rutaX = join(capturas, xlsx.suggestedFilename());
  await xlsx.saveAs(rutaX);
  esperar(statSync(rutaX).size > 5000, `Excel exportado (${xlsx.suggestedFilename()})`);
  await esc.screenshot({ path: join(capturas, '09_base.png') });
  await esc.getByRole('link', { name: /Historial/ }).click();
  await esc.locator('td', { hasText: /^Recepción$/ }).first().waitFor();
  ok('Historial muestra la recepción y sus movimientos');
  await esc.screenshot({ path: join(capturas, '10_historial.png') });

  console.log(errores.length ? `\nErrores de consola:\n${errores.join('\n')}` : '\nSin errores de consola.');
} catch (e) {
  console.error(`\n✗ ${e.message}`);
  if (errores.length) console.error(`Errores de consola:\n${errores.join('\n')}`);
  process.exitCode = 1;
} finally {
  await navegador.close();
}
