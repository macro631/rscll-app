// Única plantilla de informe de observaciones (§9). Los filtros cambian filas y agrupación, no las columnas.
import type { Content, TDocumentDefinitions, TableCell } from 'pdfmake/interfaces';
import { api } from './backend';
import { fecha } from './formato';
import type { Observacion } from './tipos';

export const LEYENDA_PDF = 'Emitido por Calidad\nSubComisaria LlayLlay';

export type Agrupacion = 'recinto' | 'especialidad';

async function aDataUrl(blob: Blob): Promise<string> {
  return new Promise((ok, mal) => {
    const r = new FileReader();
    r.onload = () => ok(r.result as string);
    r.onerror = () => mal(r.error);
    r.readAsDataURL(blob);
  });
}

async function cargarFotos(filas: Observacion[], maxPorObs: number) {
  const pedidos = filas.flatMap((o) => o.fotos.slice(0, maxPorObs).map((f) => f.ligera));
  const mapa = new Map<string, string>();
  let i = 0;
  async function trabajador() {
    while (i < pedidos.length) {
      const path = pedidos[i++];
      try {
        const url = await api().urlFoto('fotos-ligera', path);
        const blob = await (await fetch(url)).blob();
        mapa.set(path, await aDataUrl(blob));
      } catch {
        /* foto no disponible: la fila se imprime sin ella */
      }
    }
  }
  await Promise.all(Array.from({ length: 4 }, trabajador));
  return mapa;
}

export function agrupar(filas: Observacion[], agrupacion: Agrupacion) {
  const grupos = new Map<string, Observacion[]>();
  for (const o of filas) {
    const clave = agrupacion === 'recinto' ? `${o.codigo} · ${o.recinto_nombre}` : o.especialidad;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave)!.push(o);
  }
  return grupos;
}

export async function generarPdf(
  filas: Observacion[],
  opciones: { filtros: string[]; agrupacion: Agrupacion; conFotos: boolean },
): Promise<Blob> {
  const [{ default: pdfMake }, { default: vfs }] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
  ]);
  pdfMake.addVirtualFileSystem(vfs);

  const emision = fecha(new Date());
  const fotos = opciones.conFotos ? await cargarFotos(filas, 3) : new Map<string, string>();
  // Cada tabla necesita su propio encabezado: pdfmake modifica los objetos de celda al maquetar.
  const encabezado = (): TableCell[] => ['N°', 'Recinto', 'Especialidad', 'Observación', 'Estado', 'Foto'].map((t) => ({
    text: t,
    style: 'th',
  }));

  const cuerpo: Content[] = [];
  for (const [grupo, obs] of agrupar(filas, opciones.agrupacion)) {
    const pendientes = obs.filter((o) => o.estado === 'pendiente').length;
    cuerpo.push({ text: `${grupo}  (${obs.length} obs., ${pendientes} pend.)`, style: 'grupo' });
    cuerpo.push({
      table: {
        headerRows: 1,
        dontBreakRows: true,
        widths: [24, 62, 58, '*', 54, 104],
        body: [
          encabezado(),
          ...obs.map((o): TableCell[] => {
            const imagenes = o.fotos
              .slice(0, 3)
              .map((f) => fotos.get(f.ligera))
              .filter((d): d is string => !!d)
              .map((d) => ({ image: d, fit: [100, 76] as [number, number], margin: [0, 0, 0, 3] as [number, number, number, number] }));
            return [
              { text: String(o.numero), style: 'td' },
              { text: [{ text: o.codigo, bold: true }, `\n${o.recinto_nombre}`], style: 'td' },
              { text: o.especialidad, style: 'td' },
              {
                stack: [
                  { text: o.descripcion },
                  ...(o.comentario_inspeccion
                    ? [{ text: `Inspección (${fecha(o.comentario_inspeccion_fecha)}): ${o.comentario_inspeccion}`, italics: true, color: '#8a5300', margin: [0, 3, 0, 0] as [number, number, number, number] }]
                    : []),
                  { text: `${o.autor} · ${fecha(o.creada, false)}`, color: '#666', fontSize: 7, margin: [0, 3, 0, 0] as [number, number, number, number] },
                ],
                style: 'td',
              },
              {
                stack: [
                  { text: o.estado === 'pendiente' ? 'Pendiente' : 'Subsanada', bold: true, color: o.estado === 'pendiente' ? '#9a5b00' : '#1d6b2a' },
                  ...(o.estado === 'subsanada' && o.comprobada_en ? [{ text: fecha(o.comprobada_en, false), fontSize: 7, color: '#666' }] : []),
                ],
                style: 'td',
              },
              imagenes.length ? { stack: imagenes, style: 'td' } : { text: o.fotos.length ? '(sin descarga)' : '—', style: 'td', color: '#999' },
            ];
          }),
        ],
      },
      layout: {
        hLineColor: () => '#c8d0d2',
        vLineColor: () => '#c8d0d2',
        fillColor: (fila: number) => (fila === 0 ? '#e8eef0' : null),
      },
      margin: [0, 0, 0, 10],
    });
  }
  if (filas.length === 0) cuerpo.push({ text: 'No hay observaciones con los filtros aplicados.', italics: true });

  const doc: TDocumentDefinitions = {
    pageSize: 'LETTER',
    pageMargins: [36, 54, 36, 48],
    info: { title: 'RSCLL · Informe de observaciones', author: 'Calidad' },
    header: (pagina, total) => ({
      columns: [
        { text: 'RSCLL · Reposición SubComisaría Llay Llay', bold: true },
        { text: `Emitido ${emision} · Página ${pagina} de ${total}`, alignment: 'right' },
      ],
      margin: [36, 22, 36, 0],
      fontSize: 8,
      color: '#445',
    }),
    footer: () => ({ text: LEYENDA_PDF, alignment: 'center', fontSize: 8, color: '#445', margin: [36, 8, 36, 0] }),
    content: [
      { text: 'Informe de observaciones', style: 'titulo' },
      { text: `Fecha y hora de emisión: ${emision}`, margin: [0, 0, 0, 2] },
      { text: `Filtros: ${opciones.filtros.join(' · ')}`, margin: [0, 0, 0, 2] },
      { text: `Total: ${filas.length} observación(es), ${filas.filter((o) => o.estado === 'pendiente').length} pendiente(s)`, margin: [0, 0, 0, 10] },
      ...cuerpo,
    ],
    defaultStyle: { fontSize: 9 },
    styles: {
      titulo: { fontSize: 15, bold: true, margin: [0, 0, 0, 6] },
      grupo: { fontSize: 10.5, bold: true, margin: [0, 6, 0, 4], color: '#1f4e5a' },
      th: { bold: true, fontSize: 8 },
      td: { fontSize: 8.5 },
    },
  };
  return pdfMake.createPdf(doc).getBlob();
}
