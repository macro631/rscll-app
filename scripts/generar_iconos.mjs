// Genera los íconos PNG de la PWA (sin logotipos): planta esquemática sobre fondo del proyecto.
// Uso: node scripts/generar_iconos.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const destino = join(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'public');

const crcTabla = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTabla[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function bloque(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const td = Buffer.concat([Buffer.from(tipo), datos]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([largo, td, c]);
}

function icono(n) {
  const fondo = [0x1f, 0x4e, 0x5a];
  const claro = [0xf3, 0xf5, 0xf4];
  const colores = [[0xa8, 0xdc, 0x9c], [0xf2, 0xb3, 0x3d], [0x5b, 0x9b, 0xd5], [0x2e, 0x7d, 0x32]];
  const m = Math.round(n * 0.2); // margen seguro para íconos «maskable»
  const g = Math.max(2, Math.round(n * 0.025));
  const cel = (n - 2 * m - g) / 2;
  const filas = [];
  for (let y = 0; y < n; y++) {
    const fila = Buffer.alloc(1 + n * 3);
    for (let x = 0; x < n; x++) {
      let c = fondo;
      const dentro = x >= m && x < n - m && y >= m && y < n - m;
      if (dentro) {
        const lx = x - m;
        const ly = y - m;
        const borde = lx < g || ly < g || lx >= n - 2 * m - g || ly >= n - 2 * m - g;
        const muroV = Math.abs(lx - cel - g / 2) < g / 2;
        const muroH = Math.abs(ly - cel - g / 2) < g / 2;
        if (borde || muroV || muroH) c = claro;
        else c = colores[(lx > cel ? 1 : 0) + (ly > cel ? 2 : 0)];
      }
      fila.set(c, 1 + x * 3);
    }
    filas.push(fila);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(n, 0);
  ihdr.writeUInt32BE(n, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloque('IHDR', ihdr),
    bloque('IDAT', deflateSync(Buffer.concat(filas))),
    bloque('IEND', Buffer.alloc(0)),
  ]);
}

for (const n of [192, 512]) writeFileSync(join(destino, `icono-${n}.png`), icono(n));
console.log('Íconos generados en app/public');
